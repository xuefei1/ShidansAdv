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

// Build once per level, never per frame. Ground, upstairs, balcony, both yards,
// and hidden passages are eligible. A clear ring gives Shidan room to approach.
export function createChewablePlaces(world) {
  const places=[];
  for (const y of [0,H]) for(let x=BOUNDS.minX+.9;x<BOUNDS.maxX-.8;x+=1.4) {
    for(let z=BOUNDS.minZ+.9;z<BOUNDS.maxZ-.8;z+=1.4) {
      if(Math.hypot(x-DEN.x,z-DEN.z)<DEN.radius+1 || world.rampAt(x,z)) continue;
      if(Math.abs(world.support(x,z,y+.02).y-y)>.02) continue;
      if(world.query(x-.7,z-.7,x+.7,z+.7).some(b=>b.maxY>y+.04 && b.minY<y+.8 && b.maxX>x-.7 && b.minX<x+.7 && b.maxZ>z-.7 && b.minZ<z+.7)) continue;
      places.push({x,y,z});
    }
  }
  return places;
}
