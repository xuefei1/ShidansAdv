import { CONSUMABLE_SLOTS, DEN_HAY, consumableDetails, consumptionSeconds, randomConsumableType } from './consumable-data.js';
import { consumableCollider } from './consumable-collision.js';
import { ConsumableMotion } from './consumable-motion.js';
import { DEN } from './layout.js';
import { WIRE_SLOTS, RANDOM_CHEWABLE_LIMITS, createChewablePlaces } from './chewable-data.js';

export const CONSUME_REACH = 1.15;
export const RESTOCK_SECONDS = 60;

function segmentHitsBox(a, b, box) {
  let enter = 0, exit = 1;
  for (const [axis, low, high] of [['x','minX','maxX'],['y','minY','maxY'],['z','minZ','maxZ']]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) { if (a[axis] <= box[low] || a[axis] >= box[high]) return false; }
    else {
      const t1 = (box[low] - a[axis]) / delta, t2 = (box[high] - a[axis]) / delta;
      enter = Math.max(enter, Math.min(t1, t2)); exit = Math.min(exit, Math.max(t1, t2));
      if (exit <= enter) return false;
    }
  }
  return enter < 1 - .001 && exit > .001;
}

export function canReachConsumable(player, item, world) {
  const top=item.collider?.maxY ?? item.y;
  if (!player.grounded || player.y<item.y-.45 || player.y>Math.max(item.y+.45,top+.1) || Math.hypot(player.x - item.x, player.z - item.z) > CONSUME_REACH) return false;
  const a = { x: player.x, y: player.y + .32, z: player.z }, b = { x: item.x, y: item.y + .2, z: item.z };
  const insideDen = p => Math.hypot(p.x - DEN.x, p.z - DEN.z) < DEN.radius;
  if (item.permanent && !insideDen(player)) return false;
  if (Math.min(a.y, b.y) < DEN.fenceHeight && insideDen(a) !== insideDen(b)) return false;
  return !world.query(Math.min(a.x,b.x), Math.min(a.z,b.z), Math.max(a.x,b.x), Math.max(a.z,b.z)).some(box => box.consumableId!==item.id && segmentHitsBox(a,b,box));
}

