import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from '../src/house.js';
import { RabbitController } from '../src/physics.js';
import { PoopPhysics } from '../src/poop-physics.js';
import { WALLS, PORTALS, FLOOR_HEIGHT as H, RAMPS, DEN } from '../src/layout.js';
import { upperRoomsVisible } from '../src/visibility.js';

const { world, group, upper, ceiling, layers } = createHouse(new THREE.Scene());
const windows = WALLS.flatMap(w => w.openings.filter(o => o.kind === 'glazed-window').map(o => ({ w, o })));

test('32 closed exterior windows supplement all eight existing jump windows', () => {
  assert.equal(windows.length, 32);
  assert.equal(PORTALS.filter(p => p.kind === 'window').length, 8);
  assert.equal(PORTALS.some(p => p.kind === 'glazed-window'), false);
  for (const { w, o } of windows) {
    assert.ok(['front', 'rear', 'east', 'west'].includes(w.id.split('-')[0]));
    const pane = group.getObjectByName(`glass:${w.id}:${o.at}`);
    assert.ok(pane.material.transparent && pane.material.opacity > 0 && pane.material.opacity < .3);
    assert.equal(pane.castShadow, false); assert.equal(pane.material.depthWrite, false);
  }
  for (const id of ['front', 'rear-0', 'rear-1', 'west-0', 'west-1', 'east-0', 'east-1']) assert.ok(windows.some(({ w }) => w.id === id));
});

test('every glass pane blocks airborne Shidan and poop from either side', () => {
  for (const { w, o } of windows) for (const sign of [-1, 1]) {
    const b = world.fixtures.get(`glass:${w.id}:${o.at}`), axis = w.axis === 'x' ? 'z' : 'x';
    const centre = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2 };
    const r = new RabbitController(world); Object.assign(r, centre, { grounded: false }); r[axis] += sign * .55; r['v' + axis] = -sign * 8.2;
    r.update(.1, { [axis]: -sign, run: true });
    assert.ok((r[axis] - centre[axis]) * sign >= r.radius + .029, `${w.id} rabbit side ${sign}`);
    const p = new PoopPhysics(world), ball = p.spawn({ ...centre, [axis]: centre[axis] + sign * .4, ['v' + axis]: -sign * 8 });
    for (let i = 0; i < 12; i++) p.update(1 / 120);
    assert.ok((ball[axis] - centre[axis]) * sign >= ball.radius + .029, `${w.id} ball side ${sign}`);
  }
});

test('closed windows batch into two cheap draws and the ceiling costs 12 triangles', () => {
  layers.forEach(batchStaticGeometry);
  const glass = []; group.traverse(m => { if (m.name === 'Batched window glass') glass.push(m); });
  assert.equal(glass.length, 2);
  assert.equal(glass.reduce((n, m) => n + m.geometry.index.count / 3, 0), 32 * 12);
  assert.equal(ceiling.children.length, 1); assert.equal(ceiling.children[0].geometry.index.count / 3, 12);
  upper.visible = false;
  assert.equal(ceiling.visible, true); assert.equal(ceiling.parent, group);
  assert.equal(world.support(0, 0, H + .1).y, H);
});

for (const r of RAMPS) test(`${r.id} reveals the upstairs on approach and throughout ascent/descent`, () => {
  const x = (r.minX + r.maxX) / 2, direction = Math.sign(r.endZ - r.startZ);
  let visible = false;
  assert.equal(upperRoomsVisible({ x, y: 0, z: r.startZ - direction * .9 }), true);
  for (const t of [...Array.from({ length: 31 }, (_, i) => i / 30), ...Array.from({ length: 31 }, (_, i) => 1 - i / 30)]) {
    visible = upperRoomsVisible({ x, y: t * H, z: r.startZ + t * (r.endZ - r.startZ) }, visible);
    assert.equal(visible, true, `flight progress ${t}`);
  }
  assert.equal(upperRoomsVisible({ x, y: 0, z: r.startZ - direction * 3 }, visible), false);
});

test('the reveal stays stable near a stair edge and does not enable upstairs from remote ground rooms', () => {
  assert.equal(upperRoomsVisible({ x: 2.5, y: 0, z: 16 }), true);
  for (const z of [16.01, 15.99, 16.1, 16.7]) assert.equal(upperRoomsVisible({ x: 2.5, y: 0, z }, true), true);
  assert.equal(upperRoomsVisible({ x: 2.5, y: 0, z: 16.7 }), false);
  for (const y of [0, 2.1]) assert.equal(upperRoomsVisible({ x: DEN.x, y, z: DEN.z }), false);
  assert.equal(upperRoomsVisible({ x: 20.5, y: 0, z: -26 }), false);
});
