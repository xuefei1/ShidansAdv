import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createHouse } from '../src/house.js';
import { RabbitController, DEN, World } from '../src/physics.js';
import { FLOOR_HEIGHT as H, RAMPS, PORTALS, LANDMARKS } from '../src/layout.js';
const { world, group } = createHouse(new THREE.Scene());
function run(r, seconds, input = {}, dt = 1 / 120) {
  let highest = r.y;
  for (let t = 0; t < seconds - .00001; t += dt) { r.update(dt, input); highest = Math.max(highest, r.y); }
  return highest;
}
function place(x, y, z) {
  const r = new RabbitController(world); Object.assign(r, { x, y, z, surface: world.support(x, z, y + .02).surface }); return r;
}
function walk(r, x, z, y = r.y) {
  const duration = Math.hypot(x - r.x, z - r.z) / 1.8 + 5;
  for (let t = 0; t < duration; t += 1 / 60) {
    const dx = x - r.x, dz = z - r.z, length = Math.hypot(dx, dz), gain = Math.max(1, length);
    r.update(1 / 60, { x: dx / gain, z: dz / gain });
    if (length < .06 && Math.hypot(r.vx, r.vz) < .2) break;
  }
  assert.ok(Math.hypot(x - r.x, z - r.z) < .15, `blocked route to (${x},${z}), at ${r.x.toFixed(2)},${r.y.toFixed(2)},${r.z.toFixed(2)}`);
  assert.ok(Math.abs(r.y - y) < .08, `wrong floor: ${r.y}, expected ${y}`);
}
function route(start, points) { const r = place(...start); for (const [x, z, y = r.y] of points) walk(r, x, z, y); return r; }

test('the 8m den has over three times the previous area, with an unscaled rabbit', () => {
  const r = new RabbitController(world); assert.equal(DEN.radius * 2, 8); assert.equal(DEN.fenceHeight, 1.1);
  assert.ok(DEN.radius ** 2 / 2.25 ** 2 > 3); assert.equal(r.radius, .22); assert.equal(r.height, .68); assert.equal(r.surface, 'bedding');
});
test('walking, tapping, and low frame rates cannot bypass the pen fence', () => {
  for (const dt of [1 / 120, .1]) { const r = new RabbitController(world); run(r, 4, { x: 1, run: true }, dt); run(r, .04, { jump: true }); const apex = run(r, 1.5, { x: 1 }); assert.ok(apex > .4 && apex < .65); assert.ok(Math.hypot(r.x - DEN.x, r.z - DEN.z) <= DEN.radius - .239); }
});
test('a charged escape works from the centre and against the fence', () => {
  for (const nearFence of [false, true]) { const r = new RabbitController(world); if (nearFence) run(r, 3, { x: 1 }); run(r, .7, { jump: true }); assert.ok(run(r, 1.3, { x: 1 }) > 1.7); assert.ok(r.x > DEN.x + DEN.radius + r.radius); assert.equal(r.surface, 'wood'); assert.equal(r.y, 0); }
});
test('wood limits the jump while carpet and grass allow a full charge', () => {
  for (const [x, y, z, long] of [[-10, 0, 16, false], [1, H, 0, true], [2, 0, -29, true]]) {
    const r = place(x, y, z); run(r, .7, { jump: true }); const apex = run(r, 1.4); assert.ok(long ? apex > y + 1.7 : apex < y + .65); assert.ok(Math.abs(r.y - y) < .01);
  }
});
test('wood has a controlled slide between the original and grippy revisions', () => {
  const wood = place(-10, 0, 16); run(wood, .3, { x: 1, run: true }); assert.ok(wood.vx > 2.5 && wood.vx < 3);
  for (const [speed, minSlide, maxSlide] of [[2.3, .45, .6], [8.2, 1.6, 1.9]]) {
    const r = place(-10, 0, 16), start = r.z; r.vz = speed; run(r, 1.5);
    assert.ok(r.z - start > minSlide && r.z - start < maxSlide); assert.ok(r.vz < .02);
  }
});
for (const ramp of RAMPS) {
  test(`${ramp.id} is walkable in both directions without jumping`, () => {
    const x = (ramp.minX + ramp.maxX) / 2, sign = Math.sign(ramp.endZ - ramp.startZ);
    const r = place(x, 0, ramp.startZ - sign * .7); walk(r, x, ramp.endZ + sign * .7, H); walk(r, x, ramp.startZ - sign * .7, 0);
  });
}
test('the ground-floor chase loop connects lounge, entrance, dining and hall', () => {
  route([-7, 0, 17], [[-2, 17], [7, 17], [7, 18.8], [19, 18.8], [19, 17], [19, 4], [17, 4], [17, 0], [-14, 0], [-14, 3], [-10.5, 3], [-10.5, 17], [-7, 17]]);
});
test('the rear-room loop links library, garden room and craft room twice', () => {
  route([-14, 0, -1], [[-14, -6], [-7, -6], [1, -6], [10, -6], [17, -6], [17, 0], [1, 0], [1, -6], [0, -17], [-7, -17], [-18, -17], [-18, -6], [-14, -6], [-14, -1]]);
});
test('the complete upstairs/outside loop returns through a garden door', () => {
  route([2.5, 0, 16], [[2.5, 1, H], [1, 0], [1, -6], [0, -6], [0, -22.5], [20.5, -22.5], [20.5, -24], [20.5, -36, 0], [20.5, -37], [2, -37], [2, -36], [2, -29], [0, -22], [0, -17], [0, -6], [1, -6], [1, 0]]);
});
test('both concealed passages have two usable entrances', () => {
  route([-19, 0, -6], [[-22.5, -6], [-22.5, -17], [-19, -17]]);
  route([19, H, -6], [[22.5, -6], [22.5, -17], [19, -17]]);
});
test('the hedge tunnel has a clear route through both ends', () => { route([-22, 0, -33], [[-16, -33], [-10, -33]]); });
test('the front entrance and side path reconnect to the backyard', () => { route([0, 0, 18], [[0, 21.5], [0, 22.6], [25, 22.6], [25, 21.5], [25, -22]]); });

