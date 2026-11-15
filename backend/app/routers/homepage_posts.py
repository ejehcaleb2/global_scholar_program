from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from app.schemas.pagination import PageResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.content import audit_field_changes, sanitize_html, write_audit_log
from app.routers._admin_content_common import _require_current_version
from app.core.homepage import next_pin_order, pinned_count
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.gsp_models import HomepagePost, HomepageStatus, User
from app.schemas.admin import HomepagePostReorder, PublicHomepagePostResponse
from app.schemas.homepage_post import HomepagePostPatch, HomepagePostResponse, HomepagePostWrite

admin_router = APIRouter(prefix='/admin', tags=['admin-homepage'])
public_router = APIRouter(tags=['homepage'])


def _response(post: HomepagePost) -> HomepagePostResponse:
    return HomepagePostResponse.model_validate({**post.__dict__, 'body_html': sanitize_html(post.body_html)})


async def _validate_pin_request(db: AsyncSession, pinned: bool, status_value: HomepageStatus, pin_order: int | None, exclude_id: UUID | None = None) -> int | None:
    if pinned and status_value != HomepageStatus.published:
        raise HTTPException(status_code=422, detail='A draft homepage post cannot be pinned')
    if not pinned:
        return None
    if await pinned_count(db, exclude_id) >= 3:
        raise HTTPException(status_code=409, detail='Three homepage posts are already pinned; unpin one first')
    if pin_order is not None:
        occupied = await db.scalar(
            select(HomepagePost.id).where(
                HomepagePost.status == HomepageStatus.published,
                HomepagePost.pinned.is_(True),
                HomepagePost.pin_order == pin_order,
                HomepagePost.id != exclude_id,
            )
        )
        if occupied is not None:
            raise HTTPException(status_code=409, detail='That pin order is already occupied')
        return pin_order
    try:
        return await next_pin_order(db, exclude_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@admin_router.post('/homepage-posts', response_model=HomepagePostResponse, status_code=status.HTTP_201_CREATED)
async def create_homepage_post(
    payload: HomepagePostWrite,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> HomepagePostResponse:
    pin_order = await _validate_pin_request(db, payload.pinned, payload.status, payload.pin_order)
    post = HomepagePost(
        **payload.model_dump(exclude={'body_html', 'pin_order'}),
        body_html=sanitize_html(payload.body_html),
        pin_order=pin_order,
        published_at=datetime.now(timezone.utc) if payload.status == HomepageStatus.published else None,
    )
    db.add(post)
    await db.flush()
    await write_audit_log(db, admin.id, 'created', 'homepage_post', post.id, post.title)
    await db.commit()
    await db.refresh(post)
    return _response(post)


@admin_router.patch('/homepage-posts/{post_id}', response_model=HomepagePostResponse)
async def update_homepage_post(
    post_id: UUID,
    payload: HomepagePostPatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> HomepagePostResponse:
    post = await db.scalar(select(HomepagePost).where(HomepagePost.id == post_id).with_for_update())
    if post is None:
        raise HTTPException(status_code=404, detail='Homepage post not found')
    changes = payload.model_dump(exclude_unset=True)
    _require_current_version(post, changes.pop('expected_updated_at', None))
    previous_status = post.status
    previous_pinned = post.pinned
    new_status = changes.get('status', post.status)
    new_pinned = changes.get('pinned', post.pinned)
    pin_order = changes.get('pin_order', post.pin_order)
    if new_status == HomepageStatus.draft and changes.get('pinned') is True:
        raise HTTPException(status_code=422, detail='A draft homepage post cannot be pinned')
    if 'body_html' in changes and changes['body_html'] is not None:
        changes['body_html'] = sanitize_html(changes['body_html'])
    if new_status == HomepageStatus.published and post.status != HomepageStatus.published:
        post.published_at = datetime.now(timezone.utc)
    if new_status == HomepageStatus.draft:
        new_pinned = False
        pin_order = None
    pin_order = await _validate_pin_request(db, new_pinned, new_status, pin_order, post.id)
    changes['pinned'] = new_pinned
    changes['pin_order'] = pin_order
    audit_changes = audit_field_changes(post, changes)
    for field, value in changes.items():
        setattr(post, field, value)
    action = 'published' if new_status == HomepageStatus.published and previous_status != new_status else 'updated'
    if new_status == HomepageStatus.draft and previous_status != new_status:
        action = 'unpublished'
    elif new_pinned and not previous_pinned:
        action = 'pinned'
    elif previous_pinned and not new_pinned:
        action = 'unpinned'
    await write_audit_log(db, admin.id, action, 'homepage_post', post.id, post.title, audit_changes or {'unchanged': True})
    await db.commit()
    await db.refresh(post)
    return _response(post)


@admin_router.delete('/homepage-posts/{post_id}', status_code=status.HTTP_204_NO_CONTENT)
async def delete_homepage_post(
    post_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    post = await db.get(HomepagePost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail='Homepage post not found')
    await write_audit_log(db, admin.id, 'deleted', 'homepage_post', post.id, post.title)
    await db.delete(post)
    await db.commit()


@admin_router.get('/homepage-posts', response_model=list[HomepagePostResponse] | PageResponse[HomepagePostResponse])
async def list_admin_homepage_posts(
    post_status: HomepageStatus | None = Query(default=None, alias='status'),
    paginated: bool = False,
    pinned: bool | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[HomepagePostResponse] | PageResponse[HomepagePostResponse]:
    query = select(HomepagePost).order_by(HomepagePost.created_at.desc(), HomepagePost.id.desc())
    if post_status is not None:
        query = query.where(HomepagePost.status == post_status)
    if pinned is not None:
        query = query.where(HomepagePost.pinned == pinned)
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) if paginated else None
    if paginated:
        query = query.limit(limit).offset(offset)
    posts = (await db.scalars(query)).all()
    items = [_response(post) for post in posts]
    return PageResponse(items=items, total=total or 0, limit=limit, offset=offset) if paginated else items


@admin_router.get('/homepage-posts/{post_id}', response_model=HomepagePostResponse)
async def get_admin_homepage_post(
    post_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> HomepagePostResponse:
    post = await db.get(HomepagePost, post_id)
    if post is None:
        raise HTTPException(status_code=404, detail='Homepage post not found')
    return _response(post)


@admin_router.post('/homepage-posts/reorder', response_model=list[HomepagePostResponse])
async def reorder_homepage_posts(
    payload: HomepagePostReorder,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[HomepagePostResponse]:
    if len(set(payload.ordered_ids)) != len(payload.ordered_ids):
        raise HTTPException(status_code=422, detail='ordered_ids must not contain duplicates')

    pinned_posts = (
        await db.scalars(
            select(HomepagePost)
            .where(HomepagePost.status == HomepageStatus.published, HomepagePost.pinned.is_(True))
            .with_for_update()
        )
    ).all()
    current_ids = {post.id for post in pinned_posts}
    if set(payload.ordered_ids) != current_ids:
        raise HTTPException(status_code=409, detail='ordered_ids must exactly match the currently pinned posts')

    posts_by_id = {post.id: post for post in pinned_posts}
    before_order = [str(post.id) for post in sorted(pinned_posts, key=lambda post: post.pin_order or 0)]
    reordered = []
    for order, post_id in enumerate(payload.ordered_ids, start=1):
        post = posts_by_id[post_id]
        post.pin_order = order
        reordered.append(post)
    await write_audit_log(db, admin.id, 'reordered', 'homepage_post',
                          payload.ordered_ids[0] if payload.ordered_ids else UUID(int=0),
                          '; '.join(post.title for post in reordered) or 'Homepage post order',
                          {'order': {'from': before_order, 'to': [str(value) for value in payload.ordered_ids]}},
                          affected_ids=payload.ordered_ids)
    await db.commit()
    if reordered:
        (await db.scalars(select(HomepagePost).where(HomepagePost.id.in_(payload.ordered_ids)).execution_options(populate_existing=True))).all()
    return [_response(post) for post in reordered]


@public_router.get('/homepage-posts', response_model=list[HomepagePostResponse])
async def list_public_homepage_posts(db: AsyncSession = Depends(get_db)) -> list[HomepagePostResponse]:
    pinned = (
        await db.scalars(
            select(HomepagePost)
            .where(HomepagePost.status == HomepageStatus.published, HomepagePost.pinned.is_(True))
            .order_by(HomepagePost.pin_order.asc())
            .limit(3)
        )
    ).all()
    pinned_ids = [post.id for post in pinned]
    remaining = 3 - len(pinned)
    fallback: list[HomepagePost] = []
    if remaining:
        fallback_query = (
            select(HomepagePost)
            .where(
                HomepagePost.status == HomepageStatus.published,
                HomepagePost.pinned.is_(False),
            )
            .order_by(HomepagePost.published_at.desc(), HomepagePost.created_at.desc(), HomepagePost.id.desc())
            .limit(remaining)
        )
        if pinned_ids:
            fallback_query = fallback_query.where(HomepagePost.id.not_in(pinned_ids))
        fallback = (await db.scalars(fallback_query)).all()
    return [_response(post) for post in [*pinned, *fallback]]


@public_router.get('/homepage-posts/{post_id}', response_model=PublicHomepagePostResponse)
async def get_public_homepage_post(
    post_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> PublicHomepagePostResponse:
    post = await db.scalar(
        select(HomepagePost).where(
            HomepagePost.id == post_id,
            HomepagePost.status == HomepageStatus.published,
        )
    )
    if post is None:
        raise HTTPException(status_code=404, detail='Homepage post not found')
    return PublicHomepagePostResponse(
        id=post.id,
        title=post.title,
        summary=post.summary,
        thumbnail_url=post.thumbnail_url,
        body_html=sanitize_html(post.body_html),
        published_at=post.published_at or post.created_at,
    )
