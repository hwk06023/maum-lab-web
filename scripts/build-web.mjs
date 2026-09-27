import { readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const expected = ['app.js', 'favicon.svg', 'index.html', 'robots.txt', 'styles.css'];
const actual = (await readdir(path.join(root, 'public'))).sort();
if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error('Unexpected public assets. Review the deployment boundary.');
for (const route of ['cases', 'health', 'session', 'turn']) await access(path.join(root, 'api', `${route}.mjs`));
console.log('Vercel build ready: five public assets and four stateless API proxy routes.');
