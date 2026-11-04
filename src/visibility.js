import { FLOOR_HEIGHT, RAMPS, BASEMENT, BASEMENT_STAIRS } from './layout.js';

// Constant-cost approach checks, independent of the renderer. A wider exit band
// prevents repeated cutaway/shadow rebuilds while hovering near a boundary.
export function upperRoomsVisible(player, wasVisible = false) {
  if (player.y >= FLOOR_HEIGHT - (wasVisible ? 1.15 : .65)) return true;
  const margin = wasVisible ? 2 : 1;
  return RAMPS.some(r => {
    if((r.baseY??0)+r.height<FLOOR_HEIGHT-.1)return false;
    const lowZ = Math.min(r.startZ, r.endZ), highZ = Math.max(r.startZ, r.endZ);
    if (player.x < r.minX - margin || player.x > r.maxX + margin || player.z < lowZ - margin || player.z > highZ + margin) return false;
    const progress = Math.max(0, Math.min(1, (player.z - r.startZ) / (r.endZ - r.startZ)));
    // A rabbit beneath the high end of the outdoor stairs is still downstairs.
    return player.y >= (r.baseY??0)+progress * r.height - .45;
  });
}

export function basementRoomsVisible(player,wasVisible=false) {
  if(player.y<=BASEMENT.ceilingY)return true;
  const margin=wasVisible?1.8:1.25,r=BASEMENT_STAIRS;
  return player.y<.65&&player.x>=r.minX-margin&&player.x<=r.maxX+margin&&
    player.z>=Math.min(r.startZ,r.endZ)-margin&&player.z<=Math.max(r.startZ,r.endZ)+margin;
}
