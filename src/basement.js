import { BASEMENT as B, BASEMENT_STAIRS as STAIRS, BASEMENT_STAIR_OPENING as OPENING, HOUSE } from './layout.js';
import { cylinder } from './model.js';

// Concrete structure and one stair flight. All other household furnishings stay
// upstairs; this open utility floor leaves long, readable chase routes.
export function createBasement({ basement, basementCeiling, ground, solid, detail, world, label }) {
  const groundSlabs = [];
  for (const [id, minX, maxX, minZ, maxZ] of [
    ['west', HOUSE.minX, OPENING.minX, HOUSE.minZ, HOUSE.maxZ],
    ['east', OPENING.maxX, HOUSE.maxX, HOUSE.minZ, HOUSE.maxZ],
    ['rear', OPENING.minX, OPENING.maxX, HOUSE.minZ, OPENING.minZ],
    ['front', OPENING.minX, OPENING.maxX, OPENING.maxZ, HOUSE.maxZ],
  ]) {
    const mesh = solid(basementCeiling, 0xb4b2aa, (minX + maxX) / 2, B.ceilingY / 2,
      (minZ + maxZ) / 2, maxX - minX, -B.ceilingY, maxZ - minZ, 'wood', `ground-floor:${id}`);
    groundSlabs.push(mesh.userData.collider);
  }

  solid(basement, 0x9b9e9b, 0, B.y - .12, 0, 48.24, .24, 40.24, 'concrete', 'basement-floor');
  const wallHeight = B.ceilingY - B.y, wallY = (B.y + B.ceilingY) / 2;
  for (const z of [B.minZ, B.maxZ]) {
    const mesh = solid(basement, 0xb4b8b1, 0, wallY, z, 48.24, wallHeight, .24, 'concrete', `basement-wall:${z < 0 ? 'rear' : 'front'}`);
    mesh.userData.collider.verticalBarrier = true;
  }
  for (const x of [B.minX, B.maxX]) {
    const mesh = solid(basement, 0xa7afad, x, wallY, 0, .24, wallHeight, 39.76, 'concrete', `basement-wall:${x < 0 ? 'west' : 'east'}`);
    mesh.userData.collider.verticalBarrier = true;
  }
  for (const x of [-12, 0, 12]) for (const z of [-6, 8]) {
    solid(basement, 0x8f9693, x, wallY, z, .52, wallHeight, .52, 'concrete', `basement-pillar:${x}:${z}`);
  }

  // The floor opening is guarded on three sides at ground level. The only
  // ground entrance is its upper end at z=-5; the low end opens into the cellar.
  for (const [side, x] of [['west', OPENING.minX - .08], ['east', OPENING.maxX + .08]]) {
    const mesh = solid(ground, 0xb7b4a5, x, .48, (OPENING.minZ + OPENING.maxZ) / 2,
      .16, .96, OPENING.maxZ - OPENING.minZ, 'concrete', `basement-opening-side:${side}`);
    mesh.userData.collider.verticalBarrier = true;
    // The stairwell's lower side is continuous from the cellar floor to the
    // ground lip. It meets the upper guard without overlapping coloured faces.
    const cheek = solid(basement, 0xa0a69e, x, (B.y + B.ceilingY) / 2, (OPENING.minZ + OPENING.maxZ) / 2,
      .16, B.ceilingY - B.y, OPENING.maxZ - OPENING.minZ, 'concrete', `basement-stair-side:${side}`);
    cheek.userData.collider.verticalBarrier = true;
  }
  const rearGuard = solid(ground, 0xacae9f, (OPENING.minX + OPENING.maxX) / 2, .48, OPENING.minZ - .08,
    OPENING.maxX - OPENING.minX, .96, .16, 'concrete', 'basement-opening-rear');
  rearGuard.userData.collider.verticalBarrier = true;

  const count = 30, width = STAIRS.maxX - STAIRS.minX, depth = (STAIRS.endZ - STAIRS.startZ) / count;
  for (let i = 0; i < count; i++) {
    // Midpoint treads stay within 7cm of the analytic ramp in either direction.
    const top = STAIRS.baseY + STAIRS.height * (i + .5) / count;
    const z = STAIRS.startZ + (i + .5) * depth;
    const tread = solid(basement, i % 2 ? 0xaaa99b : 0xb5b3a5, (STAIRS.minX + STAIRS.maxX) / 2,
      top - .07, z, width, .14, depth, 'stairs', `basement-tread:${i}`);
    tread.userData.collider.rampId = tread.userData.collider.analyticRamp = STAIRS.id;
  }

  const furnace = solid(basement, 0x7e8e89, 16, B.y + 1.1, -16, 1.8, 2.2, 1.2, 'concrete', 'basement-furnace');
  furnace.userData.utility = 'furnace';
  detail(basement, 0xb5bdb3, 16, B.y + 1.15, -15.388, 1.45, 1.7, .018);
  for (let i = 0; i < 7; i++) detail(basement, 0x697a76, 16, B.y + .5 + i * .12, -15.373, 1.1, .035, .012);
  solid(basement, 0x8d9793, 16, B.y + 2.72, -16, .38, 1.04, .38, 'concrete', 'basement-furnace-flue');

  // Twenty radial segments place vertices exactly on both AABB axes, so the
  // tank's visible bounds agree with its enclosing collider.
  const tank = cylinder(basement, 0xc1c9bd, 19.5, B.y + 1.05, -16, .65, 2.1, .65, 20);
  const tankBox = world.addBox(19.5, B.y + 1.05, -16, 1.3, 2.1, 1.3, 'concrete');
  tankBox.id = tank.name = 'basement-water-heater'; tank.userData.collider = tankBox;
  tank.userData.utility = 'water-heater'; world.fixtures.set(tankBox.id, tankBox);
  solid(basement, 0x8fa3a1, 19.25, B.y + 2.45, -16, .07, .7, .07, 'concrete', 'basement-hot-water-pipe');
  solid(basement, 0xa5b3a4, 19.75, B.y + 2.45, -16, .07, .7, .07, 'concrete', 'basement-cold-water-pipe');
  label(ground, 'BASEMENT', -22.4, .55, -4.78, 1.8, .35);

  return { groundSlabs, stairOpening: OPENING };
}
