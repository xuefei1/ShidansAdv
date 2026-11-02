import * as THREE from '../vendor/three.module.js';
import { PoopPhysics, MAX_POOP_BALLS } from './poop-physics.js';
import { PoopSupply } from './poop-supply.js';

export function createPoopBalls(scene, world) {
  const physics = new PoopPhysics(world), supply = new PoopSupply();
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x785032, roughness: 1 }), MAX_POOP_BALLS);
  mesh.name = 'Persistent poop balls'; mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; scene.add(mesh);
  const transform = new THREE.Object3D();
  const hasBall=ball=>!!ball&&physics.balls[ball.slot]===ball;
  return {
    physics, supply,
    reset() { physics.reset(); supply.reset(); mesh.count = 0; mesh.instanceMatrix.clearUpdateRanges(); },
    drop(rabbit, nowSeconds = 0) { return supply.trySpend(nowSeconds) ? physics.dropBehind(rabbit) : null; },
    update(dt, rabbit) { if (rabbit) supply.observePosition(rabbit); physics.update(dt, rabbit); },
    *availableItems() {
      for (const ball of physics.balls) {
        ball.pickup ||= { id: `poop-${ball.id}`, type: 'poop', ball,
          get x() { return ball.x; }, get y() { return ball.y - ball.radius; }, get z() { return ball.z; } };
        yield ball.pickup;
      }
    },
    hasBall,
    remove(ball) { return physics.remove(ball); },
    has(item) { return item?.type === 'poop' && hasBall(item.ball); },
    consume(item, player) {
      if (item?.type !== 'poop' || !physics.remove(item.ball)) return false;
      player.energy.consume(5);
      return true;
    },
    sync() {
      if (!physics.dirty.size) return;
      for (const slot of physics.dirty) {
        const ball = physics.balls[slot];
        if (!ball) continue;
        transform.position.set(ball.x, ball.y, ball.z); transform.scale.setScalar(ball.radius);
        transform.rotation.set(ball.z * 3, ball.id * 2.399, ball.x * 3); transform.updateMatrix();
        mesh.setMatrixAt(slot, transform.matrix);
        // Three merges adjacent ranges before upload. One moving ball should
        // not transfer the entire 1,000-slot buffer on every frame.
        mesh.instanceMatrix.addUpdateRange(slot * 16, 16);
      }
      mesh.count = physics.count; mesh.instanceMatrix.needsUpdate = true; physics.dirty.clear();
    },
  };
}
