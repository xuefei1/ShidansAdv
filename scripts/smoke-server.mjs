import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const base = process.argv[2] || 'http://127.0.0.1:4173';
let ready = false;
for (let i = 0; i < 60; i++) {
  try { const response = await fetch(base, { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch { /* Starting the server. */ }
  await setTimeout(100);
}
assert.ok(ready, 'The launcher started the local HTTP server');
for (const path of ['/', '/src/main.js', '/src/layout.js', '/src/furnishings.js', '/src/level-map.js', '/vendor/three.module.js', '/style.css']) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path); assert.ok((await response.text()).length > 50, path);
}
for (const path of ['/pic/', '/.git/config', '/Start-Game.command']) assert.equal((await fetch(base + path)).status, 404, path);
console.log('Launcher/server smoke checks passed: page, game modules, local engine, stylesheet, and private-file boundaries.');
