import { clamp } from './physics.js';
import { DEN, STAIRS, BOUNDS } from './layout.js';

export const MAX_POOP_BALLS = 10_000;
export const POOP_RADIUS = .065;

class SphereGrid {
  constructor() { this.size = POOP_RADIUS * 4; this.cells = new Map(); }
  key(x, y, z) { return `${Math.floor(x / this.size)},${Math.floor(y / this.size)},${Math.floor(z / this.size)}`; }
  remove(ball) {
    const cell = this.cells.get(ball.cell);
    cell?.delete(ball); if (cell?.size === 0) this.cells.delete(ball.cell);
  }
  update(ball) {
    const key = this.key(ball.x, ball.y, ball.z);
    if (key === ball.cell) return;
    this.remove(ball); ball.cell = key;
    if (!this.cells.has(key)) this.cells.set(key, new Set());
    this.cells.get(key).add(ball);
  }
  *near(x, y, z, radius) {
    const s = this.size;
    for (let ix = Math.floor((x - radius) / s); ix <= Math.floor((x + radius) / s); ix++)
      for (let iy = Math.floor((y - radius) / s); iy <= Math.floor((y + radius) / s); iy++)
        for (let iz = Math.floor((z - radius) / s); iz <= Math.floor((z + radius) / s); iz++) {
          const cell = this.cells.get(`${ix},${iy},${iz}`);
          if (cell) yield* cell;
        }
  }
}

