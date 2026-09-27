const METHODS = new Map([
  ['/api/health', ['GET']], ['/api/cases', ['GET']],
  ['/api/session', ['GET', 'POST', 'DELETE']], ['/api/turn', ['POST']]
]);
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};
const errorResponse = (status, error) => new Response(JSON.stringify({ error }), { status, headers: HEADERS });
async function boundedBody(request) {
  if (Number(request.headers.get('content-length')) > 8192) throw 413;
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw 413; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(chunks);
  if (body.length && !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw 415;
  return body.length ? body : undefined;
}
export function createProxy(options = {}) {
  return async function proxy(request) {
    const incoming = new URL(request.url);
    const methods = METHODS.get(incoming.pathname);
    if (!methods) return errorResponse(404, '페이지를 찾을 수 없습니다.');
    if (!methods.includes(request.method)) return errorResponse(405, '지원하지 않는 요청 방식입니다.');
    // Use the actual request URL, never untrusted forwarded-host headers.
    if (['POST', 'DELETE'].includes(request.method) && request.headers.get('origin') !== incoming.origin)
      return errorResponse(403, '허용되지 않은 출처의 요청입니다.');
    const base = options.backendUrl ?? process.env.MAUM_BACKEND_URL;
    const secret = options.secret ?? process.env.MAUM_PROXY_SECRET;
    let backend;
    try {
      backend = new URL(base);
      const local = options.allowLocalhost === true && ['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname);
      if ((backend.protocol !== 'https:' && !(local && backend.protocol === 'http:')) || backend.username || backend.password
        || backend.pathname !== '/' || backend.search || backend.hash || !secret || secret.length < 32) throw new Error();
    } catch { return errorResponse(503, '연습실 서버를 준비하고 있습니다. 잠시 후 다시 이용해 주세요.'); }
    let body;
    try { body = await boundedBody(request); }
    catch (error) { return errorResponse(error === 413 ? 413 : 415, error === 413 ? '요청이 너무 큽니다.' : 'JSON 요청만 허용됩니다.'); }
    const headers = { 'x-maum-proxy-secret': secret };
    if (body) headers['content-type'] = 'application/json';
    const sid = /(?:^|;\s*)maum_session=([a-f0-9]{48})(?:;|$)/.exec(request.headers.get('cookie') ?? '')?.[1];
    if (sid) headers.cookie = `maum_session=${sid}`;
    try {
      const response = await (options.fetchImpl ?? fetch)(new URL(incoming.pathname, backend), {
        method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(55_000)
      });
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error();
      const responseHeaders = new Headers(HEADERS);
      const cookies = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')].filter(Boolean);
      for (const cookie of cookies) {
        if (!cookie.startsWith('maum_session=') || /;\s*Domain=/i.test(cookie)) continue;
        responseHeaders.append('Set-Cookie', incoming.protocol === 'https:' && !/;\s*Secure(?:;|$)/i.test(cookie) ? `${cookie}; Secure` : cookie);
      }
      return new Response(await response.arrayBuffer(), { status: response.status, headers: responseHeaders });
    } catch (error) { console.error('Backend proxy failed', { name: error?.name, code: error?.cause?.code }); return errorResponse(502, '서버 응답을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  };
}
export const proxy = createProxy();
