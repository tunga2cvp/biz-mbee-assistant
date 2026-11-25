import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import esbuild from 'esbuild';
import { copyStaticFiles, createBuildOptions } from './buildConfig.ts';
import worker from '../../cloudflare/worker.js';

const workspace = fileURLToPath(new URL('../..', import.meta.url));
const live = process.argv.includes('--live');
const project = fileURLToPath(new URL('..', import.meta.url));
const secrets = JSON.parse(await fs.readFile(path.join(workspace, 'cloudflare/private/deploy-secrets.json'), 'utf8'));
const credentials = JSON.parse(await fs.readFile(path.join(workspace, 'cloudflare/private/test-login.json'), 'utf8'));
const previousEnv = await fs.readFile(path.join(project, '.env'), 'utf8');
const pocToken = previousEnv.match(/^OPENAI_API_KEY=(.*)$/m)[1].trim();
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'mbee-auth-test-'));
const output = path.join(workspace, live ? 'artifacts/auth-live-acceptance' : 'artifacts/auth-acceptance');
await fs.mkdir(output, { recursive: true });
let inferenceCount = 0;
const trace = [];
const settings = { ...secrets, EXTENSION_RATE_LIMITER: { limit: async () => ({ success: true }) }, AI: { run: async (_model, input) => {
  inferenceCount++;
  const response = await fetch('https://biz.thanhtunga2cvp.workers.dev/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${pocToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Error(`Real model HTTP ${response.status}`);
  return input.stream ? response.body : response.json();
} } };
const bridge = http.createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request(`http://127.0.0.1:${bridge.address().port}${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) }),
    });
    const response = await worker.fetch(request, settings);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) outgoing.write(Buffer.from(chunk));
    outgoing.end();
  } catch (error) { outgoing.writeHead(500); outgoing.end(JSON.stringify({ error: String(error) })); }
});
await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
const cloudUrl = live ? 'https://biz.thanhtunga2cvp.workers.dev' : `http://127.0.0.1:${bridge.address().port}`;
copyStaticFiles(project, stage);
await Promise.all(createBuildOptions({ rootDir: project, outDir: stage, authToken: '', serverUrl: '', cloudUrl }).map(config => esbuild.build(config)));
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, pipe: true, enableExtensions: true, protocolTimeout: 20000, args: ['--enable-features=WebMCP'] });
const checks = [];
const passed = name => { checks.push({ name, status: 'passed' }); console.log('PASS', name); };
let panel;
let demo;
try {
  const extensionId = await browser.installExtension(stage);
  await browser.waitForTarget(t => t.type() === 'service_worker' && t.url() === `chrome-extension://${extensionId}/background.js`);
  demo = await browser.newPage();
  await demo.goto(`${cloudUrl}/demo`);
  await demo.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Hai tool native'));
  panel = await browser.newPage();
  await panel.setViewport({ width: 1280, height: 800 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
  await panel.waitForSelector('.mbee-auth form');
  assert.equal(await panel.$('#chatStream'), null);
  assert.equal(inferenceCount, 0);
  await panel.screenshot({ path: path.join(workspace, 'store/login-1280x800.png') });
  passed('locked_before_login_no_inference');
  const submitLogin = async password => {
    for (const [name, value] of [['username', credentials.username], ['password', password]]) {
      await panel.$eval(`input[name="${name}"]`, (el, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
    }
    await panel.$eval('.mbee-auth__submit', el => el.click());
  };
  await submitLogin('incorrect-password-for-test');
  await panel.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('không đúng'));
  assert.equal(await panel.$('#chatStream'), null);
  assert.equal(inferenceCount, 0);
  passed('wrong_password_cannot_open_agent');
  await submitLogin(credentials.password);
  await panel.waitForSelector('.consent-view', { timeout: 30000 });
  await panel.screenshot({ path: path.join(workspace, 'store/consent-1280x800.png') });
  assert.equal(await panel.$eval('input[type="password"]', el => el.value).catch(() => ''), '');
  const saved = await panel.evaluate(async () => ({ session: await chrome.storage.session.get('mbeeSession'), local: await chrome.storage.local.get(null), localStorage: JSON.stringify(localStorage) }));
  assert.ok(saved.session.mbeeSession.token);
  assert.ok(!JSON.stringify(saved.local).includes(credentials.password));
  assert.ok(!saved.localStorage.includes(credentials.password));
  passed('correct_login_session_only_password_not_persisted');
  await demo.bringToFront();
  await panel.$$eval('.consent-view button', els => els.find(el => el.textContent.trim() === 'Got it').click());
  await panel.waitForFunction(() => /2 tools/.test(document.querySelector('.actions-chip')?.textContent || ''), { polling: 100, timeout: 20000 });
  panel.on('request', request => {
    if (request.url().endsWith('/extension/v1/chat/completions')) trace.push(JSON.parse(request.postData()));
  });
  await panel.$eval('input.text-input__field', el => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'Điền mã đơn vị AUTHDEMO và tên người dùng CLOUDUSER');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await panel.$eval('button[aria-label="send"]', el => el.click());
  await panel.waitForSelector('.tool-permission-card', { timeout: 150000 });
  assert.equal(await demo.$eval('#unit', el => el.value), '');
  await panel.$eval('.tool-permission-card__btn--allow', el => el.click());
  await demo.waitForFunction(() => document.querySelector('#unit').value === 'AUTHDEMO' && document.querySelector('#user').value === 'CLOUDUSER', { timeout: 150000 });
  await panel.waitForFunction(() => document.querySelector('input.text-input__field') && !document.querySelector('button[aria-label="stop"]') && /CLOUDUSER/.test(document.querySelector('.ai-response')?.textContent || ''), { polling: 100, timeout: 150000 });
  assert.ok(live ? trace.length >= 2 : inferenceCount >= 2);
  await demo.screenshot({ path: path.join(output, 'native-filled.png') });
  await fs.writeFile(path.join(output, 'panel-transcript.txt'), await panel.$eval('body', el => el.innerText));
  passed('authenticated_cloud_model_native_tool_result_loop');
  await panel.$eval('.mbee-account button', el => el.click());
  await panel.waitForSelector('.mbee-auth form');
  assert.equal(await panel.$('.user-bubble'), null);
  assert.deepEqual(await panel.evaluate(() => chrome.storage.session.get('mbeeSession')), {});
  passed('logout_locks_and_clears_session_and_conversations');
  await submitLogin(credentials.password);
  await panel.waitForSelector('.mbee-account');
  assert.equal(await panel.$$eval('.user-bubble', els => els.length), 0);
  await panel.evaluate(async () => {
    const { mbeeSession } = await chrome.storage.session.get('mbeeSession');
    await chrome.storage.session.set({ mbeeSession: { ...mbeeSession, expiresAt: Date.now() - 1 } });
  });
  await panel.waitForSelector('.mbee-auth form');
  passed('expired_session_relocks_without_reusing_old_chat');
} catch (error) {
  checks.push({ name: 'run', status: 'failed', error: String(error) });
  console.error(error);
  if (panel) await fs.writeFile(path.join(output, 'failure-panel.txt'), await panel.$eval('body', el => el.innerText).catch(() => 'unavailable'));
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ date: new Date().toISOString(), mode: live ? 'deployed Worker login and inference, native WebMCP, temporary Chrome profile' : 'real Worker authentication locally; actual Cloudflare Qwen via existing POC proxy; temporary Chrome profile', checks, inferenceCount: live ? trace.length : inferenceCount }, null, 2));
  await fs.writeFile(path.join(output, 'model-trace.json'), JSON.stringify(trace, null, 2));
  await browser.close();
  await new Promise(resolve => bridge.close(resolve));
  assert.ok(path.dirname(path.resolve(stage)) === path.resolve(os.tmpdir()) && path.basename(stage).startsWith('mbee-auth-test-'), 'Cleanup target must be this test temporary directory');
  await fs.rm(stage, { recursive: true, force: true });
}
