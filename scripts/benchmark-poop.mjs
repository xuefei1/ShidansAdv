import { performance } from 'node:perf_hooks';
import * as THREE from '../vendor/three.module.js';
import { createHouse } from '../src/house.js';
import { PoopPhysics, POOP_RADIUS, MAX_POOP_BALLS } from '../src/poop-physics.js';

const { world } = createHouse(new THREE.Scene());
const physics = new PoopPhysics(world), frameTimes = [];
for (let i = 0; i < MAX_POOP_BALLS; i++) physics.spawn({ x: -11 + (i % 100) * .22, y: POOP_RADIUS + .02, z: -9.4 + Math.floor(i / 100) * .19 });
for (let frame = 0; frame < 180; frame++) {
  const before = performance.now(); physics.update(1 / 60); frameTimes.push(performance.now() - before);
  physics.dirty.clear();
  if (frame % 60 === 59) console.log(`After ${(frame + 1) / 60}s: ${physics.count} balls, ${physics.active.size} active, last step ${frameTimes.at(-1).toFixed(2)} ms`);
}
const final = frameTimes.slice(-60).sort((a, b) => a - b);
const finite = physics.balls.every(b => Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz));
console.log(JSON.stringify({ balls: physics.count, active: physics.active.size, lastSecondMedianMs: +final[30].toFixed(2), lastSecondP95Ms: +final[57].toFixed(2), finite }));
if (!finite || physics.count !== MAX_POOP_BALLS) process.exitCode = 1;