test('all wide door openings admit an adult-sized planning capsule', () => {
  for (const p of PORTALS.filter(p => p.kind === 'door')) {
    const y = p.floor * H;
    const blocked = world.solids.some(b => b.minY < y + 1.9 && b.maxY > y + .05 && p.x > b.minX - .4 && p.x < b.maxX + .4 && p.z > b.minZ - .4 && p.z < b.maxZ + .4);
    assert.equal(blocked, false, p.id);
  }
});
test('all jump windows have clear air above their collidable sills', () => {
  for (const p of PORTALS.filter(p => p.kind === 'window')) {
    const support = world.support(p.x, p.z, p.y + .01); assert.ok(Math.abs(support.y - p.y) < .015, p.id);
    const blocked = world.solids.some(b => b.minY < p.y + 1.35 && b.maxY > p.y + .02 && p.x > b.minX - .22 && p.x < b.maxX + .22 && p.z > b.minZ - .22 && p.z < b.maxZ + .22);
    assert.equal(blocked, false, p.id);
  }
});
test('a real hop crosses an interior window instead of hitting invisible wall', () => {
  const r = place(-6.5, 0, 11); run(r, .25, { x: 1 });
  for (let i = 0; i < 5; i++) { run(r, .04, { x: 1, jump: true }); run(r, .65, { x: 1 }); }
  assert.ok(r.x > -4, `window crossed to ${r.x}`); assert.equal(r.y, 0);
});

