import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createBasementGate} from '../src/basement-gate.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {BASEMENT,BASEMENT_STAIRS} from '../src/layout.js';

const p=(x,y,z)=>({x,y,z});
const scene=new THREE.Scene(),{world,layers}=createHouse(scene);
const gate=createBasementGate({parent:layers[0],world});
const nav=new MistressNavigation(world);
const upstairs=p(-15.8,0,6.9),downstairs=p(0,BASEMENT.y,0);
const entrance=p((BASEMENT_STAIRS.minX+BASEMENT_STAIRS.maxX)/2,0,BASEMENT_STAIRS.endZ);

test('locked basement fence separates NPC routes and cached targets until unlocked, then relocks on restart',()=>{
  const nodes=nav.nodes,edges=nav.nodes.map(node=>node.edges),grid=nav.grid;
  assert.equal(nav.canStand(entrance),false);
  assert.notEqual(nav.componentAt(upstairs),nav.componentAt(downstairs));
  assert.deepEqual(nav.findPath(upstairs,downstairs),[]);
  assert.deepEqual(nav.findPath(downstairs,upstairs),[]);
  assert.equal(nav.pursuitTarget(downstairs,upstairs),null);
  assert.equal(nav.cleanupTarget(downstairs,upstairs),null);
  assert.equal(nav.nearestReachable(downstairs,upstairs,{maxDistance:1}),null);
  const closedComponents=nav.components;
  for(let i=0;i<5;i++)nav.componentAt(upstairs);
  assert.equal(nav.components,closedComponents,'ordinary queries do not relabel the navigation graph');

  gate.setLocked(false);
  assert.equal(nav.canStand(entrance),true);
  assert.equal(nav.componentAt(upstairs),nav.componentAt(downstairs));
  assert.notEqual(nav.components,closedComponents,'the single unlock refreshes connectivity');
  for(const [from,to] of [[upstairs,downstairs],[downstairs,upstairs]]) {
    const path=nav.findPath(from,to);assert.ok(path.length>2);
    for(let i=1;i<path.length;i++)assert.equal(nav.segmentClear(path[i-1],path[i]),true);
  }
  assert.ok(nav.pursuitTarget(downstairs,upstairs),'closed-gate safety must not remain in the pursuit cache');
  assert.ok(nav.cleanupTarget(downstairs,upstairs),'waste downstairs becomes reachable too');
  const openComponents=nav.components;
  for(let i=0;i<5;i++)nav.componentAt(downstairs);
  assert.equal(nav.components,openComponents);

  gate.setLocked(true);
  assert.deepEqual(nav.findPath(upstairs,downstairs),[]);
  assert.equal(nav.pursuitTarget(downstairs,upstairs),null);
  assert.equal(nav.cleanupTarget(downstairs,upstairs),null);
  assert.equal(nav.nodes,nodes);assert.equal(nav.grid,grid);
  for(let i=0;i<nodes.length;i++)assert.equal(nav.nodes[i].edges,edges[i],'lock changes retain the fixed graph');
});

test('gate sight and contact follow live collision state without retaining hidden static fence triangles',()=>{
  const sight=new MistressSight(gate.group),vision=new MistressVision(sight,world);
  assert.equal(sight.entries.length,0,'movable gate art is excluded from the permanent triangle index');
  const eye=p(entrance.x,1,entrance.z+.6),target=p(entrance.x,1,entrance.z-.6);
  const actor={position:eye,eye,yaw:Math.PI};
  assert.equal(vision.canSeePoint(actor,target),false);
  assert.equal(vision.canReachPoint(eye,target),false);
  gate.setLocked(false);
  assert.equal(vision.canSeePoint(actor,target),true);
  assert.equal(vision.canReachPoint(eye,target),true);
  gate.setLocked(true);
  assert.equal(vision.canSeePoint(actor,target),false);
  assert.equal(vision.canReachPoint(eye,target),false);
});

test('omitting the NPC origin still refreshes gate connectivity before consulting cached targets',()=>{
  for(const query of [()=>nav.isRabbitSafe(downstairs),()=>!nav.cleanupTarget(downstairs),()=>!nav.nearestReachable(downstairs)]) {
    gate.setLocked(true);assert.equal(query(),true);
    gate.setLocked(false);assert.equal(query(),false,'the first query after unlocking must see the newly reachable basement');
    gate.setLocked(true);assert.equal(query(),true,'the first query after relocking must reject basement targets');
  }
});
