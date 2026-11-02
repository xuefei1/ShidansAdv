import { BOUNDS, DEN, FLOOR_HEIGHT as H } from './layout.js';

// Fixed cable coils beside recognisable appliances and floor lamps.
export const WIRE_SLOTS = Object.freeze([
  ['tv', -22, 0, 9.5], ['oven', 21, 0, 10.5],
  ['computer', 17, H, -12], ['desk', -14.6, 0, -11.5],
  ['sofa-lamp', -21, 0, 6.6], ['library-lamp', -18, 0, -5.3],
  ['dining-lamp', 20, 0, 17.2], ['bedroom-lamp', -22, H, -8.3],
  ['reading-lamp', 5.5, H, -14.7], ['studio-lamp', 18, H, -5.3],
].map(([place,x,y,z]) => Object.freeze({id:`wire-${place}`,type:'wire',x,y,z})));
export const RANDOM_CHEWABLE_LIMITS = Object.freeze({cardboard:8,slippers:4});

// Build candidates once per level, never per frame. The consumable system then
// excludes human-inaccessible hiding areas using the shared navigation graph.
// A clear ring gives Shidan room to approach.
export function createChewablePlaces(world) {
  const places=[];
  const clearPlace=(x,y,z,radius=.7)=>Math.abs(world.support(x,z,y+.02).y-y)<=.02 &&
    !world.query(x-radius,z-radius,x+radius,z+radius).some(b=>b.maxY>y+.04 && b.minY<y+.8 && b.maxX>x-radius && b.minX<x+radius && b.maxZ>z-radius && b.minZ<z+radius);
  for (const y of [0,H]) for(let x=BOUNDS.minX+.9;x<BOUNDS.maxX-.8;x+=1.4) {
    for(let z=BOUNDS.minZ+.9;z<BOUNDS.maxZ-.8;z+=1.4) {
      if(Math.hypot(x-DEN.x,z-DEN.z)<DEN.radius+1 || world.rampAt(x,z)) continue;
      if(clearPlace(x,y,z))places.push({x,y,z});
    }
  }
  // The two linen decks are exposed climbing destinations. Add a few clear
  // elevated candidates while keeping the ramp landing/jump launch open.
  for(const deck of world.solids??[]) {
    if(!deck.shelfDeck||!deck.reachableShelf)continue;
    const y=deck.maxY,keepClear=deck.reachableShelf.spawnKeepClear??
      (deck.id==='linen-shelf-upper'?{x:deck.minX+.25,z:deck.maxZ-.2,radius:1.3}:null);
    const candidates=[{x:(deck.minX+deck.maxX)/2,z:deck.maxZ-.45}];
    for(let x=deck.minX+.75;x<=deck.maxX-.75+1e-9;x+=1.4)for(let z=deck.minZ+.75;z<=deck.maxZ-.75+1e-9;z+=1.4)candidates.push({x,z});
    for(const {x,z} of candidates) {
      if(keepClear&&Math.hypot(x-keepClear.x,z-keepClear.z)<keepClear.radius)continue;
      // Both loose prop silhouettes fit a 0.45 m half-width. The front-centre
      // candidate leaves the smaller lower landing usable beside its ramp.
      if(clearPlace(x,y,z,.45))places.push({x,y,z});
    }
  }
  return places;
}
