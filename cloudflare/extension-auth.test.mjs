import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes, createHmac } from 'node:crypto';
import worker from './worker.js';
const salt = randomBytes(16);
const password = 'test-password-only';
const hash = `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('base64url')}`;
const env = () => ({ EXTENSION_USERS_JSON: JSON.stringify({ testuser: { hash } }), EXTENSION_SESSION_SECRET: 'test-signing-secret-more-than-32-characters', EXTENSION_RATE_LIMITER: { limit: async () => ({ success: true }) }, AI: { run: async () => { throw Error('must not infer'); } } });
const req = (path, body, token, origin) => new Request(`https://worker.test/extension/${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const sign = (claims, secret) => {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${head}.${payload}.${createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url')}`;
};
const getSession = async (settings) => {
  const response = await worker.fetch(req('auth/login', { username: 'testuser', password }), settings);
  assert.equal(response.status, 200);
  return response.json();
};
test('invalid passwords and unknown accounts are rejected; login never returns credentials', async () => {
  const settings = env();
  for (const username of ['testuser', 'unknown', '__proto__']) {
    const response = await worker.fetch(req('auth/login', { username, password: 'wrong' }), settings);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'invalid_credentials' });
  }
  const session = await getSession(settings);
  assert.equal(session.username, 'testuser');
  assert.ok(session.expiresAt > Date.now());
  assert.ok(!JSON.stringify(session).includes(password));
  assert.ok(!JSON.stringify(session).includes(hash));
});
test('every inference request needs a verified server session', async () => {
  const settings = env();
  assert.equal((await worker.fetch(req('v1/chat/completions', { messages: [] }), settings)).status, 401);
  const session = await getSession(settings);
  assert.equal((await worker.fetch(req('auth/session', undefined, session.token), settings)).status, 200);
  assert.equal((await worker.fetch(req('auth/session', undefined, session.token + 'x'), settings)).status, 401);
});
test('expired and future-dated tokens are rejected even with a valid signature', async () => {
  const settings = env();
  const session = await getSession(settings);
  const claims = JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url'));
  const now = Math.floor(Date.now() / 1000);
  for (const changed of [{ ...claims, iat: now - 4000, exp: now - 1 }, { ...claims, iat: now + 500, exp: now + 1000 }]) {
    assert.equal((await worker.fetch(req('auth/session', undefined, sign(changed, settings.EXTENSION_SESSION_SECRET)), settings)).status, 401);
  }
});
test('credential changes revoke existing tokens', async () => {
  const settings = env();
  const session = await getSession(settings);
  settings.EXTENSION_USERS_JSON = JSON.stringify({ testuser: { hash, disabled: true } });
  assert.equal((await worker.fetch(req('auth/session', undefined, session.token), settings)).status, 401);
});
test('rate limits and missing bindings fail closed', async () => {
  const settings = env();
  settings.EXTENSION_RATE_LIMITER = { limit: async () => ({ success: false }) };
  assert.equal((await worker.fetch(req('auth/login', { username: 'testuser', password }), settings)).status, 429);
  delete settings.EXTENSION_RATE_LIMITER;
  assert.equal((await worker.fetch(req('auth/login', { username: 'testuser', password }), settings)).status, 503);
});
test('webpage origins are denied and extension ID restrictions are enforced', async () => {
  const settings = env();
  assert.equal((await worker.fetch(req('auth/login', { username: 'testuser', password }, null, 'https://evil.test'), settings)).status, 403);
  settings.EXTENSION_ALLOWED_IDS = 'a'.repeat(32);
  assert.equal((await worker.fetch(req('auth/login', { username: 'testuser', password }, null, `chrome-extension://${'b'.repeat(32)}`), settings)).status, 403);
  const response = await worker.fetch(req('auth/login', { username: 'testuser', password }, null, `chrome-extension://${'a'.repeat(32)}`), settings);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), `chrome-extension://${'a'.repeat(32)}`);
});
test('authenticated tool schemas reach the default model; arbitrary models are rejected', async () => {
  const settings = env();
  const session = await getSession(settings);
  const tools = [{ type: 'function', function: { name: 'dynamic_page_tool', parameters: { type: 'object' } } }];
  let called = false;
  settings.AI.run = async (model, input) => {
    called = true; assert.equal(model, '@cf/qwen/qwen3.8-27b'); assert.deepEqual(input.tools, tools);
    return { choices: [{ message: { role: 'assistant', content: 'ok' } }] };
  };
  assert.equal((await worker.fetch(req('v1/chat/completions', { model: 'unapproved-model', messages: [{ role: 'user', content: 'test' }] }, session.token), settings)).status, 400);
  assert.equal(called, false);
  const response = await worker.fetch(req('v1/chat/completions', { model: 'worker-configured-model', messages: [{ role: 'user', content: 'test' }], tools }, session.token), settings);
  assert.equal(response.status, 200); assert.ok(called);
});

