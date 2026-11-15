import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// npm and the guarded wrapper always run this harness from app/.
const appRoot = resolve(process.cwd());
const backendRoot = resolve(appRoot, '../backend');
const python = resolve(backendRoot, '.venv/Scripts/python.exe');

function e2eEnvironment() {
  const text = readFileSync(resolve(appRoot, '../.env.e2e'), 'utf8');
  const values = Object.fromEntries(text.split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), JSON.parse(line.slice(separator + 1))];
  }));
  if (values.GSP_E2E_API_PORT !== '8101' || values.GSP_E2E_FRONTEND_PORT !== '3101'
      || values.GSP_E2E_BASE_URL !== 'http://127.0.0.1:3101'
      || values.GSP_E2E_API_URL !== 'http://127.0.0.1:8101'
      || decodeURIComponent(new URL(values.DATABASE_URL.replace('postgresql+asyncpg:', 'postgresql:')).pathname) !== '/Global_scholar_e2e') {
    throw new Error('Refusing a browser-test environment outside the isolated URLs/database.');
  }
  for (const key of ['GSP_E2E_BASE_URL', 'GSP_E2E_API_URL', 'GSP_E2E_FRONTEND_PORT', 'GSP_E2E_API_PORT', 'DATABASE_URL']) {
    if (process.env[key] && process.env[key] !== values[key]) {
      throw new Error(`Refusing conflicting E2E setting: ${key}`);
    }
  }
  return values;
}

const environmentHelper = { appRoot, backendRoot, python, e2eEnvironment };
export default environmentHelper;
