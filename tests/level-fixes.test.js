import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from '../src/house.js';
import { RabbitController, World, SURFACES } from '../src/physics.js';
import { DEN, BOUNDS } from '../src/layout.js';
import { PoopPhysics } from '../src/poop-physics.js';

const { group, world, layers } = createHouse(new THREE.Scene());
const advance = (r, seconds, input = {}, dt = 1 / 60) => { for (let t = 0; t < seconds - 1e-8; t += dt) r.update(dt, input); };
function rabbit(x, y, z, w = world) {
  const r = new RabbitController(w); Object.assign(r, { x, y, z }); r.surface = w.support(x, z, y + .01).surface; return r;
}

test('all den rings and posts share the collision fence centre and radius', () => {
  group.updateWorldMatrix(true, true); let rings = 0, posts = 0;
  group.traverse(mesh => {
    if (mesh.name.startsWith('Den ring')) {
      const bounds = new THREE.Box3().setFromObject(mesh), centre = bounds.getCenter(new THREE.Vector3());
      assert.ok(Math.abs(centre.x - DEN.x) < 1e-6 && Math.abs(centre.z - DEN.z) < 1e-6);
      assert.ok(Math.abs(bounds.max.x - centre.x - DEN.radius) < .02);
      assert.ok(bounds.min.y > 0 && bounds.max.y <= DEN.fenceHeight + .01); rings++;
    }
    if (mesh.name.startsWith('Den post')) {
      assert.ok(Math.abs(Math.hypot(mesh.position.x - DEN.x, mesh.position.z - DEN.z) - DEN.radius) < 1e-6); posts++;
    }
  });
  assert.equal(rings, 8); assert.equal(posts, 112);
});

test('wall sections meet without overlapping volumes or coplanar top patches', () => {
  const walls = []; group.traverse(mesh => { if (mesh.userData.wall) walls.push(mesh); });
  assert.ok(walls.length > 60);
  for (let i = 0; i < walls.length; i++) for (const other of walls.slice(i + 1)) {
    const a = walls[i].userData.collider, b = other.userData.collider;
    const overlap = ['X', 'Y', 'Z'].every(axis => Math.min(a['max' + axis], b['max' + axis]) - Math.max(a['min' + axis], b['min' + axis]) > 1e-7);
    assert.equal(overlap, false, `${walls[i].name} overlaps ${other.name}`);
  }
});

test('batching preserves the full level bounds and shadow participation', () => {
  group.updateWorldMatrix(true, true);
  for (const layer of layers) {
    const before = new THREE.Box3().setFromObject(layer);
    batchStaticGeometry(layer);
    const after = new THREE.Box3().setFromObject(layer);
    assert.ok(before.min.distanceTo(after.min) < .0001 && before.max.distanceTo(after.max) < .0001);
    assert.ok(layer.children.some(mesh => mesh.castShadow));
    assert.ok(layer.children.some(mesh => !mesh.castShadow));
  }
});

test('Shift reaches full speed within a second, at least three times walking speed', () => {
  for (const [name, surface] of Object.entries(SURFACES)) {
    const empty = new World(); empty.ramps = []; empty.addBox(0, -.1, 0, 40, .2, 38, name);
    // A tiny positive top chooses the fixture surface instead of the default ground.
    const top = empty.addBox(0, .0005, 0, 40, .001, 38, name).maxY;
    const walk = rabbit(0, top, 0, empty), sprint = rabbit(0, top, 0, empty);
    advance(walk, 1, { x: 1 }); advance(sprint, 1, { x: 1, run: true });
    assert.ok(Math.abs(sprint.vx - surface.run) < .001);
    const startWalk = walk.x, startSprint = sprint.x;
    advance(walk, .5, { x: 1 }); advance(sprint, .5, { x: 1, run: true });
    assert.ok(sprint.x - startSprint > (walk.x - startWalk) * 3, name);
  }
});

test('outdoor floors and furniture stop without sliding and allow charged leaps', () => {
  for (const [x, y, z] of [[2, 0, -29], [0, 0, 28], [25, 0, 0], [2, 4.2, -22.5], [-8, 4.75, -22.2]]) {
    const r = rabbit(x, y, z); r.vx = 8.8; r.vz = -3;
    const start = [r.x, r.z]; advance(r, .2);
    assert.deepEqual([r.x, r.z], start); assert.equal(r.vx, 0); assert.equal(r.vz, 0);
    assert.ok(SURFACES[r.surface].grip && SURFACES[r.surface].longJump);
  }
});

