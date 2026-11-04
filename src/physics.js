// Engine-independent, metre-based character physics. Render code never owns movement.
import { DEN, RAMPS, BOUNDS, HOUSE, FLOOR_HEIGHT } from './layout.js';
import { Energy, highJumpCost, HIGH_JUMP_THRESHOLD } from './energy.js';
export { DEN, STAIRS } from './layout.js';
export const SURFACES = Object.freeze({
  bedding: { acceleration: 26, drag: 18, walk: 3.64, run: 7.8, longJump: true },
  carpet: { acceleration: 28, drag: 18, walk: 3.9, run: 8.5, longJump: true },
  wood: { acceleration: 9, drag: 4.5, walk: 3.9, run: 8.2, longJump: false },
  stairs: { acceleration: 24, drag: 18, walk: 3.64, run: 7, longJump: false },
  grass: { acceleration: 40, drag: 30, walk: 3.9, run: 8.8, longJump: true, grip: true },
  deck: { acceleration: 40, drag: 30, walk: 3.9, run: 8.8, longJump: true, grip: true },
  concrete: { acceleration: 40, drag: 30, walk: 3.9, run: 8.8, longJump: true, grip: true },
});
export const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const approach = (value, target, delta) => value + clamp(target - value, -delta, delta);
export function box(x, y, z, w, h, d, surface = 'wood') {
  return { minX: x - w / 2, maxX: x + w / 2, minY: y - h / 2, maxY: y + h / 2, minZ: z - d / 2, maxZ: z + d / 2, surface };
}
export function inside(x, z, b, margin = 0) { return x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin; }

