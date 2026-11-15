import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function setup() {
  const backend = path.resolve(process.cwd(), '../backend');
  execFileSync(path.join(backend, '.venv/Scripts/python.exe'), ['scripts/e2e_db.py', '--reset'], {
    cwd: backend, stdio: 'pipe', env: process.env,
  });
}
