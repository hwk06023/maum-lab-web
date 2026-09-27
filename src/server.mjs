import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CASES, getCase, publicCase } from './cases.mjs';
import { createState, transition, viewState } from './engine.mjs';
import { createProvider } from './provider.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TTL = 60 * 60 * 1000;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/robots.txt', ['robots.txt', 'text/plain; charset=utf-8']]
]);
const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = value => createHash('sha256').update(value).digest();
function safeEqual(a, b) { return timingSafeEqual(hash(a), hash(b)); }
function readSid(req) { return /(?:^|;\s*)maum_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1]; }

export async function readJson(req) {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw fail(415, 'JSON 요청만 허용됩니다.');
  if (Number(req.headers['content-length']) > 8192) throw fail(413, '요청이 너무 큽니다.');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8192) throw fail(413, '요청이 너무 큽니다.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw fail(400, '요청 형식을 확인해 주세요.'); }
}

export async function createApp(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const origin = options.origin ?? process.env.APP_ORIGIN ?? `http://localhost:${port}`;
  if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error('APP_ORIGIN must be an origin without a trailing slash');
  const secure = options.secureCookies ?? (process.env.COOKIE_SECURE === 'true' || origin.startsWith('https://'));
  const proxySecret = options.proxySecret ?? process.env.MAUM_PROXY_SECRET ?? '';
  const requireProxy = options.requireProxy ?? (process.env.REQUIRE_PROXY_SECRET === 'true');
  const serveStatic = options.serveStatic ?? (process.env.SERVE_STATIC !== 'false');
  if ((requireProxy || proxySecret) && proxySecret.length < 32) throw new Error('MAUM_PROXY_SECRET must contain at least 32 characters');
  const mode = options.mode ?? process.env.LLM_MODE ?? 'demo';
  if (!['demo', 'live'].includes(mode)) throw new Error('LLM_MODE must be demo or live');
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const accessCode = options.accessCode ?? process.env.PILOT_ACCESS_CODE ?? '';
  if (mode === 'live' && (!apiKey || accessCode.length < 16)) throw new Error('Live mode requires OPENAI_API_KEY and a PILOT_ACCESS_CODE of at least 16 characters');
  const maxSessions = Number(options.maxSessions ?? process.env.MAX_SESSIONS ?? 100);
  const maxCalls = Number(process.env.MAX_LLM_CALLS_PER_HOUR ?? 100);
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || !Number.isInteger(maxCalls) || maxCalls < 1) throw new Error('Invalid limit configuration');
  const sessions = new Map();
  let budget = { until: Date.now() + TTL, calls: 0 };
  let starts = { until: Date.now() + 60_000, count: 0 };
  const spend = () => {
    if (Date.now() > budget.until) budget = { until: Date.now() + TTL, calls: 0 };
    if (++budget.calls > maxCalls) throw fail(429, '이 서버의 AI 호출 한도에 도달했습니다. 운영자에게 문의해 주세요.');
  };
  const provider = options.provider ?? (mode === 'live' ? await createProvider({ apiKey, model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', spend }) : null);
  const sweep = () => { for (const [id, value] of sessions) if (value.expiresAt <= Date.now() && !value.busy) sessions.delete(id); };
  const timer = setInterval(sweep, 60_000);
  timer.unref();
  const cookie = (id, expired = false) => `maum_session=${expired ? '' : id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expired ? 0 : 3600}${secure ? '; Secure' : ''}`;
  const headers = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'Cache-Control': 'no-store'
  };
  if (secure) headers['Strict-Transport-Security'] = 'max-age=31536000';
  const server = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, origin);
      const method = req.method ?? 'GET';
      const publicHealth = url.pathname === '/api/health' && method === 'GET';
      const trustedProxy = Boolean(proxySecret) && typeof req.headers['x-maum-proxy-secret'] === 'string'
        && safeEqual(req.headers['x-maum-proxy-secret'], proxySecret);
      if (proxySecret && url.pathname.startsWith('/api/') && !publicHealth && !trustedProxy)
        throw fail(403, '허용되지 않은 서버 연결입니다.');
      // The authenticated web proxy checks browser Origin before forwarding.
      if (!trustedProxy && ['POST', 'DELETE', 'PUT', 'PATCH'].includes(method) && req.headers.origin !== origin)
        throw fail(403, '허용되지 않은 출처의 요청입니다.');
      if (url.pathname === '/api/health' && method === 'GET') return json(200, { ok: true, version: '0.1.0', mode });
      if (url.pathname === '/api/cases' && method === 'GET') return json(200, {
        cases: CASES.map(publicCase), mode, requiresAccessCode: mode === 'live',
        disclaimer: '성인 교육·연습용 가상 시나리오입니다. 실제 상담·진단·치료 서비스가 아닙니다.'
      });
      if (url.pathname === '/api/session' && method === 'POST') {
        if (Date.now() > starts.until) starts = { until: Date.now() + 60_000, count: 0 };
        if (++starts.count > 30) throw fail(429, '새 연습 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
        const body = await readJson(req);
        const c = getCase(body.caseId);
        if (!c) throw fail(404, '사연을 찾을 수 없습니다.');
        if (body.consent !== true) throw fail(400, '가상 연습 및 개인정보 안내를 확인해 주세요.');
        if (mode === 'live' && (body.aiConsent !== true || typeof body.accessCode !== 'string' || !safeEqual(body.accessCode, accessCode)))
          throw fail(403, 'AI 전송 안내 동의와 올바른 파일럿 접근 코드가 필요합니다.');
        sweep();
        const oldSid = readSid(req);
        if (oldSid && sessions.get(oldSid)?.busy) throw fail(409, '현재 응답을 처리 중입니다.');
        if (sessions.size >= maxSessions && !sessions.has(oldSid)) throw fail(503, '사용 가능한 연습 세션이 가득 찼습니다.');
        if (oldSid) sessions.delete(oldSid);
        const sid = randomBytes(24).toString('hex');
        const state = createState(c, mode);
        sessions.set(sid, { state, busy: false, expiresAt: Date.now() + TTL, requests: new Map(), calls: [] });
        res.setHeader('Set-Cookie', cookie(sid));
        return json(201, viewState(c, state));
      }
      if (url.pathname === '/api/session' && method === 'DELETE') {
        const sid = readSid(req);
        const session = sid ? sessions.get(sid) : null;
        if (session?.busy) throw fail(409, '현재 응답 처리 후 종료해 주세요.');
        if (sid) sessions.delete(sid);
        res.setHeader('Set-Cookie', cookie('', true));
        return json(200, { deleted: true });
      }
      if (url.pathname === '/api/session' || url.pathname === '/api/turn') {
        const sid = readSid(req);
        const session = sid ? sessions.get(sid) : null;
        if (!session || session.expiresAt <= Date.now()) { if (sid) sessions.delete(sid); throw fail(401, '세션이 없거나 만료되었습니다. 새 연습을 시작해 주세요.'); }
        const c = getCase(session.state.caseId);
        if (url.pathname === '/api/session' && method === 'GET') return json(200, viewState(c, session.state));
        if (url.pathname !== '/api/turn' || method !== 'POST') throw fail(405, '지원하지 않는 요청 방식입니다.');
        const body = await readJson(req);
        if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.requestId)) throw fail(400, '요청 ID가 필요합니다.');
        if (session.requests.has(body.requestId)) return json(200, session.requests.get(body.requestId));
        if (session.busy) throw fail(409, '이전 응답을 처리 중입니다.');
        if (body.version !== session.state.version) throw fail(409, '다른 창에서 진행 상태가 바뀌었습니다. 새로고침해 주세요.');
        if (!body.action || !['say', 'support', 'resume'].includes(body.action.kind)) throw fail(400, '올바른 행동을 선택해 주세요.');
        session.calls = session.calls.filter(t => Date.now() - t < 60_000);
        if (session.calls.length >= 20) throw fail(429, '대화 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.');
        session.calls.push(Date.now());
        session.busy = true;
        try {
          const next = await transition(c, session.state, body.action, provider);
          // No partial state updates on provider failure.
          session.state = next;
          const view = viewState(c, next);
          session.requests.set(body.requestId, view);
          if (session.requests.size > 8) session.requests.delete(session.requests.keys().next().value);
          return json(200, view);
        } finally { session.busy = false; }
      }
      if (serveStatic && method === 'GET' && assets.has(url.pathname)) {
        const [file, mime] = assets.get(url.pathname);
        const data = await readFile(path.join(ROOT, 'legacy-web', file));
        res.writeHead(200, { 'Content-Type': mime });
        return res.end(data);
      }
      throw fail(404, '페이지를 찾을 수 없습니다.');
    } catch (error) {
      // Never log prompts, input, access codes, API keys, or provider response bodies.
      const status = Number.isInteger(error.status) ? error.status : 502;
      return json(status, { error: status === 502 ? 'AI 응답을 완료하지 못했습니다. 진행 상태는 바꾸지 않았습니다. 잠시 후 다시 시도해 주세요.' : error.message });
    }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 10_000;
  server.on('close', () => clearInterval(timer));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile(path.join(ROOT, '.env.local'));
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = await createApp({ port });
  server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
    console.log(`마음연습실 · ${process.env.LLM_MODE ?? 'demo'} · http://localhost:${port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
