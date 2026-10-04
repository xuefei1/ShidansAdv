import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'style.css', 'favicon.svg', 'src']) await cp(path, `dist/${path}`, { recursive: true });
await mkdir('dist/vendor', { recursive: true });
for (const path of ['three.core.js', 'three.module.js', 'THREE-LICENSE.txt']) await cp(`vendor/${path}`, `dist/vendor/${path}`);
for (const path of ['LICENSE', 'docs/ASSETS.md']) await cp(path, `dist/${path === 'LICENSE' ? 'LICENSE' : 'ASSETS.md'}`);
console.log('Built dist/. Run node scripts/serve.mjs --dist to preview. No network dependencies.');
