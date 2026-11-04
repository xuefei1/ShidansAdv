import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const base = process.argv[2] || 'http://127.0.0.1:4173';
let ready = false;
for (let i = 0; i < 60; i++) {
  try { const response = await fetch(base, { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch { /* Starting the server. */ }
  await setTimeout(100);
}
assert.ok(ready, 'The launcher started the local HTTP server');
for (const path of ['/', '/src/main.js', '/src/happiness.js', '/src/chewable-data.js', '/src/start.js', '/src/day-cycle.js', '/src/day-lighting.js', '/src/house-lamps.js', '/src/adventure-session.js', '/src/layout.js', '/src/furnishings.js', '/src/level-map.js', '/src/render-batching.js', '/src/render-quality.js', '/src/surface-materials.js', '/src/render-profile.js', '/src/energy.js', '/src/consumable-data.js', '/src/consumable-collision.js', '/src/consumable-motion.js', '/src/house-roof.js', '/src/consumable-system.js', '/src/consumables.js', '/vendor/three.module.js', '/style.css']) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path); assert.ok((await response.text()).length > 50, path);
}
for (const path of ['/src/poop-supply.js','/src/poop.js','/src/poop-physics.js','/src/water.js','/src/fountains.js','/src/noise.js','/src/noise-ripples.js','/src/consumable-legend.js','/src/mistress-ai.js','/src/mistress-navigation.js','/src/mistress-model.js','/src/mistress-awareness.js']) assert.equal((await fetch(base + path)).status,200,path);
for (const path of ['/pic/', '/.git/config', '/Start-Game.command']) assert.equal((await fetch(base + path)).status, 404, path);
for (const path of ['/src/mistress-pursuit.js','/src/mistress-vision.js','/src/mistress-cone.js','/src/mistress-cleanup.js','/src/table-refuges.js','/src/round-stats.js','/src/rabbit-clearance.js','/src/mistress-capture.js','/src/audio.js','/src/basement.js','/src/terrain-backdrop.js']) assert.equal((await fetch(base + path)).status,200,path);
console.log('Launcher/server smoke checks passed: page, game modules, local engine, stylesheet, and private-file boundaries.');
