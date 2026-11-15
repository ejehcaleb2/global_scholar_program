from fastapi import APIRouter, HTTPException

from app.core.legal import CurrentLegalDocuments, LegalDocument, LEGAL_VERSIONS, document

router = APIRouter(prefix='/legal', tags=['legal'])


@router.get('/current', response_model=CurrentLegalDocuments)
async def current_documents() -> CurrentLegalDocuments:
    return CurrentLegalDocuments(documents=[document(kind).model_dump(exclude={'html'}) for kind in LEGAL_VERSIONS])


@router.get('/{document_type}', response_model=LegalDocument)
async def legal_document(document_type: str) -> LegalDocument:
    if document_type not in {'terms', 'privacy'}:
        raise HTTPException(404, detail='Legal document not found')
    return document('tos' if document_type == 'terms' else 'privacy')
