import { DEN, FLOOR_HEIGHT as H, BOUNDS } from './layout.js';
import { palette as P, cylinder, ellipsoid, beam } from './model.js';

export function furnishHouse({ ground: g, upper: u, outside: o, solid: s, detail: d, world, label }) {
  const rug = (p, x, y, z, w, depth, color) => {
    // Ground-floor mats are cosmetic; only the pen has grip downstairs.
    d(p, color, x, y + .006, z, w, .012, depth);
    for (const sign of [-1, 1]) d(p, 0xf4e9cc, x, y + .014, z + sign * (depth / 2 - .14), w - .18, .008, .06);
  };
  const book = (p, x, bottom, z, w, h, depth, color, id) => {
    s(p, color, x, bottom + h / 2, z, w, h, depth, 'wood', id);
    d(p, 0xf5e8cc, x + .015, bottom + h / 2, z + .018, w - .04, Math.max(.025, h - .055), depth - .035);
  };
  const plant = (p, x, y, z, size = 1, color = 0xf4d2aa) => {
    // Enclose the pot and low foliage, so neither the pot nor the canopy can be walked through.
    world.addBox(x, y + size * .6, z, .85 * size, 1.2 * size, .85 * size);
    cylinder(p, color, x, y + .28 * size, z, .27 * size, .56 * size, .35 * size);
    cylinder(p, 0x806951, x, y + .56 * size, z, .31 * size, .02);
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4;
      beam(p, 0x7b945a, [x, y + .5 * size, z], [x + Math.sin(a) * .23 * size, y + size * (.83 + i % 2 * .2), z + Math.cos(a) * .23 * size], .024 * size);
      ellipsoid(p, [0x99b87c, 0xb7cc91, 0x789e70][i % 3], x + Math.sin(a) * .24 * size, y + size * (.82 + i % 2 * .2), z + Math.cos(a) * .24 * size, .2 * size, .24 * size, .17 * size);
    }
  };
  const picture = (p, x, y, z, w, h) => {
    d(p, 0xbca17a, x, y, z, w, h, .075); d(p, 0xfff4d8, x, y, z + .043, w - .12, h - .12, .01);
    ellipsoid(p, 0xc6d4a1, x - w * .13, y - h * .2, z + .065, w * .3, h * .18, .012);
    ellipsoid(p, 0xd9b875, x + w * .2, y + h * .2, z + .065, w * .12, w * .12, .01);
  };
  const table = (p, x, y, z, w, depth, top, color = P.wood, id = 'table') => {
    s(p, color, x, y + top - .09, z, w, .18, depth, 'wood', `${id}-top`);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) s(p, 0xae8c65, x + dx * (w / 2 - .2), y + (top - .18) / 2, z + dz * (depth / 2 - .2), .16, top - .18, .16);
  };
  const stool = (p, x, y, z, w, depth, top, color = P.peach, surface = 'wood', id) => {
    s(p, 0xbfa381, x, y + (top - .13) / 2, z, w * .8, top - .13, depth * .8);
    s(p, color, x, y + top - .065, z, w, .13, depth, surface, id);
  };
  const chest = (p, x, y, z, w, h, depth, color, id) => {
    s(p, color, x, y + h / 2, z, w, h, depth, 'wood', id);
    d(p, 0xf0ddba, x, y + h - .035, z, w + .02, .045, depth + .02);
    for (const dx of [-1, 1]) d(p, 0xba9869, x + dx * w * .33, y + h / 2, z + depth / 2 + .009, .045, h - .05, .02);
    d(p, 0xb69a68, x, y + h * .55, z + depth / 2 + .026, .13, .08, .025);
  };
  const sofa = (p, x, y, z, w, color, id) => {
    s(p, 0xb29470, x, y + .32, z, w, .56, 1.95, 'wood', `${id}-base`);
    s(p, color, x, y + .71, z + .12, w - .36, .26, 1.72, 'carpet', `${id}-cushion`);
    s(p, color, x, y + 1.1, z - .94, w, 1.22, .28);
    for (const sign of [-1, 1]) s(p, color, x + sign * (w / 2 - .14), y + .8, z, .28, 1, 2.05);
    for (let i = 1; i < 3; i++) d(p, 0xe5ebcf, x - w / 2 + w * i / 3, y + .846, z + .12, .022, .004, 1.67);
    s(p, 0xf3ddb7, x - w * .3, y + 1.04, z - .44, .66, .4, .32, 'carpet', `${id}-pillow`);
  };
  const blanket = (p, x, y, z, w, depth, color, id) => {
    s(p, color, x, y + .04, z, w, .08, depth, 'carpet', id);
    for (let i = 0; i < 7; i++) d(p, 0xeeddbb, x - w / 2 + .12 + i * (w - .24) / 6, y + .082, z, .035, .004, depth - .05);
  };
  const shelves = (p, x, y, z, w, depth, height, color, id) => {
    s(p, color, x, y + height / 2, z, w, height, depth, 'wood', id);
    // Recessed dark faces and book spines remain contained within the cabinet collider.
    for (let row = 0; row < 3; row++) {
      const cy = y + .35 + row * (height - .5) / 3;
      d(p, 0x998267, x, cy, z + depth / 2 + .004, w - .18, .5, .012);
      for (let i = 0; i < Math.floor(w / .19) - 1; i++) d(p, [P.blue, P.sage, P.peach, P.gold][(row + i) % 4], x - w / 2 + .2 + i * .19, cy - .02, z + depth / 2 + .013, .145, .32 + (i % 3) * .05, .012);
    }
  };
  const paw = (p, x, y, z, angle = 0) => {
    const print = ellipsoid(p, 0xb89970, x, y + .014, z, .09, .003, .12); print.rotation.y = angle;
    for (const dx of [-.07, 0, .07]) ellipsoid(p, 0xb89970, x + dx, y + .014, z - .15, .028, .003, .035);
  };

  // Den: clear central runway and props near the perimeter, leaving room to charge.
  stool(g, DEN.x - 2.6, 0, DEN.z + 1.4, 1.4, 1.1, .23, 0xc2cba8, 'bedding', 'den-bed');
  blanket(g, DEN.x - 2.6, .23, DEN.z + 1.4, 1.25, .95, 0xeed5af, 'den-blanket');
  for (const [x, z, color] of [[DEN.x + 2.7, DEN.z + 1.7, 0x94bbca], [DEN.x + 2.7, DEN.z + .5, 0xd9b385]]) {
    world.addBox(x, .15, z, .68, .3, .68);
    cylinder(g, 0xf9eed6, x, .14, z, .38, .28, .34);
    cylinder(g, color, x, .286, z, .28, .012);
  }
  chest(g, -21.7, 0, 16.8, 1.8, .32, 1.4, 0xece3cb, 'folded-cover-base');
  blanket(g, -21.7, .32, 16.8, 1.8, 1.4, 0xf5eedb, 'folded-cotton-cover');

  // Lounge: book -> footstool -> sofa cushion -> solid blanket.
  rug(g, -17, 0, 5.8, 8, 5.6, 0xd9ddbf);
  sofa(g, -17, 0, 5.2, 5.4, P.sage, 'lounge-sofa');
  blanket(g, -17, .84, 5.65, 1.25, 1.1, 0xe3c89c, 'sofa-blanket');
  book(g, -19, 0, 7.9, 1.1, .27, .75, P.peach, 'sofa-book-step');
  stool(g, -19, 0, 6.95, 1.2, 1.1, .5, 0xc5cda9, 'wood', 'sofa-footstool');
  d(g, 0x424953, -15.2, .854, 5.5, .28, .025, .5); d(g, 0xaecbd3, -15.2, .87, 5.5, .23, .006, .43);
  table(g, -9, 0, 7.5, 3.2, 2.1, 1.44, 0xdab482, 'coffee');
  book(g, -9, 0, 10.8, 1.2, .28, .9, P.blue, 'coffee-books');
  stool(g, -9, 0, 9.7, 1.3, 1.1, .66, P.peach, 'wood', 'coffee-stool');
  chest(g, -9, 0, 8.7, 1.25, 1.05, .95, 0xd2b082, 'coffee-trunk');
  book(g, -9.4, 1.44, 7.3, .7, .09, .5, P.sage);
  plant(g, -22.3, 0, 4.1, 1.6); plant(g, -7, 0, 18, 1.5);
  picture(g, -18, 2.3, 2.14, 2.4, 1.4);
  label(g, 'SUNNY LOUNGE', -11, 2.3, 2.14, 2.8, .5);

  // Entrance: wide circulation on the west of the stairs and a front-door porch.
  chest(g, -3.2, 0, 9, 1.5, .55, 2.4, 0xb2c3a5, 'hall-bench');
  blanket(g, -3.2, .55, 9, 1.4, 1.4, P.peach, 'hall-bench-blanket');
  for (let i = 0; i < 10; i++) paw(g, -10.5 + i * 1.1, 0, 17 + Math.sin(i) * .2, Math.PI / 2);
  label(g, 'GARDEN  /  UPSTAIRS', -2, 2.3, 2.14, 3.2, .45);
  rug(o, 0, 0, 21.5, 5, 2, 0xb8c49b);
  for (const x of [-3.8, 3.8]) plant(o, x, 0, 21.5, 1.3);

  // Kitchen/dining: an island to circle, a table to duck under, and a chair route.
  s(g, 0xaac4a4, 22.7, .66, 11, 1.6, 1.32, 9, 'wood', 'kitchen-cabinets');
  s(g, 0xf6e9cf, 22.7, 1.38, 11, 1.75, .12, 9.15, 'wood', 'kitchen-counter');
  for (let z = 7; z < 16; z += 1.3) d(g, 0x728e6c, 21.87, .75, z, .04, .07, .32);
  s(g, 0xe2e9d6, 22.6, 1.35, 4.6, 1.9, 2.7, 1.5, 'wood', 'fridge');
  d(g, 0xb4c3b0, 21.63, 1.6, 4.2, .04, .8, .07);
  s(g, 0xc4d0ab, 14, .67, 7, 4.8, 1.34, 2.7, 'wood', 'kitchen-island');
  s(g, 0xf3dfbd, 14, 1.42, 7, 5.05, .16, 2.9, 'wood', 'island-counter');
  for (let i = 0; i < 3; i++) {
    world.addBox(13 + i * .6, 1.64, 7, .27, .28, .28);
    ellipsoid(g, [0xe6b06e, 0xc2ce7d, 0xe8a086][i], 13 + i * .6, 1.64, 7, .16, .16, .16);
  }
  rug(g, 14, 0, 15, 8, 6, 0xe4cfb0); table(g, 14, 0, 15, 4.8, 2.8, 1.52, 0xcfa87b, 'dining');
  for (const x of [12.3, 15.7]) for (const z of [12.8, 17.2]) {
    stool(g, x, 0, z, 1.1, 1.1, .68, P.sage);
    s(g, 0xb8c69f, x, 1.12, z + (z < 15 ? -.5 : .5), 1.1, 1.15, .13);
  }
  chest(g, 10.7, 0, 15, 1.25, 1.12, 1.6, 0xe7bd96, 'dining-climb');
  stool(g, 9.5, 0, 15, 1.2, 1.4, .72, P.peach); book(g, 8.4, 0, 15, .9, .32, 1.1, P.blue);
  label(g, 'KITCHEN & DINING', 12, 2.3, 2.14, 3.2, .5);
  for (const x of [-20, -8, 10, 22]) plant(g, x, 0, -.5, .9);

  // Library: shelving hides a real two-ended passage along the western wall.
  for (const z of [-13.8, -10]) {
    s(g, 0xb29b7d, -20.4, 1.35, z, 1, 2.7, 3, 'wood', 'library-shelf-' + z);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) d(g, [P.peach, P.blue, P.sage, P.gold][i % 4], -19.89, .3 + row * .6, z - 1.22 + i * .3, .014, .42, .23);
  }
  // A ceiling makes this route a genuine low passage, with open arches at each end.
  s(g, 0xc6b798, -22.5, 1.72, -11.5, 2.8, .22, 16, 'wood', 'library-tunnel-ceiling');
  for (let z = -16; z < -6; z += 1.5) paw(g, -22.5, 0, z);
  table(g, -12, 0, -11, 4.4, 2.8, 1.6, 0xc7a983, 'library-table');
  shelves(g, -12, 0, -18.8, 6, .8, 2.6, 0xbda27f, 'rear-bookcase');
  for (let i = 0; i < 4; i++) book(g, -12.6 + i * .72, 1.6, -11, .65, .08 + i % 2 * .07, .8, [P.sage, P.peach, P.blue][i % 3]);
  stool(g, -11, 0, -8.9, 1.4, 1.1, .65, P.peach); chest(g, -14.4, 0, -10.5, 1, 1.05, 1.5, 0xd7b98d, 'library-step');
  plant(g, -7, 0, -8.5, 1.6);
  label(g, 'THE SECRET LIBRARY', -17, 2.4, -19.85, 3.7, .5);
  // Cushioned window seats on both sides create a readable jump shortcut.
  for (const x of [-5.65, -4.35, 7.35, 8.65]) stool(g, x, 0, -12, .9, 2.1, .32, 0xdacdaa);

  // Garden room: cover clusters offset from the direct path to the rear doors.
  sofa(g, 3.5, 0, -10.8, 3.3, 0xc4ceb2, 'garden-sofa');
  blanket(g, 3.3, .84, -10.4, 1, 1.1, P.peach, 'garden-blanket');
  table(g, 2.9, 0, -7.6, 2.4, 1.5, 1.45, 0xe0bf8c, 'garden-table');
  plant(g, -3.1, 0, -8.5, 1.5); plant(g, 5.9, 0, -15, 1.8); plant(g, -3, 0, -18, 1.3);
  rug(g, 2.8, 0, -10, 6.5, 6, 0xdbe2c3);
  label(g, 'TO THE CLOVER GARDEN', 4.5, 2.3, -19.85, 3.9, .45);

  // Craft room: crate staircase and laundry create several corners for losing sight.
  for (const [x, z, h, color] of [[12, -9, .32, 0xdfbd91], [12, -10, .69, 0xc8ac88], [12, -11, 1.08, 0xe0c499], [12, -12, 1.48, 0xd0b389], [14, -12, 1.48, 0xd9bb94]]) chest(g, x, 0, z, 1.65, h, 1.25, color, `craft-crate-${z}-${x}`);
  blanket(g, 14, 1.48, -12, 1.6, 1.2, P.blue, 'crate-blanket');
  for (const z of [-15, -17.4]) {
    s(g, 0xe1e9d7, 22.2, .8, z, 2, 1.6, 2, 'wood', 'laundry-' + z);
    const door = cylinder(g, 0xb5c7ca, 21.18, .83, z, .52, .03); door.rotation.z = Math.PI / 2;
    const glass = cylinder(g, 0x748c96, 21.15, .83, z, .38, .035); glass.rotation.z = Math.PI / 2;
  }
  table(g, 18, 0, -9, 4, 2.1, 1.55, 0xc6b194, 'craft-table');
  chest(g, 10.3, 0, -18.2, 2.5, 1.2, 1.6, 0xcbd6bb, 'linen-chest');
  label(g, 'MAKE A LITTLE MESS', 12, 2.4, -19.85, 3.8, .5);

  // Bedroom: every layer (frame, mattress, quilt, pillows) is individually solid.
  rug(u, -15, H, -13, 9, 10, 0xdcc5b4);
  s(u, 0xb39977, -15, H + .25, -14, 5.1, .5, 4.7, 'carpet', 'bed-frame');
  s(u, 0xf5ebd4, -15, H + .69, -14, 4.95, .38, 4.5, 'carpet', 'mattress');
  blanket(u, -15, H + .88, -13.5, 5, 3.5, 0xe5b8a6, 'bed-quilt');
  s(u, 0xc4ac8c, -15, H + .94, -16.4, 5.25, 1.88, .2, 'carpet', 'headboard');
  for (const x of [-16.4, -13.6]) s(u, 0xf6e5c7, x, H + 1.01, -15.7, 1.9, .26, .9, 'carpet', 'bed-pillow-' + x);
  stool(u, -15, H, -9.8, 1.6, 1.1, .3, P.peach, 'carpet', 'bed-pouf');
  chest(u, -15, H, -10.9, 2.4, .61, 1.2, 0xc7b092, 'bed-trunk');
  for (const x of [-19, -11]) { chest(u, x, H, -15, 1.4, .9, 1.35, 0xd7ba94, 'nightstand-' + x); plant(u, x, H + .9, -15, .6); }
  sofa(u, -20, H, -7.5, 3, 0xb3c3a4, 'bedroom-chair');
  plant(u, -7.2, H, -9, 1.4);
  picture(u, -15, H + 2.6, -19.85, 2.5, 1.3);

  // Reading room: soft grip and stepping furniture encourage longer upstairs jumps.
  rug(u, 2, H, -12, 8, 9, 0xc4d1a6);
  sofa(u, 2.4, H, -13.5, 3.8, 0xb2c4a0, 'reading-sofa');
  blanket(u, 2.4, H + .84, -13, 1.4, 1.2, 0xead5a3, 'reading-blanket');
  stool(u, 2, H, -11.3, 2.2, 1.6, .4, P.peach, 'carpet', 'reading-pouf');
  shelves(u, 4.5, H, -18.8, 4, 1, 2.7, 0xc2ac86, 'reading-shelves');
  plant(u, -3.1, H, -8.5, 1.5); plant(u, 6, H, -6, 1.1);
  for (const x of [-5.65, -4.35, 7.35, 8.65]) stool(u, x, H, -12, .9, 2.1, .32, 0xdacdaa, 'carpet');
  label(u, 'ONE MORE CHAPTER', 3.9, H + 3, -19.85, 3.5, .5);

  // Studio: desktop route and a second secret passage behind the linen cupboards.
  table(u, 14, H, -12, 4.4, 2.1, 1.46, 0xdcc199, 'studio-desk');
  book(u, 14, H, -8.6, 1.1, .29, .9, P.peach, 'desk-book-step');
  stool(u, 14, H, -9.6, 1.3, 1.2, .65, P.blue, 'carpet', 'desk-stool');
  chest(u, 14, H, -10.65, 1.4, 1.06, .9, 0xc7b893, 'desk-trunk');
  book(u, 14.2, H + 1.46, -12, .8, .11, .9, P.blue);
  for (const z of [-13.8, -10]) {
    s(u, 0xc1d0c5, 20.4, H + 1.35, z, 1, 2.7, 3);
    for (let i = 0; i < 4; i++) d(u, 0x9fb9ac, 19.88, H + .5 + i * .58, z, .02, .03, 2.8);
  }
  s(u, 0xc9d7c6, 22.5, H + 1.72, -11.5, 2.8, .22, 16, 'wood', 'linen-tunnel-ceiling');
  for (let z = -16; z < -6; z += 1.5) paw(u, 22.5, H, z);
  chest(u, 10.5, H, -18, 2.5, .8, 1.3, 0xe1bf9e, 'studio-trunk');
  blanket(u, 10.5, H + .8, -18, 2.4, 1.25, P.blue, 'studio-blanket');
  picture(u, 12, H + 2.5, -19.85, 2.8, 1.5);
  for (const x of [-20, -8, 10, 22]) plant(u, x, H, -.7, .9);

  // Balcony: two doors and a hop-through bedroom window feed the outdoor stair loop.
  stool(o, -8, H, -22.2, 4, 1.2, .55, 0xcbd0ab, 'wood', 'balcony-bench');
  blanket(o, -8, H + .55, -22.2, 1.6, 1.1, 0xe4c6a1, 'balcony-blanket');
  for (const x of [-18.8, 6, 12, 23]) plant(o, x, H, -24, .85);
  for (const x of [-19.7, -9, 8, 23.7]) s(o, 0xf1e6cc, x, H / 2, -24.6, .25, H, .25);

  // Backyard: grass sprint lanes, a hedge tunnel, garden-bed loops, and stepping logs.
  d(o, 0xb7cc98, 0, -.06, -29, 52, .12, 18);
  for (let i = 0; i < 32; i++) {
    const x = -24 + (i * 13.37 % 48), z = -21 - (i * 7.71 % 15);
    ellipsoid(o, i % 2 ? 0xc8d8a8 : 0xc0d19e, x, .005, z, 1.3 + i % 3, .008, .65 + i % 2);
  }
  for (let i = 0; i < 9; i++) {
    const z = -21.5 - i * 1.5, x = Math.sin(i * .52) * 1.2;
    s(o, 0xdfdcc4, x, .055, z, 1.35, .11, .92, 'grass');
  }
  for (const [x, z] of [[-8, -25], [-8, -29], [7, -26]]) {
    chest(o, x, 0, z, 4.2, .46, 2.2, 0xb7a07a, 'raised-bed-' + z + x);
    s(o, 0x8e795c, x, .48, z, 3.9, .07, 1.9, 'grass');
    for (let i = 0; i < 5; i++) for (const dz of [-.5, .5]) ellipsoid(o, [0x8fab6d, 0xb3c780][i % 2], x - 1.5 + i * .75, .64, z + dz, .22, .16, .22);
  }
  // Low lintels make a sheltered route that a future standing adult cannot use.
  for (const z of [-35, -31]) s(o, 0x87a773, -16, .94, z, 8.2, 1.88, 1, 'grass', 'hedge-' + z);
  for (const x of [-20, -12]) {
    for (const z of [-34.1, -31.9]) s(o, 0x91af79, x, .94, z, 1, 1.88, 1.2, 'grass');
    s(o, 0x91af79, x, 1.71, -33, 1, .34, 1.2, 'grass');
  }
  s(o, 0x9bb77e, -16, 1.72, -33, 7, .22, 3, 'grass', 'hedge-roof');
  for (let i = 0; i < 6; i++) paw(o, -19 + i * 1.2, 0, -33, Math.PI / 2);
  for (const [x, z, h] of [[-6, -34, .3], [-4.8, -34, .65], [-3.6, -34, 1.02]]) {
    world.addBox(x, h / 2, z, 1, h, 1);
    cylinder(o, 0xb59b75, x, h / 2, z, .53, h, .5, 12);
    cylinder(o, 0xe0c89a, x, h + .003, z, .46, .006, .46, 12);
  }
  table(o, 10, 0, -32, 4.5, 2.6, 1.6, 0xc0a57a, 'picnic');
  for (const z of [-34, -30]) stool(o, 10, 0, z, 4.5, .8, .65, 0xc7af83);
  for (const [x, z] of [[-23, -27], [24, -27], [16, -36], [-22, -36]]) {
    world.addBox(x, 1.9, z, .7, 3.8, .7);
    cylinder(o, 0xb49b75, x, 1.9, z, .35, 3.8, .25, 10);
    for (let i = 0; i < 5; i++) ellipsoid(o, [0xa7bf83, 0xbbcc93, 0x93b07d][i % 3], x + Math.sin(i * 2.4) * 1.1, 4.6 + i % 2 * .7, z + Math.cos(i * 2.4) * 1.1, 1.75, 1.5, 1.75);
  }
  // Visible property boundary, including the narrow side paths around the house.
  for (const [axis, fixed, start, end] of [['x', BOUNDS.minZ, BOUNDS.minX, BOUNDS.maxX], ['x', BOUNDS.maxZ, BOUNDS.minX, BOUNDS.maxX], ['z', BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxZ], ['z', BOUNDS.maxX, BOUNDS.minZ, BOUNDS.maxZ]]) {
    s(o, 0xdbd0ad, axis === 'x' ? (start + end) / 2 : fixed, 1.35, axis === 'x' ? fixed : (start + end) / 2, axis === 'x' ? end - start : .16, 2.7, axis === 'x' ? .16 : end - start);
    for (let at = start; at < end; at += 1.4) d(o, 0xf0e5c5, axis === 'x' ? at : fixed, 1.4, axis === 'x' ? fixed : at, .15, 2.8, .15);
  }
}
