import * as THREE from '../vendor/three.module.js';
import { PoopPhysics, MAX_POOP_BALLS } from './poop-physics.js';

export function createPoopBalls(scene, world) {
  const physics = new PoopPhysics(world);
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x785032, roughness: 1 }), MAX_POOP_BALLS);
  mesh.name = 'Persistent poop balls'; mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh);
  const transform = new THREE.Object3D();
  return {
    physics,
    drop(rabbit) { return physics.dropBehind(rabbit); },
    update(dt, rabbit) { physics.update(dt, rabbit); },
    sync() {
      if (!physics.dirty.size) return;
      for (const slot of physics.dirty) {
        const ball = physics.balls[slot];
        transform.position.set(ball.x, ball.y, ball.z); transform.scale.setScalar(ball.radius);
        transform.rotation.set(ball.z * 3, ball.id * 2.399, ball.x * 3); transform.updateMatrix();
        mesh.setMatrixAt(slot, transform.matrix);
        // Three merges adjacent ranges before upload. One moving ball should
        // not transfer the entire 10,000-slot buffer on every frame.
        mesh.instanceMatrix.addUpdateRange(slot * 16, 16);
      }
      mesh.count = physics.count; mesh.instanceMatrix.needsUpdate = true; physics.dirty.clear();
    },
  };
}
