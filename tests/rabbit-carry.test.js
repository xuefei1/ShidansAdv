import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createRabbit} from '../src/model.js';

const pose=rabbit=>[rabbit.joints.body,rabbit.joints.head,...rabbit.joints.ears,...rabbit.joints.paws]
  .map(joint=>[...joint.position.toArray(),...joint.rotation.toArray(),...joint.scale.toArray()].map(value=>value===0?0:value));
function top(rabbit) {
  rabbit.root.updateMatrixWorld(true);let max=-Infinity;
  rabbit.joints.body.traverse(mesh=>{if(mesh.isMesh)max=Math.max(max,new THREE.Box3().setFromObject(mesh).max.y);});
  return max-rabbit.root.position.y;
}

test('the carried rabbit starts without a pose snap and smoothly folds into a compact cradle pose',()=>{
  const rabbit=createRabbit();rabbit.animate(1.4,0,true,0,0);const ordinary=pose(rabbit),height=top(rabbit);
  rabbit.animate(1.4,0,true,0,0,'carried',Infinity,0);assert.deepEqual(pose(rabbit),ordinary);
  let lastEar=rabbit.joints.ears[0].rotation.x;
  for(let step=1;step<=100;step++) {
    rabbit.animate(1.4,0,true,0,0,'carried',Infinity,step/100);
    assert.ok(rabbit.joints.ears[0].rotation.x<lastEar);lastEar=rabbit.joints.ears[0].rotation.x;
    assert.ok(pose(rabbit).flat().filter(value=>typeof value==='number').every(Number.isFinite));
  }
  assert.ok(top(rabbit)<1);assert.ok(top(rabbit)<height-.4);assert.equal(rabbit.root.scale.x,1);
  assert.equal(rabbit.root.position.y,0);assert.equal(rabbit.root.rotation.x,0);
});

test('holding hides the floor shadow, preserves rigid buffers and restores ordinary poses after return',()=>{
  const rabbit=createRabbit(),meshes=[];
  rabbit.root.traverse(mesh=>{if(mesh.isMesh)meshes.push([mesh,mesh.geometry,mesh.material,mesh.geometry.attributes.position.version]);});
  for(const [speed,grounded,charge] of [[0,true,0],[5,true,0],[0,true,.8],[5,false,0]]) {
    rabbit.animate(2,speed,grounded,charge,0);const expected=pose(rabbit);
    rabbit.animate(1,0,false,0,0,'carried',Infinity,1);assert.equal(rabbit.root.children.at(-1).visible,false);
    rabbit.animate(2,speed,grounded,charge,0);assert.deepEqual(pose(rabbit),expected);
    assert.equal(rabbit.root.children.at(-1).visible,true);
  }
  for(const [mesh,geometry,material,version] of meshes) {
    assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(geometry.attributes.position.version,version);
  }
});
