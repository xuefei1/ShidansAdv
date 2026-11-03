import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from '../src/house.js';
import { MistressSight, MistressFootsteps, MISTRESS_FOOTSTEP_SECONDS } from '../src/mistress-awareness.js';

const p=(x=0,y=0,z=0)=>({x,y,z});
const camera=(origin=p(0,1,5),target=p(0,1,0))=>{
  const camera=new THREE.PerspectiveCamera(60,16/9,.05,100);
  camera.position.set(origin.x,origin.y,origin.z);camera.lookAt(target.x,target.y,target.z);camera.updateMatrixWorld(true);return camera;
};
const cube=(parent,x,y,z,w,h,d,material=new THREE.MeshBasicMaterial({color:0x7c9378}))=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
};
const walk=(position=p(0,0,0))=>({state:'walking',speed:3.5,position});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);

test('the minimap sighting requires the mistress to be inside the current camera frustum',()=>{
  const sight=new MistressSight(),view=camera();
  assert.equal(sight.inView(view,[p(0,1,0)]),true);
  for(const target of [p(20,1,0),p(0,1,10),p(0,100,0),p(0,1,-200)])assert.equal(sight.inView(view,[target]),false);
  view.lookAt(0,1,10);
  assert.equal(sight.inView(view,[p(0,1,0)]),false,'turning away immediately hides the dot');
  assert.equal(sight.inView(view,[p(0,1,10)]),true);
  assert.equal(sight.inView(view,[p(0,1,10)],{visible:false}),false,'cutaway-hidden actors stay hidden');
});

test('opaque walls and furniture block a sighting while any visible body sample permits one',()=>{
  const group=new THREE.Group();cube(group,0,1,2,4,4,.1);
  const sight=new MistressSight(group),view=camera();
  assert.equal(sight.inView(view,[p(0,1,0),p(0,2,0)]),false);
  const lowFurniture=new THREE.Group();cube(lowFurniture,0,.65,2,2,1.3,.5);
  const overFurniture=new MistressSight(lowFurniture);
  assert.equal(overFurniture.inView(view,[p(0,.5,0)]),false);
  assert.equal(overFurniture.inView(view,[p(0,.5,0),p(0,2.4,0)]),true);
});

test('see-through glass and wire gaps do not behave like solid walls',()=>{
  const group=new THREE.Group(),glass=new THREE.MeshBasicMaterial({transparent:true,opacity:.18,depthWrite:false});
  cube(group,0,1,2,4,4,.06,glass);
  cube(group,-1,1,2,.05,3,.05);cube(group,1,1,2,.05,3,.05);
  cube(group,0,.5,2,2,.03,.03);cube(group,0,1.5,2,2,.03,.03);
  const sight=new MistressSight(group);
  assert.equal(sight.inView(camera(),[p(0,1,0)]),true);
  assert.equal(sight.inView(camera(p(0,1.5,5),p(0,1.5,0)),[p(0,1.5,0)]),false,'the real wire still occludes a point');
});

test('static sight bounds honor transformed roots, ceilings, and current ancestor visibility',()=>{
  const parent=new THREE.Group(),group=new THREE.Group();parent.add(group);parent.position.x=4;
  cube(group,-4,1,2,4,4,.1);
  const sight=new MistressSight(group),view=camera();
  assert.equal(sight.inView(view,[p(0,1,0)]),false);
  group.visible=false;assert.equal(sight.inView(view,[p(0,1,0)]),true);
  group.visible=true;parent.visible=false;assert.equal(sight.inView(view,[p(0,1,0)]),true);
  const floors=new THREE.Group();cube(floors,0,4,0,10,.2,10);
  assert.equal(new MistressSight(floors).inView(camera(p(0,1,0),p(0,5,0)),[p(0,5,0)]),false);
});

test('a mixed-material mesh ignores transparent faces while preserving opaque faces',()=>{
  const group=new THREE.Group();
  const glass=new THREE.MeshBasicMaterial({transparent:true,opacity:.2,depthWrite:false});
  const materials=Array.from({length:6},()=>glass);
  materials[4]=new THREE.MeshBasicMaterial({color:0xaac3b4});
  cube(group,0,1,2,4,4,.1,materials);
  const sight=new MistressSight(group);
  assert.equal(sight.inView(camera(),[p(0,1,0)]),false,'front face opaque');
  assert.equal(sight.inView(camera(p(0,1,-5),p(0,1,5)),[p(0,1,5)]),true,'rear glass stays transparent');
});

