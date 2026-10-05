// Engine-independent, metre-based character physics. Render code never owns movement.
import { DEN, RAMPS, BOUNDS, HOUSE, FLOOR_HEIGHT } from './layout.js';
export { DEN, STAIRS } from './layout.js';
export const SURFACES = Object.freeze({
  bedding: { acceleration: 26, drag: 18, walk: 2.1, run: 7.8, longJump: true },
  carpet: { acceleration: 28, drag: 18, walk: 2.35, run: 8.5, longJump: true },
  wood: { acceleration: 9, drag: 4.5, walk: 2.3, run: 8.2, longJump: false },
  stairs: { acceleration: 24, drag: 18, walk: 2.2, run: 7, longJump: false },
  grass: { acceleration: 40, drag: 30, walk: 2.35, run: 8.8, longJump: true, grip: true },
  deck: { acceleration: 40, drag: 30, walk: 2.35, run: 8.8, longJump: true, grip: true },
});
export const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const approach = (value, target, delta) => value + clamp(target - value, -delta, delta);
export function box(x, y, z, w, h, d, surface = 'wood') {
  return { minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2, surface };
}
export function inside(x, z, b, margin = 0) { return x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin; }

export class World {
  constructor() { this.solids = []; this.ramps = RAMPS; this.cells = new Map(); this.queryCache = new Map(); this.order = new WeakMap(); }
  addBox(...args) {
    const b = box(...args); this.order.set(b, this.solids.length); this.solids.push(b);
    for (let x = Math.floor(b.minX / 4); x <= Math.floor(b.maxX / 4); x++) for (let z = Math.floor(b.minZ / 4); z <= Math.floor(b.maxZ / 4); z++) {
      const key = `${x},${z}`;
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(b);
    }
    this.queryCache.clear(); return b;
  }
  query(minX, minZ, maxX = minX, maxZ = minZ) {
    const x0 = Math.floor(minX / 4), x1 = Math.floor(maxX / 4), z0 = Math.floor(minZ / 4), z1 = Math.floor(maxZ / 4);
    if (x0 === x1 && z0 === z1) return this.cells.get(`${x0},${z0}`) || [];
    const key = `${x0},${z0},${x1},${z1}`;
    if (!this.queryCache.has(key)) {
      const found = new Set();
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (const b of this.cells.get(`${x},${z}`) || []) found.add(b);
      if (this.queryCache.size >= 128) this.queryCache.clear();
      this.queryCache.set(key, [...found].sort((a, b) => this.order.get(a) - this.order.get(b)));
    }
    return this.queryCache.get(key);
  }
  rampAt(x, z) { return this.ramps.find(r => x >= r.minX && x <= r.maxX && z >= Math.min(r.startZ, r.endZ) && z <= Math.max(r.startZ, r.endZ)); }
  rampHeight(x, z) {
    const r = this.rampAt(x, z);
    return r ? (r.startZ - z) / (r.startZ - r.endZ) * r.height : null;
  }
  support(x, z, maxHeight = Infinity) {
    const outdoors = x < HOUSE.minX || x > HOUSE.maxX || z < HOUSE.minZ || z > HOUSE.maxZ;
    let y = 0, surface = Math.hypot(x - DEN.x, z - DEN.z) < DEN.radius ? 'bedding' : outdoors ? 'grass' : 'wood';
    for (const b of this.query(x, z)) if (b.maxY <= maxHeight + .001 && b.maxY > y && inside(x, z, b)) { y = b.maxY; surface = b.surface; }
    // Outdoor benches, stone paths and deck furniture have the same firm grip.
    if (outdoors) surface = y >= FLOOR_HEIGHT - .3 ? 'deck' : 'grass';
    const ramp = this.rampHeight(x, z);
    if (ramp !== null && ramp <= maxHeight + .001 && ramp >= y) { y = ramp; surface = 'stairs'; }
    return { y, surface };
  }
}

