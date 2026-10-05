import { FLOOR_HEIGHT, RAMPS } from './layout.js';

// Constant-cost approach checks, independent of the renderer. A wider exit band
// prevents repeated cutaway/shadow rebuilds while hovering near a boundary.
export function upperRoomsVisible(player, wasVisible = false) {
  if (player.y >= FLOOR_HEIGHT - (wasVisible ? 1.15 : .65)) return true;
  const margin = wasVisible ? 2 : 1;
  return RAMPS.some(r => {
    const lowZ = Math.min(r.startZ, r.endZ), highZ = Math.max(r.startZ, r.endZ);
    if (player.x < r.minX - margin || player.x > r.maxX + margin || player.z < lowZ - margin || player.z > highZ + margin) return false;
    const progress = Math.max(0, Math.min(1, (player.z - r.startZ) / (r.endZ - r.startZ)));
    // A rabbit beneath the high end of the outdoor stairs is still downstairs.
    return player.y >= progress * r.height - .45;
  });
}
