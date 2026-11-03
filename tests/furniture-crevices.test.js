import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createHouse } from '../src/house.js';
import { RabbitController } from '../src/physics.js';
import { FLOOR_HEIGHT as H } from '../src/layout.js';

const { world, group } = createHouse(new THREE.Scene());
const fixture = id => {
  const box = world.fixtures.get(id);
  assert.ok(box, id);
  return box;
};

test('bed, lounge and reading treads overlap instead of leaving rabbit-width crevices', () => {
  for (const [frontId, rearId] of [
    ['bed-trunk', 'bed-frame'],
    ['sofa-book-step', 'sofa-footstool'],
    ['sofa-footstool', 'lounge-sofa-base'],
    ['reading-pouf', 'reading-sofa-base'],
  ]) {
    const front = fixture(frontId), rear = fixture(rearId);
    const overlap = Math.min(front.maxZ, rear.maxZ) - Math.max(front.minZ, rear.minZ);
    assert.ok(overlap >= .02 - 1e-8, `${frontId} must tuck at least 2cm beneath ${rearId}: ${overlap}`);
  }
});

const approaches = [
  { name: 'bed trunk to mattress', x: -15, y: H + .61, z: -11.35 },
  { name: 'lounge footstool to sofa', x: -19, y: .5, z: 6.7 },
  { name: 'lounge book to footstool', x: -19, y: .27, z: 7.9 },
  { name: 'reading pouf to sofa', x: 2, y: H + .4, z: -11.3 },
];

for (const approach of approaches) {
  test(`${approach.name} remains supported while walking, sprinting or charging against the next step`, () => {
    for (const dt of [1 / 30, 1 / 60, .1]) for (const mode of [{}, { run: true }, { jump: true }]) {
      const r = new RabbitController(world);
      Object.assign(r, approach, { surface: world.support(approach.x, approach.z, approach.y + .01).surface });
      let lateLandings = 0;
      for (let elapsed = 0; elapsed < 4 - 1e-8; elapsed += dt) {
        r.update(dt, { z: -1, ...mode });
        assert.ok(r.y >= approach.y - .005,
          `${approach.name} dropped into a crevice at dt=${dt}: (${r.x}, ${r.y}, ${r.z})`);
        if (elapsed >= 3) lateLandings += Number(r.lastLanding);
      }
      assert.equal(lateLandings, 0, `${approach.name} repeatedly loses support at contact`);
      assert.equal(r.grounded, true);
      if (approach.name === 'lounge book to footstool') {
        assert.ok(r.z < 6.65 && r.y >= .5 - 1e-8, 'the shallow first step should be walkable');
      }
    }
  });
}

test('extended furniture has matching visible and collision bounds', () => {
  group.updateWorldMatrix(true, true);
  for (const id of ['bed-trunk', 'sofa-book-step', 'sofa-footstool', 'reading-pouf']) {
    const mesh = group.getObjectByName(id), collision = fixture(id);
    assert.ok(mesh?.isMesh, id);
    const bounds = new THREE.Box3().setFromObject(mesh);
    for (const axis of ['x', 'y', 'z']) {
      const key = axis.toUpperCase();
      assert.ok(Math.abs(bounds.min[axis] - collision[`min${key}`]) < 1e-6, `${id} min ${axis}`);
      assert.ok(Math.abs(bounds.max[axis] - collision[`max${key}`]) < 1e-6, `${id} max ${axis}`);
    }
  }
});
