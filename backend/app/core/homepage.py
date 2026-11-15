from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gsp_models import HomepagePost, HomepageStatus


async def next_pin_order(db: AsyncSession, exclude_id=None) -> int:
    query = select(HomepagePost.pin_order).where(
        HomepagePost.status == HomepageStatus.published,
        HomepagePost.pinned.is_(True),
        HomepagePost.pin_order.is_not(None),
    )
    if exclude_id is not None:
        query = query.where(HomepagePost.id != exclude_id)
    orders = set((await db.scalars(query)).all())
    for order in range(1, 4):
        if order not in orders:
            return order
    raise ValueError('Three homepage posts are already pinned')


async def pinned_count(db: AsyncSession, exclude_id=None) -> int:
    query = select(HomepagePost.id).where(
        HomepagePost.status == HomepageStatus.published,
        HomepagePost.pinned.is_(True),
    )
    if exclude_id is not None:
        query = query.where(HomepagePost.id != exclude_id)
    return len((await db.scalars(query)).all())
