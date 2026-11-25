/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/*/

 export default {
  async fetch(request, env) {
    const publicPath = new URL(request.url).pathname;
    if ((publicPath === '/privacy' || publicPath === '/demo') && request.method === 'GET') return extensionPublicPage(publicPath);
    if (publicPath.startsWith('/extension/')) return handleExtensionApi(request, env);
    if (publicPath === '/v1/chat/completions') return handleWebMcp(request, env);
    if (
      !env.POC_TOKEN ||
      request.headers.get("Authorization") !== `Bearer ${env.POC_TOKEN}`
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    let body;
    try {
      const text = await request.text();
      if (text.length > 8000) {
        return new Response("Request too large", { status: 413 });
      }
      body = JSON.parse(text);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (
      typeof body?.message !== "string" ||
      !body.message.trim() ||
      body.message.length > 1000
    ) {
      return new Response("message must contain 1–1000 characters", {
        status: 400,
      });
    }

    try {
      const result = await env.AI.run("@cf/qwen/qwen3.8-27b", {
        messages: [
          {
            role: "system",
            content:
              "Bạn là trợ lý thử nghiệm giao diện ngân hàng doanh nghiệp. " +
              "Trả lời ngắn gọn bằng ngôn ngữ người dùng. " +
              "Không yêu cầu mật khẩu, OTP hoặc dữ liệu khách hàng. " +
              "Không tự nhận đã thực hiện giao dịch. " +
              "Nếu chưa có hướng dẫn nghiệp vụ được cung cấp, hãy nói rõ, không bịa.",
          },
          { role: "user", content: body.message },
        ],
        reasoning_effort: "low",
        max_completion_tokens: 1024,
      });

      return Response.json(result, {
        headers: { "Cache-Control": "no-store",
          "Content-Type":"application/json; charset=utf-8"
         },

      });
    } catch {
      return Response.json(
        { error: "AI request failed; check Worker logs and quota." },
        { status: 502 },
      );
    }
  },
};

const WEBMCP_MODEL_CATALOG = {"defaultModel":"@cf/qwen/qwen3.8-27b","models":[{"id":"@cf/qwen/qwen3.8-27b","label":"Qwen 3.8 27B","description":"Mặc định · hội thoại và tác vụ nhiều bước","adapter":"openai"},{"id":"@cf/ibm-granite/granite-4.0-h-micro","label":"Granite 4.0 H Micro · 3B","description":"Model nhỏ · thử nghiệm gọi công cụ","adapter":"openai"}]};

// Generic inference endpoint: page tools are supplied by the extension.
// No page callback or business action is executed by this Worker.
async function handleWebMcp(request, env) {
  const reply = (body, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  if (!env.POC_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.POC_TOKEN}`) {
    return reply({ error: 'unauthorized' }, 401);
  }
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  let body;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'invalid_request' }, 400);
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) {
        await reader.cancel();
        return reply({ error: 'too_large' }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return reply({ error: 'invalid_json' }, 400);
  }
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 64 ||
      body.messages.some((m) => !m || !['system', 'developer', 'user', 'assistant', 'tool'].includes(m.role)) ||
      (body.tools !== undefined && (!Array.isArray(body.tools) || body.tools.length > 32 ||
        body.tools.some((t) => t?.type !== 'function' || typeof t.function?.name !== 'string'))) ||
      (body.stream !== undefined && typeof body.stream !== 'boolean')) {
    return reply({ error: 'invalid_request' }, 400);
  }
  const stream = body.stream === true;
  let modelId = env.MODEL_ID || WEBMCP_MODEL_CATALOG.defaultModel;
  if (env.ALLOW_MODEL_SELECTION) {
    // The old extension sent this placeholder; keep the submitted 1.1.0 working.
    modelId = body.model === undefined || body.model === 'worker-configured-model'
      ? WEBMCP_MODEL_CATALOG.defaultModel : body.model;
    if (!WEBMCP_MODEL_CATALOG.models.some(model => model.id === modelId)) return reply({ error: 'model_not_allowed' }, 400);
  }
  const buffered = modelId === '@cf/ibm-granite/granite-4.0-h-micro';
  try {
    const result = await env.AI.run(modelId, {
      // Granite's chat template rejects null assistant content on tool-call turns.
      // Preserve its native calls and results; only represent absent text as ''.
      messages: modelId === '@cf/ibm-granite/granite-4.0-h-micro'
        ? body.messages.map(message => message.role === 'assistant' && message.content === null ? { ...message, content: '' } : message)
        : body.messages,
      ...(body.tools?.length ? { tools: body.tools, ...(body.tool_choice ? { tool_choice: body.tool_choice } : {}) } : {}),
      parallel_tool_calls: false,
      ...(modelId === '@cf/ibm-granite/granite-4.0-h-micro' ? { max_tokens: 2048 } : { reasoning_effort: 'low', max_completion_tokens: 2048 }),
      stream: buffered ? false : stream,
      ...(stream && !buffered ? { stream_options: { include_usage: true } } : {}),
    });
    // Granite currently rejects streaming requests with tool-result history.
    // Its native non-streamed completion still carries actual structured calls.
    if (stream && buffered) return nativeCompletionSse(result);
    if (stream) {
      return new Response(normalizeWebMcpSse(result), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
    return reply(result);
  } catch {
    return reply({ error: 'inference_failed' }, 502);
  }
}

function nativeCompletionSse(completion) {
  if (!Array.isArray(completion?.choices) || !completion.choices[0]?.message) throw Error('Expected native completion');
  const choice = completion.choices[0];
  const { tool_calls, ...message } = choice.message;
  const chunk = { id: completion.id, object: 'chat.completion.chunk', created: completion.created, model: completion.model,
    choices: [{ index: 0, delta: { ...message, ...(tool_calls?.length ? { tool_calls: tool_calls.map((call, index) => ({ ...call, index })) } : {}) }, finish_reason: choice.finish_reason }],
  };
  const usage = completion.usage ? `data: ${JSON.stringify({ id: completion.id, object: chunk.object, created: completion.created, model: completion.model, choices: [], usage: completion.usage })}\n\n` : '';
  return new Response(`data: ${JSON.stringify(chunk)}\n\n${usage}data: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// The AI binding appends {response:'', usage} after native OpenAI chunks.
// Convert only that usage trailer; native text and tool-call deltas pass through.
function normalizeWebMcpSse(source) {
  let pending = '';
  let metadata = {};
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  function emit(event, controller) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (data && data !== '[DONE]') {
      const payload = JSON.parse(data);
      if (Array.isArray(payload.choices)) {
        metadata = { id: payload.id, object: 'chat.completion.chunk', created: payload.created, model: payload.model };
      } else if (payload.response === '' && payload.usage && metadata.id) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...metadata, choices: [], usage: payload.usage })}\n\n`));
        return;
      } else if (!payload.error) {
        throw new Error('Expected native Chat Completions SSE');
      }
    }
    controller.enqueue(encoder.encode(event + '\n\n'));
  }
  function drain(controller, final = false) {
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(pending))) {
      const event = pending.slice(0, boundary.index);
      pending = pending.slice(boundary.index + boundary[0].length);
      if (event) emit(event, controller);
    }
    if (pending.length > 1048576) throw new Error('SSE event too large');
    if (final && pending.trim()) { emit(pending, controller); pending = ''; }
  }
  return source.pipeThrough(new TransformStream({
    transform(chunk, controller) { pending += decoder.decode(chunk, { stream: true }); drain(controller); },
    flush(controller) { pending += decoder.decode(); drain(controller, true); },
  }));
}


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



function extensionPublicPage(path) {
  const nonce = crypto.randomUUID();
  const html = path === '/privacy' ? "<!doctype html><html lang=\"vi\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Quyền riêng tư · BIZ Mbee Assistant</title>\n<style>body{font:16px/1.7 system-ui,sans-serif;max-width:820px;margin:40px auto;padding:20px;color:#16334e}h1,h2{line-height:1.3}a{color:#0757ba}</style>\n<h1>Chính sách quyền riêng tư</h1><p><strong>BIZ Mbee Assistant</strong> · Cập nhật ngày 20/11/2026.</p>\n<p>Tiện ích trợ lý WebMCP do cá nhân phát triển. Liên hệ hỗ trợ và yêu cầu về dữ liệu: <a href=\"mailto:thanhtunga2cvp@gmail.com\">thanhtunga2cvp@gmail.com</a>.</p>\n<h2>Dữ liệu đăng nhập</h2><p>Tên đăng nhập và mật khẩu của tài khoản trợ lý được gửi qua HTTPS đến Cloudflare Worker để xác thực. Worker lưu bản băm PBKDF2 có salt trong Secrets; ứng dụng không lưu mật khẩu dạng rõ và không gửi thông tin đăng nhập tới model AI. Phiên có chữ ký hết hạn sau một giờ, được giữ trong chrome.storage.session của tiện ích. Đăng xuất xóa phiên trên trình duyệt; token đã phát hành tự hết hạn, và thay đổi cấu hình tài khoản hoặc khóa ký sẽ vô hiệu hóa các token tương ứng.</p>\n<h2>Dữ liệu khi sử dụng trợ lý</h2><p>Khi bạn gửi yêu cầu chat, tiện ích gửi nội dung hội thoại, metadata công cụ WebMCP do trang công bố và kết quả các công cụ được gọi tới Cloudflare Worker / Workers AI để tạo câu trả lời. Nội dung công cụ có thể chứa thông tin của trang bạn đang mở. Tiện ích không tự quét toàn bộ lịch sử duyệt web, không bán dữ liệu và không dùng dữ liệu cho quảng cáo.</p>\n<p>Địa chỉ và biểu tượng của tab đang hoạt động được dùng để hiển thị ngữ cảnh và xác định quyền thao tác. Công cụ thay đổi trang được kiểm tra quyền trước khi thực hiện; quyền xác nhận các thao tác có hậu quả vẫn được giữ.</p>\n<h2>Lưu trữ và bên xử lý</h2><p>Hội thoại được giữ trong bộ nhớ của side panel theo từng tab; đăng xuất, reset chat hoặc đóng phiên sẽ xóa ngữ cảnh tương ứng. Worker xử lý inference theo từng yêu cầu, không có cơ sở dữ liệu hội thoại trong ứng dụng. Mã ứng dụng không ghi mật khẩu hoặc toàn bộ nội dung chat vào log. Cloudflare có thể xử lý metadata vận hành, địa chỉ IP và dữ liệu inference theo <a href=\"https://www.cloudflare.com/privacypolicy/\">chính sách riêng tư của Cloudflare</a>.</p>\n<h2>Quyền trình duyệt</h2><p>sidePanel hiển thị trợ lý; storage giữ phiên đăng nhập; scripting và quyền truy cập website kết nối với WebMCP native của trang; webNavigation nhận biết điều hướng và các frame; favicon hiển thị biểu tượng tab. Quyền website phục vụ việc khám phá và gọi capability do website cung cấp, không nhằm thu thập lịch sử duyệt web.</p>\n<h2>Kiểm soát và xóa dữ liệu</h2><p>Bạn có thể reset hội thoại, đăng xuất, hạn chế quyền website trong Chrome hoặc gỡ tiện ích. Liên hệ email hỗ trợ để yêu cầu vô hiệu hóa tài khoản hoặc hỏi về dữ liệu. Không nhập mật khẩu ngân hàng, OTP, PIN hay thông tin khách hàng vào chat thử nghiệm.</p>\n<p><a href=\"/demo\">Mở trang demo WebMCP với dữ liệu giả</a></p></html>\n" : "<!doctype html>\n<html lang=\"vi\">\n  <meta charset=\"utf-8\" />\n  <title>WebMCP external-agent test</title>\n  <style>\n    body {\n      max-width: 760px;\n      margin: 40px auto;\n      padding: 20px;\n      font: 16px Arial;\n    }\n    label {\n      display: block;\n      margin: 16px 0;\n    }\n    input,\n    button {\n      padding: 10px;\n      margin: 4px;\n    }\n    pre {\n      white-space: pre-wrap;\n      background: #eef2ff;\n      padding: 16px;\n    }\n  </style>\n  <h1>Trang kiểm thử WebMCP độc lập</h1>\n  <p>Chỉ dữ liệu giả. Không đăng nhập, không backend, không giao dịch.</p>\n  <label>\n    Mã đơn vị thử nghiệm\n    <input id=\"unit\" autocomplete=\"off\" />\n  </label>\n  <label>\n    Tên người dùng thử nghiệm\n    <input id=\"user\" autocomplete=\"off\" />\n  </label>\n  <button id=\"extra\">Công bố thêm một tool mới</button>\n  <button id=\"disable\">Gỡ toàn bộ tool</button>\n  <pre id=\"status\">Đang kiểm tra native WebMCP…</pre>\n  <script type=\"module\">\n    const status = document.querySelector('#status');\n    const context = document.modelContext;\n    const controllers = [];\n    const log = (text) => {\n      status.textContent = text;\n    };\n    async function expose(tool) {\n      const controller = new AbortController();\n      await context.registerTool(tool, { signal: controller.signal });\n      controllers.push(controller);\n    }\n    if (!context?.registerTool || !context?.getTools) {\n      log('Không có API native. Bật WebMCP testing và mở trang bằng localhost. Không dùng polyfill.');\n    } else {\n      await expose({\n        name: 'explain_test_workspace',\n        description: 'Describe the current independent demo page and available preparation task. Read only.',\n        inputSchema: { type: 'object', properties: {}, additionalProperties: false },\n        annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false },\n        execute: () =>\n          JSON.stringify({\n            page: 'Independent WebMCP test',\n            capabilities: ['Prepare a demo unit code and demo username in the visible form'],\n            safety: 'No authentication, passwords or backend calls.',\n          }),\n      });\n      await expose({\n        name: 'stage_demo_identity',\n        description: 'Fill the visible demo form using a unit code and username supplied by the user. Ask for any missing field, never invent a value. Does not authenticate or submit.',\n        inputSchema: {\n          type: 'object',\n          properties: {\n            unitCode: { type: 'string', minLength: 3, maxLength: 30 },\n            userName: { type: 'string', minLength: 3, maxLength: 40 },\n          },\n          required: ['unitCode', 'userName'],\n          additionalProperties: false,\n        },\n        annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: false },\n        execute: (args) => {\n          if (!args || Object.keys(args).some((k) => !['unitCode', 'userName'].includes(k)) || typeof args.unitCode !== 'string' || typeof args.userName !== 'string' || !/^[A-Za-z0-9_-]{3,30}$/.test(args.unitCode) || !/^[A-Za-z0-9_-]{3,40}$/.test(args.userName)) {\n            throw new Error('Need explicit valid demo unitCode and userName.');\n          }\n          document.querySelector('#unit').value = args.unitCode;\n          document.querySelector('#user').value = args.userName;\n          log('Callback native đã điền hai ô. Không có đăng nhập/gửi dữ liệu.');\n          return JSON.stringify({ status: 'filled', unitCode: args.unitCode, userName: args.userName });\n        },\n      });\n      document.querySelector('#extra').onclick = async (event) => {\n        event.currentTarget.disabled = true;\n        await expose({\n          name: 'calculate_demo_total',\n          description: 'Calculate the total demo cost from the quantity and unit price the user provides. Read only, no purchase.',\n          inputSchema: {\n            type: 'object',\n            properties: {\n              quantity: { type: 'integer', minimum: 1, maximum: 1000 },\n              unitPrice: { type: 'integer', minimum: 0, maximum: 1000000 },\n            },\n            required: ['quantity', 'unitPrice'],\n            additionalProperties: false,\n          },\n          annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false },\n          execute: (args) => {\n            if (!args || !Number.isInteger(args.quantity) || args.quantity < 1 || args.quantity > 1000 || !Number.isInteger(args.unitPrice) || args.unitPrice < 0 || args.unitPrice > 1000000 || Object.keys(args).some((k) => !['quantity', 'unitPrice'].includes(k))) {\n              throw new Error('Invalid demo quantity/unitPrice.');\n            }\n            return JSON.stringify({ total: args.quantity * args.unitPrice });\n          },\n        });\n        log('Đã công bố tool mới. Agent phải tự cập nhật, không sửa code agent.');\n      };\n      document.querySelector('#disable').onclick = () => {\n        controllers.forEach((controller) => controller.abort());\n        document.querySelector('#extra').disabled = true;\n        log('Đã gỡ toàn bộ tool. Không có fallback vào DOM hoặc registry nội bộ.');\n      };\n      log('Hai tool native đã sẵn sàng. Mở extension và chat.');\n    }\n  </script>\n</html>".replace('<script type="module">', '<script type="module" nonce="' + nonce + '">');
  return new Response(html, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  } });
}