test('selected Granite receives unchanged page schemas and native streaming settings', async () => {
  const settings = env();
  const session = await getSession(settings);
  const tool = { name: 'page_calculate', description: 'Compute total', parameters: { type: 'object', properties: { quantity: { type: 'integer' } } } };
  settings.AI.run = async (model, input) => {
    assert.equal(model, '@cf/ibm-granite/granite-4.0-h-micro');
    assert.equal(input.stream, false);
    assert.equal(input.max_tokens, 2048);
    assert.equal(input.reasoning_effort, undefined);
    assert.equal(input.messages[1].content, '');
    assert.equal(input.messages[1].tool_calls[0].id, 'prior-call');
    assert.equal(input.messages[2].tool_call_id, 'prior-call');
    assert.deepEqual(input.tools, [{ type: 'function', function: tool }]);
    return { id: 'native-id', created: 1, model, choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'native-call', type: 'function', function: { name: tool.name, arguments: '{"quantity":3}' } }] }, finish_reason: 'tool_calls' }] };
  };
  const response = await worker.fetch(req('v1/chat/completions', {
    model: '@cf/ibm-granite/granite-4.0-h-micro', messages: [{ role: 'user', content: '3 items' }, { role: 'assistant', content: null, tool_calls: [{ id: 'prior-call' }] }, { role: 'tool', tool_call_id: 'prior-call', content: '3' }], stream: true,
    tools: [{ type: 'function', function: tool }],
  }, session.token), settings);
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split('\n\n').map(event => event.slice(6));
  const chunk = JSON.parse(events[0]);
  assert.equal(chunk.choices[0].finish_reason, 'tool_calls');
  assert.deepEqual(JSON.parse(chunk.choices[0].delta.tool_calls[0].function.arguments), { quantity: 3 });
  assert.equal(events[1], '[DONE]');
});

test('Granite prose is never parsed into tool calls', async () => {
  const settings = env();
  const session = await getSession(settings);
  settings.AI.run = async () => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"name":"dangerous_tool","arguments":{}}' } }] });
  const response = await worker.fetch(req('v1/chat/completions', {
    model: '@cf/ibm-granite/granite-4.0-h-micro', messages: [{ role: 'user', content: 'test' }],
  }, session.token), settings);
  const body = await response.json();
  assert.equal(body.choices[0].finish_reason, 'stop');
  assert.equal(body.choices[0].message.tool_calls, undefined);
});

test('authenticated quota failures retain CORS and the session stays valid', async () => {
  const settings = env();
  const session = await getSession(settings);
  const origin = `chrome-extension://${'a'.repeat(32)}`;
  settings.AI.run = async () => { throw Error('4006: you have used up your daily free allocation of 10,000 neurons'); };
  const response = await worker.fetch(req('v1/chat/completions', {
    model: '@cf/ibm-granite/granite-4.0-h-micro', messages: [{ role: 'user', content: 'hello' }], stream: true,
  }, session.token, origin), settings);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.ok(Number(response.headers.get('Retry-After')) > 0);
  assert.equal((await response.json()).error.code, 'ai_quota_exceeded');
  assert.equal((await worker.fetch(req('auth/session', undefined, session.token), settings)).status, 200);
});

test('quota checks need authentication, send only a tiny fixed probe and never claim exact remaining neurons', async () => {
  const settings = env();
  let calls = 0;
  settings.AI.run = async (model, input) => {
    calls++;
    assert.equal(model, '@cf/ibm-granite/granite-4.0-h-micro');
    assert.deepEqual(input, { messages: [{ role: 'user', content: 'OK' }], max_tokens: 1, stream: false });
    return { choices: [{ message: { content: 'OK' } }] };
  };
  assert.equal((await worker.fetch(req('quota/check', {}), settings)).status, 401);
  assert.equal(calls, 0);
  const session = await getSession(settings);
  const response = await worker.fetch(req('quota/check', { messages: [{ content: 'private page content' }] }, session.token), settings);
  const body = await response.json();
  assert.equal(body.status, 'available');
  assert.equal(body.remainingNeurons, null);
  assert.equal(body.freeDailyNeurons, 10000);
  assert.equal(body.source, 'inference_probe');
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(body).includes('private page content'));
});

test('quota checks distinguish exhausted quota from outages and enforce the chat rate limit', async () => {
  const settings = env();
  const session = await getSession(settings);
  for (const [error, status] of [[Error('4006: you have used up your daily free allocation of 10,000 neurons'), 'exhausted'], [Error('upstream outage'), 'unknown']]) {
    settings.AI.run = async () => { throw error; };
    const response = await worker.fetch(req('quota/check', {}, session.token), settings);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, status);
  }
  settings.AI.run = async () => ({ error: 'bad response' });
  assert.equal((await (await worker.fetch(req('quota/check', {}, session.token), settings)).json()).status, 'unknown');
  settings.EXTENSION_RATE_LIMITER.limit = async ({ key }) => { assert.equal(key, 'chat:testuser'); return { success: false }; };
  settings.AI.run = () => { throw Error('must not infer'); };
  assert.equal((await worker.fetch(req('quota/check', {}, session.token), settings)).status, 429);
});

test('new Gemma and GLM options preserve native tool calls and real token usage', async () => {
  const settings = env();
  const session = await getSession(settings);
  for (const model of ['@cf/google/gemma-4-26b-a4b-it', '@cf/zai-org/glm-4.7-flash']) {
    const call = { id: 'actual-call', type: 'function', function: { name: 'page_tool', arguments: '{"value":3}' } };
    const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
    settings.AI.run = async (id, input) => {
      assert.equal(id, model);
      assert.equal(input.stream, false);
      assert.equal(input.max_completion_tokens, 2048);
      assert.equal(input.reasoning_effort, undefined);
      assert.equal(input.tools[0].function.name, 'page_tool');
      return { id: 'actual-id', model, choices: [{ message: { role: 'assistant', content: null, tool_calls: [call] }, finish_reason: 'tool_calls' }], usage };
    };
    const response = await worker.fetch(req('v1/chat/completions', {
      model, messages: [{ role: 'user', content: 'do task' }], stream: true,
      tools: [{ type: 'function', function: { name: 'page_tool', parameters: { type: 'object' } } }],
    }, session.token), settings);
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split('\n\n').map(event => event.slice(6));
    assert.equal(JSON.parse(events[0]).choices[0].delta.tool_calls[0].id, call.id);
    assert.deepEqual(JSON.parse(events[1]).usage, usage);
  }
});
