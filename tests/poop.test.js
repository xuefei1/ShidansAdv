import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createHouse } from '../src/house.js';
import { World, RabbitController } from '../src/physics.js';
import { DEN, STAIRS } from '../src/layout.js';
import { PoopPhysics, POOP_RADIUS as R, MAX_POOP_BALLS } from '../src/poop-physics.js';
const { world } = createHouse(new THREE.Scene());
function run(physics, seconds, rabbit) { for (let i = 0; i < seconds * 60; i++) physics.update(1 / 60, rabbit); }
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('every drop starts behind Shidan, including airborne drops', () => {
  const physics = new PoopPhysics(world), rabbit = new RabbitController(world);
  rabbit.y = 1; rabbit.facing = Math.PI / 2;
  const ball = physics.dropBehind(rabbit);
  assert.ok(ball.x < rabbit.x - .6); assert.ok(ball.y > rabbit.y); assert.equal(physics.count, 1);
});
test('balls bounce, settle, sleep and remain indefinitely', () => {
  const physics = new PoopPhysics(world), ball = physics.spawn({ x: 0, y: 1, z: 3 });
  run(physics, 4); assert.ok(Math.abs(ball.y - R) < .001); assert.equal(ball.sleeping, true);
  run(physics, 120); assert.equal(physics.count, 1); assert.equal(physics.balls[0], ball);
});
test('dropping beside the fence does not create a ball through the fence', () => {
  const physics = new PoopPhysics(world), rabbit = new RabbitController(world);
  rabbit.x = DEN.x + DEN.radius - .24; rabbit.facing = -Math.PI / 2;
  const ball = physics.dropBehind(rabbit);
  assert.ok(ball.x < DEN.x + DEN.radius - R);
  run(physics, 2); assert.ok(Math.hypot(ball.x - DEN.x, ball.z - DEN.z) < DEN.radius - R);
});
test('balls land on the upper floor, not the ground below', () => {
  const physics = new PoopPhysics(world), ball = physics.spawn({ x: 1.3, y: STAIRS.height + 1, z: -2.4 });
  run(physics, 4); assert.ok(Math.abs(ball.y - STAIRS.height - R) < .001);
});
test('balls below the upper floor stay on the ground floor', () => {
  const physics = new PoopPhysics(world), ball = physics.spawn({ x: .4, y: 1, z: -2 });
  run(physics, 4); assert.ok(Math.abs(ball.y - R) < .001);
});
test('furniture and ceilings block balls', () => {
  const room = new World(); room.addBox(.8, .5, 0, .2, 1, 3); room.addBox(0, 1.4, 0, 3, .2, 3);
  const physics = new PoopPhysics(room), ball = physics.spawn({ x: 0, y: .2, z: 0, vx: 5, vy: 7 });
  for (let i = 0; i < 100; i++) { physics.update(1 / 60); assert.ok(ball.x <= .7 - R + .001); assert.ok(ball.y <= 1.3 - R + .001); }
});
test('the enlarged den fence collides with poop balls', () => {
  const physics = new PoopPhysics(world), ball = physics.spawn({ x: DEN.x + DEN.radius - .2, y: .4, z: DEN.z, vx: 4 });
  run(physics, 1); assert.ok(Math.hypot(ball.x - DEN.x, ball.z - DEN.z) < DEN.radius - R);
});
test('balls collide with each other and transfer momentum', () => {
  const physics = new PoopPhysics(new World());
  const a = physics.spawn({ x: -.25, y: R, z: 0, vx: 2 }), b = physics.spawn({ x: 0, y: R, z: 0 });
  run(physics, .3); assert.ok(b.x > .035, `other ball moved to ${b.x}`); assert.ok(distance(a, b) >= R * 1.9);
});
test('Shidan wakes and pushes a sleeping ball instead of phasing through it', () => {
  const physics = new PoopPhysics(new World()), ball = physics.spawn({ x: 0, y: R, z: 0 });
  run(physics, 2); assert.equal(ball.sleeping, true);
  const rabbit = { x: -.08, y: 0, z: 0, radius: .22, height: .68, facing: Math.PI / 2, vx: 2, vy: 0, vz: 0 };
  physics.update(1 / 60, rabbit); assert.ok(ball.x > .15); assert.equal(ball.sleeping, false); assert.ok(ball.vx > 0);
});
test('coincident balls separate without NaN positions', () => {
  const physics = new PoopPhysics(new World());
  const a = physics.spawn({ x: 0, y: .3, z: 0 }), b = physics.spawn({ x: 0, y: .3, z: 0 });
  run(physics, 2); assert.ok(Number.isFinite(distance(a, b))); assert.ok(distance(a, b) >= R * 1.95);
});
test('stairs support balls and let them roll downward', () => {
  const physics = new PoopPhysics(world), x = (STAIRS.minX + STAIRS.maxX) / 2, z = (STAIRS.startZ + STAIRS.endZ) / 2;
  const ball = physics.spawn({ x, y: world.rampHeight(x, z) + R + .1, z });
  run(physics, 1); assert.ok(ball.z > z + .1); assert.ok(ball.y >= world.rampHeight(ball.x, ball.z));
});
test('exactly 10,000 balls persist and adding more replaces only the oldest', () => {
  const physics = new PoopPhysics(new World());
  for (let i = 0; i < MAX_POOP_BALLS; i++) physics.spawn({ x: -10 + (i % 100) * .2, y: R, z: -9.7 + Math.floor(i / 100) * .195 });
  const oldest = physics.balls[0], second = physics.balls[1], last = physics.balls.at(-1);
  assert.equal(physics.count, MAX_POOP_BALLS); assert.equal(oldest.id, 1); assert.equal(last.id, MAX_POOP_BALLS);
  const extra = physics.spawn({ x: 0, y: .5, z: 3 });
  assert.equal(physics.count, MAX_POOP_BALLS); assert.equal(extra.slot, oldest.slot);
  assert.equal(physics.balls[1], second); assert.equal(physics.balls.at(-1), last);
  assert.equal(physics.active.has(oldest), false); assert.equal([...physics.grid.near(oldest.x, oldest.y, oldest.z, R * 2)].includes(oldest), false);
});
