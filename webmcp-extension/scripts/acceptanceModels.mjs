import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import catalog from '../shared/cloudModels.json' with { type: 'json' };

const root = fileURLToPath(new URL('../..', import.meta.url));
const measureUsage = process.argv.includes('--usage');
const output = path.join(root, measureUsage ? 'artifacts/token-usage' : 'artifacts/model-selection');
await fs.mkdir(output, { recursive: true });
const credentials = JSON.parse(await fs.readFile(path.join(root, 'cloudflare/private/test-login.json'), 'utf8'));
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, pipe: true, enableExtensions: true, protocolTimeout: 20000, args: ['--enable-features=WebMCP', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const checks = [];
const trace = [];
const responseUsage = [];
const usageReads = [];
let panel;
try {
  const extensionId = await browser.installExtension(path.join(root, 'webmcp-extension/store-dist'));
  await browser.waitForTarget(target => target.type() === 'service_worker' && target.url() === `chrome-extension://${extensionId}/background.js`);
  console.log('READY extension');
  const demo = await browser.newPage();
  await demo.goto('https://biz.thanhtunga2cvp.workers.dev/demo');
  await demo.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Hai tool native'));
  panel = await browser.newPage();
  // A real side panel stays visible beside the active page. Keep this test's
  // extension tab visible to Chrome too, while the demo remains the active tab.
  await (await panel.createCDPSession()).send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await panel.setViewport({ width: 420, height: 900 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
  await panel.waitForSelector('.mbee-auth form');
  for (const [name, value] of Object.entries(credentials)) {
    await panel.$eval(`input[name="${name}"]`, (el, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  }
  await panel.$eval('.mbee-auth__submit', el => el.click());
  await panel.waitForSelector('#mbee-cloud-model', { timeout: 30000 });
  console.log('READY logged in');
  assert.equal(await panel.$eval('#mbee-cloud-model', el => el.value), catalog.defaultModel);
  assert.equal(await panel.$$eval('#mbee-cloud-model option', els => els.length), 2);
  await panel.$$eval('.consent-view button', els => els.find(el => el.textContent.trim() === 'Got it').click());
  panel.on('request', request => { if (request.url().endsWith('/extension/v1/chat/completions')) trace.push(JSON.parse(request.postData())); });
  panel.on('response', response => {
    if (!response.url().endsWith('/extension/v1/chat/completions')) return;
    console.log('MODEL HTTP', response.status());
    if (measureUsage) usageReads.push((async () => {
      const events = (await response.text()).split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]').map(line => JSON.parse(line.slice(6)));
      const usage = events.filter(event => event.usage && typeof event.usage.prompt_tokens === 'number' && event.usage.total_tokens > 0).at(-1)?.usage;
      assert.ok(usage, 'provider reported final numeric usage');
      responseUsage.push({ model: JSON.parse(response.request().postData()).model, ...usage });
    })());
  });
  panel.on('requestfailed', request => console.log('REQUEST FAILED', request.failure()?.errorText));
  panel.on('pageerror', error => console.log('PAGE ERROR', String(error)));
  for (const [index, model] of catalog.models.entries()) {
    await demo.bringToFront();
    console.log('READY demo active', model.id);
    if (index) {
      await panel.select('#mbee-cloud-model', model.id);
      assert.equal(await panel.$$eval('.user-bubble', els => els.length), 0);
      checks.push({ name: 'switch_clears_conversation', status: 'passed' });
    }
    await panel.waitForFunction(() => /2 tools/.test(document.querySelector('.actions-chip')?.textContent || ''), { timeout: 20000, polling: 100 }).catch(async error => { console.log('PANEL', await panel.$eval('body', el => el.innerText)); throw error; });
    const unit = index ? 'GRANITEDEMO' : 'QWENDEMO';
    const user = index ? 'GRANITEUSER' : 'QWENUSER';
    const traceStart = trace.length;
    await panel.$eval('input.text-input__field', (el, text) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, `Use the form-filling tool with unitCode ${unit} and userName ${user}.`);
    await panel.$eval('button[aria-label="send"]', el => el.click());
    await panel.waitForSelector('.tool-permission-card', { timeout: 120000 });
    assert.equal(await panel.$eval('#mbee-cloud-model', el => el.disabled), true);
    await panel.$eval('.tool-permission-card__btn--allow', el => el.click());
    await demo.waitForFunction((unit, user) => document.querySelector('#unit').value === unit && document.querySelector('#user').value === user, { timeout: 120000, polling: 100 }, unit, user);
    await panel.waitForFunction(() => !document.querySelector('button[aria-label="stop"]'), { timeout: 120000, polling: 100 });
    assert.equal(await panel.$('.msg.error'), null);
    assert.ok(trace.length >= traceStart + 2);
    assert.ok(trace.slice(traceStart).every(request => request.model === model.id));
    assert.equal(await panel.$eval('#mbee-cloud-model', el => el.disabled), false);
    if (measureUsage) {
      await Promise.all(usageReads);
      const displayed = await panel.$eval('[data-testid="token-usage"]', el => ({ requests: Number(el.dataset.requests), input: Number(el.dataset.input), output: Number(el.dataset.output), total: Number(el.dataset.total), missing: Number(el.dataset.missing) }));
      assert.equal(displayed.requests, trace.length);
      assert.equal(displayed.input, responseUsage.reduce((sum, usage) => sum + usage.prompt_tokens, 0));
      assert.equal(displayed.output, responseUsage.reduce((sum, usage) => sum + usage.completion_tokens, 0));
      assert.equal(displayed.total, responseUsage.reduce((sum, usage) => sum + usage.total_tokens, 0));
      assert.equal(displayed.missing, 0);
      checks.push({ name: `usage_matches_provider_all_tool_rounds:${model.id}`, status: 'passed', ...displayed });
    }
    checks.push({ name: `native_browser_tool_loop:${model.id}`, status: 'passed' });
    console.log('PASS', model.id, 'native callback, model routing, busy lock');
  }
  if (measureUsage) {
    await panel.bringToFront();
    await panel.$eval('[data-testid="token-usage"]', el => { el.open = true; });
    assert.equal(await panel.$$eval('[data-testid="token-usage"] tbody tr', els => els.length), 2);
    await panel.screenshot({ path: path.join(output, 'token-usage.png') });
  }
  await panel.reload();
  await panel.waitForSelector('#mbee-cloud-model', { timeout: 30000 });
  assert.equal(await panel.$eval('#mbee-cloud-model', el => el.value), catalog.models[1].id);
  if (measureUsage) assert.equal(await panel.$eval('[data-testid="token-usage"]', el => Number(el.dataset.requests)), 0);
  await panel.select('#mbee-cloud-model', catalog.defaultModel);
  await panel.reload();
  await panel.waitForSelector('#mbee-cloud-model', { timeout: 30000 });
  assert.equal(await panel.$eval('#mbee-cloud-model', el => el.value), catalog.defaultModel);
  checks.push({ name: 'selection_persists_on_reload_and_returns_to_qwen', status: 'passed' });
  await panel.bringToFront();
  await panel.screenshot({ path: path.join(output, 'model-picker.png') });
} catch (error) {
  process.exitCode = 1;
  checks.push({ name: 'run', status: 'failed', error: String(error) });
  console.error(String(error));
  if (panel) {
    await fs.writeFile(path.join(output, 'failure.txt'), await panel.$eval('body', el => el.innerText).catch(() => 'Browser page did not respond'));
  }
} finally {
  await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2));
  await fs.writeFile(path.join(output, 'browser-trace.json'), JSON.stringify(trace, null, 2));
  if (measureUsage) await fs.writeFile(path.join(output, 'provider-usage.json'), JSON.stringify(responseUsage, null, 2));
  await browser.close();
}
