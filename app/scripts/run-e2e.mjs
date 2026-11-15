import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import environmentHelper from './e2e-environment.mjs';
const { appRoot, backendRoot, python, e2eEnvironment } = environmentHelper;

const preparation = spawnSync(python, ['scripts/e2e_db.py', '--reset'], { cwd: backendRoot, encoding: 'utf8' });
if (preparation.status !== 0) {
  console.error('Isolated E2E database preparation failed; no credentials are printed.');
  process.exit(1);
}
const values = e2eEnvironment();
Object.assign(process.env, values);
const artifact = resolve(appRoot, 'test-artifacts/e2e-run.log');
mkdirSync(resolve(appRoot, 'test-artifacts'), { recursive: true });
writeFileSync(artifact, '');
const sensitive = [values.GSP_E2E_PASSWORD, values.JWT_SECRET, new URL(values.DATABASE_URL.replace('postgresql+asyncpg:', 'postgresql:')).password].filter(Boolean);
function log(line) {
  for (const value of sensitive) line = line.split(value).join('[redacted]');
  line = line.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted token]');
  process.stdout.write(line + '\n');
  appendFileSync(artifact, line + '\n');
}
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
  cwd: appRoot, env: { ...process.env, ...values, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['inherit', 'pipe', 'pipe'],
});
for (const stream of [child.stdout, child.stderr]) {
  let pending = '';
  stream.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/); pending = lines.pop() ?? '';
    for (const line of lines) log(line);
  });
  stream.on('end', () => { if (pending) log(pending); });
}
child.on('exit', (code) => {
  const cleanup = spawnSync(python, ['scripts/e2e_db.py', '--teardown'], { cwd: backendRoot, env: { ...process.env, ...values }, encoding: 'utf8' });
  if (cleanup.stdout) log(cleanup.stdout.trim());
  process.exitCode = code || cleanup.status || 0;
});