export class ConsumableSystem {
  constructor(world, { slots = CONSUMABLE_SLOTS, random = Math.random, wires = WIRE_SLOTS, randomLimits = RANDOM_CHEWABLE_LIMITS, randomPlaces = null } = {}) {
    this.world = world; this.random = random;
    this.motion=new ConsumableMotion(world);
    // Both the initial population and restocking use this pool. Leave enough
    // clearance that an item's geometry cannot overlap the den fence either.
    this.slots = slots.filter(slot => Math.hypot(slot.x - DEN.x, slot.z - DEN.z) >= DEN.radius + .4)
      .filter((slot,index,available) => slot.type !== 'cake' || available.findIndex(s=>s.type==='cake')===index);
    this.denHay = {...DEN_HAY};
    this.wires = wires; this.randomLimits = randomLimits;
    this.randomPlaces = randomPlaces || createChewablePlaces(world);
    this.reset();
  }
  reset() {
    this.motion.clear();
    for(const item of [this.denHay,...(this.items?.values() || []),...(this.chewables?.values() || [])]) if(item.collider) this.world.removeBox(item.collider);
    this.denHay={...DEN_HAY};
    this.items = new Map(this.slots.map(slot => [slot.id, { ...slot }]));
    this.chewables = new Map(this.wires.map(slot => [slot.id, {...slot}]));
    this.pending = new Map(); this.elapsed = 0; this.restockTime = 0; this.cancel();
    for(const item of this.availableItems()) this.addCollider(item);
    for(const [type,limit] of Object.entries(this.randomLimits)) for(let i=0;i<limit;i++) {
      const item=this.randomItem(`${type}-${i}`,type);
      if(item) this.addChewable(item);
    }
  }
  get count() { return this.items.size; }
  addCollider(item) {
    item.spawnPosition ||= {x:item.x,y:item.y,z:item.z};
    item.collider=this.world.addDynamicBox(...consumableCollider(item));
    item.collider.consumableId=item.id;
    this.motion.add(item);
  }
  get restockCount() { return [...this.items.values()].filter(item=>!consumableDetails(item).respawn).length; }
  addChewable(item) {
    this.addCollider(item);
    this.chewables.set(item.id,item);
  }
  get chewableCount() { return this.chewables.size; }
  get fraction() { return this.target ? Math.min(1,this.progress/consumptionSeconds(this.target)) : 0; }
  *availableItems() { yield this.denHay; yield* this.items.values(); yield* this.chewables.values(); }
  randomItem(id,type,player=null) {
    // Reserve fixed locations even when empty, so returning food/cables cannot
    // appear inside a random box while their own cooldown is running.
    const occupied=[...this.availableItems(),...this.slots,...this.wires];
    if(player) occupied.push(player);
    const free=this.randomPlaces.filter(p=>occupied.every(item=>Math.abs(item.y-p.y)>.5 || Math.hypot(item.x-p.x,item.z-p.z)>1.3));
    if(!free.length) return null;
    const place=free[Math.min(free.length-1,Math.floor(this.random()*free.length))];
    return {id,type,...place};
  }
  nearest(player) {
    let found = null, distance = Infinity;
    for (const item of this.availableItems()) {
      const d = Math.hypot(player.x - item.x, player.z - item.z);
      if (d < distance && canReachConsumable(player, item, this.world)) { found = item; distance = d; }
    }
    return found;
  }
  begin(player, frameOffset = 0) { this.cancel(); this.target = this.nearest(player); this.holdDelay = Math.max(0, frameOffset); }
  cancel() { this.target = null; this.progress = 0; this.holdDelay = 0; }
  update(dt, player, timerDt = dt) {
    const events = [];
    if (!(dt >= 0) || !Number.isFinite(dt) || !(timerDt >= 0) || !Number.isFinite(timerDt)) return events;
    this.elapsed += timerDt;
    for(const [id,pending] of this.pending) if(this.elapsed+1e-9>=pending.at) {
      const fixed=['wire','cake'].includes(pending.item.type);
      const item=fixed ? {...pending.item,...pending.item.spawnPosition} : this.randomItem(id,pending.item.type,player);
      if(!item) continue;
      this.pending.delete(id);
      if(item.type==='cake') { this.addCollider(item); this.items.set(id,item); } else this.addChewable(item);
      events.push({kind:'spawn',item});
    }
    // Count only time actually spent below the threshold. Pauses do not call update.
    if (this.restockCount < 2) {
      this.restockTime += timerDt;
      while (this.restockTime + 1e-9 >= RESTOCK_SECONDS && this.restockCount < 2) {
        const type = randomConsumableType(this.random);
        const free = this.slots.filter(slot => slot.type!=='cake' && !this.items.has(slot.id) && [...this.chewables.values()].every(item=>Math.abs(item.y-slot.y)>.5 || Math.hypot(item.x-slot.x,item.z-slot.z)>1.3));
        const preferred = free.filter(slot => slot.type === type);
        const vacant = preferred.length ? preferred : free.filter(slot => ['bread','noodles','banana','apple','rabbitFood'].includes(slot.type));
        if (!vacant.length) { this.restockTime = 0; break; }
        const slot = vacant[Math.min(vacant.length - 1, Math.floor(this.random() * vacant.length))];
        const item = { ...slot, type };
        this.addCollider(item); this.items.set(item.id, item); this.restockTime -= RESTOCK_SECONDS;
        events.push({ kind: 'spawn', item });
      }
      if (this.restockCount >= 2) this.restockTime = 0;
    } else this.restockTime = 0;
    this.motion.update(dt);
    if (!this.target) return events;
    if ((this.target !== this.denHay && !this.items.has(this.target.id) && !this.chewables.has(this.target.id)) || !canReachConsumable(player, this.target, this.world)) { this.cancel(); return events; }
    // Do not credit the part of the first frame before the mouse was pressed.
    this.progress += Math.max(0, dt - this.holdDelay);
    this.holdDelay = Math.max(0, this.holdDelay - dt);
    if (this.progress + 1e-9 >= consumptionSeconds(this.target)) {
      const item = this.target, type = consumableDetails(item);
      if (item.permanent) player.energy.refill();
      else {
        this.items.delete(item.id); this.chewables.delete(item.id);
        if(item.collider) { this.motion.remove(item);this.world.removeBox(item.collider); delete item.collider; }
        if(type.energy>0) player.energy.consume(type.energy);
        if(type.respawn) this.pending.set(item.id,{item,at:this.elapsed+type.respawn});
      }
      events.push({ kind: 'consume', item, energy: type.energy, happiness: type.happiness || 0 });
      // A fresh press is required for the next item, even if the button stays down.
      this.cancel();
    }
    return events;
  }
}