test('the fixed sight index rejects off-ray meshes without growing a query cache',()=>{
  const group=new THREE.Group();let calls=0;
  for(let index=0;index<100;index++) {
    const mesh=cube(group,40+index*5,1,2,1,1,1),raycast=mesh.raycast.bind(mesh);
    mesh.raycast=(...args)=>{calls++;return raycast(...args);};
  }
  const behindTarget=cube(group,0,1,-20,4,4,1),raycast=behindTarget.raycast.bind(behindTarget);
  behindTarget.raycast=(...args)=>{calls++;return raycast(...args);};
  const sight=new MistressSight(group),entries=sight.entries.length,cells=sight.cells.size;
  for(let frame=0;frame<50;frame++)assert.equal(sight.inView(camera(),[p(0,1,0)]),true);
  assert.equal(calls,0);assert.equal(sight.entries.length,entries);assert.equal(sight.cells.size,cells);
  for(const samples of [[],[null],[p(NaN,0,0)]])assert.equal(sight.inView(camera(),samples),false);
  assert.equal(sight.inView(null,[p(0,1,0)]),false);
});

test('real batched house sight distinguishes closed glass, solid walls, doors and den-wire gaps',()=>{
  const scene=new THREE.Scene(),{layers,ceiling}=createHouse(scene);layers.forEach(batchStaticGeometry);
  const sight=new MistressSight([...layers,ceiling]);
  const see=(from,to)=>sight.inView(camera(from,to),[to]);
  assert.equal(see(p(-21.7,2.6,-23.5),p(-21.7,2.6,-18.5)),true,'closed rear glass is see-through');
  assert.equal(see(p(-18.8,2.6,-23.5),p(-18.8,2.6,-18.5)),false,'solid rear wall hides the dot');
  assert.equal(see(p(-7,2.2,-9),p(-3,2.2,-9)),false,'interior wall blocks a room-to-room dot');
  assert.equal(see(p(-7,2.2,-6),p(-3,2.2,-6)),true,'an open doorway permits a sighting');
  assert.equal(see(p(-16,.71,12),p(-15.8,.71,7)),true,'a wire-den gap permits a sighting');
});

function footfallAt(source,player=p()) {
  const steps=new MistressFootsteps();
  steps.update(.01,{player,mistress:walk(p(source.x-1,source.y,source.z))});
  steps.update(1/3.5,{player,mistress:walk(source)});return steps;
}

test('only actual travel within the inclusive 3D five-metre radius reaches the minimap',()=>{
  for(const [source,heard] of [[p(5,0,0),true],[p(5.000001,0,0),false],[p(3,4,0),true],[p(3,4.000001,0),false],[p(0,4.2,0),true]]) {
    const steps=footfallAt(source);assert.equal(steps.events.length>0,heard,JSON.stringify(source));
    assert.equal(steps.cues.length,1,'world/audio cues exist independently of minimap hearing');
  }
  for(const state of ['acting','entering','leaving','idle']) {
    const steps=new MistressFootsteps();steps.update(.01,{player:p(),mistress:walk()});
    steps.update(.5,{player:p(),mistress:{...walk(p(1,0,0)),state}});assert.equal(steps.cueSequence,0,state);
  }
  const stopped=new MistressFootsteps();for(let frame=0;frame<60;frame++)stopped.update(1/60,{player:p(),mistress:walk()});
  assert.equal(stopped.cueSequence,0,'reported walking speed without physical travel makes no footfalls');
});

test('heard footfalls ignore walls and visibility but reveal only expiring uncertainty rings',()=>{
  const steps=footfallAt(p(2,0,0)),event=steps.events[0],ripple=steps.ripples[0];
  assert.equal(event.source,'mistress');assert.equal(event.kind,'footstep');assert.equal(event.scope,'local');assert.equal(event.radius,5);
  assert.equal(steps.canHear(event,p(7,0,0)),true);assert.equal(steps.canHear(event,p(7.01,0,0)),false);
  assert.equal(ripple.mistress,undefined);assert.equal(ripple.dot,undefined);
  assert.equal(steps.audibleTo(p()).length,1);assert.equal(steps.audibleTo(p(20,0,0)).length,0);
  steps.update(MISTRESS_FOOTSTEP_SECONDS,{player:p(),mistress:{...walk(),state:'acting'}});
  assert.equal(steps.events.length,0);assert.equal(steps.cues.length,0);assert.equal(steps.ripples.length,0);assert.equal(steps.canHear(event,p()),false);
});