export class RabbitController {
  constructor(world) { this.world = world; this.radius = .22; this.height = .68; this.reset(); }
  reset() {
    this.x = DEN.x; this.y = 0; this.z = DEN.z; this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = Math.PI; this.grounded = true; this.surface = 'bedding'; this.charge = 0;
    this.charging = false; this.jumpHeld = false; this.lastJump = null; this.lastLanding = false; this.longJumping = false;
  }
  releaseInput() { this.jumpHeld = false; this.charging = false; this.charge = 0; }
  update(dt, input = {}) {
    // Small substeps prevent tunnelling at low framerates, including the circular fence.
    const duration = clamp(dt, 0, .1), n = Math.max(1, Math.ceil(duration / (1 / 120)));
    this.lastJump = null; this.lastLanding = false;
    for (let i = 0; i < n; i++) this.step(duration / n, input);
  }
  step(dt, input) {
    const oldX = this.x, oldY = this.y, oldZ = this.z;
    const ground = this.world.support(this.x, this.z, this.y + .24);
    if (this.grounded && this.y - ground.y > .26) this.grounded = false;
    if (this.grounded) this.surface = ground.surface;
    const tuning = SURFACES[this.surface];
    let dx = input.x || 0, dz = input.z || 0;
    const length = Math.hypot(dx, dz);
    if (length > 1) { dx /= length; dz /= length; }
    const moving = length > .05;
    if (moving) {
      const angle = Math.atan2(dx, dz), diff = Math.atan2(Math.sin(angle - this.facing), Math.cos(angle - this.facing));
      this.facing += diff * Math.min(1, dt * 13);
    }
    if (input.jump && !this.jumpHeld && this.grounded) { this.charging = true; this.charge = 0; }
    if (this.charging && input.jump && this.grounded) this.charge = Math.min(.8, this.charge + dt);
    if (!input.jump && this.jumpHeld && this.charging) {
      if (this.grounded) {
        const long = this.charge >= .22 && tuning.longJump;
        const power = clamp(this.charge / .65, 0, 1);
        this.vy = long ? 6 + power * 2.25 : 4.2;
        this.longJumping = long;
        if (long && moving) { this.vx = dx * (3.8 + power * 2); this.vz = dz * (3.8 + power * 2); }
        this.grounded = false; this.lastJump = long ? 'long' : 'hop';
      }
      this.charging = false; this.charge = 0;
    }
    this.jumpHeld = !!input.jump;
    if (!this.grounded) this.charging = false;
    const speed = (input.run ? tuning.run : tuning.walk) * (this.charging ? .25 : 1);
    if (this.grounded) {
      if (moving) {
        this.vx = tuning.grip ? dx * speed : approach(this.vx, dx * speed, tuning.acceleration * dt);
        this.vz = tuning.grip ? dz * speed : approach(this.vz, dz * speed, tuning.acceleration * dt);
      } else {
        if (tuning.grip) this.vx = this.vz = 0;
        else { this.vx *= Math.exp(-tuning.drag * dt); this.vz *= Math.exp(-tuning.drag * dt); }
      }
    } else if (moving) {
      // Limited air steering preserves the long jump's forward momentum.
      if (this.longJumping) {
        // Recover forward momentum once above a fence brushed during takeoff.
        this.vx = approach(this.vx, dx * 6.4, 12 * dt); this.vz = approach(this.vz, dz * 6.4, 12 * dt);
      } else {
        // Recover after brushing a low ledge during takeoff. Without this, a
        // stopped rabbit cannot move her centre over a reachable window sill.
        this.vx = approach(this.vx, dx * Math.max(2.4, speed), 12 * dt);
        this.vz = approach(this.vz, dz * Math.max(2.4, speed), 12 * dt);
      }
      const airSpeed = Math.hypot(this.vx, this.vz);
      const airLimit = Math.max(6.4, input.run ? tuning.run : 0);
      if (airSpeed > airLimit) { this.vx *= airLimit / airSpeed; this.vz *= airLimit / airSpeed; }
    }
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.x = clamp(this.x, BOUNDS.minX + this.radius, BOUNDS.maxX - this.radius);
    this.z = clamp(this.z, BOUNDS.minZ + this.radius, BOUNDS.maxZ - this.radius);
    // The fence has a continuous collision ring, independently of its thin visual wires.
    if (this.y < DEN.fenceHeight && this.y + this.height > 0) {
      const wasInside = Math.hypot(oldX - DEN.x, oldZ - DEN.z) < DEN.radius;
      let fx = this.x - DEN.x, fz = this.z - DEN.z, dist = Math.hypot(fx, fz);
      const boundary = DEN.radius + (wasInside ? -this.radius - .02 : this.radius + .02);
      if ((wasInside && dist > boundary) || (!wasInside && dist < boundary)) {
        if (!dist) { fx = 1; fz = 0; dist = 1; }
        this.x = DEN.x + fx / dist * boundary; this.z = DEN.z + fz / dist * boundary;
        const dot = this.vx * fx / dist + this.vz * fz / dist;
        if ((wasInside && dot > 0) || (!wasInside && dot < 0)) { this.vx -= dot * fx / dist; this.vz -= dot * fz / dist; }
      }
    }
    // Resolve circle vs. AABB horizontally; jumping on furniture remains possible.
    for (let pass = 0; pass < 2; pass++) for (const b of this.world.query(this.x - this.radius, this.z - this.radius, this.x + this.radius, this.z + this.radius)) {
      if (this.y >= b.maxY - .01 || this.y + this.height <= b.minY + .01 || (this.grounded && b.maxY - this.y <= .24)) continue;
      const nx = clamp(this.x, b.minX, b.maxX), nz = clamp(this.z, b.minZ, b.maxZ);
      let ox = this.x - nx, oz = this.z - nz, distance = Math.hypot(ox, oz);
      if (distance >= this.radius) continue;
      if (distance < .00001) {
        const sides = [{ d: Math.abs(this.x - b.minX), x: -1, z: 0 }, { d: Math.abs(this.x - b.maxX), x: 1, z: 0 }, { d: Math.abs(this.z - b.minZ), x: 0, z: -1 }, { d: Math.abs(this.z - b.maxZ), x: 0, z: 1 }].sort((a, b) => a.d - b.d);
        ox = sides[0].x; oz = sides[0].z; distance = 1;
        this.x += ox * (sides[0].d + this.radius); this.z += oz * (sides[0].d + this.radius);
      } else { this.x += ox / distance * (this.radius - distance); this.z += oz / distance * (this.radius - distance); }
      const dot = this.vx * ox / distance + this.vz * oz / distance;
      if (dot < 0) { this.vx -= dot * ox / distance; this.vz -= dot * oz / distance; }
    }
    const ramp = this.world.rampHeight(this.x, this.z);
    if (ramp !== null && ramp > this.y + .25) { this.x = oldX; this.z = oldZ; this.vx = this.vz = 0; }
    this.vy -= 16 * dt;
    this.y += this.vy * dt;
    // Head collisions under the upper floor and tabletops.
    if (this.vy > 0) for (const b of this.world.query(this.x - this.radius, this.z - this.radius, this.x + this.radius, this.z + this.radius)) {
      if (inside(this.x, this.z, b, this.radius * .65) && oldY + this.height <= b.minY + .01 && this.y + this.height >= b.minY) {
        this.y = b.minY - this.height; this.vy = 0;
      }
    }
    const below = this.world.support(this.x, this.z, Math.max(oldY, this.y) + (this.grounded ? .25 : .01));
    if (this.vy <= 0 && this.y <= below.y + .001) {
      this.lastLanding ||= !this.grounded;
      this.y = below.y; this.vy = 0; this.grounded = true; this.surface = below.surface; this.longJumping = false;
    } else this.grounded = false;
    if (this.y < -4 || !Number.isFinite(this.x + this.y + this.z)) this.reset();
  }
}
