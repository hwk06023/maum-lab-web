import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const roots = ['src', 'legacy-web', 'scripts', 'tests', 'lib'];
let count = 0;
for (const root of roots) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(?:mjs|js)$/.test(entry.name)) continue;
    const file = path.join(root, entry.name);
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
    count++;
  }
}
console.log(`Syntax check passed: ${count} JavaScript modules`);
