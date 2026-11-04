import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {World} from '../src/physics.js';
import {BASEMENT,FLOOR_HEIGHT as H} from '../src/layout.js';
import {createHouse} from '../src/house.js';
import {createConsumables} from '../src/consumables.js';
import {createWaterFountains} from '../src/fountains.js';

const position=(mesh,index=0)=>{const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);return new THREE.Vector3().setFromMatrixPosition(matrix);};
const versions=meshes=>meshes.map(mesh=>mesh.instanceMatrix.version);
function foodFixture(){
  const scene=new THREE.Scene(),world=new World();world.basement=BASEMENT;
  const view=createConsumables(scene,world,{wires:[],randomLimits:{},slots:[
    {id:'ground',type:'carrot',x:4,y:0,z:4},{id:'upper',type:'book',x:8,y:H,z:-8},{id:'pushed',type:'apple',x:6,y:0,z:6},
  ]});
  const pushed=view.system.items.get('pushed'),body=view.system.motion.bodies.get(pushed.collider);
  view.system.motion.shift(body,0,BASEMENT.y,0);view.sync();
  const groups=scene.children.filter(node=>node.name.startsWith('Consumables floor'));
  const batches=groups.flatMap(group=>group.children),ring=scene.children.find(node=>node.geometry?.type==='RingGeometry');
  const sparks=scene.children.find(node=>node.isInstancedMesh);
  return {scene,world,view,pushed,groups,batches,ring,sparks};
}

test('basement tour filters food by its current floor, preserving pushed items and all simulation state',()=>{
  const {scene,world,view,pushed,groups,batches,ring}=foodFixture(),ground=view.system.items.get('ground');
  view.sync(0,ground,true);assert.equal(ring.visible,true);
  const objects=scene.children.slice(),items=[...view.system.items.values()],collider={...pushed.collider};
  const state={count:view.system.count,restockTime:view.system.restockTime,target:view.system.target,boxes:world.dynamicBoxes.size};
  assert.equal(batches.reduce((sum,mesh)=>sum+mesh.count,0),4);
  view.setUpperVisible(false);view.setFloorView(-1);
  assert.equal(batches.reduce((sum,mesh)=>sum+mesh.count,0),1);assert.equal(ring.visible,false);
  const apple=groups[0].getObjectByName('apple collectibles');assert.equal(apple.count,1);assert.ok(Math.abs(position(apple).y-BASEMENT.y)<1e-6);
  assert.equal(groups[1].visible,false);assert.deepEqual(scene.children,objects);
  assert.deepEqual([...view.system.items.values()],items);assert.deepEqual({...pushed.collider},collider);
  assert.deepEqual({count:view.system.count,restockTime:view.system.restockTime,target:view.system.target,boxes:world.dynamicBoxes.size},state);
  const before=versions(batches);view.setFloorView(-1);assert.deepEqual(versions(batches),before,'unchanged view does not re-upload matrices');
  view.setFloorView(null);assert.equal(batches.reduce((sum,mesh)=>sum+mesh.count,0),4);assert.equal(ring.visible,true);
  assert.equal(groups[1].visible,false,'returning to play preserves the existing upper-floor cutaway');
  view.setUpperVisible(true);assert.equal(groups[1].visible,true);
});

test('basement food particles and targeting remain visible while above-ground feedback is filtered and restored',()=>{
  const {view,pushed,ring,sparks}=foodFixture(),ground=view.system.items.get('ground');
  view.handle([{kind:'consume',item:ground},{kind:'consume',item:pushed}]);view.sync(.1,pushed,true);
  assert.equal(sparks.count,24);assert.equal(ring.visible,true);
  view.setFloorView(-1);assert.equal(sparks.count,12);assert.equal(ring.visible,true);
  view.setFloorView(null);assert.equal(sparks.count,24);assert.equal(ring.visible,true);
  assert.equal(view.system.count,3,'visual filtering never consumes an item');
});

function finishedPee(view,player){
  view.advance(view.system.cooldownRemaining,player);view.system.bladder.value=100;
  const puddle=view.pee(player);assert.ok(puddle);view.advance(1,player);assert.equal(puddle.progress,1);return puddle;
}

test('basement tour hides every fountain part but retains basement puddles, then restores exact floor pools',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene),view=createWaterFountains(scene,world);
  finishedPee(view,{x:-6,y:0,z:4.8});const below=finishedPee(view,{x:3,y:BASEMENT.y,z:3});
  finishedPee(view,{x:0,y:H,z:-.5});finishedPee(view,{x:0,y:0,z:25});
  assert.deepEqual(view.puddleMeshes.map(mesh=>mesh.count),[2,1,1]);
  const shells=view.groups.map(group=>group.children.find(mesh=>mesh.name.startsWith('Water fountains'))),stationParts=[...shells,...view.waterMeshes,...view.streamMeshes];
  const puddles=view.puddles.slice(),resources={elapsed:view.system.elapsed,readyAt:view.system.readyAt,bladder:view.system.bladder.value,
    revision:view.system.waterRevision,reservoirs:[...view.system.reservoirs],peeEvent:view.system.peeEvent};
  const boxCount=world.dynamicBoxes.size,objects=scene.children.slice();view.setUpperVisible(false);view.setFloorView(-1);
  assert.ok(stationParts.every(mesh=>mesh.visible===false));assert.equal(view.groups[0].visible,true);
  assert.deepEqual(view.puddleMeshes.map(mesh=>mesh.count),[1,0,0]);assert.ok(Math.abs(position(view.puddleMeshes[0]).y-below.y-.045)<1e-6);
  const before=versions(view.puddleMeshes);view.setFloorView(-1);assert.deepEqual(versions(view.puddleMeshes),before,'unchanged basement view is cached');
  assert.deepEqual(view.puddles,puddles);assert.equal(world.dynamicBoxes.size,boxCount);assert.deepEqual(scene.children,objects);
  assert.deepEqual({elapsed:view.system.elapsed,readyAt:view.system.readyAt,bladder:view.system.bladder.value,
    revision:view.system.waterRevision,reservoirs:[...view.system.reservoirs],peeEvent:view.system.peeEvent},resources);
  view.setFloorView(null);assert.ok(stationParts.every(mesh=>mesh.visible===true));assert.deepEqual(view.puddleMeshes.map(mesh=>mesh.count),[2,1,1]);
  assert.equal(view.groups[1].visible,false);view.setUpperVisible(true);assert.equal(view.groups[1].visible,true);
});
