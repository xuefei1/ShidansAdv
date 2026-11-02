import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createRabbit} from '../src/model.js';
import {findCoplanarColorOverlaps} from './surface-audit.js';

const scenarios=[
  ['idle',0,true,0,'idle'],['running',8.8,true,0,'idle'],['charging',0,true,1,'idle'],
  ['airborne',6,false,0,'idle'],['eating',0,true,0,'eat'],['drinking',0,true,0,'drink'],['peeing',0,true,0,'pee'],
];
const pose=rabbit=>{
  const result=[];rabbit.joints.body.traverse(object=>result.push([object.uuid,...object.position.toArray(),...object.rotation.toArray(),...object.scale.toArray()]));return result;
};
function highestVertex(rabbit) {
  rabbit.root.updateWorldMatrix(true,true);const point=new THREE.Vector3();let highest=-Infinity;
  rabbit.joints.body.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    const position=mesh.geometry.attributes.position;
    for(let index=0;index<position.count;index++) {
      point.fromBufferAttribute(position,index).applyMatrix4(mesh.matrixWorld);
      assert.ok(Number.isFinite(point.x+point.y+point.z));highest=Math.max(highest,point.y);
    }
  });
  return highest-rabbit.root.matrixWorld.elements[13];
}

test('actual animated rabbit vertices fit available headroom down to the ceiling-contact allowance',()=>{
  const rabbit=createRabbit();rabbit.root.position.set(21.8,7.42,-14);rabbit.root.rotation.y=.8;
  for(const headroom of [1.55,1.3,1,.8,.655])for(const [name,speed,grounded,charge,action] of scenarios)for(let frame=0;frame<24;frame++) {
    rabbit.animate(frame/9,speed,grounded,charge,6.1,action,headroom);
    assert.ok(highestVertex(rabbit)<=headroom+1e-8,`${name} phase ${frame} exceeds ${headroom} m`);
  }
});

test('a tight ceiling visibly folds the ears and lowers the head while keeping the room anchor unchanged',()=>{
  const rabbit=createRabbit();rabbit.root.position.set(19.95,7.42,-12.3);rabbit.animate(.4,6,false,0,6.1);
  const upright=rabbit.joints.ears[0].rotation.x,headY=rabbit.joints.head.position.y;
  rabbit.animate(.4,6,false,0,6.1,'idle',.655);
  assert.ok(rabbit.joints.ears[0].rotation.x<upright-.9);assert.ok(rabbit.joints.head.position.y<headY-.15);
  assert.ok(rabbit.joints.body.scale.y<.9);assert.deepEqual(rabbit.root.position.toArray(),[19.95,7.42,-12.3]);
  assert.ok(highestVertex(rabbit)<.655);
});

test('clearance and action poses restore the exact ordinary pose once overhead space opens',()=>{
  const rabbit=createRabbit();
  for(const [name,speed,grounded,charge,action] of scenarios) {
    rabbit.animate(1.7,speed,grounded,charge,0,action);const ordinary=pose(rabbit);
    for(const tightAction of ['idle','eat','drink','pee']) {
      rabbit.animate(.4,6,false,.4,0,tightAction,.655);
      rabbit.animate(1.7,speed,grounded,charge,0,action,Infinity);
      assert.deepEqual(pose(rabbit),ordinary,`${name} restores after ${tightAction}`);
    }
    for(const nonLimit of [Infinity,NaN,undefined,3]) {
      rabbit.animate(1.7,speed,grounded,charge,0,action,nonLimit);assert.deepEqual(pose(rabbit),ordinary);
    }
  }
});

test('compact animation preserves rigid batches, geometry buffers, materials and the floor shadow',()=>{
  const rabbit=createRabbit(),meshes=[];rabbit.root.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
  const originals=meshes.map(mesh=>({geometry:mesh.geometry,material:mesh.material,attribute:mesh.geometry.attributes.position,version:mesh.geometry.attributes.position.version}));
  assert.equal(meshes.length,11);rabbit.root.position.y=7.42;
  const shadow=rabbit.root.children.find(child=>child.isMesh);
  for(let frame=0;frame<120;frame++)rabbit.animate(frame/60,6,false,0,6.1,'idle',.655);
  meshes.forEach((mesh,index)=>{
    assert.equal(mesh.geometry,originals[index].geometry);assert.equal(mesh.material,originals[index].material);
    assert.equal(mesh.geometry.attributes.position,originals[index].attribute);assert.equal(mesh.geometry.attributes.position.version,originals[index].version);
  });
  assert.equal(shadow.position.y,6.1-7.42+.014);assert.ok(shadow.material.opacity>0);
});

test('folded-ear clearance poses introduce no differently coloured coplanar patches',()=>{
  const rabbit=createRabbit();
  for(const action of ['idle','eat','drink','pee']) {
    rabbit.animate(.7,0,true,0,0,action,.655);assert.equal(findCoplanarColorOverlaps(rabbit.root).length,0,action);
  }
});
