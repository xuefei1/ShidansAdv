import * as THREE from '../vendor/three.module.js';
import { World } from './physics.js';
import { DEN, FLOOR_HEIGHT as H, RAMPS, WALLS, ROOMS } from './layout.js';
import { cube, cylinder, beam, mat } from './model.js';
import { furnishHouse } from './furnishings.js';

// The house is a set of connected spaces, authored at rabbit scale. Ground and
// upper art are batched separately for a readable floor-by-floor cutaway.
export function createHouse(scene) {
  const group = new THREE.Group(); group.name = 'Clover House'; scene.add(group);
  const ground = new THREE.Group(), upper = new THREE.Group(), outside = new THREE.Group(), ceiling = new THREE.Group();
  ground.name = 'Ground floor'; upper.name = 'Upper floor'; outside.name = 'Garden and stairs';
  ceiling.name = 'Permanent floor and ceiling'; group.add(ground, upper, outside, ceiling);
  const world = new World(); world.fixtures = new Map();
  const solid = (parent, color, x, y, z, w, h, d, surface = 'wood', id) => {
    const b = world.addBox(x, y, z, w, h, d, surface);
    const mesh = cube(parent, color, x, y, z, w, h, d); mesh.userData.collider = b;
    if (id) { b.id = id; mesh.name = id; world.fixtures.set(id, b); }
    return mesh;
  };
  // Art-only geometry is limited to floor decals, thin trim, leaves, and details
  // contained by a solid prop. Every walkable furnishing uses solid().
  const detail = (parent, color, ...dimensions) => { const mesh = cube(parent, color, ...dimensions); mesh.userData.decoration = true; mesh.castShadow = false; return mesh; };
  detail(ground, 0xf0e5cc, 0, -.27, 0, 48.4, .5, 40.4);
  const planks = [0xd6b386, 0xe2bf92, 0xdec097, 0xdaba91, 0xe4c69e];
  for (let row = 0; row < 50; row++) for (let col = 0; col < 9; col++) {
    const start = -27 + col * 6 + (row % 2 ? 3 : 0), left = Math.max(-24, start), right = Math.min(24, start + 6);
    if (left >= 24) continue;
    detail(ground, planks[(row * 3 + col) % 5], (left + right) / 2, -.025, -19.6 + row * .8, right - left - .012, .05, .787);
  }
  // Upper floor and balcony have matching visible/collision tops at y=4.2.
  // Keep this 12-triangle slab independent of the upstairs decoration cutaway.
  solid(ceiling, 0xbccda9, 0, H - .14, -9, 48, .28, 22, 'carpet', 'upper-floor');
  solid(outside, 0xdac49e, 2, H - .14, -22.5, 44, .28, 5, 'deck', 'balcony-floor');
  for (const r of ROOMS.filter(r => r.floor === 1 && r.id !== 'balcony')) {
    detail(upper, Number(r.color.replace('#', '0x')), (r.minX + r.maxX) / 2, H + .001, (r.minZ + r.maxZ) / 2, r.maxX - r.minX - .3, .002, r.maxZ - r.minZ - .3);
  }
  for (let x = -19.6; x < 24; x += .8) detail(outside, 0xc5af8c, x, H + .003, -22.5, .018, .005, 4.95);

  function wallSegment(w, a, b, low, high, joined = false) {
    if (b - a < .005 || high - low < .005) return;
    // Butt z-running walls against the faces of x-running walls. Splitting at
    // interior T-junctions also removes coplanar tops with conflicting colours.
    if (w.axis === 'z' && !joined) {
      let pieces = [[a, b]];
      for (const cross of WALLS.filter(c => c.floor === w.floor && c.axis === 'x' && w.fixed >= c.start && w.fixed <= c.end)) {
        const opening = cross.openings.find(o => w.fixed > o.at - o.width / 2 && w.fixed < o.at + o.width / 2);
        if (opening && low >= opening.bottom && high <= opening.top) continue;
        pieces = pieces.flatMap(([start, end]) => cross.fixed + .12 <= start || cross.fixed - .12 >= end ? [[start, end]] : [[start, Math.min(end, cross.fixed - .12)], [Math.max(start, cross.fixed + .12), end]]);
      }
      for (const [start, end] of pieces) wallSegment(w, start, end, low, high, true);
      return;
    }
    const parent = w.floor ? upper : ground, y = w.floor * H;
    solid(parent, w.color, w.axis === 'x' ? (a + b) / 2 : w.fixed, y + (low + high) / 2,
      w.axis === 'x' ? w.fixed : (a + b) / 2, w.axis === 'x' ? b - a : .24, high - low, w.axis === 'x' ? .24 : b - a, 'wood', `${w.id}:${a}:${low}`).userData.wall = w.id;
    if (low === 0) detail(parent, 0xf9f0dc, w.axis === 'x' ? (a + b) / 2 : w.fixed, y + .1,
      w.axis === 'x' ? w.fixed : (a + b) / 2, w.axis === 'x' ? b - a : .255, .2, w.axis === 'x' ? .255 : b - a);
  }
  // Uniform, unlit tint is cheap and blends consistently even when panes share
  // one batch. No refraction pass or shadow casting for transparent glass.
  const glassMaterial = new THREE.MeshBasicMaterial({ color: 0xa7d4df, transparent: true, opacity: .18, depthWrite: false });
  for (const w of WALLS) {
    let cursor = w.start;
    for (const o of [...w.openings].sort((a, b) => a.at - b.at)) {
      const a = o.at - o.width / 2, b = o.at + o.width / 2;
      wallSegment(w, cursor, a, 0, 3.9); wallSegment(w, a, b, 0, o.bottom); wallSegment(w, a, b, o.top, 3.9);
      // Contrasting frames make traversable windows and low hidden arches legible.
      const p = w.floor ? upper : ground, y = w.floor * H, c = o.kind === 'tunnel' ? 0x977b5d : o.kind === 'window' ? 0xa4c9ca : 0xfdf3df;
      for (const at of [a - .045, b + .045]) detail(p, c, w.axis === 'x' ? at : w.fixed, y + (o.top + o.bottom) / 2,
        w.axis === 'x' ? w.fixed : at, w.axis === 'x' ? .09 : .28, o.top - o.bottom + .07, w.axis === 'x' ? .28 : .09);
      if (o.bottom) detail(p, 0xc49d72, w.axis === 'x' ? o.at : w.fixed, y + o.bottom - .025,
        w.axis === 'x' ? w.fixed : o.at, w.axis === 'x' ? o.width : .27, .05, w.axis === 'x' ? .27 : o.width);
      if (o.kind === 'glazed-window') {
        const x = w.axis === 'x' ? o.at : w.fixed, z = w.axis === 'x' ? w.fixed : o.at, midY = y + (o.bottom + o.top) / 2;
        const pane = solid(p, 0xa7d4df, x, midY, z, w.axis === 'x' ? o.width : .06, o.top - o.bottom, w.axis === 'x' ? .06 : o.width, 'wood', `glass:${w.id}:${o.at}`);
        pane.material = glassMaterial; pane.castShadow = pane.receiveShadow = false; pane.userData.batchTransparent = true;
        // White crossbars distinguish closed glass from blue-framed jump windows.
        detail(p, 0xfdf3df, x, midY, z, w.axis === 'x' ? .065 : .10, o.top - o.bottom, w.axis === 'x' ? .10 : .065);
        for (const height of [o.bottom, (o.top + o.bottom) / 2, o.top]) detail(p, 0xfdf3df, x, y + height, z,
          w.axis === 'x' ? o.width : .10, .065, w.axis === 'x' ? .10 : o.width);
      }
      cursor = b;
    }
    wallSegment(w, cursor, w.end, 0, 3.9);
  }

  function rail(parent, axis, fixed, start, end, y, id) {
    const length = end - start, x = axis === 'x' ? (start + end) / 2 : fixed, z = axis === 'x' ? fixed : (start + end) / 2;
    // A continuous, visible low panel prevents rabbits/balls going between rails.
    solid(parent, 0xe9e2ca, x, y + .44, z, axis === 'x' ? length : .12, .88, axis === 'x' ? .12 : length, 'wood', id);
    solid(parent, 0xa99470, x, y + .92, z, axis === 'x' ? length : .16, .08, axis === 'x' ? .16 : length);
    for (let at = start; at <= end; at += .9) detail(parent, 0xfbf5e1, axis === 'x' ? at : fixed, y + .43, axis === 'x' ? fixed : at, .10, .87, .10);
  }
  rail(upper, 'x', 2, -24, .8, H, 'gallery-west-rail'); rail(upper, 'x', 2, 4.2, 24, H, 'gallery-east-rail');
  rail(outside, 'x', -25, -20, 18.8, H, 'balcony-rail'); rail(outside, 'x', -25, 22.2, 24, H);
  rail(outside, 'z', -20, -25, -20, H); rail(outside, 'z', 24, -25, -20, H);
  for (const r of RAMPS) {
    const count = 30, width = r.maxX - r.minX, dz = (r.endZ - r.startZ) / count;
    for (let i = 0; i < count; i++) {
      // Art tread is at the ramp's midpoint, limiting render/physics discrepancy to 7cm.
      const top = r.height * (i + .5) / count;
      detail(outside, i % 2 ? 0xd8c49d : 0xe0cfaa, (r.minX + r.maxX) / 2, top - .055, r.startZ + (i + .5) * dz, width, .11, Math.abs(dz) + .008);
      detail(outside, 0x9eaf8c, (r.minX + r.maxX) / 2, top + .004, r.startZ + (i + .5) * dz, width * .63, .007, Math.abs(dz));
      for (const x of [r.minX - .09, r.maxX + .09]) {
        // Stepped solid cheeks prevent side entry into the raised part of either flight.
        solid(outside, 0xe5d4b4, x, top / 2, r.startZ + (i + .5) * dz, .16, top, Math.abs(dz) + .01);
        if (i % 3 === 0) solid(outside, 0xf7edd5, x, top + .48, r.startZ + (i + .5) * dz, .09, .96, .09);
      }
    }
    for (const x of [r.minX - .09, r.maxX + .09]) beam(outside, 0xb79d78, [x, .98, r.startZ], [x, H + .98, r.endZ], .065);
  }

  // A much wider pen, while the fence stays a rabbit-jumpable 1.1m high.
  cylinder(ground, 0xdcd5ad, DEN.x, .004, DEN.z, DEN.radius + .1, .006, DEN.radius + .1, 96).castShadow = false;
  cylinder(ground, 0xece4bf, DEN.x, .008, DEN.z, DEN.radius - .08, .002, DEN.radius - .08, 96).castShadow = false;
  for (let ring = 0; ring <= 7; ring++) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(DEN.radius, .016, 5, 128), mat(0xfffaed));
    mesh.name = `Den ring ${ring}`;
    mesh.rotation.x = Math.PI / 2; mesh.position.set(DEN.x, .035 + ring * (DEN.fenceHeight - .045) / 7, DEN.z); ground.add(mesh);
  }
  for (let i = 0; i < 112; i++) {
    const a = i / 112 * Math.PI * 2;
    cylinder(ground, 0xfffaed, DEN.x + Math.sin(a) * DEN.radius, DEN.fenceHeight / 2, DEN.z + Math.cos(a) * DEN.radius, .014, DEN.fenceHeight, .014, 5).name = `Den post ${i}`;
  }
  label(ground, 'SHIDAN', DEN.x, .65, DEN.z + DEN.radius + .023, 1.25, .35, '#f7edcb', '#71825e');
  const art = { group, ground, upper, outside, solid, detail, world, label };
  furnishHouse(art);
  return { group, world, layers: [ground, upper, outside], upper, ceiling };
}

