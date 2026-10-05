// Same input traces and level, changing only the collision candidate lookup.
// Rendering is measured separately in the game canvas's data-performance field.
import * as THREE from '../vendor/three.module.js';
import { createHouse } from '../src/house.js';
import { RabbitController } from '../src/physics.js';

const { world } = createHouse(new THREE.Scene()), indexed = world.query;
const starts = [[-10, 0, 16], [1, 4.2, -6], [20.5, 0, -36], [-22.5, 0, -12], [0, 0, 29], [-16, 0, 12]];
const inputs = Array.from({ length: 600 }, (_, i) => ({ x: Math.sin(i * .09), z: Math.cos(i * .11), run: true, jump: i % 67 < 30 }));
function sample(query) {
  world.query = query;
  const start = performance.now();
  for (const [x, y, z] of starts) {
    const rabbit = new RabbitController(world); Object.assign(rabbit, { x, y, z });
    rabbit.surface = world.support(x, z, y + .01).surface;
    for (const input of inputs) rabbit.update(1 / 60, input);
  }
  return performance.now() - start;
}
const scan = () => world.solids;
sample(indexed); sample(scan);
const a = [], b = [];
for (let i = 0; i < 9; i++) {
  // Alternate order to reduce warm-up and CPU scheduling bias.
  if (i % 2) { b.push(sample(scan)); a.push(sample(indexed)); }
  else { a.push(sample(indexed)); b.push(sample(scan)); }
}
world.query = indexed;
const median = values => values.sort((a, b) => a - b)[4];
const fast = median(a), slow = median(b);
let cells = 0, candidates = 0;
for (let x = -25; x < 26; x += 2) for (let z = -37; z < 32; z += 2) { cells++; candidates += world.query(x, z).length; }
console.log(JSON.stringify({ updatesPerSample: starts.length * inputs.length, solids: world.solids.length, averageNearbySolids: +(candidates / cells).toFixed(1), indexedMedianMs: +fast.toFixed(2), fullScanMedianMs: +slow.toFixed(2), speedup: +(slow / fast).toFixed(2) }, null, 2));
