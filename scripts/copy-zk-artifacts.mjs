import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'managed', 'counter');

for (const dir of ['keys', 'zkir']) {
  const from = path.join(source, dir);
  const to = path.join(root, 'public', dir);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

console.log('Copied managed/counter keys and zkir into public/');