export class World {
  constructor() { this.solids = []; this.ramps = RAMPS; this.cells = new Map(); this.queryCache = new Map(); this.order = new WeakMap(); this.nextOrder = 0; this.dynamicBoxes = new Set(); this.dynamicCells = new Map(); this.dynamicQueryCache = new Map(); this.dynamicRevision = 0; }
  addDynamicBox(...args) {
    const b=this.addBox(...args); this.dynamicBoxes.add(b); this.dynamicRevision++;
    for(let x=Math.floor(b.minX/4);x<=Math.floor(b.maxX/4);x++) for(let z=Math.floor(b.minZ/4);z<=Math.floor(b.maxZ/4);z++) {
      const key=`${x},${z}`;
      if(!this.dynamicCells.has(key)) this.dynamicCells.set(key,[]);
      this.dynamicCells.get(key).push(b);
    }
    this.dynamicQueryCache.clear(); return b;
  }
  moveDynamicBox(b,dx,dy,dz) {
    if(!this.dynamicBoxes.has(b) || !Number.isFinite(dx+dy+dz) || !(dx || dy || dz)) return b;
    const old=[Math.floor(b.minX/4),Math.floor(b.maxX/4),Math.floor(b.minZ/4),Math.floor(b.maxZ/4)];
    b.minX+=dx; b.maxX+=dx; b.minY+=dy; b.maxY+=dy; b.minZ+=dz; b.maxZ+=dz;
    const next=[Math.floor(b.minX/4),Math.floor(b.maxX/4),Math.floor(b.minZ/4),Math.floor(b.maxZ/4)];
    if(old.some((value,index)=>value!==next[index])) {
      // Retain collider identity and insertion order: render/camera references
      // and contact snapshots can follow a prop without allocating a new box.
      for(const index of [this.cells,this.dynamicCells]) {
        for(let x=old[0];x<=old[1];x++) for(let z=old[2];z<=old[3];z++) {
          const key=`${x},${z}`,cell=index.get(key),at=cell?.indexOf(b) ?? -1;
          if(at>=0) cell.splice(at,1);
          if(!cell?.length) index.delete(key);
        }
        for(let x=next[0];x<=next[1];x++) for(let z=next[2];z<=next[3];z++) {
          const key=`${x},${z}`;
          if(!index.has(key)) index.set(key,[]);
          const cell=index.get(key),order=this.order.get(b);
          let at=cell.findIndex(other=>this.order.get(other)>order);
          if(at<0) at=cell.length;
          cell.splice(at,0,b);
        }
      }
      this.queryCache.clear(); this.dynamicQueryCache.clear();
    }
    this.dynamicRevision++; return b;
  }
  addBox(...args) {
    const b = box(...args); this.order.set(b, this.nextOrder++); this.solids.push(b);
    for (let x = Math.floor(b.minX / 4); x <= Math.floor(b.maxX / 4); x++) for (let z = Math.floor(b.minZ / 4); z <= Math.floor(b.maxZ / 4); z++) {
      const key = `${x},${z}`;
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(b);
    }
    this.queryCache.clear(); return b;
  }
  removeBox(b) {
    const index=this.solids.indexOf(b); if(index<0) return;
    this.solids.splice(index,1);
    const dynamic=this.dynamicBoxes.delete(b);
    if(dynamic) { this.dynamicRevision++; this.dynamicQueryCache.clear(); }
    for(let x=Math.floor(b.minX/4);x<=Math.floor(b.maxX/4);x++) for(let z=Math.floor(b.minZ/4);z<=Math.floor(b.maxZ/4);z++) {
      const key=`${x},${z}`, cell=this.cells.get(key);
      if(dynamic) {
        const dynamicCell=this.dynamicCells.get(key),at=dynamicCell?.indexOf(b) ?? -1;
        if(at>=0) dynamicCell.splice(at,1);
        if(!dynamicCell?.length) this.dynamicCells.delete(key);
      }
      if(!cell) continue;
      const at=cell.indexOf(b); if(at>=0) cell.splice(at,1);
      if(!cell.length) this.cells.delete(key);
    }
    this.queryCache.clear();
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
  // Consumables use the same 4m horizontal cells as scenery, but a separate
  // index keeps tiny ball contacts from scanning every collectible in the house.
  queryDynamic(minX,minZ,maxX=minX,maxZ=minZ) {
    const x0=Math.floor(minX/4),x1=Math.floor(maxX/4),z0=Math.floor(minZ/4),z1=Math.floor(maxZ/4);
    if(x0===x1 && z0===z1) return this.dynamicCells.get(`${x0},${z0}`) || [];
    const key=`${x0},${z0},${x1},${z1}`;
    if(!this.dynamicQueryCache.has(key)) {
      const found=new Set();
      for(let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) for(const b of this.dynamicCells.get(`${x},${z}`) || []) found.add(b);
      if(this.dynamicQueryCache.size>=128) this.dynamicQueryCache.clear();
      this.dynamicQueryCache.set(key,[...found].sort((a,b)=>this.order.get(a)-this.order.get(b)));
    }
    return this.dynamicQueryCache.get(key);
  }
  rampAt(x, z) { return this.ramps.find(r => x >= r.minX && x <= r.maxX && z >= Math.min(r.startZ, r.endZ) && z <= Math.max(r.startZ, r.endZ)); }
  rampHeight(x, z) {
    const r = this.rampAt(x, z);
    return r ? (r.baseY??0)+(r.startZ - z) / (r.startZ - r.endZ) * r.height : null;
  }
  baseFloorHeight(x,z) {
    const b=this.basement;
    return b&&x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ?b.y:0;
  }
  support(x, z, maxHeight = Infinity, ignorePushables = false, radius = 0) {
    const outdoors = x < HOUSE.minX || x > HOUSE.maxX || z < HOUSE.minZ || z > HOUSE.maxZ;
    let y=this.baseFloorHeight(x,z),surface=y<0?'concrete':Math.hypot(x-DEN.x,z-DEN.z)<DEN.radius?'bedding':outdoors?'grass':'wood';
    const footprint=Number.isFinite(radius)&&radius>0?radius:0;
    for (const b of this.query(x-footprint, z-footprint, x+footprint, z+footprint)) {
      if((ignorePushables&&b.pushable)||b.analyticRamp||b.maxY>maxHeight+.001||b.maxY<=y)continue;
      // A rabbit's feet can rest across a narrow seam even when her centre is
      // just outside a platform. Point-only support let opposing furniture
      // sides push her on/off an edge every substep. Require positive overlap,
      // so merely touching a vertical side cannot hold her in mid-air.
      let supported=inside(x,z,b);
      if(!supported&&footprint) {
        const dx=x-clamp(x,b.minX,b.maxX),dz=z-clamp(z,b.minZ,b.maxZ);
        supported=dx*dx+dz*dz<Math.max(0,footprint-.001)**2;
      }
      if(supported) {y=b.maxY;surface=b.surface;}
    }
    // Outdoor benches, stone paths and deck furniture have the same firm grip.
    if (outdoors) surface = y >= FLOOR_HEIGHT - .3 ? 'deck' : 'grass';
    else if(y===0&&Math.hypot(x-DEN.x,z-DEN.z)<DEN.radius)surface='bedding';
    const ramp = this.rampHeight(x, z);
    if (ramp !== null && ramp <= maxHeight + .001 && ramp >= y) { y = ramp; surface = 'stairs'; }
    return { y, surface };
  }
}

export class RabbitController {
  constructor(world) { this.world = world; this.radius = .22; this.height = .68; this.energy = new Energy(); this.sprintExhausted = false; this.reset(); }
  reset() {
    this.x = DEN.x; this.y = 0; this.z = DEN.z; this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = Math.PI; this.grounded = true; this.surface = 'bedding'; this.charge = 0;
    this.charging = false; this.jumpHeld = false; this.lastJump = null; this.lastJumpPosition=null;this.lastJumpFree = false; this.lastLanding = false; this.longJumping = false;
    this.sprinting = false; this.jumpEnergyBlocked = false; this.pushing=false;this.lastPushedId='';
  }
  // Every charged launch from the ground-floor den is free, including after
  // returning home. The height guard excludes basement/upper-floor positions.
  resetDay() { this.reset(); }
  get hasFreeDenJump() { return true; }
  isFreeDenJump() {
    return this.grounded && this.y>=-.05 && this.y<DEN.fenceHeight && Math.hypot(this.x-DEN.x,this.z-DEN.z)<DEN.radius;
  }
  jumpCost(charge = this.charge,input = {}) { return this.isFreeDenJump(input) ? 0 : highJumpCost(charge); }
  releaseInput() { this.jumpHeld = false; this.charging = false; this.charge = 0; }
  update(dt, input = {}) {
    if(input.captured) {
      // Being held is different from peeing: gravity must not carry Shidan
      // away from the catch point during the three-second return delay.
      this.releaseInput();this.vx=this.vy=this.vz=0;this.sprinting=false;
      this.lastJump=null;this.lastJumpPosition=null;this.lastJumpFree=false;this.lastLanding=false;this.jumpEnergyBlocked=false;
      this.energy.update(clamp(dt,0,.1));return;
    }
    if(input.locked) {
      this.releaseInput();this.vx=this.vz=0;this.sprinting=false;
      input={};
    }
    // Small substeps prevent tunnelling at low framerates, including the circular fence.
    const duration = clamp(dt, 0, .1), n = Math.max(1, Math.ceil(duration / (1 / 120)));
    this.lastJump = null; this.lastJumpPosition=null;this.lastJumpFree = false; this.lastLanding = false; this.jumpEnergyBlocked = false;
    for (let i = 0; i < n; i++) this.step(duration / n, input);
  }
  step(dt, input) {
    const oldX = this.x, oldY = this.y, oldZ = this.z;
    this.pushing=false;
    let ground = this.world.support(this.x, this.z, this.y + .24,true);
    if(this.grounded&&this.y-ground.y>.001) {
      const edge=this.world.support(this.x,this.z,this.y+.001,true,this.radius);
      if(edge.y>ground.y)ground=edge;
    }
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
        const wantsLong = this.charge + 1e-9 >= HIGH_JUMP_THRESHOLD && tuning.longJump;
        const free = wantsLong && this.isFreeDenJump(input);
        const long = wantsLong && (free || this.energy.spend(highJumpCost(this.charge)));
        if(free && long) this.lastJumpFree = true;
        this.jumpEnergyBlocked = wantsLong && !long;
        const power = clamp(this.charge / .65, 0, 1);
        this.vy = long ? 6 + power * 2.25 : 4.2;
        this.longJumping = long;
        if (long && moving) { this.vx = dx * (3.8 + power * 2); this.vz = dz * (3.8 + power * 2); }
        this.lastJumpPosition={x:this.x,y:this.y,z:this.z};
        this.grounded = false; this.lastJump = long ? 'long' : 'hop';
      }
      this.charging = false; this.charge = 0;
    }
    this.jumpHeld = !!input.jump;
    if (!this.grounded) this.charging = false;
    if (!input.run) this.sprintExhausted = false;
    else if (this.energy.value === 0) this.sprintExhausted = true;
    const sprint = !!input.run && moving && !this.charging && !this.sprintExhausted && this.energy.value > 0;
    let friction=0;
    if(this.grounded) for(const b of this.world.queryDynamic(this.x-this.radius-.08,this.z-this.radius-.08,this.x+this.radius+.08,this.z+this.radius+.08)) {
      if(!b.pushable||this.y>=b.maxY-.01||this.y+this.height<=b.minY+.01)continue;
      const x=clamp(this.x,b.minX,b.maxX),z=clamp(this.z,b.minZ,b.maxZ);
      if(Math.hypot(x-this.x,z-this.z)<this.radius+.06)friction=Math.max(friction,b.pushFriction||.1);
    }
    const speed = (sprint ? tuning.run : tuning.walk) * (this.charging ? .25 : 1)*(1-friction);
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
      const airLimit = Math.max(6.4, sprint ? tuning.run : 0);
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
      if(b.pushable) {
        if(this.y<b.maxY-.01 && this.y+this.height>b.minY+.01)b.onRabbitPush?.(this,dt);
        continue;
      }
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
    const rampBase=this.world.rampAt(this.x,this.z)?.baseY??0;
    if (ramp !== null && this.y+this.height>rampBase-.01 && ramp > this.y + .25) { this.x = oldX; this.z = oldZ; this.vx = this.vz = 0; }
    this.vy -= 16 * dt;
    this.y += this.vy * dt;
    // Head collisions under the upper floor and tabletops.
    if (this.vy > 0) for (const b of this.world.query(this.x - this.radius, this.z - this.radius, this.x + this.radius, this.z + this.radius)) {
      if(b.pushable)continue;
      if (inside(this.x, this.z, b, this.radius * .65) && oldY + this.height <= b.minY + .01 && this.y + this.height >= b.minY) {
        this.y = b.minY - this.height; this.vy = 0;
      }
    }
    let below = this.world.support(this.x, this.z, Math.max(oldY, this.y) + (this.grounded ? .25 : .01),true);
    if(this.grounded&&oldY-below.y>.001) {
      // Retain an existing ledge only while the feet still overlap it. Higher
      // neighbours and airborne landings keep their ordinary centre test.
      const edge=this.world.support(this.x,this.z,oldY+.001,true,this.radius);
      if(edge.y>below.y)below=edge;
    }
    const followsRamp=this.grounded&&below.surface==='stairs'&&below.y<=oldY&&oldY-below.y<=.25;
    if (this.vy <= 0 && (this.y <= below.y + .001||followsRamp)) {
      this.lastLanding ||= !this.grounded;
      this.y = below.y; this.vy = 0; this.grounded = true; this.surface = below.surface; this.longJumping = false;
    } else this.grounded = false;
    // Only moving with Shift spends sprint energy; a blocked/idle rabbit is free.
    this.sprinting = sprint && Math.hypot(this.x - oldX, this.z - oldZ) > dt * .05;
    this.energy.update(dt, this.sprinting);
    if (this.sprinting && this.energy.value === 0) this.sprintExhausted = true;
    if (this.y < (this.world.basement?.y??0)-4 || !Number.isFinite(this.x + this.y + this.z)) this.reset();
  }
}
