// All dimensions are authored directly in metres. Shidan's model is unscaled.
export const FLOOR_HEIGHT = 4.2;
export const DEN = Object.freeze({ x: -16, z: 12, radius: 4, fenceHeight: 1.1 });
export const BOUNDS = Object.freeze({ minX: -26, maxX: 26, minZ: -38, maxZ: 32 });
export const HOUSE = Object.freeze({ minX: -24, maxX: 24, minZ: -20, maxZ: 20 });
export const STAIRS = Object.freeze({ id: 'hall-stairs', minX: 1, maxX: 4, startZ: 15, endZ: 2, height: FLOOR_HEIGHT });
export const GARDEN_STAIRS = Object.freeze({ id: 'garden-stairs', minX: 19, maxX: 22, startZ: -35, endZ: -25, height: FLOOR_HEIGHT });
export const RAMPS = Object.freeze([STAIRS, GARDEN_STAIRS]);

const room = (id, name, floor, minX, maxX, minZ, maxZ, color) => ({ id, name, floor, minX, maxX, minZ, maxZ, color });
export const ROOMS = Object.freeze([
  room('living', 'The sunny lounge', 0, -24, -5, 2, 20, '#e4d3b4'),
  room('foyer', 'The entrance hall', 0, -5, 5, 2, 20, '#eee0c3'),
  room('kitchen', 'Kitchen & dining', 0, 5, 24, 2, 20, '#d8dfbe'),
  room('hall', 'The long hallway', 0, -24, 24, -3, 2, '#eadabd'),
  room('library', 'The secret library', 0, -24, -5, -20, -3, '#d7ccbb'),
  room('garden-room', 'The garden room', 0, -5, 8, -20, -3, '#cee0cc'),
  room('utility', 'The craft & laundry room', 0, 8, 24, -20, -3, '#e5ced0'),
  room('bedroom', 'The cloud bedroom', 1, -24, -5, -20, -3, '#e7c9bd'),
  room('reading', 'The reading room', 1, -5, 8, -20, -3, '#d4ddbb'),
  room('study', 'The attic studio', 1, 8, 24, -20, -3, '#cbdde0'),
  room('gallery', 'The upstairs gallery', 1, -24, 24, -3, 2, '#dce1c5'),
  room('balcony', 'The garden balcony', 1, -20, 24, -25, -20, '#dccba8'),
  room('yard', 'The clover backyard', 0, -26, 26, -38, -20, '#bed3a3'),
  room('front-yard', 'The sunny front yard', 0, -26, 26, 20, 32, '#c4d5a5'),
]);
export const LANDMARKS = Object.freeze([
  { id: 'sofa', name: 'Climb the sofa', x: -17, y: .84, z: 5.8, radius: 1.7, hint: 'Use the book stack and footstool in the lounge.' },
  { id: 'secret', name: 'Behind the bookcases', x: -22.5, y: 0, z: -12, radius: 1.3, hint: 'Look for the little arches at either end of the library shelves.' },
  { id: 'upstairs', name: 'Reach the upstairs', x: 2.5, y: FLOOR_HEIGHT, z: -.5, radius: 2, hint: 'The broad staircase starts in the entrance hall.' },
  { id: 'bed', name: 'Hop onto the quilt', x: -15, y: FLOOR_HEIGHT + 1, z: -14, radius: 2, hint: 'Climb the bedroom pouf, trunk, and mattress.' },
  { id: 'balcony', name: 'Find the balcony', x: 1, y: FLOOR_HEIGHT, z: -22.5, radius: 2.2, hint: 'Go through the reading room and out the rear doors.' },
  { id: 'yard', name: 'Explore the backyard', x: 2, y: 0, z: -29, radius: 3, hint: 'Use a garden door, an open window, or the balcony stairs.' },
  { id: 'burrow', name: 'The hedge hideaway', x: -16, y: 0, z: -33, radius: 1.5, hint: 'Follow the stepping stones to the hedge arches.' },
]);

const door = (at, width = 3) => ({ at, width, bottom: 0, top: 2.9, kind: 'door' });
const window = (at, width = 2.4) => ({ at, width, bottom: .42, top: 2.65, kind: 'window' });
const glazed = (at, width = 2.8) => ({ at, width, bottom: .85, top: 3.15, kind: 'glazed-window' });
const tunnel = at => ({ at, width: 1.8, bottom: 0, top: 1.6, kind: 'tunnel' });
// One source for real wall openings, collision and the floor plan. Portal sizes
// also describe constraints for the future pursuer; no enemy AI is enabled yet.
export const WALLS = [];
const wall = (id, axis, fixed, start, end, floor, openings = [], color = 0xf2e7cc) => WALLS.push({ id, axis, fixed, start, end, floor, openings, color });
for (const floor of [0, 1]) {
  wall(`rear-${floor}`, 'x', -20, -24, 24, floor, [glazed(-21, 2.6), window(-15, 3), glazed(-8, 2.6), door(0, 3.5), glazed(6, 2.6), glazed(11, 2.6), door(16, 3.5), glazed(21, 2.6)]);
  const sideWindows = (floor ? [-17, -11, -6] : [-17, -11, -6, 6, 12, 17]).map(at => glazed(at));
  wall(`west-${floor}`, 'z', -24, -20, floor ? 2 : 20, floor, sideWindows, 0xe5dabe);
  wall(`east-${floor}`, 'z', 24, -20, floor ? 2 : 20, floor, sideWindows, 0xe8d8c7);
  wall(`rear-hall-${floor}`, 'x', -3, -24, 24, floor, [door(-14, 3.5), door(1, 3.5), door(17, 3.5)]);
  wall(`west-rooms-${floor}`, 'z', -5, -20, -3, floor, [door(-17), window(-12), door(-6)], floor ? 0xe8cfc5 : 0xe2d5bd);
  wall(`east-rooms-${floor}`, 'z', 8, -20, -3, floor, [door(-17), window(-12), door(-6)], floor ? 0xcddfe0 : 0xd3dfc6);
}
wall('front', 'x', 20, -24, 24, 0, [glazed(-19, 4), glazed(-11, 4), door(0, 4), glazed(10, 4), glazed(18, 4)], 0xe9dac0);
wall('lounge-hall', 'z', -5, 2, 20, 0, [door(6), window(11), door(17)], 0xeee2c9);
wall('kitchen-hall', 'z', 5, 2, 20, 0, [door(7), window(11), door(17)], 0xdce3c8);
wall('front-hall', 'x', 2, -24, 24, 0, [door(-14, 3.5), door(0, 8.5), door(17, 3.5)]);
wall('shelf-passage', 'z', -21, -19.5, -3.5, 0, [tunnel(-17), tunnel(-6)], 0xbda485);
wall('linen-passage', 'z', 21, -19.5, -3.5, 1, [tunnel(-17), tunnel(-6)], 0xb2c2bd);

export const PORTALS = Object.freeze(WALLS.flatMap(w => w.openings.map((o, i) => ({
  id: `${w.id}-${i}`, kind: o.kind, floor: w.floor, width: o.width, clearance: o.top - o.bottom,
  x: w.axis === 'x' ? o.at : w.fixed, z: w.axis === 'x' ? w.fixed : o.at,
  y: w.floor * FLOOR_HEIGHT + o.bottom,
})).filter(p => p.kind !== 'glazed-window')));
export function roomAt(x, y, z) {
  const floor = y >= FLOOR_HEIGHT - .25 ? 1 : 0;
  return ROOMS.find(r => r.floor === floor && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
}
