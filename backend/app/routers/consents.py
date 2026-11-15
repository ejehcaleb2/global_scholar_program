from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_authenticated
from app.core.legal import LEGAL_VERSIONS, LegalSummary, document
from app.models.gsp_models import Consent, ConsentType, User

router = APIRouter(prefix='/consents', tags=['consents'])


class ConsentDocument(LegalSummary):
    accepted: bool


class ConsentStatus(BaseModel):
    documents: list[ConsentDocument]
    complete: bool


class ConsentAcceptance(BaseModel):
    model_config = ConfigDict(extra='forbid')
    versions: dict[Literal['tos', 'privacy'], str]


async def status_for(user_id, db: AsyncSession) -> ConsentStatus:
    accepted = set((await db.execute(select(Consent.consent_type, Consent.version).where(Consent.user_id == user_id))).all())
    documents = [ConsentDocument(**document(kind).model_dump(exclude={'html'}), accepted=(ConsentType(kind), version) in accepted) for kind, version in LEGAL_VERSIONS.items()]
    return ConsentStatus(documents=documents, complete=all(item.accepted for item in documents))


@router.get('/status', response_model=ConsentStatus)
async def consent_status(user: User = Depends(require_authenticated), db: AsyncSession = Depends(get_db)) -> ConsentStatus:
    return await status_for(user.id, db)


@router.post('', response_model=ConsentStatus)
async def accept_consents(payload: ConsentAcceptance, user: User = Depends(require_authenticated), db: AsyncSession = Depends(get_db)) -> ConsentStatus:
    if payload.versions != LEGAL_VERSIONS:
        raise HTTPException(409, detail={'code': 'version_mismatch'})
    # Serialize repeat submissions for this account without changing historical acceptances.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    existing = await status_for(user.id, db)
    for item in existing.documents:
        if not item.accepted:
            db.add(Consent(user_id=user.id, consent_type=ConsentType(item.type), version=item.version))
    await db.commit()
    return await status_for(user.id, db)
