// Geometry is authored in the original layout coordinates, then the environment
// (including collision) is enlarged. Shidan and her movement stay at rabbit scale.
export const ENVIRONMENT_SCALE = 1.5;
export const BASE_DEN = Object.freeze({ x: -4.5, z: 3.1, radius: 1.5, fenceHeight: 1.1 });
export const BASE_STAIRS = Object.freeze({ minX: 5.15, maxX: 7.45, startZ: 4.7, endZ: -2.7, height: 3.4 });
const scaled = data => Object.freeze(Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value * ENVIRONMENT_SCALE])));
export const DEN = scaled(BASE_DEN);
export const STAIRS = scaled(BASE_STAIRS);
export const BOUNDS = scaled({ minX: -7.7, maxX: 7.7, minZ: -6.7, maxZ: 6.7 });
