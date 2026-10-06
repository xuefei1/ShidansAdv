import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { batchStaticGeometry } from '../src/render-batching.js';
import { renderPixelRatio } from '../src/render-quality.js';
import { createRabbit } from '../src/model.js';
import { createPoopBalls } from '../src/poop.js';
import { World, RabbitController, SURFACES } from '../src/physics.js';

test('batches preserve transformed indexed vertices, normals and linear colours', () => {
  const root = new THREE.Group(), joint = new THREE.Group();
  root.position.set(12, 3, -7); root.rotation.y = .3; root.add(joint); joint.position.set(1, 2, 1);
  const records = [];
  for (const [i, color] of [0xe8b49d, 0x9fb891].entries()) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color }));
    mesh.position.set(i, .4, .2); mesh.rotation.set(.2, .5, .1); mesh.scale.set(2, .3, .5); joint.add(mesh);
    root.updateWorldMatrix(true, true);
    const transform = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    records.push({ geometry: mesh.geometry.clone().applyMatrix4(transform), color: mesh.material.color.clone() });
  }
  batchStaticGeometry(root, { cellSize: Infinity });
  const merged = root.children.find(o => o.isMesh), geometry = merged.geometry;
  assert.equal(geometry.index.count, 72); assert.equal(geometry.attributes.position.count, 48);
  assert.equal(merged.material.color.getHex(), 0xffffff); assert.ok(merged.material.vertexColors);
  for (const [i, record] of records.entries()) for (let v = 0; v < 24; v++) {
    for (const name of ['position', 'normal', 'uv']) {
      const before = record.geometry.attributes[name], after = geometry.attributes[name];
      for (let c = 0; c < before.itemSize; c++) assert.ok(Math.abs(before.array[v * before.itemSize + c] - after.array[(i * 24 + v) * after.itemSize + c]) < 1e-5);
    }
    const color = new THREE.Vector3().fromBufferAttribute(geometry.attributes.color, i * 24 + v);
    assert.ok(color.distanceTo(new THREE.Vector3(record.color.r, record.color.g, record.color.b)) < 1e-6);
  }
  assert.deepEqual(Array.from(geometry.index.array.slice(36)), Array.from(records[1].geometry.index.array, i => i + 24));
});

test('distant chunks can be culled while shadow and material properties remain separate', () => {
  const group = new THREE.Group();
  for (const [x, roughness, cast] of [[0, 1, true], [.2, .4, true], [.3, 1, false], [80, 1, true]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x99ccaa, roughness }));
    mesh.position.x = x; mesh.castShadow = cast; mesh.receiveShadow = true; group.add(mesh);
  }
  batchStaticGeometry(group); group.updateMatrixWorld(true);
  assert.equal(group.children.length, 4);
  assert.equal(group.children.filter(o => o.castShadow).length, 3);
  assert.ok(group.children.some(o => o.material.roughness === .4));
  const camera = new THREE.PerspectiveCamera(46, 1, .1, 200); camera.position.set(0, 1, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  assert.equal(group.children.filter(o => frustum.intersectsObject(o)).length, 3);
});

test('rabbit keeps independent animated joints after rigid detail batching', () => {
  const rabbit = createRabbit(), meshes = [];
  rabbit.root.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 11);
  rabbit.animate(0, 0, true, 0); rabbit.root.updateMatrixWorld(true);
  const before = meshes.map(o => o.matrixWorld.clone());
  rabbit.animate(.73, 5, false, .5); rabbit.root.updateMatrixWorld(true);
  assert.ok(meshes.filter((o, i) => !o.matrixWorld.equals(before[i])).length >= 10);
  assert.ok(new Set(meshes.filter(o => !o.material.transparent).map(o => o.parent)).size >= 10);
});

test('3D resolution is bounded across regular, Retina and 4K displays', () => {
  assert.equal(renderPixelRatio(1280, 720, 1), 1);
  for (const [w, h, dpr] of [[1280, 720, 2], [1920, 1080, 2], [2560, 1440, 1.5], [3840, 2160, 2]]) {
    const ratio = renderPixelRatio(w, h, dpr);
    assert.ok(ratio > 0 && ratio <= dpr && ratio <= 1.5);
    assert.ok(w * h * ratio * ratio <= 1920 * 1080 + 1);
  }
});

test('one moving ball uploads one matrix and queued uploads survive until rendered', () => {
  const scene = new THREE.Scene(), poop = createPoopBalls(scene, new World()), mesh = scene.children[0];
  poop.physics.spawn({ x: 0, y: 2, z: 0 }); poop.sync(); mesh.instanceMatrix.clearUpdateRanges();
  poop.update(1 / 60); poop.sync();
  assert.deepEqual(mesh.instanceMatrix.updateRanges, [{ start: 0, count: 16 }]);
  poop.physics.spawn({ x: 2, y: 2, z: 0 }); poop.sync();
  assert.ok(mesh.instanceMatrix.updateRanges.some(r => r.start === 0));
  assert.ok(mesh.instanceMatrix.updateRanges.some(r => r.start === 16));
});

test('ordinary walking reaches 3m/s on wood with moderate release drift', () => {
  const r = new RabbitController(new World()); Object.assign(r, { x: 0, y: 0, z: 12 });
  for (let i = 0; i < 120; i++) r.update(1 / 120, { z: 1 });
  assert.ok(Math.abs(r.vz - 3) < .001);
  const start = r.z;
  for (let i = 0; i < 180; i++) r.update(1 / 120, {});
  assert.ok(r.z - start > .6 && r.z - start < .7);
  assert.equal(SURFACES.wood.run, 8.2); assert.equal(SURFACES.grass.grip, true);
});
