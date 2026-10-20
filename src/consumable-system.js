import { CONSUMABLE_SLOTS, DEN_HAY, consumableDetails, randomConsumableType } from './consumable-data.js';
import { DEN } from './layout.js';

export const CONSUME_SECONDS = 1;
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
  if (!player.grounded || Math.abs(player.y - item.y) > .45 || Math.hypot(player.x - item.x, player.z - item.z) > CONSUME_REACH) return false;
  const a = { x: player.x, y: player.y + .32, z: player.z }, b = { x: item.x, y: item.y + .2, z: item.z };
  const insideDen = p => Math.hypot(p.x - DEN.x, p.z - DEN.z) < DEN.radius;
  if (item.permanent && !insideDen(player)) return false;
  if (Math.min(a.y, b.y) < DEN.fenceHeight && insideDen(a) !== insideDen(b)) return false;
  return !world.query(Math.min(a.x,b.x), Math.min(a.z,b.z), Math.max(a.x,b.x), Math.max(a.z,b.z)).some(box => segmentHitsBox(a,b,box));
}

export class ConsumableSystem {
  constructor(world, { slots = CONSUMABLE_SLOTS, random = Math.random } = {}) {
    this.world = world; this.random = random;
    // Both the initial population and restocking use this pool. Leave enough
    // clearance that an item's geometry cannot overlap the den fence either.
    this.slots = slots.filter(slot => Math.hypot(slot.x - DEN.x, slot.z - DEN.z) >= DEN.radius + .4);
    this.items = new Map(this.slots.map(slot => [slot.id, { ...slot }]));
    this.denHay = DEN_HAY;
    this.target = null; this.progress = 0; this.restockTime = 0;
  }
  get count() { return this.items.size; }
  *availableItems() { yield this.denHay; yield* this.items.values(); }
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
  update(dt, player) {
    const events = [];
    if (!(dt > 0) || !Number.isFinite(dt)) return events;
    // Count only time actually spent below the threshold. Pauses do not call update.
    if (this.count < 2) {
      this.restockTime += dt;
      while (this.restockTime + 1e-9 >= RESTOCK_SECONDS && this.count < 2) {
        const type = randomConsumableType(this.random);
        const free = this.slots.filter(slot => !this.items.has(slot.id));
        const preferred = free.filter(slot => slot.type === type);
        const vacant = preferred.length ? preferred : free.filter(slot => ['bread','cake','noodles','banana','apple','rabbitFood'].includes(slot.type));
        if (!vacant.length) { this.restockTime = 0; break; }
        const slot = vacant[Math.min(vacant.length - 1, Math.floor(this.random() * vacant.length))];
        const item = { ...slot, type };
        this.items.set(item.id, item); this.restockTime -= RESTOCK_SECONDS;
        events.push({ kind: 'spawn', item });
      }
      if (this.count >= 2) this.restockTime = 0;
    } else this.restockTime = 0;
    if (!this.target) return events;
    if ((this.target !== this.denHay && !this.items.has(this.target.id)) || !canReachConsumable(player, this.target, this.world)) { this.cancel(); return events; }
    // Do not credit the part of the first frame before the mouse was pressed.
    this.progress += Math.max(0, dt - this.holdDelay);
    this.holdDelay = Math.max(0, this.holdDelay - dt);
    if (this.progress + 1e-9 >= CONSUME_SECONDS) {
      const item = this.target, type = consumableDetails(item);
      if (item.permanent) player.energy.refill();
      else { this.items.delete(item.id); player.energy.consume(type.energy); }
      events.push({ kind: 'consume', item, energy: type.energy });
      // A fresh press is required for the next item, even if the button stays down.
      this.cancel();
    }
    return events;
  }
}
