"""Review development fixtures; deletion requires reviewed IDs and --execute.

AGENTS.md: seed data and unknown accounts are protected. This batch invokes
only dry-run mode. No credentials, password columns, or tokens are reported.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter
import json
from pathlib import Path
import re
import sys
from uuid import UUID

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'backend'))

from sqlalchemy import String, cast, delete, func, select
from app.db.base import Base
from app.db.session import AsyncSessionLocal, engine
import app.models.gsp_models  # noqa: F401 - register all domain metadata

PREFIX = re.compile(r'(?:^|[^a-z0-9])(?:seed-h1|a1-|b1-|b2-|b3-|h1-|l1b-|l1-|probe-)', re.I)
FIXTURE = re.compile(r'^(?:b3-(?:course|module|lesson)-\d{13}(?:-revised)?|h1-(?:button|form)-\d{13}|h1-e2e-(?:thumbnail-)?\d{13}(?:-peer)?)$')


def classification(label: str) -> tuple[str, str]:
    if re.fullmatch(r'seed-h1-student-(?:0[1-9]|1\d|2[0-5])@gsp\.test', label):
        return 'SEEDED', 'scripts/seed_data.py: seed_admin_stage_h1, indexes 1..25'
    if re.fullmatch(r'gsp-stage-a1-seed-0[1-6]@gsp\.test', label):
        return 'SEEDED', 'scripts/seed_data.py: seed_admin_stage_a1, indexes 1..6'
    if label.startswith('seed-h1-'):
        return 'SEEDED', 'seed_admin_stage_h1 label namespace; protected'
    if FIXTURE.fullmatch(label):
        return 'TEST FIXTURE', 'tests/e2e: course-manager-routes, homepage-pin-flow, button-pending or post-form exact timestamp template'
    return 'UNKNOWN', 'No exact seed/test creation template proven; protected'


async def inventory(session):
    result = []
    for table in Base.metadata.sorted_tables:
        names = [table.c[name] for name in ('name', 'email', 'title', 'full_name') if name in table.c]
        if table.name == 'audit_logs':
            names.append(table.c.metadata['label'].as_string().label('label'))
        if not names:
            continue
        key = next(iter(table.primary_key.columns))
        columns = [key, *names]
        for name in ('created_at', 'role'):
            if name in table.c:
                columns.append(table.c[name])
        rows = (await session.execute(select(*columns))).mappings().all()
        for row in rows:
            labels = [str(row[column.key]) for column in names if row[column.key] is not None]
            matches = [label for label in labels if PREFIX.search(label)]
            if not matches:
                continue
            preferred = next((label for label in matches if classification(label)[0] == 'SEEDED'), matches[0])
            kind, proof = classification(preferred)
            record = {'table': table.name, 'id': str(row[key.key]), 'label': preferred,
                      'classification': kind, 'provenance': proof}
            if table.name == 'users':
                record.update(email=row['email'], role=str(getattr(row['role'], 'value', row['role'])),
                              created_at=str(row['created_at']))
                for child, output in [('lesson_progress', 'has_progress'), ('service_requests', 'has_service_requests')]:
                    child_table = Base.metadata.tables[child]
                    record[output] = bool(await session.scalar(select(func.count()).select_from(child_table).where(
                        child_table.c.user_id == row[key.key])))
            elif 'created_at' in row:
                record['created_at'] = str(row['created_at'])
            result.append(record)
    return result


async def orphan_uploads(session):
    references = []
    for table in Base.metadata.sorted_tables:
        for column in table.c:
            if any(word in column.name.lower() for word in ('password', 'token', 'secret')):
                continue
            if str(column.type).startswith(('VARCHAR', 'TEXT', 'JSON')):
                references.extend(str(value) for value in (await session.execute(select(cast(column, String)))).scalars()
                                  if value is not None)
    files = []
    upload = ROOT/'backend/uploads'
    for path in sorted(upload.rglob('*')):
        if path.is_file() and not any(path.name in value or path.relative_to(upload).as_posix() in value for value in references):
            files.append({'path': path.relative_to(upload).as_posix(), 'bytes': path.stat().st_size})
    return files


async def execute_reviewed(session, records, ids_file: Path):
    requested = json.loads(ids_file.read_text(encoding='utf-8-sig'))
    eligible = {(row['table'], row['id']) for row in records if row['classification'] == 'TEST FIXTURE'}
    selected = {name: set(values) for name, values in requested.items()}
    for name, values in selected.items():
        for value in values:
            UUID(value)
            if (name, value) not in eligible:
                raise ValueError('Refusing an unknown/seeded/non-fixture record in the IDs file')
    # Expand dependencies using declared FKs, never a name/prefix deletion.
    changed = True
    while changed:
        changed = False
        for table in Base.metadata.sorted_tables:
            key = next(iter(table.primary_key.columns))
            for foreign in table.foreign_keys:
                parent = selected.get(foreign.column.table.name, set())
                if not parent:
                    continue
                children = set(str(value) for value in (await session.execute(select(key).where(
                    cast(foreign.parent, String).in_(parent)))).scalars())
                existing = selected.setdefault(table.name, set())
                if children - existing:
                    existing.update(children)
                    changed = True
    audit = Base.metadata.tables['audit_logs']
    entity_ids = set().union(*selected.values()) if selected else set()
    audit_ids = set(str(value) for value in (await session.execute(select(audit.c.id).where(
        audit.c.entity_id.in_(entity_ids)))).scalars())
    selected.setdefault('audit_logs', set()).update(audit_ids)
    ordered = [audit, *[table for table in reversed(Base.metadata.sorted_tables) if table.name != 'audit_logs']]
    for table in ordered:
        values = selected.get(table.name, set())
        if values:
            before = await session.scalar(select(func.count()).select_from(table))
            key = next(iter(table.primary_key.columns))
            result = await session.execute(delete(table).where(cast(key, String).in_(values)))
            after = await session.scalar(select(func.count()).select_from(table))
            print(f'{table.name}: before={before}; removed={result.rowcount}; after={after}')
    await session.commit()


async def run(args):
    async with AsyncSessionLocal() as session:
        records = await inventory(session)
        if args.execute:
            await execute_reviewed(session, records, args.ids_file)
        else:
            files = await orphan_uploads(session)
            report = {'mode': 'DRY RUN - nothing deleted', 'records': records, 'orphan_upload_candidates': files}
            path = ROOT/'.work/cleanup-test-data-dry-run.json'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(report, indent=2), encoding='utf-8')
            md = ['# Development cleanup dry run', '', 'Following AGENTS.md. No rows or files deleted.', '',
                  '| Table | ID | Label/email | Classification | Created | Role | Progress | Requests | Provenance |',
                  '|---|---|---|---|---|---|---|---|---|']
            for row in records:
                md.append('| '+' | '.join(str(row.get(key, '')).replace('|', '\\|') for key in
                          ('table', 'id', 'label', 'classification', 'created_at', 'role', 'has_progress', 'has_service_requests', 'provenance'))+' |')
            md.extend(['', '## Unreferenced upload candidates', '', '| File | Bytes |', '|---|---:|'])
            md.extend('| '+row['path']+' | '+str(row['bytes'])+' |' for row in files)
            (ROOT/'.work/cleanup-test-data-dry-run.md').write_text('\n'.join(md)+'\n', encoding='utf-8')
            print('DRY RUN: records='+str(len(records))+'; classes='+str(dict(Counter(row['classification'] for row in records))))
            print('Orphan upload candidates='+str(len(files))+'; full reports=.work/cleanup-test-data-dry-run.{md,json}')
    await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--ids-file', type=Path)
    args = parser.parse_args()
    if args.execute and args.ids_file is None:
        parser.error('--execute requires an explicitly reviewed --ids-file')
    asyncio.run(run(args))


if __name__ == '__main__':
    main()
