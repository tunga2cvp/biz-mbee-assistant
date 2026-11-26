// Runs a disposable browser profile. Never reloads or modifies the user's
// installed extension. Chat responses below are UI fixtures, not model tests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import catalog from '../shared/cloudModels.json' with { type: 'json' };

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = path.join(root, 'artifacts/ui-1.3.1');
await fs.mkdir(output, { recursive: true });
const checks = [];
const failures = [];
const login = await fetch('https://biz.thanhtunga2cvp.workers.dev/extension/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: await fs.readFile(path.join(root, 'cloudflare/private/test-login.json'), 'utf8'),
});
assert.equal(login.status, 200);
const session = await login.json();
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, pipe: true,
  enableExtensions: true, protocolTimeout: 20000, args: ['--enable-features=WebMCP', '--disable-background-timer-throttling'],
});
let panel;
try {
  const extensionId = await browser.installExtension(path.join(root, 'webmcp-extension/store-dist'));
  const demo = await browser.newPage();
  await demo.goto('https://biz.thanhtunga2cvp.workers.dev/demo');
  panel = await browser.newPage();
  await (await panel.createCDPSession()).send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await panel.setViewport({ width: 380, height: 800 });
  panel.on('pageerror', error => failures.push(String(error)));
  let chatCalls = 0;
  let quotaCalls = 0;
  let quotaMode = 'available';
  await panel.setRequestInterception(true);
  panel.on('request', request => {
    const resetAt = new Date((Math.floor(Date.now() / 86400000) + 1) * 86400000).toISOString();
    if (request.url().endsWith('/extension/quota/check') && !process.argv.includes('--live-quota')) {
      quotaCalls++;
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
        status: quotaMode, checkedAt: new Date().toISOString(), resetAt, freeDailyNeurons: 10000, remainingNeurons: null, source: 'inference_probe',
      }) });
    } else if (request.url().endsWith('/extension/v1/chat/completions')) {
      chatCalls++;
      const metadata = { id: 'ui-fixture', object: 'chat.completion.chunk', created: 1, model: JSON.parse(request.postData()).model };
      void request.respond({ status: 200, contentType: 'text/event-stream', body:
        `data: ${JSON.stringify({ ...metadata, choices: [{ index: 0, delta: { role: 'assistant', content: 'Mbee có thể giúp bạn hỏi đáp và sử dụng công cụ WebMCP của trang, sau khi bạn cho phép.' }, finish_reason: 'stop' }] })}\n\n` +
        `data: ${JSON.stringify({ ...metadata, choices: [], usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 } })}\n\ndata: [DONE]\n\n`,
      });
    } else void request.continue();
  });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
  await panel.waitForSelector('.mbee-auth form');
  await panel.bringToFront();
  await panel.screenshot({ path: path.join(output, 'login.png') });
  await panel.evaluate(async session => {
    localStorage.setItem('agentConsent', 'true');
    await chrome.storage.session.set({ mbeeSession: session });
  }, session);
  await panel.reload();
  await panel.waitForSelector('.mbee-shell');
  await demo.bringToFront();
  await panel.waitForFunction(() => document.querySelector('.attached-tab')?.textContent?.includes('workers.dev'), { polling: 100 });
  assert.equal(await panel.$('#mbee-cloud-model'), null);
  assert.equal(chatCalls, 0);
  assert.equal(quotaCalls, 0);
  checks.push('four models; no automatic inference or quota probe on opening');
  console.log('READY demo tools');
  await panel.waitForSelector('.mbee-tool-suggestion');
  const suggestions = await panel.$$('.mbee-tool-suggestion');
  assert.ok(suggestions.length > 0 && suggestions.length <= 3);
  await panel.$eval('.mbee-tool-suggestion', el => el.click());
  assert.match(await panel.$eval('.text-input__field', el => el.value), /Hãy hỏi tôi những thông tin còn thiếu/);
  assert.equal(chatCalls, 0);
  checks.push('native page tools produce up to three suggestions; choosing one does not execute it');
  // A real side panel does not become the active tab. Pin this disposable
  // test panel's tab query to the demo while capturing its UI in a normal tab.
  await panel.evaluate(async () => {
    const [demoTab] = await chrome.tabs.query({ url: 'https://biz.thanhtunga2cvp.workers.dev/demo' });
    const originalQuery = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async query => query.active && query.currentWindow ? [demoTab] : originalQuery(query);
  });
  await panel.bringToFront();
  await panel.screenshot({ path: path.join(output, 'welcome-tools.png') });
  await panel.bringToFront();
  await panel.reload();
  await panel.waitForSelector('.mbee-shell');
  assert.equal(await panel.$('.mbee-tool-suggestion'), null);
  await panel.screenshot({ path: path.join(output, 'welcome.png') });
  await panel.click('[aria-label="Cài đặt"]');
  await panel.waitForSelector('#mbee-cloud-model');
  assert.equal(await panel.$$eval('#mbee-cloud-model option', els => els.length), 4);
  await panel.click('[aria-label="Kiểm tra hạn mức AI"]');
  await panel.waitForFunction(() => /AI đang khả dụng|Đã hết hạn mức hôm nay/.test(document.querySelector('.mbee-quota')?.textContent || ''), { polling: 100 });
  checks.push(process.argv.includes('--live-quota') ? 'live quota endpoint displayed' : 'available probe fixture displayed');
  if (!process.argv.includes('--live-quota')) {
    quotaMode = 'exhausted';
    await panel.click('[aria-label="Kiểm tra hạn mức AI"]');
    await panel.waitForSelector('.mbee-quota--exhausted');
    checks.push('exhausted quota explains reset and shared model allocation');
  }
  await panel.screenshot({ path: path.join(output, 'quota-exhausted.png') });
  await panel.click('[aria-label="Đóng cài đặt"]');
  for (const model of catalog.models) {
    await panel.click('[aria-label="Cài đặt"]');
    await panel.select('#mbee-cloud-model', model.id);
    await panel.click('[aria-label="Đóng cài đặt"]');
    await panel.type('.text-input__field', 'Mbee có thể giúp gì?');
    await panel.click('button[data-action="send"]');
    await panel.waitForSelector('.ai-response');
    await panel.waitForFunction(() => !document.querySelector('button[data-action="stop"]'), { polling: 100 });
    assert.equal(await panel.$('.msg.error'), null);
  }
  checks.push('all four selections complete chat UI with controlled SSE fixtures');
  await panel.click('[aria-label="Cài đặt"]');
  await panel.click('.mbee-activity > summary');
  await panel.click('.mbee-token-usage > summary');
  assert.equal(await panel.$eval('[data-testid="token-usage"]', el => Number(el.dataset.requests)), 4);
  assert.equal(await panel.$eval('[data-testid="token-usage"]', el => Number(el.dataset.total)), 4800);
  assert.match(await panel.$eval('.mbee-neuron-estimate', el => el.textContent), /ước tính/);
  checks.push('usage retained across model switches; neuron estimate explicitly labeled');
  await panel.screenshot({ path: path.join(output, 'settings.png') });
  await panel.click('[aria-label="Đóng cài đặt"]');
  for (const [width, height] of [[320, 480], [340, 620], [380, 800], [480, 900]]) {
    await panel.setViewport({ width, height });
    const layout = await panel.evaluate(() => {
      const input = document.querySelector('.text-input__field').getBoundingClientRect();
      const main = document.querySelector('.mbee-shell > main').getBoundingClientRect();
      return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, inputBottom: input.bottom, inputTop: input.top, mainHeight: main.height };
    });
    assert.ok(layout.width <= width + 1, `horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
    assert.ok(layout.height <= height + 1, `vertical overflow at ${width}: ${JSON.stringify(layout)}`);
    assert.ok(layout.inputBottom <= height && layout.inputTop >= 0, `composer visible at ${width}`);
    assert.ok(layout.mainHeight >= 120, `chat still has room at ${width}: ${JSON.stringify(layout)}`);
    await panel.screenshot({ path: path.join(output, `panel-${width}x${height}.png`) });
  }
  checks.push('model and usage only in settings; chat composer visible at four panel sizes');
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
} catch (error) {
  process.exitCode = 1;
  failures.push(String(error));
  console.error(String(error));
  if (panel) await panel.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
} finally {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ date: new Date().toISOString(), checks, failures, modelResponses: 'controlled UI fixtures; live model inference blocked by exhausted account quota' }, null, 2));
  await browser.close();
}