test('footfalls and rings preserve immutable last-heard snapshots while their cue identity links audio and world effects',()=>{
  const source=p(2,0,1),steps=footfallAt(source),event=steps.events[0],cue=steps.cues[0],initial=steps.ripples[0];
  assert.ok(Object.isFrozen(event));assert.ok(Object.isFrozen(event.position));assert.ok(Object.isFrozen(cue));assert.ok(Object.isFrozen(initial));
  assert.equal(event.cueId,cue.id);assert.equal(event.position,cue.position);assert.equal(event.gait,'walk');assert.equal(event.phase,'routine');
  source.x=30;steps.update(.2,{player:p(),mistress:{...walk(source),state:'acting'}});
  const later=steps.ripples[0];assert.equal(later.x,2);assert.equal(later.z,1);
  assert.ok(later.radius>initial.radius&&later.radius<=5);assert.ok(later.opacity<initial.opacity);
  const events=steps.events,cues=steps.cues;events.length=cues.length=0;assert.equal(steps.events.length,1);assert.equal(steps.cues.length,1);
});

test('distance cadence interpolates source and listener at the actual footfall time',()=>{
  const steps=new MistressFootsteps();steps.update(.01,{player:p(),mistress:walk()});
  steps.update(.5,{player:p(1,0,0),mistress:walk(p(2,0,0))});
  assert.equal(steps.events.length,2);close(steps.events[0].time,.26);close(steps.events[0].position.x,1);
  close(steps.events[1].time,.51);close(steps.events[1].position.x,2);
  close(steps.events[0].speed,4);assert.equal(steps.events[0].foot,'left');assert.equal(steps.events[1].foot,'right');
});

test('listener relocation preserves cadence and heard snapshots without hearing a ghost path',()=>{
  const steps=new MistressFootsteps();steps.update(.01,{player:p(-10,0,0),mistress:walk()});
  steps.relocateListener(p(10,0,0));steps.update(1/3.5,{player:p(10,0,0),mistress:walk(p(1,0,0))});
  assert.equal(steps.sequence,0);assert.equal(steps.cueSequence,1);
  steps.relocateListener(p(2,0,0));steps.update(1/3.5,{player:p(2,0,0),mistress:walk(p(2,0,0))});
  assert.equal(steps.sequence,1);assert.equal(steps.events[0].cueId,2);const event=steps.events[0];
  steps.relocateListener(p(30,0,0));assert.equal(steps.events[0],event);assert.equal(steps.sequence,1);
});

test('pause, invalid deltas and reset keep heard and global footstep state consistent',()=>{
  const steps=footfallAt(p(2,0,0)),options={player:p(),mistress:walk(p(2,0,0))};
  const snapshot=()=>JSON.stringify({elapsed:steps.elapsed,sequence:steps.sequence,cueSequence:steps.cueSequence,events:steps.events,cues:steps.cues,ripples:steps.ripples});
  const before=snapshot();for(const dt of [0,-1,NaN,Infinity])steps.update(dt,options);steps.update(20,{...options,active:false});assert.equal(snapshot(),before);
  steps.reset();assert.equal(steps.elapsed,0);assert.equal(steps.sequence,0);assert.equal(steps.cueSequence,0);assert.deepEqual(steps.ripples,[]);
  steps.update(.01,{player:p(),mistress:walk()});assert.equal(steps.cueSequence,0);
  steps.update(1/3.5,{player:p(),mistress:walk(p(1,0,0))});assert.equal(steps.cues[0].id,1);assert.equal(steps.events[0].id,1);
});

test('invalid positions expire old cues, safely rebase and cannot cause an unbounded cadence',()=>{
  const steps=footfallAt(p(2,0,0));
  for(const options of [{},{player:p(),mistress:walk(p(NaN,0,0))}])steps.update(1,options);
  assert.equal(steps.events.length,0);assert.equal(steps.cues.length,0);
  steps.update(.01,{player:p(),mistress:walk()});steps.update(1/3.5,{player:p(),mistress:walk(p(1,0,0))});assert.equal(steps.events.length,1);
  steps.reset();steps.update(Number.MAX_VALUE/2,{player:p(),mistress:walk()});
  assert.equal(steps.events.length,0);assert.equal(steps.cueSequence,0);
});
