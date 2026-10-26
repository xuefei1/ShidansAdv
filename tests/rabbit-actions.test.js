import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createRabbit } from '../src/model.js';
import { findCoplanarColorOverlaps } from './surface-audit.js';

const joints = rabbit => [rabbit.joints.body,rabbit.joints.head,...rabbit.joints.eyes,...rabbit.joints.ears,...rabbit.joints.paws];
const pose = rabbit => joints(rabbit).map(joint => {
  joint.updateMatrix(); return joint.matrix.elements.slice();
});
const noseHeight = rabbit => {
  rabbit.root.updateMatrixWorld(true);
  return new THREE.Vector3(0,-.087,.31).applyMatrix4(rabbit.joints.head.matrixWorld).y;
};

for(const action of ['eat','drink']) {
  test(`${action} lowers Shidan's muzzle and moves her head, ears and front paws rhythmically`, () => {
    const rabbit = createRabbit(); rabbit.animate(.5);
    const idleNose = noseHeight(rabbit), idlePawZ = rabbit.joints.paws[2].position.z;
    rabbit.animate(.5,0,true,0,0,action);
    assert.ok(noseHeight(rabbit)<idleNose-.14,'the action is recognizable from a lowered muzzle');
    assert.ok(rabbit.joints.head.rotation.x>.15); assert.ok(rabbit.joints.paws[2].position.z>idlePawZ);
    const before = pose(rabbit), headY = rabbit.joints.head.position.y;
    rabbit.animate(.62,0,true,0,0,action); const after = pose(rabbit);
    assert.notEqual(rabbit.joints.head.position.y,headY,'the muzzle bobs while the button is held');
    assert.notDeepEqual(before[1],after[1]); assert.notDeepEqual(before[4],after[4]);
    assert.notDeepEqual(before.at(-1),after.at(-1));
  });
}

test('drinking reaches lower than eating so the shared action fits a water bowl', () => {
  const rabbit = createRabbit();
  rabbit.animate(.7,0,true,0,0,'eat'); const eatingHeight = noseHeight(rabbit);
  rabbit.animate(.7,0,true,0,0,'drink');
  assert.ok(noseHeight(rabbit)<eatingHeight-.05);
});

test('the pee action visibly crouches with wider paws and a gentle forward rump tilt', () => {
  const rabbit = createRabbit(); rabbit.animate(.4);
  const idleNose = noseHeight(rabbit), idleWidth = Math.abs(rabbit.joints.paws[0].position.x);
  rabbit.animate(.4,0,true,0,0,'pee');
  assert.ok(rabbit.joints.body.scale.y<.8); assert.ok(rabbit.joints.body.scale.x>1);
  assert.ok(noseHeight(rabbit)<idleNose-.15); assert.ok(rabbit.joints.body.rotation.x>0);
  assert.ok(Math.abs(rabbit.joints.paws[0].position.x)>idleWidth);
  assert.equal(rabbit.joints.paws[0].rotation.x,.16);
});

for(const action of ['eat','drink','pee']) {
  for(const [name,speed,grounded,charge] of [['idle',0,true,0],['running',6,true,0],['charged',0,true,1],['airborne',5,false,.5]]) {
    test(`${action} restores the ordinary ${name} pose immediately when the action ends`, () => {
      const rabbit = createRabbit();
      rabbit.animate(1.7,speed,grounded,charge,0); const expected = pose(rabbit);
      rabbit.animate(.6,0,true,0,0,action);
      rabbit.animate(1.7,speed,grounded,charge,0);
      assert.deepEqual(pose(rabbit),expected);
    });
  }
}

test('airborne action flags preserve jumping poses and shadow position', () => {
  const rabbit = createRabbit(); rabbit.root.position.y = 2;
  rabbit.animate(.9,6,false,.4,.5); const jumping = pose(rabbit);
  for(const action of ['eat','drink','pee']) {
    rabbit.animate(.9,6,false,.4,.5,action); assert.deepEqual(pose(rabbit),jumping);
  }
  const shadow = rabbit.root.children.find(object => object.isMesh);
  assert.equal(shadow.position.y,.5-2+.014); assert.ok(shadow.material.opacity>0);
});

test('action animation retains eleven mesh batches and never rewrites rigid geometry', () => {
  const rabbit = createRabbit(), meshes = []; rabbit.root.traverse(object => {if(object.isMesh) meshes.push(object);});
  assert.equal(meshes.length,11);
  const original = meshes.map(mesh => ({geometry:mesh.geometry,position:mesh.geometry.getAttribute('position'),version:mesh.geometry.getAttribute('position').version}));
  for(let frame=0;frame<180;frame++) rabbit.animate(frame/60,0,true,0,0,['eat','drink','pee'][frame%3]);
  meshes.forEach((mesh,index) => {
    assert.equal(mesh.geometry,original[index].geometry);
    assert.equal(mesh.geometry.getAttribute('position'),original[index].position);
    assert.equal(mesh.geometry.getAttribute('position').version,original[index].version);
  });
});

test('eating, drinking and crouching introduce no differently coloured coplanar patches', () => {
  const rabbit = createRabbit();
  for(const action of ['eat','drink','pee']) {
    rabbit.animate(.7,0,true,0,0,action);
    assert.equal(findCoplanarColorOverlaps(rabbit.root).length,0,action);
  }
});
