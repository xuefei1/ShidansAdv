import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {cube} from '../src/model.js';
import {World} from '../src/physics.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision,inMistressViewCone,MISTRESS_VIEW_RANGE} from '../src/mistress-vision.js';
import {createHouse} from '../src/house.js';

test('forward cone includes exact 45-degree and 50-metre limits, excludes behind and beyond',()=>{
  const origin={x:0,y:0,z:0};
  assert.equal(inMistressViewCone(origin,0,{x:0,y:0,z:MISTRESS_VIEW_RANGE}),true);
  assert.equal(inMistressViewCone(origin,0,{x:0,y:0,z:50.0001}),false);
  assert.equal(inMistressViewCone(origin,0,{x:10,y:0,z:10}),true);
  assert.equal(inMistressViewCone(origin,0,{x:10.001,y:0,z:10}),false);
  assert.equal(inMistressViewCone(origin,0,{x:0,y:0,z:-1}),false);
  assert.equal(inMistressViewCone(origin,Math.PI/2,{x:10,y:0,z:0}),true);
  assert.equal(inMistressViewCone(origin,0,{x:0,y:40,z:40}),false,'distance includes height');
});

test('vision uses real cover while sleeping disables sight and contact ignores facing',()=>{
  const wall=new THREE.Group();cube(wall,0,0,1.5,2,8,3,.2);
  const vision=new MistressVision(new MistressSight(wall)),actor={position:{x:0,y:0,z:0},eye:{x:0,y:2.3,z:0},yaw:0},rabbit={x:0,y:0,z:4};
  assert.equal(vision.canSee(actor,rabbit),false);
  assert.equal(vision.contactClear(actor.eye,rabbit),false);
  const clear=new MistressVision(new MistressSight([]));
  assert.equal(clear.canSee(actor,rabbit),true);
  assert.equal(clear.canSee({...actor,asleep:true},rabbit),false);
  assert.equal(clear.canSee({...actor,yaw:Math.PI},rabbit),false);
  assert.equal(clear.contactClear(actor.eye,rabbit),true);
});

test('camera cutaways never make physical walls or floors transparent to the NPC',()=>{
  const upper=new THREE.Group();cube(upper,0,0,1.5,2,8,3,.2);
  const sight=new MistressSight(upper);upper.visible=false;
  const eye={x:0,y:2.3,z:0},targets=[{x:0,y:.4,z:4}];
  assert.equal(sight.hasLineOfSight(eye,targets),true,'camera sight follows render visibility');
  assert.equal(sight.hasLineOfSight(eye,targets,{includeHidden:true}),false);
  assert.equal(new MistressVision(sight).canSee({position:eye,eye,yaw:0},{x:0,y:0,z:4}),false);
});

test('glass permits visual detection and reusable body samples cover a partially hidden rabbit',()=>{
  const group=new THREE.Group();const pane=cube(group,0,0,1.4,2,4,2.8,.05);
  pane.material=new THREE.MeshBasicMaterial({transparent:true,opacity:.18,depthWrite:false});
  const vision=new MistressVision(new MistressSight(group));
  const actor={position:{x:0,y:0,z:0},eye:{x:0,y:2.3,z:0},yaw:0},rabbit={x:0,y:0,z:4};
  assert.equal(vision.canSee(actor,rabbit),true);
  const samples=vision.targetSamples(rabbit);assert.equal(vision.targetSamples({...rabbit,x:1}),samples);
  assert.equal(vision.canSee(actor,{x:NaN,y:0,z:1}),false);
});

test('closed transparent glass permits sight but blocks every physical catch ray',()=>{
  const group=new THREE.Group(),pane=cube(group,0,0,1.4,.4,4,2.8,.06),world=new World();
  pane.material=new THREE.MeshBasicMaterial({transparent:true,opacity:.18,depthWrite:false});
  world.addBox(0,1.4,.4,4,2.8,.06);
  const vision=new MistressVision(new MistressSight(group),world),eye={x:0,y:2.3,z:0},player={x:0,y:.7,z:.75};
  assert.equal(vision.canSee({position:{x:0,y:0,z:0},eye,yaw:0},player),true);
  assert.equal(vision.contactClear(eye,player),false);
  world.removeBox(world.solids[0]);assert.equal(vision.contactClear(eye,player),true);
});

