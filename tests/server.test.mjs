import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
let server, base;
const origin = 'http://localhost';
async function request(path, { method = 'GET', body, cookie, customOrigin = origin } = {}) {
  return fetch(base + path, { method, headers: {
    Origin: customOrigin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {})
  }, body: body ? JSON.stringify(body) : undefined });
}
async function start() {
  const response = await request('/api/session', { method: 'POST', body: { caseId: 'minjun', consent: true } });
  assert.equal(response.status, 201);
  return { cookie: response.headers.get('set-cookie').split(';')[0], data: await response.json() };
}
before(async () => {
  server = await createApp({ origin, mode: 'demo' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
test('homepage and public catalogue are available', async () => {
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /마음연습실/);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  const data = await (await request('/api/cases')).json();
  assert.equal(data.cases.length, 6);
  assert.equal(data.mode, 'demo');
  assert.ok(!('clues' in data.cases[0]));
});
test('session creation requires consent and origin checks', async () => {
  const badOrigin = await request('/api/session', { method: 'POST', body: { caseId: 'minjun', consent: true }, customOrigin: 'https://attacker.example' });
  assert.equal(badOrigin.status, 403);
  const noConsent = await request('/api/session', { method: 'POST', body: { caseId: 'minjun' } });
  assert.equal(noConsent.status, 400);
});
test('cookies are host-only, HttpOnly, SameSite=Strict', async () => {
  const res = await request('/api/session', { method: 'POST', body: { caseId: 'minjun', consent: true } });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.ok(!cookie.includes('Domain='));
});
test('state is server-owned; request IDs prevent duplicated turns', async () => {
  const { cookie } = await start();
  const payload = { requestId: 'test-duplicate-0001', version: 0, stage: 'complete', action: { kind: 'say', text: '혼자 새로운 문제를 풀 때는 어때?' } };
  const first = await request('/api/turn', { method: 'POST', body: payload, cookie });
  assert.equal(first.status, 200);
  const a = await first.json();
  assert.equal(a.stage, 'listen');
  assert.equal(a.notes.length, 1);
  const b = await (await request('/api/turn', { method: 'POST', body: payload, cookie })).json();
  assert.deepEqual(a, b);
  const stale = await request('/api/turn', { method: 'POST', body: { ...payload, requestId: 'test-stale-0001' }, cookie });
  assert.equal(stale.status, 409);
});
test('deleting a session removes its server state', async () => {
  const { cookie } = await start();
  assert.equal((await request('/api/session', { method: 'DELETE', cookie })).status, 200);
  assert.equal((await request('/api/session', { cookie })).status, 401);
});
test('server modules, prompts and .env are not served as static files', async () => {
  for (const path of ['/src/cases.mjs', '/prompts/judge.md', '/.env.local']) assert.equal((await request(path)).status, 404);
});
test('oversized requests are rejected', async () => {
  const { cookie } = await start();
  const res = await request('/api/turn', { method: 'POST', cookie, body: { text: 'x'.repeat(9000) } });
  assert.equal(res.status, 413);
});
test('live mode fails closed without credentials and pilot access control', async () => {
  await assert.rejects(createApp({ mode: 'live', apiKey: '', accessCode: '' }), /Live mode requires/);
  await assert.rejects(createApp({ mode: 'live', apiKey: 'fake', accessCode: 'short' }), /Live mode requires/);
});
