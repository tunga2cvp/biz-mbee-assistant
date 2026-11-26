import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

const token = 'test-only';
const request = (body, key = token) => new Request('https://example.test/v1/chat/completions', {
  method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
test('unauthorized and oversized requests do not invoke inference', async () => {
  const env = { POC_TOKEN: token, AI: { run: () => { throw Error('must not run'); } } };
  assert.equal((await worker.fetch(request({ messages: [] }, 'wrong'), env)).status, 401);
  assert.equal((await worker.fetch(request({ messages: [{ role: 'user', content: 'x'.repeat(132000) }] }), env)).status, 413);
  assert.equal((await worker.fetch(request({ messages: [], tools: {} }), env)).status, 400);
});
test('tool calls, results and schemas reach the model without rewriting', async () => {
  const body = { messages: [
    { role: 'user', content: 'Compute using supplied values' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'arbitrary_page_tool', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: '42' },
  ], tools: [{ type: 'function', function: { name: 'arbitrary_page_tool', parameters: { type: 'object' } } }] };
  const env = { POC_TOKEN: token, AI: { run: async (model, input) => {
    assert.equal(model, '@cf/qwen/qwen3.8-27b');
    assert.deepEqual(input.messages, body.messages);
    assert.deepEqual(input.tools, body.tools);
    return { choices: [{ message: { role: 'assistant', content: '42' } }] };
  } } };
  const response = await worker.fetch(request(body), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, '42');
});
test('native SSE is passed through without synthesizing tool calls', async () => {
  const sse = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
  const env = { POC_TOKEN: token, AI: { run: async (_, input) => {
    assert.equal(input.stream, true);
    return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); } });
  } } };
  const response = await worker.fetch(request({ messages: [{ role: 'user', content: 'hello' }], stream: true }), env);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.equal(await response.text(), sse);
});
test('Cloudflare usage trailer is normalized while native tool deltas are preserved across split chunks', async () => {
  const native = { id: 'actual-provider-id', object: 'chat.completion.chunk', created: 1, model: 'probe', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call1', type: 'function', function: { name: 'page_tool', arguments: '{"value":5}' } }] }, finish_reason: 'tool_calls' }] };
  const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
  const raw = `data: ${JSON.stringify(native)}\r\n\r\ndata: ${JSON.stringify({ response: '', usage })}\r\n\r\ndata: [DONE]\r\n\r\n`;
  const env = { POC_TOKEN: token, AI: { run: async () => new ReadableStream({ start(c) {
    const bytes = new TextEncoder().encode(raw);
    for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
    c.close();
  } }) } };
  const response = await worker.fetch(request({ messages: [{ role: 'user', content: 'test' }], stream: true }), env);
  const events = (await response.text()).trim().split(/\r?\n\r?\n/).map(e => e.slice(6));
  assert.deepEqual(JSON.parse(events[0]), native);
  assert.deepEqual(JSON.parse(events[1]), { id: native.id, object: native.object, created: 1, model: 'probe', choices: [], usage });
  assert.equal(events[2], '[DONE]');
});
test('existing message endpoint still uses its original prompt and response', async () => {
  const response = await worker.fetch(new Request('https://example.test/', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: 'legacy' }),
  }), { POC_TOKEN: token, AI: { run: async (_, input) => {
    assert.equal(input.messages[1].content, 'legacy');
    assert.match(input.messages[0].content, /ngân hàng/);
    return { response: 'legacy response' };
  } } });
  assert.deepEqual(await response.json(), { response: 'legacy response' });
});

test('AI daily quota errors report the next UTC reset without leaking provider details', async () => {
  for (const providerError of [
    Error("4006: you have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage. private-provider-detail"),
    Object.assign(Error('account limited'), { code: 3036 }),
    Error('3036: account limited'),
  ]) {
    const response = await worker.fetch(request({ messages: [{ role: 'user', content: 'hello' }], stream: true }), {
      POC_TOKEN: token, AI: { run: async () => { throw providerError; } },
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const retry = Number(response.headers.get('Retry-After'));
    assert.ok(retry >= 1 && retry <= 86400);
    const body = await response.json();
    assert.equal(body.error.code, 'ai_quota_exceeded');
    assert.equal(body.error.type, 'insufficient_quota');
    assert.match(body.error.message, /07:00/);
    const reset = new Date(body.retryAt);
    assert.equal(reset.getUTCHours(), 0);
    assert.ok(Math.abs(reset.getTime() - Date.now() - retry * 1000) < 2000);
    assert.ok(!JSON.stringify(body).includes('private-provider-detail'));
  }
});

test('other provider errors remain 502 rather than being mislabeled as exhausted quota', async () => {
  const response = await worker.fetch(request({ messages: [{ role: 'user', content: 'hello' }] }), {
    POC_TOKEN: token, AI: { run: async () => { throw Error('4006: a different provider failure'); } },
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'inference_failed' });
});

test('legacy message endpoint also distinguishes the daily AI quota', async () => {
  const response = await worker.fetch(new Request('https://example.test/', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ message: 'hello' }),
  }), { POC_TOKEN: token, AI: { run: async () => { throw Error('4006: you have used up your daily free allocation of 10,000 neurons'); } } });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, 'ai_quota_exceeded');
});
