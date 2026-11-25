import fs from 'node:fs/promises';
const read = path => fs.readFile(new URL(path, import.meta.url), 'utf8');
const base = (await read('./worker.original.js')).replace('async fetch(request, env) {', `async fetch(request, env) {
    const publicPath = new URL(request.url).pathname;
    if ((publicPath === '/privacy' || publicPath === '/demo') && request.method === 'GET') return extensionPublicPage(publicPath);
    if (publicPath.startsWith('/extension/')) return handleExtensionApi(request, env);
    if (publicPath === '/v1/chat/completions') return handleWebMcp(request, env);`);
const privacy = await read('../store/privacy.html');
const demo = await read('../demo/index.html');
const pages = `
function extensionPublicPage(path) {
  const nonce = crypto.randomUUID();
  const html = path === '/privacy' ? ${JSON.stringify(privacy)} : ${JSON.stringify(demo)}.replace('<script type="module">', '<script type="module" nonce="' + nonce + '">');
  return new Response(html, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  } });
}
`;
const catalog = JSON.parse(await read('../webmcp-extension/shared/cloudModels.json'));
await fs.writeFile(new URL('./worker.js', import.meta.url), [base, `const WEBMCP_MODEL_CATALOG = ${JSON.stringify(catalog)};`, await read('./webmcp-handler.js'), await read('./extension-auth.js'), pages].join('\n\n'));
console.log('Built Worker with authentication, inference, privacy and public demo.');
