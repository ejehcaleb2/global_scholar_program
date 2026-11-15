"""Versioned drafting skeletons; production refuses unreviewed documents."""
from pathlib import Path
from typing import Literal

import markdown
from pydantic import BaseModel

from app.core.content import sanitize_html

LEGAL_VERSIONS = {'tos': '2026-11-01', 'privacy': '2026-11-01'}
EFFECTIVE_DATES = {'tos': '2026-11-01', 'privacy': '2026-11-01'}
DIRECTORY = Path(__file__).resolve().parents[1] / 'legal'
REVIEW_MARKER = 'PENDING_LEGAL_REVIEW'


class LegalSummary(BaseModel):
    type: Literal['tos', 'privacy']
    slug: Literal['terms', 'privacy']
    version: str
    effective_date: str
    review_pending: bool


class LegalDocument(LegalSummary):
    html: str


class CurrentLegalDocuments(BaseModel):
    documents: list[LegalSummary]


def document(kind: Literal['tos', 'privacy']) -> LegalDocument:
    slug = 'terms' if kind == 'tos' else 'privacy'
    source = (DIRECTORY / f'{slug}.en.md').read_text(encoding='utf-8')
    return LegalDocument(type=kind, slug=slug, version=LEGAL_VERSIONS[kind], effective_date=EFFECTIVE_DATES[kind], review_pending=REVIEW_MARKER in source, html=sanitize_html(markdown.markdown(source)))


def ensure_legal_ready(environment: str) -> None:
    if environment == 'production' and any(REVIEW_MARKER in (DIRECTORY / f'{kind}.en.md').read_text(encoding='utf-8') for kind in ['terms', 'privacy']):
        raise RuntimeError('Legal documents require review: remove PENDING_LEGAL_REVIEW only after owner approval.')
