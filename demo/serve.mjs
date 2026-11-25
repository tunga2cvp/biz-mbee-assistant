import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const page = new URL('./index.html', import.meta.url);
createServer(async (request, response) => {
  if (request.method !== 'GET' || !['/', '/index.html'].includes(request.url)) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    const html = await readFile(page);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(html);
  } catch {
    response.writeHead(500);
    response.end('Demo file unavailable');
  }
}).listen(8088, '127.0.0.1', () => console.log('Open http://127.0.0.1:8088'));