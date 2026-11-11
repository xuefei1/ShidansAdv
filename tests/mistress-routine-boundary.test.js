import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createMirrorMaze} from '../src/mirror-maze.js';
import {createWaterFountains} from '../src/fountains.js';
import {getMazeLayout} from '../src/maze-layout-catalog.js';
import {MistressAI,MISTRESS_ACTIVITIES} from '../src/mistress-ai.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MistressPursuit} from '../src/mistress-pursuit.js';
import {BASEMENT} from '../src/layout.js';

const scene=new THREE.Scene(),{world,basement}=createHouse(scene,{basementType:'maze'});
const maze=createMirrorMaze({parent:basement,world,layoutProvider:()=>getMazeLayout('willow-paths')});
createWaterFountains(scene,world,{mazeLayout:()=>maze.layout});
const nav=new MistressNavigation(world),home={x:-15.8,y:0,z:6.9};

test('ordinary chores stay above ground for a complete actual furnished-house routine',()=>{
  const routine=new MistressAI(world,{navigation:nav,random:()=>.5}),visited=new Set();
  for(const activity of MISTRESS_ACTIVITIES) {
    assert.ok(activity.approach.y>=0);if(activity.seat)assert.ok(activity.seat.y>=0);
  }
  for(let frame=0;frame<6500;frame++) {
    routine.update(.1);
    assert.ok(routine.position.y>=-1e-8);assert.ok(routine.renderPosition.y>=-1e-8);
    assert.ok(routine.route.every(point=>point.y>=-1e-8),'a routine route must not enter the basement flight');
    if(routine.state==='acting')visited.add(routine.activity);
    assert.equal(routine.blocked,false);
  }
  assert.equal(visited.size,MISTRESS_ACTIVITIES.length);
});

test('routine routing rejects a below-ground shortcut even from a navigation adapter that ignores the filter',()=>{
  const calls=[],routine=new MistressAI(null,{random:()=>.5,navigation:{findPath(from,to,options){calls.push(options);return [from,{x:0,y:BASEMENT.y,z:0},to];}}});
  routine.update(routine.remaining+1.2);
  assert.equal(routine.blocked,true);assert.equal(routine.position.y,0);assert.deepEqual(routine.route,[]);
  assert.ok(calls.length>0&&calls.every(options=>options.minY===0));
});

test('routine path restrictions do not remove basement pursuit routes, and a below-ground return exits before chores resume',()=>{
  const player={...maze.layout.heart,grounded:true},unrestricted=nav.findPath(home,player);
  assert.ok(unrestricted.some(point=>point.y===BASEMENT.y));
  assert.deepEqual(nav.findPath(home,player,{minY:0}),[]);
  const routine=new MistressAI(world,{navigation:nav,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  npc.update(0,{player,seen:true,contactClear:false});assert.equal(npc.phase,'chase');
  let entered=false;
  for(let frame=0;frame<2500&&!entered;frame++) {
    npc.update(.05,{player,seen:true,contactClear:false});entered=npc.position.y<-.1;
  }
  assert.equal(entered,true,'pursuit remains free to use the staircase');
  npc.update(2.001,{player,seen:false,movementScale:0,contactClear:false});
  npc.update(20.001,{player,seen:false,movementScale:0,contactClear:false});
  assert.equal(npc.phase,'returning');
  for(let frame=0;frame<4000&&npc.phase!=='routine';frame++)npc.update(.05,{player,seen:false,contactClear:false});
  assert.equal(npc.phase,'routine');assert.ok(npc.position.y>=0);
  for(let frame=0;frame<200;frame++){npc.update(.1,{player,seen:false});assert.ok(npc.position.y>=0);}
});

test('an explicit recovery from the basement is a collision-clear exit path without a deeper detour',()=>{
  const routine=new MistressAI(world,{navigation:nav,random:()=>.5}),start={...maze.layout.heart};
  assert.equal(routine.resumeFrom(start),true);
  assert.ok(routine.definition.approach.y>=0);
  const route=routine.route;assert.ok(route.length>2);assert.ok(route.every(point=>point.y>=start.y-1e-8));
  for(let index=1;index<route.length;index++)assert.equal(nav.segmentClear(route[index-1],route[index]),true);
  for(let frame=0;frame<2500&&routine.position.y<0;frame++)routine.update(.05);
  assert.ok(routine.position.y>=0);
});
