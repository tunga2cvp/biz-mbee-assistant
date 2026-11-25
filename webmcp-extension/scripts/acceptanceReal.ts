/// <reference lib="dom" />
/// <reference types="webmcp-types" />
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Page } from 'puppeteer-core';

const out = new URL('../../artifacts/acceptance/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const trace: object[] = [];
const checks: { name: string; status: string; detail?: unknown }[] = [];
const tabOnly = process.argv.includes('--tab-only');
const pendingTrace: Promise<void>[] = [];
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true, pipe: true, enableExtensions: true, protocolTimeout: 20000,
  args: ['--enable-features=WebMCP'],
});
let sidebar: Page | undefined;
let page: Page | undefined;
const click = (p: Page, selector: string) => p.$eval(selector, (el: Element) => (el as HTMLElement).click());
const tools = (p: Page) => p.evaluate(async () => (await document.modelContext!.getTools()).map(t => t.name));
const values = (p: Page) => p.evaluate(() => ({
  unitCode: (document.querySelector('#unit') as HTMLInputElement).value,
  userName: (document.querySelector('#user') as HTMLInputElement).value,
}));
function passed(name: string, detail?: unknown) { checks.push({ name, status: 'passed', detail }); console.log('PASS', name); }
async function waitCount(count: number) {
  await sidebar!.waitForFunction((n) => new RegExp(`(^|\\D)${n} tools\\b`).test(document.querySelector('.actions-chip')?.textContent || ''), { polling: 100, timeout: 20000 }, count);
}
async function prompt(message: string) {
  await sidebar!.waitForSelector('input.text-input__field');
  await sidebar!.$eval('input.text-input__field', (el, text) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, message);
  await click(sidebar!, 'button[aria-label="send"]');
}
async function idle() {
  await sidebar!.waitForFunction(() => {
    const replies = document.querySelectorAll('.ai-response');
    return Boolean(document.querySelector('input.text-input__field')) &&
      !document.querySelector('button[aria-label="stop"]') &&
      !document.querySelector('.tool-permission-card') &&
      Boolean(replies[replies.length - 1]?.textContent?.trim());
  }, { polling: 100, timeout: 150000 });
}
async function resetFormAndChat() {
  await page!.reload();
  await page!.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Hai tool native'));
  await click(sidebar!, 'button[aria-label="Start new chat"]');
  await sidebar!.waitForSelector('#welcomeCard');
  await waitCount(2);
}
async function screenshot(name: string) {
  await page!.screenshot({ path: fileURLToPath(new URL(`${name}-page.png`, out)), fullPage: true });
  // Chrome on Windows may stall captures of a background extension tab.
  // Keep it in the background so screenshotting cannot change the attached tab.
  await fs.writeFile(new URL(`${name}-panel.txt`, out), await sidebar!.$eval('body', el => el.innerText));
}
try {
  const extensionId = await browser.installExtension(fileURLToPath(new URL('../dist/', import.meta.url)));
  await browser.waitForTarget(t => t.type() === 'service_worker' && t.url() === `chrome-extension://${extensionId}/background.js`);
  page = await browser.newPage();
  await page.setViewport({ width: 1050, height: 850 });
  await page.goto('http://127.0.0.1:8088');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Hai tool native'), { timeout: 20000 });
  assert.deepEqual((await tools(page)).sort(), ['explain_test_workspace', 'stage_demo_identity']);
  passed('native_discovery', { tools: await tools(page), browser: await browser.version(), extensionId });

  sidebar = await browser.newPage();
  await sidebar.setViewport({ width: 460, height: 1000 });
  sidebar.on('response', response => {
    if (!response.url().endsWith('/api/chat')) return;
    pendingTrace.push((async () => {
      const body = response.request().postData();
      const lines = (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line));
      trace.push({ request: body ? JSON.parse(body) : null, response: lines.filter(line => line.done || line.error) });
    })().catch(error => { trace.push({ captureError: String(error) }); }));
  });
  await sidebar.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
  await page.bringToFront();
  await sidebar.waitForSelector('.consent-view');
  await sidebar.$$eval('.consent-view button', buttons => (buttons.find(b => b.textContent?.trim() === 'Got it') as HTMLElement).click());
  await waitCount(2);
  if (tabOnly) {
    await prompt('Tên người dùng thử nghiệm của tôi là PREVUSER42.');
    await idle();
  } else {
  await prompt('Trang này hỗ trợ tôi làm gì?');
  await idle();
  await Promise.all(pendingTrace);
  assert.match(JSON.stringify(trace), /explain_test_workspace/);
  assert.ok(trace.some(item => JSON.stringify(item).includes('Independent WebMCP test')), 'Actual page tool result required');
  passed('real_model_reads_page_context');
  await screenshot('01-context');

  await prompt('Điền mã đơn vị DEMOCORP và tên người dùng DEMOUSER23');
  await sidebar.waitForSelector('.tool-permission-card', { timeout: 90000 });
  assert.deepEqual(await values(page), { unitCode: '', userName: '' });
  await screenshot('02-permission');
  await click(sidebar, '.tool-permission-card__btn--allow');
  await idle();
  assert.deepEqual(await values(page), { unitCode: 'DEMOCORP', userName: 'DEMOUSER23' });
  assert.match(await page.$eval('#status', el => el.textContent || ''), /Callback native/);
  passed('vietnamese_request_native_fill_after_permission', await values(page));
  await screenshot('03-filled');

  await resetFormAndChat();
  await prompt('Điền mã đơn vị DEMOCORP');
  await idle();
  assert.deepEqual(await values(page), { unitCode: '', userName: '' });
  assert.equal(await sidebar.$('.tool-permission-card'), null);
  await screenshot('04-missing-field');
  await prompt('Tên người dùng là DEMOUSER23');
  await sidebar.waitForSelector('.tool-permission-card', { timeout: 90000 });
  await click(sidebar, '.tool-permission-card__btn--allow');
  await idle();
  assert.deepEqual(await values(page), { unitCode: 'DEMOCORP', userName: 'DEMOUSER23' });
  passed('missing_field_and_multiturn_context');
  await screenshot('05-multiturn');

  await resetFormAndChat();
  await prompt('Điền mã đơn vị DENYUNIT và tên người dùng DENYUSER');
  await sidebar.waitForSelector('.tool-permission-card', { timeout: 90000 });
  await click(sidebar, '.tool-permission-card__btn--deny');
  await idle();
  assert.deepEqual(await values(page), { unitCode: '', userName: '' });
  passed('permission_denied_no_native_fill');
  await screenshot('06-denied');

  await page.click('#extra');
  await waitCount(3);
  assert.ok((await tools(page)).includes('calculate_demo_total'));
  await prompt('Tính giúp 3 sản phẩm, giá mỗi sản phẩm 12000');
  await idle();
  await Promise.all(pendingTrace);
  assert.ok(trace.some(item => JSON.stringify(item).includes('calculate_demo_total') && JSON.stringify(item).includes('36000')), 'Native calculator result required');
  passed('dynamic_tool_discovery_and_native_total_36000');
  await screenshot('07-new-tool');

  await page.click('#disable');
  await page.waitForFunction(async () => (await document.modelContext!.getTools()).length === 0);
  await sidebar.waitForFunction(() => !/\b[1-9]\d* tools\b/.test(document.querySelector('.actions-chip')?.textContent || ''), { polling: 100, timeout: 20000 });
  await prompt('Điền mã đơn vị NEGATIVE và tên người dùng SHOULDNOTRUN');
  await idle();
  assert.deepEqual(await values(page), { unitCode: '', userName: '' });
  await Promise.all(pendingTrace);
  const negative = trace.at(-1) as { response: { functionCalls?: unknown[] }[] };
  assert.ok(negative.response.every(r => !r.functionCalls?.length));
  passed('unregistered_tools_cannot_run_no_fallback');
  await screenshot('08-no-tools');
  }

  const secondPage = await browser.newPage();
  await secondPage.goto('http://127.0.0.1:8088');
  await secondPage.bringToFront();
  await waitCount(2);
  await sidebar.waitForSelector('#welcomeCard');
  assert.equal(await sidebar.$$eval('.user-bubble', els => els.length), 0);
  await prompt('Điền mã đơn vị NEWTAB');
  await idle();
  assert.deepEqual(await values(secondPage), { unitCode: '', userName: '' });
  assert.equal(await sidebar.$('.tool-permission-card'), null);
  passed('separate_tab_does_not_reuse_username');
  page = secondPage;
  await screenshot('09-separate-tab');
} catch (error) {
  checks.push({ name: 'run', status: 'failed', detail: String(error) });
  console.error(error instanceof Error ? error.stack : String(error));
  if (sidebar && page) await screenshot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await Promise.all(pendingTrace);
  await fs.writeFile(new URL(tabOnly ? 'results-tab-isolation.json' : 'results.json', out), JSON.stringify({ date: new Date().toISOString(), provider: 'Cloudflare Workers AI', model: '@cf/qwen/qwen3.8-27b', upstreamCommit: '1d6a1c5da0096339d70dd6da4c98390746d7381b', checks }, null, 2));
  await fs.writeFile(new URL(tabOnly ? 'trace-tab-isolation.json' : 'trace.json', out), JSON.stringify(trace, null, 2));
  await browser.close();
}
