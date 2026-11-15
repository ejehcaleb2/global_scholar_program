import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function teardown() {
  const backend = path.resolve(process.cwd(), '../backend');
  const output = execFileSync(path.join(backend, '.venv/Scripts/python.exe'), ['scripts/e2e_db.py', '--teardown'], {
    cwd: backend, stdio: 'pipe', env: process.env, encoding: 'utf8',
  });
  console.log(output.trim());
}
