import * as THREE from '../vendor/three.module.js';
import { World, DEN, STAIRS } from './physics.js';
import { palette as P, mat, cube, cylinder, ellipsoid, beam } from './model.js';

// All environment art is original geometry. Metres, Y-up; the open front is a
// deliberate dollhouse cutaway. Collision boundaries still enclose the house.
export function createHouse(scene) {
  const group = new THREE.Group(); group.name = 'A home for Shidan'; scene.add(group);
  const world = new World();
  const solid = (color, x, y, z, w, h, d, surface = 'wood') => {
    world.addBox(x, y, z, w, h, d, surface); return cube(group, color, x, y, z, w, h, d);
  };
  const plant = (x, y, z, s = 1, color = P.cream) => {
    world.addBox(x, y + .25 * s, z, .52 * s, .5 * s, .52 * s);
    cylinder(group, color, x, y + .25 * s, z, .24 * s, .5 * s, .31 * s);
    cylinder(group, 0x78664c, x, y + .505 * s, z, .26 * s, .018);
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.399, height = (.5 + (i % 3) * .2) * s;
      const ex = x + Math.sin(angle) * .32 * s, ez = z + Math.cos(angle) * .32 * s;
      beam(group, 0x758a4b, [x, y + .4 * s, z], [ex, y + height + .4 * s, ez], .019 * s);
      const leaf = ellipsoid(group, [0x93ad72, 0xb1c587, 0x728e61][i % 3], ex, y + height + .4 * s, ez, .14 * s, .3 * s, .075 * s);
      leaf.rotation.z = Math.sin(angle) * -.65; leaf.rotation.x = Math.cos(angle) * .65;
    }
  };
  const book = (x, y, z, w, h, d, color, rotation = 0) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotation; group.add(g);
    cube(g, 0xf4eacb, 0, 0, 0, w * .95, h, d * .94);
    for (const side of [-1, 1]) cube(g, color, 0, side * h * .5, 0, w, .022, d);
    cube(g, color, -w * .5, 0, 0, .03, h, d);
  };
  const picture = (x, y, z, w, h, colors = [0xd5c991, 0x89a183]) => {
    cube(group, P.wood, x, y, z, w, h, .075);
    cube(group, P.white, x, y, z + .042, w - .08, h - .08, .012);
    cube(group, 0xe5ddbb, x, y, z + .052, w - .19, h - .19, .008);
    const sun = cylinder(group, colors[0], x + w * .17, y + h * .19, z + .065, Math.min(w, h) * .16, .01);
    sun.rotation.x = Math.PI / 2;
    ellipsoid(group, colors[1], x - w * .05, y - h * .18, z + .063, w * .31, h * .20, .011);
  };
  const rug = (x, y, z, w, d, color) => {
    cube(group, color, x, y + .01, z, w, .025, d);
    for (const sign of [-1, 1]) {
      cube(group, 0xe9dcc1, x, y + .026, z + sign * (d / 2 - .1), w - .14, .007, .028);
      for (let i = 0; i < w / .1; i++) beam(group, color, [x - w / 2 + i * .1, y + .017, z + sign * d / 2], [x - w / 2 + i * .1, y + .017, z + sign * (d / 2 + .1)], .012);
    }
  };

  // Floating foundation, sunny oak planks, and a warm open cross-section.
  cube(group, 0xf3eedb, 0, -.26, 0, 16.3, .5, 14.3);
  cube(group, 0xd7c5a2, 0, -.065, 0, 16.08, .1, 14.08);
  const plankColors = [0xd4ac7b, 0xdabb8d, 0xe0bf91, 0xd6b183, 0xdfb986];
  for (let row = 0; row < 28; row++) for (let col = 0; col < 6; col++) {
    const z = -6.75 + row * .5, start = -8 + col * 3 + (row % 2 ? -1.5 : 0), left = Math.max(-8, start), right = Math.min(8, start + 3);
    if (right <= left) continue;
    cube(group, plankColors[(row * 7 + col * 3) % 5], (left + right) / 2, -.024, z, right - left - .014, .045, .49);
    if ((row + col) % 3 === 0) cube(group, 0xcb9f70, (left + right) / 2, .0005, z + .13, (right - left) * .55, .001, .009);
  }
  // Back wall, with two tall inset windows per storey.
  cube(group, P.wall, 0, 3.05, -7.04, 16.15, 6.1, .16);
  cube(group, 0xe4d9bc, -8.04, 3.05, 0, .16, 6.1, 14.15);
  cube(group, P.cream, 0, .14, -6.89, 16, .27, .1);
  cube(group, P.cream, -7.9, .14, 0, .1, .27, 14);
  cube(group, 0xd8c6a1, 0, 3.25, -6.9, 16, .12, .12);
  // Side wall paneling and subtle wallpaper strips.
  for (let i = 0; i < 16; i++) cube(group, 0xe5dabd, -7.93, .55, -6.7 + i * .85, .05, .95, .025);
  for (let i = 0; i < 34; i++) cube(group, 0xe7dac6, -7.8 + i * .47, 4.8, -6.946, .016, 2.4, .016);
  const window = (x, y, z, w, h, side = false) => {
    const g = new THREE.Group(); g.position.set(x, y, z); if (side) g.rotation.y = Math.PI / 2; group.add(g);
    cube(g, 0xd7c399, 0, 0, -.02, w + .2, h + .2, .14);
    cube(g, 0xbcd9d3, 0, 0, .06, w, h, .02);
    cube(g, 0xd7e5c7, 0, -h * .3, .08, w, h * .4, .01);
    for (let i = 0; i < 5; i++) ellipsoid(g, 0xa5c6a0, -w * .39 + i * w * .195, -h * .39, .09, w * .2, h * (.13 + (i % 2) * .05), .01);
    for (const s of [-1, 1]) { cube(g, P.white, s * w / 2, 0, .1, .075, h, .1); cube(g, P.white, 0, s * h / 2, .1, w + .09, .075, .1); }
    cube(g, P.white, 0, 0, .11, .055, h, .1); cube(g, P.white, 0, 0, .11, w, .055, .1);
    cube(g, P.white, 0, -h / 2 - .07, .19, w + .35, .1, .4);
    beam(g, P.wood, [-w * .67, h / 2 + .2, .2], [w * .67, h / 2 + .2, .2], .035);
    for (const side of [-1, 1]) for (let fold = 0; fold < 4; fold++) {
      const curtain = ellipsoid(g, [0xf4efd9, 0xece6ce][fold % 2], side * (w * .5 + .045 * fold), -.03, .18, .07, h * .59, .08);
      curtain.castShadow = false;
    }
  };
  window(-4.8, 1.95, -6.82, 2.1, 1.85);
  window(3.1, 1.95, -6.82, 2.2, 1.85);
  window(-4.8, 4.95, -6.82, 2.5, 1.85);
  window(3.1, 4.95, -6.82, 2.0, 1.85);
  window(-7.8, 1.95, 3, 2.5, 1.95, true);
  window(-7.8, 4.95, -3.5, 2.1, 1.7, true);
  // Warm window-light patches on the ground, purely decorative.
  const sunPatch = new THREE.MeshBasicMaterial({ color: 0xffefb9, transparent: true, opacity: .18, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(.73, 1.15), sunPatch);
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = -.25; patch.position.set(-6.4 + (i % 2) * .88, .006, 1.45 + Math.floor(i / 2) * 1.3); group.add(patch);
  }

  // Upstairs: a genuine floor with ceiling collision below, carpet above, and an open stairwell.
  solid(0xe5d9bd, -1.375, 3.28, -4.15, 12.85, .24, 5.5, 'carpet');
  solid(0xe5d9bd, 6.325, 3.28, -4.75, 2.55, .24, 4.3, 'carpet');
  cube(group, 0xbac9a1, -1.375, 3.409, -4.15, 12.85, .018, 5.5);
  cube(group, 0xbac9a1, 6.325, 3.409, -4.75, 2.55, .018, 4.3);
  for (let i = 0; i < 55; i++) cube(group, 0xb6c49b, -7.65 + i * .23, 3.42, -4.16, .009, .001, 5.46);
  // Balcony balustrade: lower toe-board, airy white spindles, warm handrail.
  solid(P.cream, -1.65, 3.79, -1.38, 12.25, .78, .07, 'wood').visible = false;
  cube(group, P.wood, -1.65, 4.29, -1.38, 12.3, .09, .12);
  cube(group, P.cream, -1.65, 3.52, -1.38, 12.3, .14, .1);
  for (let x = -7.7; x <= 4.5; x += .38) beam(group, P.white, [x, 3.56, -1.38], [x, 4.24, -1.38], .024);
  // Sloped traversal surface is in physics; individual risers make it read as stairs.
  const count = 20, run = (STAIRS.startZ - STAIRS.endZ) / count;
  for (let i = 0; i < count; i++) {
    const h = (i + 1) * STAIRS.height / count;
    cube(group, 0xd5b084, 6.3, h / 2, STAIRS.startZ - (i + .5) * run, 2.3, h, run);
    cube(group, 0xe2c394, 6.3, h + .018, STAIRS.startZ - (i + .5) * run, 2.34, .036, run + .03);
    // A small stair runner visually makes the route easy to find.
    cube(group, 0xc6b99c, 6.3, h + .038, STAIRS.startZ - (i + .5) * run, 1.35, .007, run + .004);
  }
  for (const x of [5.13, 7.47]) {
    beam(group, P.wood, [x, .85, 4.7], [x, 4.25, -2.7], .045);
    for (let i = 0; i <= 10; i++) {
      const z = 4.7 - i * .74, y = i * .34;
      beam(group, P.white, [x, y, z], [x, y + .82, z], .035);
      // Short collision segments follow the slope; prevent leaving stairs sideways.
      world.addBox(x, y + .35, i === 10 ? z : z - .24, .07, .7, i === 10 ? .07 : .49);
    }
  }
  plant(7.1, 0, 5.65, 1.15, P.peach);
  plant(7.1, 3.4, -5.9, .85, P.white);

  // Shidan's 3 m circular den, with a 1.1 m white wire fence and no daytime cap.
  cylinder(group, 0xc9bb9b, DEN.x, -.005, DEN.z, 1.52, .04, 1.52, 96);
  cylinder(group, 0xe3dec0, DEN.x, .018, DEN.z, 1.47, .014, 1.47, 96);
  for (let ring = 0; ring <= 7; ring++) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.5, ring === 7 ? .018 : .009, 5, 96), mat(P.white));
    mesh.rotation.x = Math.PI / 2; mesh.position.set(DEN.x, .045 + ring * 1.055 / 7, DEN.z); mesh.castShadow = true; group.add(mesh);
  }
  for (let i = 0; i < 80; i++) {
    const angle = i / 80 * Math.PI * 2, x = DEN.x + Math.sin(angle) * 1.5, z = DEN.z + Math.cos(angle) * 1.5;
    beam(group, P.white, [x, .03, z], [x, 1.1, z], i % 10 === 0 ? .019 : .008);
  }
  // A folded cotton cover waits outside the den for the later bedtime mechanic.
  cube(group, 0xf2e9d7, -6.75, .12, 4.85, .85, .22, .64);
  cube(group, 0xe3d9c9, -6.75, .245, 4.85, .85, .03, .64);
  // Bed, hay tray, fresh water and pellets. These are props in milestone 1.
  cylinder(group, P.peach, -5.02, .1, 2.38, .44, .18, .47);
  cylinder(group, 0xf1dec0, -5.02, .19, 2.38, .36, .03);
  cylinder(group, 0xe8bd78, -3.75, .08, 2.64, .23, .14, .27);
  cylinder(group, 0x927547, -3.75, .156, 2.64, .21, .015);
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4, r = .03 + (i % 5) * .031;
    ellipsoid(group, 0xb18b57, -3.75 + Math.cos(a) * r, .175, 2.64 + Math.sin(a) * r, .02, .015, .035);
  }
  cylinder(group, 0xadc8c8, -3.69, .08, 3.34, .22, .14, .26);
  const water = cylinder(group, 0x96ccd9, -3.69, .148, 3.34, .21, .01); water.material = new THREE.MeshStandardMaterial({ color: 0xaddde0, roughness: .18, metalness: .15 });
  cube(group, 0xc5aa7e, -5.32, .08, 3.78, .48, .15, .55);
  for (let i = 0; i < 25; i++) {
    const x = -5.51 + (i % 6) * .07, z = 3.57 + Math.floor(i / 6) * .09;
    beam(group, [0xd8c17e, 0xb5ab65, 0xe5d198][i % 3], [x, .17, z], [x + .13, .19, z + .17], .009);
  }
  // A tiny name plaque, rendered locally without font or image requests.
  label(group, 'SHIDAN', DEN.x, .76, DEN.z + 1.535, .55, .2, '#f9f4db', '#718363');

  // Living room. Cushions are soft elliptical forms over a solid couch frame.
  solid(0x7f9c85, -4.35, .39, -.35, 3.4, .5, 1.28);
  solid(0x92ad94, -4.35, .95, -.92, 3.45, 1.0, .27);
  for (const side of [-1, 1]) solid(0x8da990, -4.35 + side * 1.58, .7, -.35, .28, .75, 1.3);
  for (let i = -1; i <= 1; i++) {
    ellipsoid(group, 0xb3c5a7, -4.35 + i * 1.01, .68, -.26, .53, .15, .53);
    ellipsoid(group, 0xa7bd9e, -4.35 + i * 1.01, 1.01, -.79, .53, .35, .14);
  }
  for (const x of [-5.8, -2.9]) for (const z of [-.85, .14]) cylinder(group, P.wood, x, .18, z, .07, .36);
  const pillow = cube(group, 0xe6ca9d, -5.42, .96, -.32, .55, .5, .22); pillow.rotation.z = -.18; pillow.rotation.x = -.2;
  const pillow2 = cube(group, 0xe0ad9b, -3.3, .96, -.32, .5, .48, .22); pillow2.rotation.z = .23;
  cube(group, 0xcad0b7, -4, .795, -.13, .63, .05, .7);
  // Phone on the couch, a future cue for the mistress's starting location.
  cube(group, 0x465263, -4, .83, -.08, .16, .025, .28); cube(group, 0x98b1b0, -4, .846, -.08, .13, .008, .23);
  solid(P.wood, -.8, .74, -.22, 1.6, .11, 1.06);
  for (const x of [-1.43, -.17]) for (const z of [-.6, .16]) solid(0xaa835e, x, .34, z, .08, .68, .08);
  book(-1.08, .845, -.16, .45, .065, .34, P.peach, -.1);
  cylinder(group, P.white, -.4, .89, -.31, .085, .18);
  cylinder(group, 0x79634c, -.4, .985, -.31, .064, .003);
  plant(-6.8, 0, -.7, 1.3, P.white);
  cylinder(group, 0x867c62, -2.28, .08, -1.04, .3, .13);
  beam(group, 0xb7a37a, [-2.28, .12, -1.04], [-2.28, 2, -1.04], .035);
  cylinder(group, 0xf4deb2, -2.28, 2.03, -1.04, .42, .48, .23);
  picture(-.25, 1.99, -6.87, 1.3, 1.2);

  // Kitchen below the upper floor.
  solid(0xacc1aa, -4.15, .5, -6.14, 4.7, 1, 1.23);
  solid(0xf2ecd9, -4.15, 1.035, -6.14, 4.8, .1, 1.29);
  for (let x = -6.15; x <= -2.4; x += .77) {
    cube(group, 0x9db49b, x, .51, -5.51, .69, .86, .03);
    beam(group, P.wood, [x - .13, .75, -5.47], [x + .13, .75, -5.47], .018);
  }
  cube(group, 0x9cafac, -4.8, 1.093, -6.1, .9, .016, .66);
  cube(group, 0xd7dfcd, -4.8, 1.104, -6.1, .75, .008, .54);
  beam(group, 0xa3b2a9, [-4.8, 1.11, -6.5], [-4.8, 1.5, -6.5], .03);
  beam(group, 0xa3b2a9, [-4.8, 1.5, -6.5], [-4.8, 1.5, -6.26], .03);
  solid(0xf1e7cf, -7, 1.13, -5.8, 1.1, 2.25, 1.3);
  cube(group, 0xe0d5bb, -7, 1.37, -5.134, 1, .025, .02);
  beam(group, P.wood, [-6.63, 1.55, -5.1], [-6.63, 1.88, -5.1], .025);
  plant(-2.45, 1.1, -6.2, .4, P.peach);
  cylinder(group, 0xd8ab77, -3.2, 1.12, -5.98, .24, .07);
  for (let i = 0; i < 3; i++) ellipsoid(group, [0xebbe66, 0xd99479, 0xc7c48a][i], -3.34 + i * .13, 1.22, -5.98, .09, .1, .08);
  // Dining table has space under it for a rabbit-sized hiding place.
  solid(0xd3b182, 2.25, 1.05, -4.6, 2.05, .13, 1.55);
  for (const x of [1.42, 3.08]) for (const z of [-5.17, -4.03]) solid(0xb9966a, x, .49, z, .11, .98, .11);
  for (const x of [.8, 3.7]) {
    solid(0xb4bfa0, x, .52, -4.6, .63, .1, .65);
    solid(0xabc09f, x, .95, -4.93, .65, .87, .09);
    for (const sx of [-.24, .24]) for (const sz of [-.24, .24]) solid(0xb99c71, x + sx, .25, -4.6 + sz, .055, .5, .055);
  }
  plant(2.25, 1.13, -4.6, .33, P.peach);

  // Tempting props establish future chewing spots without implying scoring yet.
  solid(0xcfa36c, 2.8, .26, 2, 1.05, .52, .85);
  cube(group, 0xa67e50, 2.8, .523, 2, .88, .008, .68);
  for (const side of [-1, 1]) {
    const flap = cube(group, 0xdcb480, 2.8 + side * .64, .61, 2, .38, .018, .85); flap.rotation.z = side * .5;
  }
  cube(group, 0xe6c79a, 2.8, .28, 2.432, .19, .49, .007);
  label(group, 'THIS WAY UP', 2.8, .3, 2.443, .6, .13, '#d9b381', '#8b704e');
  book(.3, .065, 3.68, .63, .11, .45, 0xabbbc0, .15);
  book(.34, .19, 3.67, .6, .08, .43, 0xdbad92, -.12);
  world.addBox(.32, .12, 3.68, .7, .24, .5);
  plant(1.35, 0, 5.7, 1.05, P.peach);
  // Bookshelf along the side, behind the couch.
  solid(0xcaa77c, -7.18, .92, -3.2, .92, 1.84, 2.1);
  for (let shelf = 0; shelf < 3; shelf++) for (let i = 0; i < 7; i++) {
    cube(group, [0xaebfa0, 0xd7b294, 0x94b5bd, 0xe4d39e][(i + shelf) % 4], -6.695, .26 + shelf * .52 + (i % 2) * .02, -4.01 + i * .235, .05, .34 + (i % 3) * .035, .17);
  }

  // Upstairs bedroom, reading corner and study nook.
  rug(-.7, 3.425, -4.5, 3.5, 3.2, 0xd9caaa);
  solid(0xc29d75, -.8, 3.68, -4.95, 2.32, .52, 3.12, 'carpet');
  solid(0x9cb59d, -.8, 4.03, -6.36, 2.4, 1.13, .15, 'carpet');
  cube(group, 0xf5ead1, -.8, 4.005, -4.91, 2.23, .26, 2.9);
  cube(group, 0xe2b39a, -.8, 4.16, -4.38, 2.28, .13, 1.95);
  for (let i = 0; i < 10; i++) cube(group, 0xe7c0a7, -.8, 4.229, -5.2 + i * .18, 2.25, .008, .012);
  for (const x of [-1.36, -.24]) ellipsoid(group, 0xfff5db, x, 4.18, -5.96, .48, .13, .35);
  solid(P.wood, -2.54, 3.8, -5.78, .63, .8, .67);
  cylinder(group, P.cream, -2.54, 4.52, -5.78, .22, .32, .13);
  cylinder(group, 0xac9876, -2.54, 4.25, -5.78, .055, .35);
  rug(-5.35, 3.425, -4.9, 2.45, 2.4, 0xe4d9bb);
  solid(0xb0bea1, -5.42, 3.72, -5.17, 1.4, .56, 1.45, 'carpet');
  solid(0x99af94, -5.42, 4.17, -5.78, 1.4, 1.12, .23, 'carpet');
  for (const x of [-6.07, -4.77]) solid(0xa7b99b, x, 3.99, -5.15, .17, .91, 1.43, 'carpet');
  ellipsoid(group, 0xc8d0af, -5.42, 4.03, -5.08, .63, .12, .64);
  const readingPillow = cube(group, 0xf0d5a4, -5.42, 4.32, -5.43, .63, .52, .19); readingPillow.rotation.x = -.18;
  solid(P.wood, -3.94, 3.98, -4.91, .62, .12, .7);
  solid(P.wood, -3.94, 3.67, -4.91, .12, .53, .12);
  book(-3.94, 4.1, -4.91, .42, .09, .31, P.blue, .17);
  plant(-6.98, 3.4, -5.9, .7, P.peach);
  // Desk, notebook, lamp and stool.
  solid(0xd6b58a, 3.15, 4.43, -5.91, 2.1, .12, .95);
  for (const x of [2.27, 4.03]) for (const z of [-6.25, -5.57]) solid(0xc4a67e, x, 3.9, z, .085, 1, .085);
  solid(0xe7c09c, 3.15, 3.88, -4.92, .72, .11, .67, 'carpet');
  for (const x of [2.9, 3.4]) for (const z of [-5.15, -4.69]) solid(0xb29875, x, 3.61, z, .06, .44, .06);
  book(3.05, 4.53, -5.8, .57, .045, .38, P.darkSage, -.1);
  cylinder(group, 0xe5c184, 3.85, 4.73, -6.05, .18, .27, .1);
  cylinder(group, 0x998666, 3.85, 4.55, -6.05, .035, .27);
  picture(.65, 5.16, -6.87, .87, 1.07, [0xe4c07f, 0x9bac8b]);
  // Ceiling pendants kept sparse to preserve sightlines.
  for (const [x, z] of [[.4, 1.5], [2.2, -4.6]]) {
    beam(group, 0xc5b899, [x, 3.16, z], [x, 2.55, z], .014);
    cylinder(group, 0xf5e5bf, x, 2.5, z, .37, .32, .18);
  }

  // Tiny pawprint trail toward the stairs; atmosphere, not collectible icons.
  for (let i = 0; i < 8; i++) {
    const x = .4 + i * .53, z = 4.85 + Math.sin(i * .7) * .18;
    const footprint = ellipsoid(group, 0xc69d6e, x, .007, z, .041, .002, .07); footprint.rotation.y = .9;
  }
  return { group, world, readingNook: { x: -5.4, z: -3.7 } };
}