test('repeated normal hops can climb the lounge furniture from wood', () => {
  const r = place(-19, 0, 8.7); let apex = 0;
  for (let i = 0; i < 7; i++) { run(r, .05, { z: -1, jump: true }); apex = Math.max(apex, run(r, .5, { z: -1 })); if (r.z < 5.9 && r.y >= .83) break; }
  assert.ok(r.z < 6.1 && apex >= .84, `climb at ${r.x},${r.y},${r.z}; apex ${apex}`);
});
test('the bedroom pouf and trunk form a reachable path onto the quilt', () => {
  const r = place(-15, H, -8.8); let found = false;
  for (let i = 0; i < 12; i++) { run(r, .05, { z: -1, jump: true }); run(r, .5, { z: -1 }); if (r.z < -12.2 && r.y >= H + .87) { found = true; break; } }
  assert.ok(found, `bed climb at ${r.y},${r.z}`);
});
for (const [name, start, direction, fixture] of [
  ['coffee table', [-9, 0, 11.8], { z: -1 }, 'coffee-top'],
  ['dining table', [7.3, 0, 15], { x: 1 }, 'dining-top'],
  ['craft crates', [12, 0, -7.8], { z: -1 }, 'craft-crate--12-12'],
  ['studio desk', [14, H, -7.6], { z: -1 }, 'studio-desk-top'],
]) {
  test(`${name} is reachable by normal hops from its lowest step`, () => {
    const r = place(...start), top = world.fixtures.get(fixture); let reached = false;
    for (let i = 0; i < 24; i++) {
      run(r, .05, { ...direction, jump: true }); run(r, .5, direction);
      if (r.x > top.minX && r.x < top.maxX && r.z > top.minZ && r.z < top.maxZ && r.y >= top.maxY - .01) { run(r, .7); reached = r.y >= top.maxY - .01 && r.grounded; break; }
    }
    assert.ok(reached, `${fixture}: ${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)}`);
  });
}
for (const id of ['sofa-blanket', 'folded-cotton-cover', 'den-blanket', 'bed-quilt', 'mattress', 'reading-blanket', 'garden-blanket', 'crate-blanket', 'studio-blanket', 'balcony-blanket']) {
  test(`${id} catches a falling rabbit on its visible top`, () => {
    const b = world.fixtures.get(id), x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    // Mattress exposed end and base layer avoid deliberately overlapping quilt.
    const targetZ = id === 'mattress' ? b.minZ + .08 : z;
    const r = place(x, b.maxY + .4, targetZ); r.grounded = false; run(r, .7);
    assert.ok(Math.abs(r.y - b.maxY) < .012, `${id}: ${r.y} vs ${b.maxY}`);
  });
}
test('every named solid mesh has exactly matching collision bounds', () => {
  group.updateMatrixWorld(true); let checked = 0;
  group.traverse(m => {
    if (!m.isMesh || !m.userData.collider) return;
    const bb = new THREE.Box3().setFromObject(m), b = m.userData.collider;
    for (const axis of ['x', 'y', 'z']) { const cap = axis.toUpperCase(); assert.ok(Math.abs(bb.min[axis] - b['min' + cap]) < .00001); assert.ok(Math.abs(bb.max[axis] - b['max' + cap]) < .00001); }
    checked++;
  }); assert.ok(checked > 300);
});
test('upper floor catches a fall and stops a jump from underneath', () => {
  const r = place(0, H + 2, 0); r.grounded = false; run(r, 2); assert.equal(r.y, H);
  const room = new World(); room.addBox(0, 1.4, 0, 5, .2, 5); const low = new RabbitController(room); Object.assign(low, {x:0,z:0,y:0,vy:8,grounded:false}); assert.ok(run(low,.5) <= .621);
});
test('walking beneath the upstairs floor stays downstairs', () => { const r = place(1,0,0); walk(r,1,-6,0); });
test('pause cancels charge and frame rates produce consistent travel', () => {
  const r = new RabbitController(world); run(r,.7,{jump:true}); r.releaseInput(); run(r,.1); assert.equal(r.y,0);
  const a=place(-10,0,16),b=place(-10,0,16); run(a,1,{z:1},1/30); run(b,1,{z:1},1/120); assert.ok(Math.abs(a.z-b.z)<.02);
});
test('all seven discovery markers have a reachable supporting surface', () => {
  for (const l of LANDMARKS) { const floor=world.support(l.x,l.z,l.y+.2); assert.ok(Math.abs(floor.y-l.y)<.2, `${l.id}: floor ${floor.y} expected ${l.y}`); }
});
