import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {World,RabbitController} from '../src/physics.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains,MAX_PUDDLES} from '../src/fountains.js';
import {createPoopBalls} from '../src/poop.js';
import {ConsumableSystem} from '../src/consumable-system.js';
import {POOP_RADIUS} from '../src/poop-physics.js';
import {FLOOR_HEIGHT} from '../src/layout.js';

const ground={x:-6,y:0,z:4.8,grounded:true};
const upper={x:0,y:FLOOR_HEIGHT,z:-.5,grounded:true};
const outdoor={x:0,y:0,z:25,grounded:true};
const fixture=()=>{const scene=new THREE.Scene(),{world}=createHouse(scene);return createWaterFountains(scene,world);};
function finishedPee(view,player=ground) {
  view.advance(view.system.cooldownRemaining,player);view.system.bladder.value=100;
  const event=view.pee(player);assert.ok(event);view.advance(1,player);assert.equal(event.progress,1);return event;
}
function matrixPosition(mesh,index) {
  const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}
function assertPuddlePosition(mesh,index,event) {
  const p=matrixPosition(mesh,index);assert.ok(Math.abs(p.x-event.x)<1e-5);assert.ok(Math.abs(p.z-event.z)<1e-5);
}

test('completed puddle cleanup compacts only its exact live instance across all floor pools',()=>{
  const view=fixture(),first=finishedPee(view),second=finishedPee(view,{...ground,x:-7});
  const upstairs=finishedPee(view,upper),yard=finishedPee(view,outdoor);
  assert.deepEqual(view.puddleMeshes.map(mesh=>mesh.count),[2,1,1]);
  assert.equal(view.removePuddle({...first}),false);assert.equal(view.removePuddle(null),false);
  assert.equal(view.removePuddle(first),true);assert.equal(view.removePuddle(first),false);
  assert.deepEqual(view.puddles,[second,upstairs,yard]);
  assert.deepEqual(view.puddleMeshes.map(mesh=>mesh.count),[1,1,1]);
  assertPuddlePosition(view.puddleMeshes[0],0,second);assertPuddlePosition(view.puddleMeshes[1],0,upstairs);assertPuddlePosition(view.puddleMeshes[2],0,yard);
  assert.equal(view.removePuddle(upstairs),true);assert.deepEqual(view.puddleMeshes.map(mesh=>mesh.count),[1,0,1]);
  assert.equal(view.removePuddle(yard),true);assert.equal(view.removePuddle(second),true);
  assert.deepEqual(view.puddleMeshes.map(mesh=>mesh.count),[0,0,0]);
});

test('forming puddles reject cleanup and completed cleanup never changes bladder, cooldown or the pee action',()=>{
  const view=fixture(),old=finishedPee(view);
  view.advance(view.system.cooldownRemaining,ground);view.system.bladder.value=100;
  const forming=view.pee(ground);view.advance(.4,ground);
  assert.equal(view.removePuddle(forming),false);assert.equal(view.system.bladder.value,60);
  const before={elapsed:view.system.elapsed,readyAt:view.system.readyAt,peeEvent:view.system.peeEvent,
    progress:view.system.peeProgress,peeElapsed:view.system.peeElapsed,bladder:view.system.bladder.value,
    reservoirs:[...view.system.reservoirs],revision:view.system.waterRevision};
  assert.equal(view.removePuddle(old),true);
  assert.deepEqual({elapsed:view.system.elapsed,readyAt:view.system.readyAt,peeEvent:view.system.peeEvent,
    progress:view.system.peeProgress,peeElapsed:view.system.peeElapsed,bladder:view.system.bladder.value,
    reservoirs:[...view.system.reservoirs],revision:view.system.waterRevision},before);
  assert.equal(view.system.peeing,true);view.advance(.6,ground);
  assert.equal(view.removePuddle(forming),true);assert.equal(view.system.peeEvent,forming);
  assert.equal(view.system.bladder.value,0);assert.equal(view.system.cooldownRemaining,59);
});

