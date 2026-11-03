import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {RabbitController} from '../src/physics.js';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {MistressCleanupSight} from '../src/mistress-cleanup.js';
import {MistressPursuit,PEE_CLEAN_SECONDS,PEE_RAGE_BONUS} from '../src/mistress-pursuit.js';

const scene=new THREE.Scene(),{world,layers,ceiling}=createHouse(scene);
const water=createWaterFountains(scene,world),navigation=new MistressNavigation(world);
const vision=new MistressVision(new MistressSight([...layers,ceiling,...water.groups]),world);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);

function fixture() {
  water.reset();
  const rabbit=new RabbitController(world);
  Object.assign(rabbit,{x:11,y:0,z:28.5,surface:'grass'});
  assert.equal(water.system.start(rabbit),true);water.advance(10,rabbit);
  assert.equal(water.system.bladder.value,100,'the real fountain fills the bladder before the action');
  const routine=new MistressAI(world,{navigation,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  assert.equal(routine.resumeFrom({x:10.5,y:0,z:28.5},{yaw:Math.PI/2}),true);
  npc.update(0,{player:rabbit,seen:true});assert.equal(npc.phase,'chase');
  const sensor=new MistressCleanupSight({vision,navigation,water,poop:{physics:{balls:[]},hasBall:()=>false}});
  let contacts=0;
  const observer=()=>({position:npc.renderPosition,stance:npc.position,
    eye:{x:npc.renderPosition.x,y:npc.renderPosition.y+2.3,z:npc.renderPosition.z},yaw:npc.yaw});
  const physicalContact=()=>vision.contactClear(observer().eye,rabbit,{stance:npc.position,reachInteraction:navigation.reachInteraction(rabbit)});
  const context=()=>({player:rabbit,seen:vision.canSee(observer(),rabbit),peeing:water.system.peeing,
    cleanupTarget:sensor.scan(observer(),npc.cleanupTarget),movementScale:0,
    contactClear:()=>{contacts++;return physicalContact();}});
  function advancePee(dt) {
    // The host settles the interval under its old action state, then updates
    // water and observes completion at zero time before simulating more work.
    npc.update(dt,context());water.advance(dt,rabbit);npc.update(0,context());
  }
  assert.equal(physicalContact(),true,'the mistress starts within real unobstructed capture reach');
  const puddle=water.pee(rabbit);assert.ok(puddle);
  return {rabbit,npc,sensor,puddle,context,advancePee,get contacts(){return contacts;}};
}

test('real one-second peeing is uncapturable through .999 seconds and immediately yields a fresh fifteen-second cleanup',()=>{
  const f=fixture();f.advancePee(.999);
  assert.equal(water.system.peeing,true);near(water.system.peeRemaining,.001);near(f.puddle.progress,.999);
  assert.equal(f.npc.phase,'chase');assert.equal(f.npc.playerLocked,false);assert.equal(f.contacts,0);
  const waiting=f.sensor.descriptor('pee',f.puddle,f.npc.position);
  assert.equal(waiting.ready,false);assert.equal(waiting.goal,null);
  f.npc.update(0,{...f.context(),cleanupTarget:waiting});
  assert.equal(f.npc.phase,'chase','even a directly supplied unfinished descriptor cannot start mopping');
  const paused={elapsed:f.npc.elapsed,waterElapsed:water.system.elapsed,progress:f.puddle.progress};
  f.npc.update(30,{...f.context(),active:false});water.advance(0,f.rabbit);
  assert.deepEqual({elapsed:f.npc.elapsed,waterElapsed:water.system.elapsed,progress:f.puddle.progress},paused);
  f.advancePee(.001);
  assert.equal(water.system.peeing,false);assert.equal(f.puddle.progress,1);assert.equal(water.system.bladder.value,0);
  assert.equal(f.npc.phase,'cleanup');assert.equal(f.npc.cleanupKind,'pee');assert.equal(f.npc.playerLocked,false);
  near(f.npc.cleanupRemaining,15);assert.equal(PEE_CLEAN_SECONDS,15);assert.equal(f.contacts,0);
  assert.equal(f.npc.takeEvents().some(event=>event.kind==='caught'),false);
  for(let frame=0;frame<10;frame++)f.rabbit.update(.1,{z:-1,run:true});
  assert.ok(f.rabbit.z<22,'unlocked Shidan has room to escape during cleaning');
  f.npc.update(14.999,f.context());assert.equal(f.npc.phase,'cleanup');near(f.npc.cleanupRemaining,.001);
  assert.equal(water.puddles.includes(f.puddle),true);near(f.npc.rageBonus,0);
  const remaining=f.npc.cleanupRemaining;f.npc.update(20,{...f.context(),active:false});near(f.npc.cleanupRemaining,remaining);
  f.npc.update(.001,f.context());assert.equal(water.puddles.includes(f.puddle),false);near(f.npc.rageBonus,PEE_RAGE_BONUS);
  near(f.npc.rageSpeedBonus,.44);
  const completed=f.npc.takeEvents().filter(event=>event.kind==='cleanup-finished');
  assert.equal(completed.length,1);assert.equal(completed[0].cleanupKind,'pee');
  f.npc.update(.1,f.context());near(f.npc.rageBonus,PEE_RAGE_BONUS);
});

test('the pee capture exception ends exactly with the action when its completed puddle is unavailable',()=>{
  const f=fixture();f.advancePee(.999);assert.equal(f.npc.phase,'chase');
  f.npc.update(.001,f.context());water.advance(.001,f.rabbit);
  assert.equal(water.system.peeing,false);assert.equal(water.removePuddle(f.puddle),true);
  f.npc.update(0,f.context());assert.equal(f.npc.phase,'caught');assert.equal(f.contacts,1);
});