test('the front entrance opens onto an unobstructed lawn', () => {
  const r = rabbit(0, 0, 18); advance(r, 1.6, { z: 1, run: true });
  assert.ok(r.z > 29 && r.z < 32); assert.equal(r.surface, 'grass');
  assert.equal(world.solids.some(b => b.minZ > 20 && b.maxZ < 32 && b.minX < 1 && b.maxX > -1 && b.maxY > .24), false);
});

test('invisible lot boundaries retain sprinting airborne rabbits and balls on all sides', () => {
  for (const [x, z, dx, dz] of [[25, 0, 1, 0], [-25, 0, -1, 0], [0, 31, 0, 1], [2, -37, 0, -1]]) {
    const r = rabbit(x, 12, z); r.grounded = false; advance(r, 1, { x: dx, z: dz, run: true }, .1);
    assert.ok(r.x >= BOUNDS.minX + r.radius && r.x <= BOUNDS.maxX - r.radius);
    assert.ok(r.z >= BOUNDS.minZ + r.radius && r.z <= BOUNDS.maxZ - r.radius);
    const p = new PoopPhysics(world), b = p.spawn({ x, y: 12, z, vx: dx * 25, vz: dz * 25 });
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    assert.ok(b.x >= BOUNDS.minX + b.radius && b.x <= BOUNDS.maxX - b.radius);
    assert.ok(b.z >= BOUNDS.minZ + b.radius && b.z <= BOUNDS.maxZ - b.radius);
  }
});

test('the collision index matches a full scan across the entire lot and both floors', () => {
  const indexed = world.query; let count = 0, candidates = 0;
  try {
    for (let x = -25.7; x < 26; x += 1.37) for (let z = -37.8; z < 32; z += 1.79) for (const ceiling of [.25, 4.45, 8.4]) {
      const expected = world.support(x, z, ceiling); candidates += world.query(x, z).length; count++;
      world.query = () => world.solids;
      assert.deepEqual(world.support(x, z, ceiling), expected, `${x}, ${z}, ${ceiling}`);
      world.query = indexed;
    }
    assert.ok(candidates / count < world.solids.length * .15);
  } finally { world.query = indexed; }
});

test('fast movement and jumps produce the same collisions with and without the index', () => {
  const indexed = world.query;
  for (const start of [[-10, 0, 16], [1, 4.2, -6], [20.5, 0, -36], [-22.5, 0, -12], [0, 0, 29], [DEN.x, 0, DEN.z]]) {
    const simulate = () => {
      const r = rabbit(...start);
      for (let i = 0; i < 300; i++) r.update(i % 17 ? 1 / 60 : .1, { x: Math.sin(i * .09), z: Math.cos(i * .11), run: true, jump: i % 67 < 30 });
      return [r.x, r.y, r.z, r.vx, r.vz];
    };
    const expected = simulate();
    try { world.query = () => world.solids; assert.deepEqual(simulate(), expected); }
    finally { world.query = indexed; }
  }
});

test('camera ray clearance matches a full scan at both floors and cell boundaries', () => {
  const boxes = new Map(world.solids.map(b => [b, new THREE.Box3(new THREE.Vector3(b.minX - .12, b.minY - .12, b.minZ - .12), new THREE.Vector3(b.maxX + .12, b.maxY + .12, b.maxZ + .12))]));
  const hit = new THREE.Vector3();
  for (const y of [.62, 4.82]) for (let x = -24; x <= 24; x += 4) for (let z = -36; z <= 32; z += 4) for (const yaw of [-.45, 1.5, 3]) {
    const origin = new THREE.Vector3(x, y, z), end = new THREE.Vector3(x + Math.sin(yaw) * 9, y + 3, z + Math.cos(yaw) * 9);
    const ray = new THREE.Ray(origin, end.clone().sub(origin).normalize());
    const distance = solids => {
      let nearest = origin.distanceTo(end);
      for (const b of solids) { const bb = boxes.get(b); if (!bb.containsPoint(origin) && ray.intersectBox(bb, hit)) nearest = Math.min(nearest, origin.distanceTo(hit)); }
      return nearest;
    };
    const nearby = world.query(Math.min(x, end.x) - .12, Math.min(z, end.z) - .12, Math.max(x, end.x) + .12, Math.max(z, end.z) + .12);
    assert.equal(distance(nearby), distance(world.solids));
  }
});