test('puddle cap replacement and round reset invalidate old references without reusing IDs',()=>{
  const view=fixture(),first=finishedPee(view);
  for(let i=1;i<=MAX_PUDDLES;i++)finishedPee(view,i%2?outdoor:ground);
  assert.equal(view.puddles.length,MAX_PUDDLES);assert.equal(view.removePuddle(first),false);
  assert.equal(new Set(view.puddles.map(event=>event.id)).size,MAX_PUDDLES);
  const last=view.puddles.at(-1);assert.ok(last.id>first.id);
  view.reset();assert.deepEqual(view.puddleMeshes.map(mesh=>mesh.count),[0,0,0]);
  const fresh=finishedPee(view);assert.ok(fresh.id>last.id);
  assert.equal(view.removePuddle(last),false);assert.equal(view.removePuddle({...fresh}),false);
  assert.equal(view.removePuddle(fresh),true);
});

test('poop cleanup removes a raw ball once and compacts rendering without granting energy or carried supply',()=>{
  const scene=new THREE.Scene(),world=new World(),poop=createPoopBalls(scene,world),mesh=scene.getObjectByName('Persistent poop balls');
  const rabbit=new RabbitController(world);rabbit.energy.value=17;
  const first=poop.physics.spawn({x:0,y:POOP_RADIUS,z:0}),middle=poop.physics.spawn({x:1,y:POOP_RADIUS,z:0}),last=poop.physics.spawn({x:2,y:POOP_RADIUS,z:0});
  poop.sync();const supply={...poop.supply},recoveries=[...rabbit.energy.recoveries];
  assert.equal(poop.hasBall(middle),true);assert.equal(poop.hasBall({...middle}),false);
  assert.equal(poop.remove(middle),true);assert.equal(poop.remove(middle),false);assert.equal(poop.remove(null),false);
  assert.equal(poop.hasBall(middle),false);assert.equal(poop.hasBall(last),true);assert.equal(last.slot,1);
  poop.sync();assert.equal(mesh.count,2);assert.equal(matrixPosition(mesh,1).x,last.x);
  assert.equal(rabbit.energy.value,17);assert.deepEqual(rabbit.energy.recoveries,recoveries);assert.deepEqual({...poop.supply},supply);
  assert.equal(poop.remove(first),true);assert.equal(poop.remove(last),true);poop.sync();assert.equal(mesh.count,0);
});

test('poop cleanup rejects cap-replaced and prior-round identities even when slot or numeric ID is reused',()=>{
  const poop=createPoopBalls(new THREE.Scene(),new World());poop.physics.capacity=3;
  const old=poop.physics.spawn({x:0,y:POOP_RADIUS,z:0});
  for(let i=1;i<=3;i++)poop.physics.spawn({x:i,y:POOP_RADIUS,z:0});
  assert.equal(poop.hasBall(old),false);assert.equal(poop.remove(old),false);
  const prior=poop.physics.balls.find(ball=>ball.slot===0);assert.ok(poop.hasBall(prior));
  poop.reset();const fresh=poop.physics.spawn({x:0,y:POOP_RADIUS,z:0});
  assert.equal(fresh.id,old.id);assert.equal(fresh.slot,old.slot);
  assert.equal(poop.remove(old),false);assert.equal(poop.remove(prior),false);assert.equal(poop.hasBall(fresh),true);
  assert.equal(poop.remove(fresh),true);assert.equal(poop.physics.count,0);
});

test('cleanup cancels an in-progress poop consume hold without a reward or supply mutation',()=>{
  const world=new World(),poop=createPoopBalls(new THREE.Scene(),world),rabbit=new RabbitController(world);
  Object.assign(rabbit,{x:0,y:0,z:0});rabbit.energy.value=20;
  const system=new ConsumableSystem(world,{slots:[],wires:[],randomPlaces:[],randomLimits:{}});system.setExternalItems(poop);
  const ball=poop.physics.spawn({x:.8,y:POOP_RADIUS,z:0});system.begin(rabbit);
  assert.equal(system.target.ball,ball);assert.deepEqual(system.update(.2,rabbit,0),[]);assert.ok(system.progress>0);
  const supply={...poop.supply};assert.equal(poop.remove(ball),true);
  assert.deepEqual(system.update(1,rabbit,0),[]);assert.equal(system.target,null);assert.equal(system.progress,0);
  assert.equal(rabbit.energy.value,20);assert.deepEqual(rabbit.energy.recoveries,[]);assert.deepEqual({...poop.supply},supply);
});
