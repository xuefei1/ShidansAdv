import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse,batchStaticGeometry} from '../src/house.js';
import {createBasementGate,BASEMENT_UNLOCK_HAPPINESS} from '../src/basement-gate.js';
import {RabbitController} from '../src/physics.js';
import {BASEMENT,BASEMENT_STAIRS as STAIRS} from '../src/layout.js';
import {PoopPhysics} from '../src/poop-physics.js';
import {findCoplanarColorOverlaps} from './surface-audit.js';

function fixture() {
  const house=createHouse(new THREE.Scene());
  return {...house,gate:createBasementGate({parent:house.layers[0],world:house.world})};
}
function player(world,x,y,z) {
  const rabbit=new RabbitController(world);Object.assign(rabbit,{x,y,z,surface:world.support(x,z,y+.01,true).surface});return rabbit;
}
function move(rabbit,input,seconds) {
  for(let t=0;t<seconds;t+=1/120)rabbit.update(1/120,input);
}

test('the locked basement has a cheap visible fence and live nonpushable collision on all four sides',()=>{
  const {gate,world}=fixture();assert.equal(BASEMENT_UNLOCK_HAPPINESS,200);
  assert.equal(world.basementGate,gate);assert.equal(gate.locked,true);assert.equal(gate.group.visible,true);
  assert.equal(gate.colliders.length,4);assert.equal(gate.collider.id,'basement-gate:entrance');
  for(const b of gate.colliders) {
    assert.ok(world.dynamicBoxes.has(b));assert.ok(b.verticalBarrier);assert.ok(b.basementGate);assert.equal(b.pushable,undefined);
    assert.ok(world.queryDynamic(b.minX,b.minZ,b.maxX,b.maxZ).includes(b));
    assert.equal(b.maxY,3.92,'the fence meets the upstairs slab');
  }
  let meshes=0;gate.group.traverse(mesh=>{if(mesh.isMesh){meshes++;assert.equal(mesh.userData.dynamicGate,true);}});
  assert.ok(meshes>0&&meshes<=2,'the fence is batched once within its independently removable group');
  assert.ok(gate.colliders.find(b=>b.id.endsWith(':west')).minY<=.96);
  assert.ok(gate.colliders.find(b=>b.id.endsWith(':rear')).minY<=.96);
});

test('unlocking and resetting updates warm spatial indexes without stale colliders or duplicate fence meshes',()=>{
  const {gate,world}=fixture(),size=world.solids.length,meshCount=gate.group.children.length;
  for(let round=0;round<3;round++) {
    const closed=[...gate.colliders],revision=world.dynamicRevision;
    world.query(-24,-18,-20,-4);world.queryDynamic(-24,-18,-20,-4);
    assert.equal(gate.setLocked(false),true);assert.equal(gate.locked,false);assert.equal(gate.group.visible,false);
    assert.equal(gate.collider,null);assert.equal(gate.colliders.length,0);assert.equal(world.solids.length,size-4);
    assert.ok(world.dynamicRevision>revision);
    for(const b of closed) {
      assert.equal(world.dynamicBoxes.has(b),false);assert.equal(world.query(-24,-18,-20,-4).includes(b),false);
      assert.equal(world.queryDynamic(-24,-18,-20,-4).includes(b),false);
    }
    assert.equal(gate.setLocked(false),false);assert.equal(gate.setLocked(true),true);assert.equal(gate.setLocked(true),false);
    assert.equal(world.solids.length,size);assert.equal(gate.colliders.length,4);assert.equal(gate.group.children.length,meshCount);
  }
});

test('the entrance blocks walking, sprinting and jumping until unlocked, then supports the complete stair route',()=>{
  const {gate,world}=fixture(),x=(STAIRS.minX+STAIRS.maxX)/2;
  for(const run of [false,true]) {
    const rabbit=player(world,x,0,STAIRS.endZ+.8);
    move(rabbit,{z:-1,run},2);
    assert.ok(rabbit.z>=gate.collider.maxZ+rabbit.radius-.001);assert.equal(rabbit.y,0);
    move(rabbit,{z:-1,jump:true},.8);move(rabbit,{z:-1,run},1.4);
    assert.ok(rabbit.z>=gate.collider.maxZ+rabbit.radius-.001);assert.equal(rabbit.y,0);
  }
  gate.setLocked(false);
  const rabbit=player(world,x,0,STAIRS.endZ+.8);
  move(rabbit,{z:-1},4.2);assert.ok(rabbit.z<STAIRS.startZ-.5);assert.equal(rabbit.y,BASEMENT.y);
  move(rabbit,{z:1},4.2);assert.ok(rabbit.z>STAIRS.endZ+.3);assert.equal(rabbit.y,0);
});

test('the closed fence cannot be bypassed by jumping from a library shelf or the low rear guard',()=>{
  const {world,gate}=fixture();
  // The neighbouring shelf is taller than an ordinary long jump from ground.
  const shelf=player(world,-20.4,2.7,-10);move(shelf,{jump:true},.8);move(shelf,{x:-1},1.4);
  const east=gate.colliders.find(b=>b.id.endsWith(':east'));
  assert.ok(shelf.x>=east.maxX+shelf.radius-.001,`shelf jump ended at ${shelf.x},${shelf.y}`);
  const rear=player(world,-22.4,.96,-17.2);move(rear,{jump:true},.8);move(rear,{z:1},1.4);
  const back=gate.colliders.find(b=>b.id.endsWith(':rear'));
  assert.ok(rear.z<=back.minZ-rear.radius+.001,`rear jump ended at ${rear.z},${rear.y}`);
});

test('balls use current gate collision even when their physics cache predates an unlock and reset',()=>{
  const {world,gate}=fixture(),physics=new PoopPhysics(world),x=(STAIRS.minX+STAIRS.maxX)/2;
  for(const locked of [true,false,true]) {
    gate.setLocked(locked);
    const ball=physics.spawn({x,y:.15,z:STAIRS.endZ+.3,vz:-3});
    let crossed=false;
    for(let i=0;i<100;i++){physics.update(1/120);if(ball.z<STAIRS.endZ-.1)crossed=true;}
    assert.equal(crossed,!locked,`crossed gate while locked=${locked}`);physics.reset();
  }
});

test('independent gate art survives house batching performed before its creation',()=>{
  const house=createHouse(new THREE.Scene());house.layers.forEach(batchStaticGeometry);
  const gate=createBasementGate({parent:house.layers[0],world:house.world});
  assert.equal(gate.group.parent,house.layers[0]);assert.ok(gate.group.children.length>0);
  gate.setLocked(false);assert.equal(gate.group.visible,false);
});

test('fence wires, latch and notice plaque have no competing coloured coplanar faces',()=>{
  const previousDocument=globalThis.document;let house;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})};
  try {house=fixture();} finally {
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  }
  assert.ok(house.gate.group.children.some(mesh=>mesh.material?.map),'the actual textured notice plane participates');
  assert.deepEqual(findCoplanarColorOverlaps(house.gate.group),[]);
  const surrounding=new THREE.Group();surrounding.add(house.gate.group.clone());
  for(const name of ['basement-opening-side:west','basement-opening-side:east','basement-opening-rear','ground-floor:front','upper-floor']) {
    const mesh=house.group.getObjectByName(name);assert.ok(mesh,name);surrounding.add(mesh.clone());
  }
  assert.deepEqual(findCoplanarColorOverlaps(surrounding,{exposedOnly:true}),[],
    'guard joins, ground lip and upstairs ceiling keep distinct coloured faces separated');
});
