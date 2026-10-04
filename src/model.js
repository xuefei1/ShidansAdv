import * as THREE from '../vendor/three.module.js';

export const palette = {
  ink: 0x292c3a, furLight: 0x363949, white: 0xfff8e8, pink: 0xa97886,
  wood: 0xc79468, cream: 0xf5efd7, sage: 0x9fb891, darkSage: 0x6f8a68,
  peach: 0xe8b49d, gold: 0xd7b770, wall: 0xf2e7cc, blue: 0xaacbd0,
};
const materialCache = new Map();
export function mat(color, roughness = 1) {
  const key = `${color}:${roughness}`;
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materialCache.get(key);
}
const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
export function ellipsoid(parent, color, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(sphereGeo, mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
export function cube(parent, color, x, y, z, w, h, d) {
  const m = new THREE.Mesh(cubeGeo, mat(color)); m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
export function cylinder(parent, color, x, y, z, radius, height, topRadius = radius, segments = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, radius, height, segments), mat(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
export function beam(parent, color, a, b, radius = .025) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const m = cylinder(parent, color, 0, 0, 0, radius, delta.length(), radius, 8);
  m.position.copy(start.add(end).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
}

export function createRabbit() {
  const root = new THREE.Group(); root.name = 'Shidan';
  const body = new THREE.Group(); root.add(body);
  ellipsoid(body, palette.ink, 0, .38, -.12, .31, .34, .43);
  ellipsoid(body, palette.furLight, 0, .38, .18, .245, .27, .26);
  const head = new THREE.Group(); head.position.set(0, .64, .25); body.add(head);
  ellipsoid(head, palette.ink, 0, 0, .035, .265, .25, .255);
  ellipsoid(head, palette.ink, -.09, -.09, .225, .13, .105, .095);
  ellipsoid(head, palette.ink, .09, -.09, .225, .13, .105, .095);
  // The small asymmetric white mark sits on the front of the muzzle, not the whole face.
  ellipsoid(head, palette.white, -.011, -.065, .287, .064, .062, .024);
  ellipsoid(head, 0xf2ece2, .018, -.092, .299, .037, .033, .012);
  ellipsoid(head, 0x49414b, 0, -.087, .31, .027, .019, .013);
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(side * .208, .035, .174); eye.rotation.y = side * .59; head.add(eye);
    ellipsoid(eye, 0x756b5f, 0, 0, 0, .073, .086, .03);
    ellipsoid(eye, 0x171b29, 0, .003, .022, .060, .072, .022);
    ellipsoid(eye, 0xffffff, -.017, .027, .042, .021, .025, .008);
    ellipsoid(eye, 0xa8bcd1, .024, -.023, .04, .009, .011, .006);
    eyes.push(eye);
    for (let j = 0; j < 3; j++) beam(head, 0x787887, [side * .09, -.095, .265], [side * (.34 + j * .02), -.065 - j * .032, .29 - j * .005], .0025);
  }
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(side * .115, .17, -.015); ear.rotation.z = side * -.14; ear.rotation.x = -.09; head.add(ear);
    ellipsoid(ear, palette.ink, 0, .235, 0, .084, .3, .064);
    ellipsoid(ear, 0x6d5262, 0, .25, .052, .046, .22, .014);
    ellipsoid(ear, 0x866373, 0, .25, .062, .02, .17, .008);
    ears.push(ear);
  }
  const paws = [];
  for (const z of [-.32, .27]) for (const side of [-1, 1]) {
    const paw = new THREE.Group(); paw.position.set(side * (z < 0 ? .235 : .145), .11, z); body.add(paw);
    ellipsoid(paw, palette.ink, 0, .012, 0, z < 0 ? .13 : .079, .11, z < 0 ? .205 : .135);
    ellipsoid(paw, palette.white, 0, -.025, z < 0 ? .13 : .085, z < 0 ? .105 : .069, .065, .09);
    for (let j = -1; j <= 1; j++) beam(paw, 0xc5c0bc, [j * .027, -.028, z < 0 ? .211 : .166], [j * .027, -.003, z < 0 ? .213 : .168], .002);
    paws.push(paw);
  }
  ellipsoid(body, palette.ink, 0, .37, -.535, .12, .13, .125);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.36, 32), new THREE.MeshBasicMaterial({ color: 0x443c35, transparent: true, opacity: .16, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .012; root.add(shadow);
  return {
    root,
    animate(time, speed = 0, grounded = true, charge = 0, floorY = 0) {
      const gait = time * (speed > 3 ? 20 : 14), moving = Math.min(speed / 2, 1);
      body.position.y = grounded ? Math.abs(Math.sin(gait)) * .045 * moving : .015;
      body.scale.set(1 + charge * .1, 1 - charge * .22, 1 + charge * .08);
      body.rotation.x = grounded ? Math.sin(gait) * .04 * moving : -.12;
      head.rotation.x = Math.sin(time * 1.7) * .035 - charge * .12;
      ears.forEach((ear, i) => { ear.rotation.x = -.07 + Math.sin(time * 2.2 + i * .8) * .055 - moving * .14; ear.rotation.z = (i ? -.14 : .14) + Math.sin(time * 1.5 + i) * .025; });
      paws.forEach((paw, i) => { paw.rotation.x = grounded ? Math.sin(gait + (i < 2 ? Math.PI : 0)) * .42 * moving : (i < 2 ? .45 : -.35); });
      const blink = Math.sin(time * .77) > .997 ? .12 : 1; eyes.forEach(eye => eye.scale.y = blink);
      shadow.position.y = floorY - root.position.y + .014; shadow.material.opacity = Math.max(.03, .17 - (root.position.y - floorY) * .065);
      shadow.scale.setScalar(1 + Math.max(0, root.position.y - floorY) * .2);
    },
  };
}
