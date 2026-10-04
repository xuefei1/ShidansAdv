import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
// An explicit allowlist keeps personal photos, Git metadata and docs off the server.
const allowed = p => p === '/index.html' || p === '/style.css' || p === '/favicon.svg' || p === '/tests/browser.html' || p === '/tests/browser-qa.js' || p.startsWith('/src/') || p.startsWith('/vendor/');
const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const requestPath = path === '/' ? '/index.html' : path;
    const file = resolve(root, '.' + requestPath);
    if (!allowed(requestPath) || !file.startsWith(root + sep)) { res.writeHead(404); res.end('Not found'); return; }
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Open http://localhost:${port}, or set PORT to another number.` : error); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  console.log(`Shidan's Adventure is ready at http://localhost:${port}\nPress Ctrl+C to stop.`);
  if (process.argv.includes('--open')) {
    const url = `http://localhost:${port}`;
    const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const browser = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
    browser.on('error', () => console.log(`Open ${url} in your browser.`));
  }
});
