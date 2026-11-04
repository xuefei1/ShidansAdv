import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from '../src/house.js';
import { BASEMENT, BASEMENT_STAIRS, BASEMENT_STAIR_OPENING, RAMPS, WALLS, PORTALS, LANDMARKS, floorAt, roomAt } from '../src/layout.js';

const house = createHouse(new THREE.Scene());
const positiveOverlap = (a, b, axes = ['X', 'Z']) => axes.every(axis => Math.min(a[`max${axis}`], b[`max${axis}`]) - Math.max(a[`min${axis}`], b[`min${axis}`]) > 1e-7);
const opening = BASEMENT_STAIR_OPENING;

test('the basement replaces the library tunnel with one named stairway and one full-footprint room', () => {
  assert.equal(house.world.basement, BASEMENT);
  assert.equal(RAMPS.filter(r => (r.baseY ?? 0) < 0).length, 1);
  assert.ok(RAMPS.includes(BASEMENT_STAIRS));
  assert.equal(WALLS.some(w => w.id === 'shelf-passage'), false);
  assert.equal(PORTALS.some(p => p.kind === 'tunnel'), false);
  assert.equal(house.world.fixtures.has('library-tunnel-ceiling'), false);
  assert.equal(LANDMARKS.some(l => l.id === 'secret'), false);
  assert.ok(LANDMARKS.some(l => l.id === 'basement-entry'));
  assert.equal(floorAt(-4.2), -1); assert.equal(floorAt(-1), 0); assert.equal(floorAt(4.2), 1);
  for (const [x, z] of [[-23, -19], [23, -19], [-23, 19], [23, 19], [0, 0]]) {
    assert.equal(roomAt(x, BASEMENT.y, z)?.id, 'basement');
  }
});

test('four physical ground slabs cover the house without bridging the stair opening', () => {
  assert.equal(house.groundSlabs.length, 4);
  assert.deepEqual(house.groundSlabs.map(b => b.id), ['ground-floor:west', 'ground-floor:east', 'ground-floor:rear', 'ground-floor:front']);
  for (const b of house.groundSlabs) {
    assert.ok(Math.abs(b.minY - BASEMENT.ceilingY) < 1e-8);
    assert.ok(Math.abs(b.maxY) < 1e-8);
    assert.equal(positiveOverlap(b, opening), false, b.id);
  }
  for (let x = -23.875; x < 24; x += .25) for (let z = -19.875; z < 20; z += .25) {
    const inOpening = x > opening.minX && x < opening.maxX && z > opening.minZ && z < opening.maxZ;
    const covered = house.groundSlabs.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
    assert.equal(covered, !inOpening, `${x},${z}`);
  }
  const front = house.world.fixtures.get('ground-floor:front');
  assert.equal(front.minZ, BASEMENT_STAIRS.endZ, 'the canonical upper lip meets the final tread');
});

test('the real opening remains free of timber and exposes 1.9m of headroom along the complete flight', () => {
  house.group.updateWorldMatrix(true, true);
  let planks = 0;
  house.layers[0].traverse(mesh => {
    if (!mesh.userData.floorPlank) return;
    const bounds = new THREE.Box3().setFromObject(mesh);
    const box = { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z };
    assert.equal(positiveOverlap(box, opening), false, mesh.name); planks++;
  });
  assert.ok(planks > 400);
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, x = (BASEMENT_STAIRS.minX + BASEMENT_STAIRS.maxX) / 2;
    const z = BASEMENT_STAIRS.startZ + t * (BASEMENT_STAIRS.endZ - BASEMENT_STAIRS.startZ);
    const y = BASEMENT_STAIRS.baseY + t * BASEMENT_STAIRS.height;
    const capsule = { minX: x - .35, maxX: x + .35, minZ: z - .1, maxZ: z + .1, minY: y + .25, maxY: y + 1.9 };
    const blocking = house.world.solids.filter(b => positiveOverlap(b, capsule, ['X', 'Y', 'Z']));
    assert.deepEqual(blocking.map(b => b.id), [], `headroom at stair progress ${t}`);
  }
});

test('three ground-level guards leave one entrance and an open lower basement landing', () => {
  const west = house.world.fixtures.get('basement-opening-side:west');
  const east = house.world.fixtures.get('basement-opening-side:east');
  const rear = house.world.fixtures.get('basement-opening-rear');
  for (const guard of [west, east, rear]) {
    assert.ok(guard?.verticalBarrier); assert.equal(guard.minY, 0);
  }
  assert.ok(Math.abs(west.maxX - opening.minX) < 1e-8);
  assert.ok(Math.abs(east.minX - opening.maxX) < 1e-8);
  assert.ok(Math.abs(rear.maxZ - opening.minZ) < 1e-8);
  for (const [z, y] of [[opening.maxZ + .25, 0], [opening.minZ - .5, BASEMENT.y]]) {
    const space = { minX: opening.minX + .6, maxX: opening.maxX - .6, minZ: z - .2, maxZ: z + .2, minY: y + .05, maxY: y + 1.9 };
    assert.equal(house.world.solids.some(b => positiveOverlap(b, space, ['X', 'Y', 'Z'])), false);
  }
});

test('the unfinished floor has only the structural pillars and named utility equipment', () => {
  const floor = house.world.fixtures.get('basement-floor');
  assert.equal(floor.maxY, BASEMENT.y); assert.equal(floor.surface, 'concrete');
  const pillars = [...house.world.fixtures].filter(([id]) => id.startsWith('basement-pillar:'));
  assert.equal(pillars.length, 6);
  for (const id of ['basement-furnace', 'basement-water-heater']) {
    const b = house.world.fixtures.get(id); assert.ok(b, id);
    assert.ok(b.minY >= BASEMENT.y - 1e-8 && b.maxY < BASEMENT.ceilingY);
  }
  for (const [x, z] of [[-15, -12], [5, -12], [-18, 14], [19, 14]]) {
    assert.equal(house.world.support(x, z, BASEMENT.y + .01).y, BASEMENT.y);
  }
});

test('basement structure keeps exact mesh/collider bounds and joins the existing static batches', () => {
  assert.equal(house.layers[5], house.basement); assert.equal(house.layers[6], house.basementCeiling);
  assert.equal(house.basement.parent, house.group); assert.equal(house.basementCeiling.parent, house.group);
  house.group.updateWorldMatrix(true, true);
  let checked = 0;
  for (const parent of [house.basement, house.basementCeiling]) parent.traverse(mesh => {
    if (!mesh.userData.collider) return;
    const bounds = new THREE.Box3().setFromObject(mesh), b = mesh.userData.collider;
    for (const axis of ['x', 'y', 'z']) {
      const key = axis.toUpperCase();
      assert.ok(Math.abs(bounds.min[axis] - b[`min${key}`]) < 1e-5, `${mesh.name} min ${axis}`);
      assert.ok(Math.abs(bounds.max[axis] - b[`max${key}`]) < 1e-5, `${mesh.name} max ${axis}`);
    }
    checked++;
  });
  assert.ok(checked >= 50);
  for (const parent of [house.basement, house.basementCeiling]) {
    const before = new THREE.Box3().setFromObject(parent), sourceCount = parent.children.length; batchStaticGeometry(parent);
    const after = new THREE.Box3().setFromObject(parent);
    assert.ok(before.min.distanceTo(after.min) < .00001 && before.max.distanceTo(after.max) < .00001);
    assert.ok(parent.children.length <= (parent === house.basement ? sourceCount / 2 : sourceCount),
      'spatial batches reduce draw calls while retaining room-scale culling');
  }
});
