import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from '../src/house.js';
import { createRabbit } from '../src/model.js';
import { upperRoomsVisible } from '../src/visibility.js';

// CPU-side count of exactly the bounds tested by Three's renderer. This is a
// workload regression benchmark, not an FPS measurement. No WebGL is required.
const scene = new THREE.Scene(), house = createHouse(scene), rabbit = createRabbit();
house.layers.forEach(batchStaticGeometry); scene.add(rabbit.root);
const camera = new THREE.PerspectiveCamera(46, 16 / 9, .06, 260), frustum = new THREE.Frustum();
const views = [
  ['den', -16, 0, 12], ['entrance', 0, 0, 17], ['stairs', 2.5, 2.1, 8.5],
  ['bedroom', -15, 4.2, -9], ['balcony', 0, 4.2, -23], ['garden', 0, 0, -32],
];
let geometryBytes = 0, rabbitMeshes = 0;
const geometries = new Set();
scene.traverse(o => { if (o.isMesh) geometries.add(o.geometry); });
for (const g of geometries) {
  for (const a of Object.values(g.attributes)) geometryBytes += a.array.byteLength;
  geometryBytes += g.index?.array.byteLength || 0;
}
rabbit.root.traverse(o => { if (o.isMesh) rabbitMeshes++; });
const results = [];
for (const [name, x, y, z] of views) {
  house.upper.visible = upperRoomsVisible({ x, y, z });
  rabbit.root.position.set(x, y, z); scene.updateMatrixWorld(true);
  let calls = 0, triangles = 0;
  for (let i = 0; i < 72; i++) {
    const angle = i / 72 * Math.PI * 2;
    camera.position.set(x + Math.sin(angle) * 4.7, y + 2.8, z + Math.cos(angle) * 4.7);
    camera.lookAt(x, y + .62, z); camera.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    scene.traverseVisible(o => {
      if (o.isMesh && (!o.frustumCulled || frustum.intersectsObject(o))) {
        calls++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      }
    });
  }
  results.push({ view: name, averageDraws: +(calls / 72).toFixed(1), averageTriangles: Math.round(triangles / 72) });
}
console.log(JSON.stringify({ geometryMiB: +(geometryBytes / 1048576).toFixed(2), rabbitMeshes, views: results }, null, 2));
