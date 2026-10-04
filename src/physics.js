// Engine-independent, metre-based character physics. Render code never owns movement.
export const DEN = Object.freeze({ x: -4.5, z: 3.1, radius: 1.5, fenceHeight: 1.1 });
export const STAIRS = Object.freeze({ minX: 5.15, maxX: 7.45, startZ: 4.7, endZ: -2.7, height: 3.4 });
export const SURFACES = Object.freeze({
  bedding: { acceleration: 19, drag: 15, walk: 2.1, run: 4.3, longJump: true },
  carpet: { acceleration: 18, drag: 14, walk: 2.35, run: 4.8, longJump: true },
  wood: { acceleration: 3.2, drag: 1.9, walk: 2.1, run: 4.5, longJump: false },
  stairs: { acceleration: 13, drag: 12, walk: 2.2, run: 3.5, longJump: false },
});
export const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const approach = (value, target, delta) => value + clamp(target - value, -delta, delta);
export function box(x, y, z, w, h, d, surface = 'wood') {
  return { minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2, surface };
}
export function inside(x, z, b, margin = 0) { return x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin; }

export class World {
  constructor() { this.solids = []; }
  addBox(...args) { const b = box(...args); this.solids.push(b); return b; }
  rampHeight(x, z) {
    if (x < STAIRS.minX || x > STAIRS.maxX || z > STAIRS.startZ || z < STAIRS.endZ) return null;
    return (STAIRS.startZ - z) / (STAIRS.startZ - STAIRS.endZ) * STAIRS.height;
  }
  support(x, z, maxHeight = Infinity) {
    let y = 0, surface = Math.hypot(x - DEN.x, z - DEN.z) < DEN.radius ? 'bedding' : 'wood';
    for (const b of this.solids) if (b.maxY <= maxHeight + .001 && b.maxY > y && inside(x, z, b)) { y = b.maxY; surface = b.surface; }
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
    this.charging = false; this.jumpHeld = false; this.lastJump = null; this.lastLanding = false;
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
        this.vy = long ? 5.8 + power * 1.9 : 4.2;
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
        this.vx = approach(this.vx, dx * speed, tuning.acceleration * dt);
        this.vz = approach(this.vz, dz * speed, tuning.acceleration * dt);
      } else {
        this.vx *= Math.exp(-tuning.drag * dt); this.vz *= Math.exp(-tuning.drag * dt);
      }
    } else if (moving) {
      // Limited air steering preserves the long jump's forward momentum.
      this.vx += dx * 1.8 * dt; this.vz += dz * 1.8 * dt;
      const airSpeed = Math.hypot(this.vx, this.vz);
      if (airSpeed > 6.4) { this.vx *= 6.4 / airSpeed; this.vz *= 6.4 / airSpeed; }
    }
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.x = clamp(this.x, -7.7 + this.radius, 7.7 - this.radius);
    this.z = clamp(this.z, -6.7 + this.radius, 6.7 - this.radius);
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
    for (let pass = 0; pass < 2; pass++) for (const b of this.world.solids) {
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
    if (this.vy > 0) for (const b of this.world.solids) {
      if (inside(this.x, this.z, b, this.radius * .65) && oldY + this.height <= b.minY + .01 && this.y + this.height >= b.minY) {
        this.y = b.minY - this.height; this.vy = 0;
      }
    }
    const below = this.world.support(this.x, this.z, Math.max(oldY, this.y) + (this.grounded ? .25 : .01));
    if (this.vy <= 0 && this.y <= below.y + .001) {
      this.lastLanding ||= !this.grounded;
      this.y = below.y; this.vy = 0; this.grounded = true; this.surface = below.surface;
    } else this.grounded = false;
    if (this.y < -4 || !Number.isFinite(this.x + this.y + this.z)) this.reset();
  }
}
