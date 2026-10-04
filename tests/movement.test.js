import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createHouse } from '../src/house.js';
import { RabbitController, DEN, World } from '../src/physics.js';

const { world } = createHouse(new THREE.Scene());
function run(rabbit, seconds, input = {}, dt = 1 / 120) {
  let highest = rabbit.y;
  for (let time = 0; time < seconds - .00001; time += dt) { rabbit.update(dt, input); highest = Math.max(highest, rabbit.y); }
  return highest;
}
function place(x, y, z) {
  const rabbit = new RabbitController(world); Object.assign(rabbit, { x, y, z, surface: world.support(x, z, y + .02).surface }); return rabbit;
}

test('den dimensions and spawn match the brief', () => {
  const rabbit = new RabbitController(world);
  assert.equal(DEN.radius * 2, 3); assert.equal(DEN.fenceHeight, 1.1);
  assert.equal(rabbit.surface, 'bedding'); assert.equal(rabbit.y, 0);
});
test('walking cannot pass through the circular fence', () => {
  const rabbit = new RabbitController(world); run(rabbit, 3, { x: 1, run: true });
  assert.ok(Math.hypot(rabbit.x - DEN.x, rabbit.z - DEN.z) <= 1.281);
});
test('a tapped jump stays below the fence', () => {
  const rabbit = new RabbitController(world); run(rabbit, .04, { jump: true });
  const highest = run(rabbit, 1.5, { x: 1 });
  assert.ok(highest > .4 && highest < .65, `tap apex ${highest}`);
  assert.ok(Math.hypot(rabbit.x - DEN.x, rabbit.z - DEN.z) < 1.5);
});
test('charged jump clears the den and lands on wood', () => {
  const rabbit = new RabbitController(world); run(rabbit, .7, { jump: true });
  const highest = run(rabbit, 1.2, { x: 1 });
  assert.ok(highest > 1.7, `long jump apex ${highest}`);
  assert.ok(rabbit.x > DEN.x + DEN.radius + rabbit.radius, `escaped x ${rabbit.x}`);
  assert.equal(rabbit.surface, 'wood'); assert.equal(rabbit.grounded, true); assert.equal(rabbit.y, 0);
});
test('wood cannot produce a long jump even after a full charge', () => {
  const rabbit = place(0, 0, 2); run(rabbit, .8, { jump: true });
  assert.ok(run(rabbit, 1, {}) < .65);
});
test('carpet supports a full charged jump', () => {
  const rabbit = place(1.3, 3.4, -2.4); run(rabbit, .7, { jump: true });
  assert.ok(run(rabbit, 1.4, {}) > 5.1); assert.equal(rabbit.y, 3.4);
});
test('wood accelerates more slowly and retains more momentum than carpet', () => {
  const wood = place(0, 0, 2), carpet = place(1.3, 3.4, -2.4);
  run(wood, .3, { x: 1, run: true }); run(carpet, .3, { x: 1, run: true });
  assert.ok(carpet.vx > wood.vx * 2);
  wood.vx = carpet.vx = 2; run(wood, .2); run(carpet, .2);
  assert.ok(wood.vx > carpet.vx * 3);
});
test('stairs are traversable to the upper landing without jumping', () => {
  const rabbit = place(6.3, 0, 5.4); run(rabbit, 5.2, { z: -1 });
  assert.ok(rabbit.z < -3, `z ${rabbit.z}`); assert.ok(rabbit.y >= 3.39, `y ${rabbit.y}`);
  assert.equal(rabbit.surface, 'carpet'); assert.equal(rabbit.grounded, true);
});
test('stairs allow returning to the ground floor', () => {
  const rabbit = place(6.3, 3.4, -3.2); run(rabbit, 5.5, { z: 1 });
  assert.ok(rabbit.z > 4.9, `z ${rabbit.z}`); assert.equal(rabbit.y, 0);
});
test('the same upper floor can be walked beneath on the ground floor', () => {
  const rabbit = place(.4, 0, -2); run(rabbit, 1, { z: -1 });
  assert.equal(rabbit.y, 0); assert.ok(rabbit.z < -3); assert.equal(rabbit.surface, 'wood');
});
test('the couch blocks horizontal movement', () => {
  const rabbit = place(-4.3, 0, 1.1); run(rabbit, 2, { z: -1, run: true });
  assert.ok(rabbit.z >= .49, `couch boundary z ${rabbit.z}`);
});
test('upper floor catches falling players instead of dropping through it', () => {
  const rabbit = place(1.3, 5.4, -2.4); rabbit.grounded = false;
  run(rabbit, 2); assert.equal(rabbit.y, 3.4); assert.equal(rabbit.surface, 'carpet');
});
test('ceilings stop upward movement from below', () => {
  const room = new World(); room.addBox(0, 1.4, 0, 5, .2, 5);
  const rabbit = new RabbitController(room); Object.assign(rabbit, { x: 0, z: 0, y: 0, vy: 8, grounded: false });
  assert.ok(run(rabbit, .5) <= .621);
});
test('low framerate does not tunnel through the fence', () => {
  const rabbit = new RabbitController(world); run(rabbit, 3, { x: 1, run: true }, .1);
  assert.ok(rabbit.x - DEN.x <= 1.281);
});
test('releasing input on pause cancels charge without an accidental jump', () => {
  const rabbit = new RabbitController(world); run(rabbit, .7, { jump: true });
  rabbit.releaseInput(); run(rabbit, .1); assert.equal(rabbit.y, 0); assert.equal(rabbit.charging, false);
});
test('frame rates produce comparable travel', () => {
  const a = place(0, 0, 2), b = place(0, 0, 2);
  run(a, 1, { z: 1 }, 1 / 30); run(b, 1, { z: 1 }, 1 / 120);
  assert.ok(Math.abs(a.z - b.z) < .02);
});

test('the upstairs landing connects to the reading nook around the furniture', () => {
  const rabbit = place(6.3, 3.4, -3.08); run(rabbit, 5, { x: -1 });
  assert.ok(rabbit.x < -4.6, `reading nook x ${rabbit.x}`);
  assert.equal(rabbit.y, 3.4); assert.equal(rabbit.surface, 'carpet');
});