test('moving loose cover updates sight and contact without rebuilding the static index',()=>{
  const world=new World(),cover=world.addDynamicBox(0,1,2,4,2,.5);cover.pushable=true;
  const sight=new MistressSight([]),vision=new MistressVision(sight,world),eye={x:0,y:2.3,z:0},rabbit={x:0,y:0,z:4};
  const actor={position:{x:0,y:0,z:0},eye,yaw:0};
  assert.equal(vision.canSee(actor,rabbit),false);assert.equal(vision.contactClear(eye,rabbit),false);
  world.moveDynamicBox(cover,5,0,0);
  assert.equal(vision.canSee(actor,rabbit),true);assert.equal(vision.contactClear(eye,rabbit),true);
  assert.equal(sight.entries.length,0);
});

test('tiny waste-point sight respects cone, hidden walls, moving cover and closed glass reach',()=>{
  const group=new THREE.Group(),world=new World();
  const pane=cube(group,0,0,1.4,.4,4,2.8,.06);
  pane.material=new THREE.MeshBasicMaterial({transparent:true,opacity:.18,depthWrite:false});
  world.addBox(0,1.4,.4,4,2.8,.06);
  const vision=new MistressVision(new MistressSight(group),world),actor={position:{x:0,y:0,z:0},eye:{x:0,y:2.3,z:0},yaw:0},ball={x:0,y:.065,z:.8};
  assert.equal(vision.canSeePoint(actor,ball),true);assert.equal(vision.canReachPoint({x:0,y:1,z:0},ball),false);
  assert.equal(vision.canSeePoint({...actor,yaw:Math.PI},ball),false);
  const cover=world.addDynamicBox(0,1,.3,4,2,.2);
  assert.equal(vision.canSeePoint(actor,ball),false);world.removeBox(cover);
  const wall=new THREE.Group();cube(wall,0,0,1.4,.4,4,2.8,.1);const hidden=new MistressVision(new MistressSight(wall));wall.visible=false;
  assert.equal(hidden.canSeePoint(actor,ball),false);
});

test('a lowered hand reaches under the real dining table while standing eye rays hit its top',()=>{
  const scene=new THREE.Scene(),{group,world}=createHouse(scene);
  const vision=new MistressVision(new MistressSight(group),world),table=world.fixtures.get('dining-top');
  const stance={x:14,y:0,z:13.05},eye={...stance,y:2.3},rabbit={x:14,y:0,z:15};
  assert.equal(vision.contactClear(eye,rabbit),false,'standing rays strike the table slab');
  const options={stance,tableInteraction:{table,under:true}};
  assert.equal(vision.contactClear(eye,rabbit,options),true,'a clear reach below the slab can catch her');
  const pane=world.addBox(14,.65,13.9,2,1.3,.06);
  assert.equal(vision.contactClear(eye,rabbit,options),false,'lowering the hand cannot reach through a solid pane');
  world.removeBox(pane);
  const leg=world.addBox(14,.65,14,.3,1.3,.3);
  assert.equal(vision.contactClear(eye,rabbit,options),false,'a table leg still blocks the reach');
  world.removeBox(leg);
  assert.equal(vision.contactClear(eye,rabbit,options),true);
});

test('tabletop contact uses a raised hand from the actual stance and respects hidden walls',()=>{
  const scene=new THREE.Scene(),{group,world}=createHouse(scene);
  const vision=new MistressVision(new MistressSight(group),world),table=world.fixtures.get('dining-top');
  const stance={x:14,y:0,z:13.05},eye={...stance,y:2.3},rabbit={x:14,y:table.maxY,z:15};
  const options={stance,tableInteraction:{table,under:false}};
  assert.equal(vision.contactClear(eye,rabbit,options),true);
  const wall=world.addBox(14,1.5,13.9,2,3,.06);
  assert.equal(vision.contactClear(eye,rabbit,options),false,'table-specific reach still obeys physical walls');
  world.removeBox(wall);
  assert.equal(vision.contactClear(eye,rabbit,options),true);
});
