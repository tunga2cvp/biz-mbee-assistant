import test from 'node:test';
import assert from 'node:assert/strict';

test('cloud chat distinguishes daily AI quota from per-minute throttling without retrying or counting tokens', async (t) => {
  t.mock.method(console, 'error', () => {}); // The SDK logs the three expected rejections.
  const originalUrl = process.env.WEBMCP_CLOUD_URL;
  process.env.WEBMCP_CLOUD_URL = 'https://worker.test';
  t.after(() => {
    if (originalUrl === undefined) delete process.env.WEBMCP_CLOUD_URL;
    else process.env.WEBMCP_CLOUD_URL = originalUrl;
  });
  const session = { token: 'test-session', username: 'testuser', expiresAt: Date.now() + 60000 };
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true, value: { storage: { session: { get: async () => ({ mbeeSession: session }) } } },
  });
  t.after(() => {
    if (originalChrome) Object.defineProperty(globalThis, 'chrome', originalChrome);
    else Reflect.deleteProperty(globalThis, 'chrome');
  });
  const { sendCloudChat, resetCloudChat } = await import('../../extension/sidepanel/services/cloudBackend.js');
  const { tokenUsage } = await import('../../extension/sidepanel/services/tokenUsage.js');
  for (const [body, expected] of [
    [{ error: { code: 'ai_quota_exceeded', message: 'Hết neurons. Hạn mức đặt lại lúc 07:00 giờ Việt Nam.' } }, /07:00/],
    [{ error: 'rate_limited' }, /một phút/],
    ['not-json', /một phút/],
  ] as const) {
    resetCloudChat();
    tokenUsage.clear();
    let requests = 0;
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      requests++;
      return typeof body === 'string' ? new Response(body, { status: 429 }) : Response.json(body, { status: 429 });
    });
    await assert.rejects(sendCloudChat({ message: 'hello', tools: [] }), expected);
    assert.equal(requests, 1);
    assert.equal(tokenUsage.getSnapshot().total.requests, 0);
    fetchMock.mock.restore();
  }
});