// Fixed-capacity pool: the oldest slot is reused only when adding ball 10,001.
// Sleeping balls keep both their collider and rendered instance indefinitely.
export class PoopPhysics {
  constructor(world, capacity = MAX_POOP_BALLS) {
    this.world = world; this.capacity = capacity; this.balls = []; this.cursor = 0; this.sequence = 0;
    this.active = new Set(); this.grid = new SphereGrid(); this.dirty = new Set();
    this.staticGrid = new Map(); this.staticCellSize = 1.5;
    for (const box of world.solids) {
      const s = this.staticCellSize;
      for (let x = Math.floor(box.minX / s); x <= Math.floor(box.maxX / s); x++)
        for (let y = Math.floor(box.minY / s); y <= Math.floor(box.maxY / s); y++)
          for (let z = Math.floor(box.minZ / s); z <= Math.floor(box.maxZ / s); z++) {
            const key = `${x},${y},${z}`;
            if (!this.staticGrid.has(key)) this.staticGrid.set(key, []);
            this.staticGrid.get(key).push(box);
          }
    }
  }
  get count() { return this.balls.length; }
  spawn({ x, y, z, vx = 0, vy = 0, vz = 0 }) {
    const slot = this.count < this.capacity ? this.count : this.cursor;
    const old = this.balls[slot];
    if (old) {
      // Removing a supporting ball wakes nearby sleepers so piles can settle.
      for (const neighbor of this.grid.near(old.x, old.y, old.z, POOP_RADIUS * 3)) this.wake(neighbor);
      this.grid.remove(old); this.active.delete(old);
    }
    const ball = { id: ++this.sequence, slot, x, y, z, vx, vy, vz, radius: POOP_RADIUS, sleeping: false, quiet: 0, contact: false, cell: null };
    this.balls[slot] = ball; this.cursor = (slot + 1) % this.capacity;
    this.resolveEnvironment(ball, { x, y, z }, 0);
    this.grid.update(ball); this.active.add(ball); this.dirty.add(slot);
    return ball;
  }
  dropBehind(rabbit) {
    const backX = -Math.sin(rabbit.facing), backZ = -Math.cos(rabbit.facing);
    // Sweep the spawn point out from the rabbit so a butt beside a fence or wall
    // cannot create a ball on the far side of that obstacle.
    const point = { x: rabbit.x, y: rabbit.y + .28, z: rabbit.z, radius: POOP_RADIUS, vx: 0, vy: 0, vz: 0 };
    for (let i = 0; i < 30; i++) {
      const previous = { x: point.x, y: point.y, z: point.z };
      point.x += backX * .024; point.z += backZ * .024;
      this.resolveEnvironment(point, previous, 0);
      if ((point.x - previous.x) * backX + (point.z - previous.z) * backZ < .023) break;
    }
    return this.spawn({ x: point.x, y: point.y, z: point.z,
      vx: rabbit.vx * .35 + backX * .65, vy: .5, vz: rabbit.vz * .35 + backZ * .65 });
  }
  wake(ball) { if (ball.sleeping) { ball.sleeping = false; ball.quiet = 0; this.active.add(ball); } }
  bounce(ball, nx, ny, nz, penetration, dt) {
    ball.x += nx * penetration; ball.y += ny * penetration; ball.z += nz * penetration;
    const speed = ball.vx * nx + ball.vy * ny + ball.vz * nz;
    if (speed < 0) {
      const impulse = -speed * (speed < -.7 ? 1.23 : 1);
      ball.vx += nx * impulse; ball.vy += ny * impulse; ball.vz += nz * impulse;
    }
    if (ny > .45) {
      ball.contact = true;
      const soft = ball.y > STAIRS.height - .2 || Math.hypot(ball.x - DEN.x, ball.z - DEN.z) < DEN.radius;
      const friction = Math.exp(-(soft ? 8 : 2.8) * dt);
      ball.vx *= friction; ball.vz *= friction;
    }
  }
  resolveBox(ball, b, dt) {
    let dx = ball.x - clamp(ball.x, b.minX, b.maxX), dy = ball.y - clamp(ball.y, b.minY, b.maxY), dz = ball.z - clamp(ball.z, b.minZ, b.maxZ);
    const length = Math.hypot(dx, dy, dz);
    if (length >= ball.radius) return;
    if (length > .000001) this.bounce(ball, dx / length, dy / length, dz / length, ball.radius - length, dt);
    else {
      const faces = [[ball.x - b.minX, -1, 0, 0], [b.maxX - ball.x, 1, 0, 0], [ball.y - b.minY, 0, -1, 0], [b.maxY - ball.y, 0, 1, 0], [ball.z - b.minZ, 0, 0, -1], [b.maxZ - ball.z, 0, 0, 1]];
      let closest = faces[0]; for (const face of faces) if (face[0] < closest[0]) closest = face;
      this.bounce(ball, closest[1], closest[2], closest[3], closest[0] + ball.radius, dt);
    }
  }
  resolveEnvironment(ball, previous, dt) {
    const r = ball.radius;
    if (ball.y < r) this.bounce(ball, 0, 1, 0, r - ball.y, dt);
    if (ball.x < BOUNDS.minX + r) this.bounce(ball, 1, 0, 0, BOUNDS.minX + r - ball.x, dt);
    if (ball.x > BOUNDS.maxX - r) this.bounce(ball, -1, 0, 0, ball.x - BOUNDS.maxX + r, dt);
    if (ball.z < BOUNDS.minZ + r) this.bounce(ball, 0, 0, 1, BOUNDS.minZ + r - ball.z, dt);
    if (ball.z > BOUNDS.maxZ - r) this.bounce(ball, 0, 0, -1, ball.z - BOUNDS.maxZ + r, dt);
    const seen = new Set(), s = this.staticCellSize;
    for (let x = Math.floor((ball.x - r) / s); x <= Math.floor((ball.x + r) / s); x++)
      for (let y = Math.floor((ball.y - r) / s); y <= Math.floor((ball.y + r) / s); y++)
        for (let z = Math.floor((ball.z - r) / s); z <= Math.floor((ball.z + r) / s); z++) {
          const boxes = this.staticGrid.get(`${x},${y},${z}`);
          if (boxes) for (const box of boxes) if (!seen.has(box)) { seen.add(box); this.resolveBox(ball, box, dt); }
        }
    const ramp = this.world.rampHeight(ball.x, ball.z);
    if (ramp !== null) {
      const slope = STAIRS.height / (STAIRS.startZ - STAIRS.endZ), normalLength = Math.hypot(1, slope);
      const depth = r - (ball.y - ramp) / normalLength;
      if (depth > 0) this.bounce(ball, 0, 1 / normalLength, slope / normalLength, depth, dt);
    }
    const dx = ball.x - DEN.x, dz = ball.z - DEN.z, distance = Math.hypot(dx, dz);
    if (ball.y - r < DEN.fenceHeight && Math.abs(distance - DEN.radius) < r + .02) {
      if (previous.y - r >= DEN.fenceHeight && ball.vy < 0) this.bounce(ball, 0, 1, 0, DEN.fenceHeight + r - ball.y, dt);
      else if (distance > .000001) {
        const side = Math.hypot(previous.x - DEN.x, previous.z - DEN.z) < DEN.radius ? -1 : 1;
        this.bounce(ball, side * dx / distance, 0, side * dz / distance, r + .02 - side * (distance - DEN.radius), dt);
      }
    }
  }
  collidePair(a, b, dt) {
    if (a === b) return;
    let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, length = Math.hypot(dx, dy, dz);
    const total = a.radius + b.radius;
    if (length >= total) return;
    if (length < .000001) {
      const angle = (a.id + b.id) * 2.399963; dx = Math.cos(angle); dy = .25; dz = Math.sin(angle); length = Math.hypot(dx, dy, dz);
      // Deterministic separation when clicks spawn balls at exactly the same point.
      this.wake(b);
      a.x += dx / length * total * .5; a.y += dy / length * total * .5; a.z += dz / length * total * .5;
      b.x -= dx / length * total * .5; b.y -= dy / length * total * .5; b.z -= dz / length * total * .5;
    } else {
      const nx = dx / length, ny = dy / length, nz = dz / length, depth = total - length;
      const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny + (a.vz - b.vz) * nz;
      if (depth > .012 || relative < -.3) this.wake(b);
      const inverseMassB = b.sleeping ? 0 : 1, share = 1 / (1 + inverseMassB);
      a.x += nx * depth * share; a.y += ny * depth * share; a.z += nz * depth * share;
      b.x -= nx * depth * share * inverseMassB; b.y -= ny * depth * share * inverseMassB; b.z -= nz * depth * share * inverseMassB;
      if (relative < 0) {
        const impulse = -relative * (relative < -.7 ? 1.18 : 1) * share;
        a.vx += nx * impulse; a.vy += ny * impulse; a.vz += nz * impulse;
        b.vx -= nx * impulse * inverseMassB; b.vy -= ny * impulse * inverseMassB; b.vz -= nz * impulse * inverseMassB;
      }
      if (ny > .45) { a.contact = true; a.vx *= Math.exp(-4 * dt); a.vz *= Math.exp(-4 * dt); }
      if (ny < -.45) b.contact = true;
    }
    this.grid.update(b); this.dirty.add(b.slot);
  }
  collideRabbit(rabbit) {
    if (!rabbit) return;
    // Rabbit is much heavier: sphere-vs-capsule contact transfers her movement to
    // the ball instead of letting her pass through it. Sleepers wake when nudged.
    const centerY = rabbit.y + rabbit.height / 2;
    const neighbors = [...this.grid.near(rabbit.x, centerY, rabbit.z, rabbit.height / 2 + POOP_RADIUS + .1)];
    for (const ball of neighbors) {
      const y = clamp(ball.y, rabbit.y + rabbit.radius, rabbit.y + rabbit.height - rabbit.radius);
      let dx = ball.x - rabbit.x, dy = ball.y - y, dz = ball.z - rabbit.z;
      let distance = Math.hypot(dx, dy, dz), total = ball.radius + rabbit.radius;
      if (distance >= total) continue;
      if (distance < .000001) { distance = .000001; dx = Math.sin(rabbit.facing) * distance; dy = 0; dz = Math.cos(rabbit.facing) * distance; }
      const nx = dx / distance, ny = dy / distance, nz = dz / distance;
      const previous = { x: ball.x, y: ball.y, z: ball.z };
      // Floor contact under the rabbit is redirected sideways so a small pellet
      // cannot be driven underneath the floor by the rabbit's heavier collider.
      const horizontal = Math.hypot(dx, dz);
      if (ny < -.3 && ball.y - ball.radius <= rabbit.y + .04 && horizontal > .00001) {
        ball.x = rabbit.x + dx / horizontal * total; ball.z = rabbit.z + dz / horizontal * total;
      } else {
        ball.x += nx * (total - Math.min(distance, total)); ball.y += ny * (total - Math.min(distance, total)); ball.z += nz * (total - Math.min(distance, total));
      }
      this.wake(ball);
      const push = Math.max(.2, (rabbit.vx - ball.vx) * nx + (rabbit.vy - ball.vy) * ny + (rabbit.vz - ball.vz) * nz);
      ball.vx += nx * push; ball.vy += Math.max(0, ny * push); ball.vz += nz * push;
      this.resolveEnvironment(ball, previous, 0); this.grid.update(ball); this.dirty.add(ball.slot);
    }
  }
  update(dt, rabbit) {
    this.collideRabbit(rabbit);
    const duration = clamp(dt, 0, .1), steps = Math.max(1, Math.ceil(duration * 180)), step = duration / steps;
    for (let i = 0; i < steps; i++) {
      const moving = [...this.active];
      for (const ball of moving) {
        ball.contact = false;
        const previous = { x: ball.x, y: ball.y, z: ball.z };
        ball.vy = Math.max(-20, ball.vy - 16 * step);
        ball.x += ball.vx * step; ball.y += ball.vy * step; ball.z += ball.vz * step;
        this.resolveEnvironment(ball, previous, step); this.grid.update(ball);
      }
      for (let iteration = 0; iteration < 2; iteration++) for (const ball of moving) {
        const previous = { x: ball.x, y: ball.y, z: ball.z };
        // Spatial neighborhood queries avoid testing every pair in the 10k pool.
        for (const neighbor of [...this.grid.near(ball.x, ball.y, ball.z, ball.radius * 2)]) {
          if (neighbor.sleeping || neighbor.id > ball.id) this.collidePair(ball, neighbor, step);
        }
        this.resolveEnvironment(ball, previous, step); this.grid.update(ball); this.dirty.add(ball.slot);
      }
      for (const ball of moving) {
        if (ball.contact && Math.hypot(ball.vx, ball.vy, ball.vz) < .07) ball.quiet += step;
        else ball.quiet = 0;
        if (ball.quiet > .65) { ball.sleeping = true; ball.vx = ball.vy = ball.vz = 0; this.active.delete(ball); }
      }
    }
  }
}
