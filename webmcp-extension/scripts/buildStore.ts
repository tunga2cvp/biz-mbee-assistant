import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { copyStaticFiles, createBuildOptions } from './buildConfig.ts';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const outDir = path.join(rootDir, 'store-dist');
const cloudUrl = (process.env.WEBMCP_CLOUD_URL || 'https://biz.thanhtunga2cvp.workers.dev').replace(/\/$/, '');
if (new URL(cloudUrl).protocol !== 'https:') throw Error('Public build requires an HTTPS Worker URL.');
fs.mkdirSync(outDir, { recursive: true });
copyStaticFiles(rootDir, outDir);
const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
Object.assign(manifest, { name: 'BIZ Mbee Assistant', short_name: 'Mbee Assistant', version: '1.3.1',
  description: 'Trợ lý WebMCP có đăng nhập: chat tiếng Việt, khám phá công cụ của trang và thực hiện sau khi được cho phép.',
  homepage_url: `${cloudUrl}/privacy`,
});
manifest.side_panel.default_title = 'BIZ Mbee Assistant';
manifest.icons = Object.fromEntries([16, 32, 48, 128].map(size => [String(size), `icons/mbee${size}.png`]));
manifest.action.default_icon = { ...manifest.icons };
manifest.content_security_policy = { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none';" };
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const config of createBuildOptions({ rootDir, outDir, authToken: '', serverUrl: '', cloudUrl })) {
  await esbuild.build({ ...config, minify: true, legalComments: 'eof' });
}
fs.copyFileSync(path.join(rootDir, 'LICENSE'), path.join(outDir, 'LICENSE'));
console.log('Built login-gated cloud extension into store-dist (no embedded credentials).');