function label(parent, text, x, y, z, w, h, background, foreground) {
  if (typeof document === 'undefined') return; // Physics tests construct the same level without a renderer.
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = foreground; ctx.font = '500 45px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 84);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 })); mesh.position.set(x, y, z); parent.add(mesh);
}

// Bake static meshes by material to keep this furnished scene economical to draw.
// Non-opaque labels and sun patches retain their original render ordering.
export function batchStaticGeometry(group) {
  group.updateMatrixWorld(true);
  const batches = new Map(), sources = [];
  group.traverse(object => {
    if (!object.isMesh || !object.visible || object.material.transparent) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(geometry); sources.push(object);
  });
  for (const [material, geometries] of batches) {
    const merged = new THREE.BufferGeometry();
    for (const attribute of ['position', 'normal', 'uv']) {
      const arrays = geometries.map(g => g.getAttribute(attribute));
      if (arrays.some(a => !a)) continue;
      const data = new Float32Array(arrays.reduce((n, a) => n + a.array.length, 0));
      let offset = 0; for (const a of arrays) { data.set(a.array, offset); offset += a.array.length; }
      merged.setAttribute(attribute, new THREE.BufferAttribute(data, arrays[0].itemSize));
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'Batched house'; group.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  sources.forEach(source => source.removeFromParent());
}
