import { DEN, FLOOR_HEIGHT } from './layout.js';

export const WATER_REACH = 1.15;
export const WATER_FILL_RATE = 10;
export const DRINK_COOLDOWN = 60;
export const FOUNTAIN_CAPACITY = 100;
export const PEE_SECONDS = 1;
export const MAX_BLADDER = 100;
const precise = value => Math.round(value * 1e9) / 1e9;

// Small drinking stations sit beside circulation routes rather than in doors,
// stair landings, hiding passages or the den's launch area.
export const FOUNTAIN_PLACEMENTS = Object.freeze([
  ['living',0,-10.5,17.8], ['foyer',0,-3.5,14], ['kitchen',0,18.3,18.4],
  ['hall',0,-11,.6], ['library',0,-18,-17.8], ['garden-room',0,6,-18.3],
  ['utility',0,18.5,-18], ['bedroom',1,-7,-17.5], ['reading',1,-2.8,-15],
  ['study',1,18,-17.8], ['gallery',1,-12.5,.5], ['balcony',1,-14,-22.5],
  ['yard',0,15,-25], ['front-yard',0,11,29.5],
].map(([room,floor,x,z]) => Object.freeze({ id:`fountain-${room}`, room, floor,
  name:'Water fountain', x, y:floor * FLOOR_HEIGHT, z })));

function segmentHitsBox(a, b, box) {
  let enter=0, exit=1;
  for (const [axis,low,high] of [['x','minX','maxX'],['y','minY','maxY'],['z','minZ','maxZ']]) {
    const delta=b[axis]-a[axis];
    if (Math.abs(delta)<1e-9) { if(a[axis]<=box[low] || a[axis]>=box[high]) return false; }
    else {
      const first=(box[low]-a[axis])/delta, second=(box[high]-a[axis])/delta;
      enter=Math.max(enter,Math.min(first,second)); exit=Math.min(exit,Math.max(first,second));
      if(exit<=enter) return false;
    }
  }
  return enter<.999 && exit>.001;
}

export function canReachFountain(player, fountain, world) {
  if (!player || !fountain || !player.grounded || Math.abs(player.y-fountain.y)>.45 ||
      Math.hypot(player.x-fountain.x,player.z-fountain.z)>WATER_REACH) return false;
  const a={x:player.x,y:player.y+.32,z:player.z}, b={x:fountain.x,y:fountain.y+.26,z:fountain.z};
  const insideDen=p=>Math.hypot(p.x-DEN.x,p.z-DEN.z)<DEN.radius;
  if(Math.min(a.y,b.y)<DEN.fenceHeight && insideDen(a)!==insideDen(b)) return false;
  return !world.query(Math.min(a.x,b.x),Math.min(a.z,b.z),Math.max(a.x,b.x),Math.max(a.z,b.z))
    .some(box=>box.fountainId!==fountain.id && segmentHitsBox(a,b,box));
}

// Pure active-play state. Rendering, key handling and pausing stay with the
// caller; advancing by zero cannot fill the bladder or shorten the cooldown.
export class WaterSystem {
  constructor(world, {items=FOUNTAIN_PLACEMENTS}={}) {
    this.world=world; this.items=items; this.bladder={value:0}; this.reset();
  }
  reset() {
    this.reservoirs=new Map(this.items.map(item=>[item.id,FOUNTAIN_CAPACITY]));
    this.waterRevision=(this.waterRevision ?? 0)+1;
    this.bladder.value=0;this.elapsed=0;this.readyAt=0;this.peeEvent=null;this.peeElapsed=0;this.stop();
  }
  remaining(fountain) { return this.reservoirs.get(typeof fountain==='string' ? fountain : fountain?.id) ?? 0; }
  get cooldownRemaining() { return Math.max(0,precise(this.readyAt-this.elapsed)); }
  get drinking() { return !!this.target; }
  get peeing() { return !!this.peeEvent && this.peeEvent.progress<1; }
  get peeProgress() { return this.peeEvent?.progress ?? 0; }
  get peeRemaining() { return this.peeing ? precise(PEE_SECONDS*(1-this.peeProgress)) : 0; }
  nearest(player) {
    let nearest=null, distance=Infinity;
    for(const fountain of this.items) {
      const d=Math.hypot(player.x-fountain.x,player.z-fountain.z);
      if(d<distance && canReachFountain(player,fountain,this.world)) { nearest=fountain; distance=d; }
    }
    return nearest;
  }
  canDrink(player, fountain=this.nearest(player)) {
    return !this.peeing && this.bladder.value<MAX_BLADDER && this.remaining(fountain)>0 && this.cooldownRemaining===0 && canReachFountain(player,fountain,this.world);
  }
  start(player, frameOffset=0) {
    this.stop();
    const fountain=this.nearest(player);
    if(!this.canDrink(player,fountain)) return false;
    this.target=fountain; this.drinkStart=this.bladder.value;this.drinkSourceStart=this.remaining(fountain);this.drinkElapsed=0;
    this.holdDelay=Number.isFinite(frameOffset) ? Math.max(0,frameOffset) : 0;
    return true;
  }
  stop() { this.target=null;this.drinkStart=0;this.drinkSourceStart=0;this.drinkElapsed=0;this.holdDelay=0; }
  advance(dt, player) {
    if(!Number.isFinite(dt) || dt<0) return;
    this.elapsed+=dt;
    if(this.peeing) {
      this.peeElapsed+=dt;
      this.peeEvent.progress=Math.min(1,precise(this.peeElapsed/PEE_SECONDS));
      this.bladder.value=precise(this.peeEvent.amount*(1-this.peeEvent.progress));
      return;
    }
    if(!this.target) return;
    if(!this.canDrink(player,this.target)) { this.stop(); return; }
    const duration=Math.max(0,dt-this.holdDelay);
    this.holdDelay=Math.max(0,this.holdDelay-dt);
    this.drinkElapsed+=duration;
    // Anchor both sides of the transfer to this hold, so fractional frames
    // conserve exactly the same percentage points instead of accumulating
    // separate rounding losses in the bladder and the reservoir.
    const amount=Math.min(MAX_BLADDER-this.drinkStart,this.drinkSourceStart,precise(this.drinkElapsed*WATER_FILL_RATE));
    const remaining=precise(this.drinkSourceStart-amount);
    this.bladder.value=precise(this.drinkStart+amount);
    if(this.remaining(this.target)!==remaining) {this.reservoirs.set(this.target.id,remaining);this.waterRevision++;}
    if(this.bladder.value===MAX_BLADDER || remaining===0) this.stop();
  }
  pee(player) {
    const amount=this.bladder.value;
    if(amount!==MAX_BLADDER || this.peeing || this.cooldownRemaining>0 || !player || !Number.isFinite(player.x+player.y+player.z)) return null;
    this.readyAt=this.elapsed+DRINK_COOLDOWN;this.peeElapsed=0;this.stop();
    // A press during a hop still acts immediately, with the patch on the
    // static support below Shidan instead of suspended in the air or on food.
    const y=this.world.support(player.x,player.z,player.y+.24,true).y;
    this.peeEvent={kind:'pee',x:player.x,y,z:player.z,amount,progress:0};
    return this.peeEvent;
  }
}
