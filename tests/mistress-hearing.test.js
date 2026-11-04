import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {ConsumableSystem} from '../src/consumable-system.js';
import {RabbitController} from '../src/physics.js';
import {NoiseSystem} from '../src/noise.js';
import {MistressAI,MISTRESS_WALK_SPEED} from '../src/mistress-ai.js';
import {MistressPursuit} from '../src/mistress-pursuit.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {RAMPS,FLOOR_HEIGHT as H} from '../src/layout.js';

const p=(x,y,z)=>({x,y,z}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);
const navigation=new MistressNavigation(world);
const slots=[
  {id:'library-book',type:'book',...p(-17,0,-15.5)},
  {id:'bedroom-book',type:'book',...p(-15,H+.96,-13.5)},
  {id:'front-yard-book',type:'book',...p(0,0,27)},
  {id:'backyard-book',type:'book',...p(3,0,-30)},
  {id:'balcony-book',type:'book',...p(0,H,-22)},
];
const food=new ConsumableSystem(world,{slots,wires:[],randomLimits:{},randomPlaces:[]});

function walkingStairs(ramp,descending=false,progress=.5) {
  const base=ramp.baseY??0,low=p((ramp.minX+ramp.maxX)/2,base,ramp.startZ),high=p(low.x,base+ramp.height,ramp.endZ);
  const start=descending?high:low,end=descending?low:high;
  const routine=new MistressAI(world,{navigation,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  assert.equal(routine.resumeFrom(start),true);
  const route=navigation.findPath(start,end);assert.ok(route.length>1);
  routine._path=route;routine._pathIndex=0;
  let length=0;for(let index=1;index<route.length;index++)length+=distance(route[index-1],route[index]);
  npc.update(length*progress/MISTRESS_WALK_SPEED,{player:p(-17,0,-15.5),seen:false});
  assert.equal(npc.phase,'routine');assert.equal(npc.state,'walking');assert.equal(navigation.canStand(npc.position),true);
  assert.ok(npc.position.y>base&&npc.position.y<base+ramp.height);assert.equal(npc.maskingNoise,false);
  return npc;
}

function heldChew(id,noise=new NoiseSystem()) {
  const item=food.items.get(id),rabbit=new RabbitController(world);assert.ok(item);
  Object.assign(rabbit,p(item.x,item.y,item.z));food.begin(rabbit);
  assert.equal(food.target?.id,id);const before=food.progress;food.update(.1,rabbit,0);
  assert.ok(food.progress>before);const emitted=noise.update(.1,rabbit,{consuming:food.target});
  assert.equal(emitted.at(-1)?.kind,'eat');assert.equal(emitted.at(-1)?.scope,'house');
  return {rabbit,noise,source:p(rabbit.x,rabbit.y,rabbit.z)};
}

test('real rewarding holds alert a quiet mistress midway up and down every flight, including basement stairs',()=>{
  let cases=0;
  for(const ramp of RAMPS)for(const descending of [false,true])for(const progress of [.2,.5,.8])for(const slot of slots) {
    const npc=walkingStairs(ramp,descending,progress),{rabbit,noise,source}=heldChew(slot.id);
    const before=npc.elapsed;assert.equal(navigation.isRabbitSafe(rabbit,npc.position),false);
    npc.update(0,{player:rabbit,seen:false,noiseEvents:noise.events,noiseElapsed:noise.elapsed});
    assert.equal(npc.phase,'chase',`${ramp.id} ${descending?'down':'up'} ${progress} hears ${slot.id}`);
    assert.equal(npc.investigating,true);assert.equal(npc.lastDetection,'eat');assert.deepEqual(npc.investigationSource,source);
    assert.equal(npc.elapsed,before,'hearing is immediate and independent of cached eye updates');
    npc.update(.05,{player:rabbit,seen:false});assert.equal(npc.phase,'chase');assert.ok(npc.investigationGoal);
    assert.equal(navigation.canStand(npc.position),true);cases++;
  }
  assert.equal(cases,RAMPS.length*2*3*slots.length);
});

test('stairs do not suppress fresh chewing during search or its sprint-only hearing grace',()=>{
  for(const ramp of RAMPS)for(const descending of [false,true]) {
    const npc=walkingStairs(ramp,descending),{rabbit,noise,source}=heldChew('library-book');
    npc.update(0,{player:rabbit,seen:true});npc.update(2.001,{player:rabbit,seen:false,movementScale:0});
    assert.equal(npc.phase,'search');assert.ok(npc.sprintHearingCooldown>1.99);
    npc.update(0,{player:rabbit,seen:false,noiseEvents:noise.events,noiseElapsed:noise.elapsed});
    assert.equal(npc.phase,'chase');assert.equal(npc.investigating,true);assert.deepEqual(npc.investigationSource,source);
  }
});

test('walking or interrupted household noise history cannot make a stair listener deaf or replay an already-masked pulse',()=>{
  const routine=new MistressAI(world,{navigation,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  const {rabbit,noise}=heldChew('library-book');npc.noise.emit('laugh',npc.renderPosition,0,5);
  assert.equal(npc.maskingNoise,true);npc.update(0,{player:rabbit,noiseEvents:noise.events,noiseElapsed:noise.elapsed});
  assert.equal(npc.phase,'routine');
  const ramp=RAMPS[1],mid=p((ramp.minX+ramp.maxX)/2,H/2,(ramp.startZ+ramp.endZ)/2);
  assert.equal(routine.resumeFrom(mid,{elapsed:npc.elapsed}),true);assert.equal(npc.maskingNoise,false);
  npc.update(0,{player:rabbit,noiseEvents:noise.events,noiseElapsed:noise.elapsed});assert.equal(npc.phase,'routine');
  // Even an unexpired historical ripple injected into a walking controller
  // cannot stand in for an actively performed household sound.
  npc.noise.emit('cook',npc.renderPosition,npc.elapsed,5);assert.ok(npc.noise.events.length>0);assert.equal(npc.maskingNoise,false);
  food.update(.8,rabbit,0);noise.update(.8,rabbit,{consuming:food.target});
  npc.update(0,{player:rabbit,noiseEvents:noise.events,noiseElapsed:noise.elapsed});
  assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'eat');assert.equal(npc.maskingNoise,false);
  assert.equal(npc.noise.events.length,0,'interrupting a household activity clears its active cue history');
});

test('an actual zero-happiness hold stays silent for a quiet staircase listener',()=>{
  const npc=walkingStairs(RAMPS[0]),rabbit=new RabbitController(world),hay=food.denHay,noise=new NoiseSystem();
  Object.assign(rabbit,p(hay.x,hay.y,hay.z));food.begin(rabbit);assert.equal(food.target?.permanent,true);
  food.update(.1,rabbit,0);assert.ok(food.progress>0);assert.deepEqual(noise.update(.1,rabbit,{consuming:food.target}),[]);
  npc.update(0,{player:rabbit,noiseEvents:noise.events,noiseElapsed:noise.elapsed});assert.equal(npc.phase,'routine');
});