export function label(parent, text, x, y, z, w, h, background = '#f8efda', foreground = '#6b7b5c') {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = foreground; ctx.font = '500 38px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 })); mesh.position.set(x, y, z); parent.add(mesh);
}

export function batchStaticGeometry(group) {
  group.updateWorldMatrix(true, true);
  const worldToLocal = group.matrixWorld.clone().invert(), batches = new Map(), sources = [];
  group.traverse(object => {
    if (!object.isMesh || !object.visible || (object.material.transparent && !object.userData.batchTransparent)) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(worldToLocal.clone().multiply(object.matrixWorld));
    const key = `${object.material.uuid}:${object.castShadow}`;
    if (!batches.has(key)) batches.set(key, { material: object.material, castShadow: object.castShadow, geometries: [] });
    batches.get(key).geometries.push(geometry); sources.push(object);
  });
  for (const { material, castShadow, geometries } of batches.values()) {
    const merged = new THREE.BufferGeometry();
    for (const attribute of ['position', 'normal', 'uv']) {
      const arrays = geometries.map(g => g.getAttribute(attribute));
      if (arrays.some(a => !a)) continue;
      const data = new Float32Array(arrays.reduce((n, a) => n + a.array.length, 0));
      let offset = 0; for (const a of arrays) { data.set(a.array, offset); offset += a.array.length; }
      merged.setAttribute(attribute, new THREE.BufferAttribute(data, arrays[0].itemSize));
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = castShadow; mesh.receiveShadow = !material.transparent; mesh.name = material.transparent ? 'Batched window glass' : 'Batched level'; group.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  sources.forEach(source => source.removeFromParent());
}
