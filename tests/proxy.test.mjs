import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { createProxy } from '../lib/proxy.mjs';
const secret = 'test-only-shared-proxy-secret-0123456789';
const site = 'https://maum.example';
let server, backend, proxy;
const request = (path, { method = 'GET', body, cookie, origin = site } = {}) => new Request(site + path, {
  method, headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined
});
before(async () => {
  server = await createApp({ origin: 'http://backend.invalid', mode: 'demo', proxySecret: secret, requireProxy: true, secureCookies: true, serveStatic: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  backend = `http://127.0.0.1:${server.address().port}`;
  proxy = createProxy({ backendUrl: backend, secret, allowLocalhost: true });
});
after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
test('Fly requires a strong proxy secret and exposes only health without it', async () => {
  await assert.rejects(createApp({ requireProxy: true, proxySecret: '' }), /32 characters/);
  await assert.rejects(createApp({ proxySecret: 'short' }), /32 characters/);
  assert.equal((await fetch(backend + '/api/health')).status, 200);
  assert.equal((await fetch(backend + '/api/cases')).status, 403);
  assert.equal((await fetch(backend + '/api/session', { headers: { 'x-maum-proxy-secret': 'wrong' } })).status, 403);
  assert.equal((await fetch(backend + '/')).status, 404);
});
test('Vercel can build before backend configuration, while API fails closed', async () => {
  const unconfigured = createProxy({ backendUrl: '', secret: '' });
  assert.equal((await unconfigured(request('/api/cases'))).status, 503);
  for (const backendUrl of ['http://untrusted.example', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test?key=x']) {
    assert.equal((await createProxy({ backendUrl, secret })(request('/api/cases'))).status, 503);
  }
});
test('proxy returns only public cases and disables CDN response caching', async () => {
  const response = await proxy(request('/api/cases'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.cases.length, 6);
  assert.ok(!('clues' in data.cases[0]));
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
});
test('session survives fresh serverless proxy instances and preserves duplicate detection', async () => {
  const created = await proxy(request('/api/session', { method: 'POST', body: { caseId: 'minjun', consent: true } }));
  assert.equal(created.status, 201);
  const setCookie = created.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly; SameSite=Strict/);
  assert.match(setCookie, /; Secure/);
  assert.ok(!setCookie.includes('Domain='));
  const cookie = setCookie.split(';')[0];
  const secondInstance = createProxy({ backendUrl: backend, secret, allowLocalhost: true });
  assert.equal((await secondInstance(request('/api/session', { cookie }))).status, 200);
  const body = { requestId: 'proxy-request-0001', version: 0, action: { kind: 'say', text: '혼자 새로운 문제를 풀 때는 어때?' } };
  const first = await (await secondInstance(request('/api/turn', { method: 'POST', body, cookie }))).json();
  const retry = await (await proxy(request('/api/turn', { method: 'POST', body, cookie }))).json();
  assert.deepEqual(retry, first);
  assert.equal(first.notes.length, 1);
  const deleted = await proxy(request('/api/session', { method: 'DELETE', cookie }));
  assert.equal(deleted.status, 200);
  assert.match(deleted.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await proxy(request('/api/session', { cookie }))).status, 401);
});
test('cross-origin and missing-origin writes are blocked before forwarding', async () => {
  for (const origin of ['https://attacker.example', 'null', '']) {
    assert.equal((await proxy(request('/api/session', { method: 'POST', origin, body: { caseId: 'minjun', consent: true } }))).status, 403);
    assert.equal((await proxy(request('/api/session', { method: 'DELETE', origin }))).status, 403);
  }
});
test('preview domains work without weakening browser origin validation', async () => {
  const response = await proxy(new Request('https://maum-preview.vercel.app/api/session', {
    method: 'POST', headers: { origin: 'https://maum-preview.vercel.app', 'content-type': 'application/json' },
    body: JSON.stringify({ caseId: 'minjun', consent: true })
  }));
  assert.equal(response.status, 201);
});
test('proxy rejects unknown routes, methods and oversized bodies', async () => {
  assert.equal((await proxy(request('/api/admin'))).status, 404);
  assert.equal((await proxy(request('/api/cases', { method: 'DELETE' }))).status, 405);
  assert.equal((await proxy(request('/api/session', { method: 'POST', body: { pad: 'a'.repeat(9000) } }))).status, 413);
  assert.equal((await proxy(request('/api/turn', { method: 'POST', body: { text: 'a'.repeat(513 * 1024) } }))).status, 413);
  assert.equal((await proxy(new Request(site + '/api/turn', { method: 'POST', headers: { origin: site }, body: 'plain text' }))).status, 415);
});
test('only the session cookie and configured secret reach the backend', async () => {
  const sid = 'a'.repeat(48);
  const inspecting = createProxy({ backendUrl: 'https://backend.example', secret, fetchImpl: async (url, options) => {
    assert.equal(url.href, 'https://backend.example/api/session');
    assert.equal(options.headers.cookie, `maum_session=${sid}`);
    assert.equal(options.headers['x-maum-proxy-secret'], secret);
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.redirect, 'error');
    return Response.json({ ok: true });
  }});
  assert.equal((await inspecting(request('/api/session?ignored=1', { cookie: `other=private; maum_session=${sid}; extra=private` }))).status, 200);
});
test('upstream errors and HTML responses do not expose internal information', async () => {
  for (const fetchImpl of [async () => { throw new Error(secret); }, async () => new Response('<html>internal failure</html>')]) {
    const response = await createProxy({ backendUrl: 'https://backend.example', secret, fetchImpl })(request('/api/cases'));
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes('internal failure'));
  }
});
