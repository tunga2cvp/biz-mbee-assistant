const EXTENSION_SESSION_SECONDS = 3600;
const authEncoder = new TextEncoder();
const toBase64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const authJson = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

async function readLimitedJson(request, maxBytes) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  let size = 0;
  const parts = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error('too_large'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function constantEqual(a, b) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
}

async function checkExtensionPassword(password, stored) {
  const [algorithm, iterationsText, saltText, expectedText] = String(stored || '').split('$');
  const iterations = Number(iterationsText);
  if (algorithm !== 'pbkdf2-sha256' || iterations !== 100000 || !saltText || !expectedText) return false;
  const material = await crypto.subtle.importKey('raw', authEncoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt: fromBase64Url(saltText) }, material, 256);
  return constantEqual(new Uint8Array(derived), fromBase64Url(expectedText));
}

async function extensionCredentialVersion(env) {
  return toBase64Url(await crypto.subtle.digest('SHA-256', authEncoder.encode(env.EXTENSION_USERS_JSON || '')));
}

async function extensionSigningKey(env, usage) {
  return crypto.subtle.importKey('raw', authEncoder.encode(env.EXTENSION_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function createExtensionSession(username, env) {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(authEncoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = toBase64Url(authEncoder.encode(JSON.stringify({
    sub: username, aud: 'biz-mbee-extension', iat: now, exp: now + EXTENSION_SESSION_SECONDS,
    jti: crypto.randomUUID(), ver: await extensionCredentialVersion(env),
  })));
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('HMAC', await extensionSigningKey(env, 'sign'), authEncoder.encode(signingInput));
  return { token: `${signingInput}.${toBase64Url(signature)}`, username, expiresAt: (now + EXTENSION_SESSION_SECONDS) * 1000 };
}

async function authenticateExtension(request, env) {
  try {
    if (!env.EXTENSION_SESSION_SECRET || env.EXTENSION_SESSION_SECRET.length < 32 || !env.EXTENSION_USERS_JSON) return null;
    const bearer = request.headers.get('Authorization') || '';
    if (!bearer.startsWith('Bearer ') || bearer.length > 4096) return null;
    const token = bearer.slice(7);
    const segments = token.split('.');
    if (segments.length !== 3) return null;
    const [head, payloadText, signature] = segments;
    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(head)));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    if (!await crypto.subtle.verify('HMAC', await extensionSigningKey(env, 'verify'), fromBase64Url(signature), authEncoder.encode(`${head}.${payloadText}`))) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadText)));
    const now = Math.floor(Date.now() / 1000);
    if (claims.aud !== 'biz-mbee-extension' || typeof claims.sub !== 'string' || !Number.isInteger(claims.exp) ||
        !Number.isInteger(claims.iat) || claims.exp <= now || claims.iat > now + 30 || claims.exp - claims.iat > EXTENSION_SESSION_SECONDS ||
        claims.ver !== await extensionCredentialVersion(env)) return null;
    const users = JSON.parse(env.EXTENSION_USERS_JSON);
    if (!Object.hasOwn(users, claims.sub) || typeof users[claims.sub]?.hash !== 'string' || users[claims.sub].disabled) return null;
    return { username: claims.sub, expiresAt: claims.exp * 1000 };
  } catch { return null; }
}

function allowedExtensionOrigin(request, env) {
  const origin = request.headers.get('Origin');
  // Origin is a browser boundary, never the credential boundary. Non-browser
  // requests still need a verified session on every inference request.
  if (!origin) return null;
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return false;
  const ids = String(env.EXTENSION_ALLOWED_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
  return !ids.length || ids.some(id => origin === `chrome-extension://${id}`) ? origin : false;
}

async function handleExtensionApi(request, env) {
  const origin = allowedExtensionOrigin(request, env);
  if (origin === false) return authJson({ error: 'origin_not_allowed' }, 403);
  const corsHeaders = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  const finish = (response) => {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  };
  if (request.method === 'OPTIONS') return finish(new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  } }));
  const path = new URL(request.url).pathname;
  if (!env.EXTENSION_USERS_JSON || !env.EXTENSION_SESSION_SECRET || env.EXTENSION_SESSION_SECRET.length < 32 || !env.EXTENSION_RATE_LIMITER) {
    return finish(authJson({ error: 'authentication_not_configured' }, 503));
  }
  if (path === '/extension/auth/login' && request.method === 'POST') {
    const address = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await env.EXTENSION_RATE_LIMITER.limit({ key: `login:${address}` })).success) return finish(authJson({ error: 'too_many_attempts' }, 429, { 'Retry-After': '60' }));
    let body;
    try { body = await readLimitedJson(request, 4096); } catch { return finish(authJson({ error: 'invalid_request' }, 400)); }
    if (typeof body?.username !== 'string' || typeof body.password !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(body.username) || body.password.length > 256) {
      return finish(authJson({ error: 'invalid_credentials' }, 401));
    }
    let users;
    try { users = JSON.parse(env.EXTENSION_USERS_JSON); } catch { return finish(authJson({ error: 'authentication_not_configured' }, 503)); }
    const user = Object.hasOwn(users, body.username) ? users[body.username] : null;
    // Always perform the same expensive KDF for unknown usernames too.
    const dummy = 'pbkdf2-sha256$100000$MDEyMzQ1Njc4OWFiY2RlZg$MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
    let correct = false;
    try { correct = await checkExtensionPassword(body.password, user?.hash || dummy); } catch { /* deny */ }
    if (!user || user.disabled || !correct) return finish(authJson({ error: 'invalid_credentials' }, 401));
    return finish(authJson(await createExtensionSession(body.username, env)));
  }
  const session = await authenticateExtension(request, env);
  if (!session) return finish(authJson({ error: 'session_expired' }, 401));
  if (path === '/extension/auth/session' && request.method === 'GET') return finish(authJson(session));
  if (path === '/extension/quota/check' && request.method === 'POST') {
    // Share the chat budget so checks cannot bypass the inference rate limit.
    if (!(await env.EXTENSION_RATE_LIMITER.limit({ key: `chat:${session.username}` })).success) return finish(authJson({ error: 'rate_limited' }, 429, { 'Retry-After': '60' }));
    return finish(await checkExtensionQuota(env));
  }
  if (path === '/extension/v1/chat/completions' && request.method === 'POST') {
    if (!(await env.EXTENSION_RATE_LIMITER.limit({ key: `chat:${session.username}` })).success) return finish(authJson({ error: 'rate_limited' }, 429, { 'Retry-After': '60' }));
    // Reuse validation and the native SSE adapter; the legacy POC secret is
    // replaced by a per-request internal value only after session verification.
    const internalKey = crypto.randomUUID();
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${internalKey}`);
    const proxied = new Request(request, { headers });
    return finish(await handleWebMcp(proxied, { ...env, POC_TOKEN: internalKey, ALLOW_MODEL_SELECTION: true }));
  }
  return finish(authJson({ error: 'not_found' }, 404));
}
