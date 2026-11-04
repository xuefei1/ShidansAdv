import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { MistressAI,MISTRESS_ACTIVITIES,MISTRESS_WALK_SPEED,MISTRESS_DOCK_SECONDS,MISTRESS_NOISE_DURATION } from '../src/mistress-ai.js';
import { MistressNavigation } from '../src/mistress-navigation.js';
import { createHouse } from '../src/house.js';
import { createWaterFountains } from '../src/fountains.js';
import { createConsumables } from '../src/consumables.js';
import { SURFACES } from '../src/physics.js';
import { FLOOR_HEIGHT,ROOMS,roomAt } from '../src/layout.js';
import { MAX_NOISE_EVENTS } from '../src/noise.js';

const fakeNavigation=()=>({calls:0,findPath(from,to) {this.calls++;return [{...from},{...to}];}});
const ai=(options={})=>new MistressAI(null,{navigation:fakeNavigation(),random:()=>.5,...options});
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);
const snapshot=actor=>({elapsed:actor.elapsed,state:actor.state,activity:actor.activity,
  activityTime:actor.activityTime,remaining:actor.remaining,position:{...actor.position},
  renderPosition:{...actor.renderPosition},yaw:actor.yaw,poseWeight:actor.poseWeight,
  sequence:actor.noise.sequence,events:actor.noise.events,laughing:actor.laughing,makingNoise:actor.makingNoise});
function advanceUntil(actor,predicate,max=600,step=.1) {
  for(let i=0;i<max/step;i++) {if(predicate(actor)) return;actor.update(step);}
  assert.fail(`Timed out in ${actor.activity}/${actor.state}`);
}

test('mistress starts seated at her phone and keeps her 3.5 m/s routine pace below sprint speeds',()=>{
  const actor=ai();
  assert.equal(actor.activity,'phone');assert.equal(actor.state,'acting');assert.equal(actor.poseWeight,1);
  assert.deepEqual(actor.position,MISTRESS_ACTIVITIES[0].approach);
  assert.deepEqual(actor.renderPosition,MISTRESS_ACTIVITIES[0].seat);
  assert.equal(actor.remaining,32);assert.equal(actor.speed,0);assert.equal(actor.noise.sequence,0);
  assert.equal(MISTRESS_WALK_SPEED,3.5);
  assert.ok(Number.isFinite(MISTRESS_WALK_SPEED)&&MISTRESS_WALK_SPEED>0);
  for(const surface of Object.values(SURFACES)) assert.ok(MISTRESS_WALK_SPEED<surface.run);
});

test('a shuffled cycle visits every activity and does not repeat adjacent actions',()=>{
  const actor=ai(),seen=new Set(['phone']),visits=['phone'];
  let prior='phone';
  for(let second=0;second<550;second+=.1) {
    actor.update(.1);
    if(actor.state==='acting' && actor.activity!==prior) {
      assert.notEqual(actor.activity,visits.at(-1));visits.push(actor.activity);prior=actor.activity;seen.add(actor.activity);
    }
  }
  assert.equal(seen.size,MISTRESS_ACTIVITIES.length);assert.ok(visits.length>=MISTRESS_ACTIVITIES.length);
  for(const id of seen) assert.ok(MISTRESS_ACTIVITIES.some(activity=>activity.id===id));
});

test('routine choices are randomized but complete a bag before repeating',()=>{
  const first=ai({random:()=>0}),last=ai({random:()=>.999});
  advanceUntil(first,actor=>actor.state==='walking');advanceUntil(last,actor=>actor.state==='walking');
  assert.notEqual(first.activity,'phone');assert.notEqual(last.activity,'phone');
  assert.notEqual(first.activity,last.activity);
  const visited=[];
  for(let i=0;i<7000 && visited.length<MISTRESS_ACTIVITIES.length-1;i++) {
    first.update(.1);
    if(first.state==='acting' && visited.at(-1)!==first.activity) visited.push(first.activity);
  }
  assert.equal(new Set(visited).size,MISTRESS_ACTIVITIES.length-1);assert.ok(!visited.includes('phone'));
});

test('phone and new household tasks provide noise cover while the original quiet tasks stay silent',()=>{
  const actor=ai(),events=[];
  actor.update(5.999);assert.equal(actor.noise.sequence,0);assert.equal(actor.laughing,false);
  const first=actor.update(.001)[0];assert.equal(first.kind,'laugh');assert.equal(actor.laughing,true);
  assert.equal(first.source,'mistress');assert.equal(first.scope,'house');assert.equal(first.radius,null);
  assert.equal(first.lifetime,3);assert.ok(Object.isFrozen(first));assert.ok(Object.isFrozen(first.position));
  assert.deepEqual(first.position,actor.renderPosition);
  actor.update(first.lifetime-.001);assert.equal(actor.laughing,true);
  actor.update(.001);assert.equal(actor.laughing,false);
  const kindsByActivity=new Map();
  for(let i=0;i<5500;i++) {
    const activity=actor.activity,state=actor.state;
    const emitted=actor.update(.1);events.push(...emitted);
    if(state==='acting') {
      if(!kindsByActivity.has(activity)) kindsByActivity.set(activity,new Set());
      for(const event of emitted) kindsByActivity.get(activity).add(event.kind);
    }
  }
  assert.ok(events.some(event=>event.kind==='cook'));
  assert.ok(kindsByActivity.get('phone').has('laugh'));assert.ok(kindsByActivity.get('cooking').has('cook'));
  for(const activity of ['eating','laundry','mopping','reading','sleeping']) {
    assert.ok(kindsByActivity.has(activity));assert.equal(kindsByActivity.get(activity).size,0,activity);
  }
  for(const activity of MISTRESS_ACTIVITIES.filter(activity=>activity.noise)) {
    assert.ok(kindsByActivity.get(activity.id)?.has(activity.noise),activity.id);
  }
  const configured=new Set(MISTRESS_ACTIVITIES.map(activity=>activity.noise).filter(Boolean));
  assert.ok(events.every(event=>configured.has(event.kind)));
  assert.ok(MISTRESS_ACTIVITIES.filter(activity=>activity.noise).length>=10,'frequent cover from ten noisy tasks');
});

test('routine noise episodes sample the complete one-to-five-second range from injected randomness',()=>{
  assert.deepEqual(MISTRESS_NOISE_DURATION,[1,5]);
  for(const [random,delay,seconds] of [[0,4,1],[.5,6,3],[1,8,5]]) {
    const actor=ai({random:()=>random}),[event]=actor.update(delay);
    assert.equal(event.kind,'laugh');assert.equal(event.lifetime,seconds);near(event.expiresAt-event.time,seconds);
    assert.equal(actor.laughing,true);actor.update(seconds-.001);assert.equal(actor.laughing,true);
    assert.equal(actor.noise.events.includes(event),true);
    actor.update(.001);assert.equal(actor.laughing,false);assert.equal(actor.noise.events.includes(event),false);
  }
});

test('each episode chooses its own duration and leaves a real quiet interval before the next',()=>{
  let random=.5;const actor=ai({random:()=>random});
  random=0;const first=actor.update(6)[0];assert.equal(first.lifetime,1);
  actor.update(1);assert.equal(actor.laughing,false);assert.deepEqual(actor.noise.events,[]);
  actor.update(3.999);assert.equal(actor.noise.sequence,1);assert.equal(actor.laughing,false);
  random=1;const second=actor.update(.001)[0];assert.equal(second.lifetime,5);
  near(second.time-first.expiresAt,4);assert.equal(actor.noise.sequence,2);
});

test('all noisy chores use the selected duration without merging long episodes into permanent cover',()=>{
  for(const activity of MISTRESS_ACTIVITIES.filter(activity=>activity.noise)) {
    const actor=ai({random:()=>1});actor.activity=activity.id;actor._startActing();
    // Keep the chosen task in progress while testing two complete episodes.
    actor._duration=60;
    const interval=activity.interval[1],first=actor.update(interval)[0];
    assert.equal(first.kind,activity.noise);assert.equal(first.lifetime,5);
    actor.update(4.999);assert.equal(actor.noise.canHear(first,{x:0,y:0,z:0}),true,activity.id);
    actor.update(.001);assert.equal(actor.noise.events.length,0,`${activity.id} becomes quiet at the exact expiry`);
    actor.update(interval-.001);assert.equal(actor.noise.sequence,1,`${activity.id} has a quiet gap`);
    const second=actor.update(.001)[0];near(second.time-first.expiresAt,interval);
  }
});

test('changing tasks stops the active episode while preserving its existing quiet gap',()=>{
  const actor=ai(),[first]=actor.update(6);assert.equal(first.kind,'laugh');actor.update(1);
  assert.equal(actor.makingNoise,true);near(first.expiresAt,9);
  // A new task cancels the old cue immediately. Its initial noise delay must
  // still respect the quiet deadline rather than emit a replacement at once.
  actor.activity='typing';actor._startActing();actor._duration=60;
  assert.equal(actor.makingNoise,false);assert.equal(actor.noise.canHear(first,{x:0,y:0,z:0}),false);
  actor.update(7.999);assert.deepEqual(actor.noise.events,[]);assert.equal(actor.noise.sequence,1);
  const next=actor.update(.001)[0];assert.equal(next.kind,'typing');near(next.time,15);
  near(next.time-first.expiresAt,6);
});

test('leaving a noisy activity immediately cancels its unfinished episode and any delayed emitted cue',()=>{
  for(const coarse of [true,false]) {
    const actor=ai();actor._duration=7;let event;
    if(coarse)assert.deepEqual(actor.update(7),[],'a coarse step must not return a cue cancelled before the step ended');
    else {
      [event]=actor.update(6);assert.equal(actor.makingNoise,true);actor.update(.999);assert.equal(actor.laughing,true);
      actor.update(.001);assert.equal(actor.noise.canHear(event,{x:0,y:0,z:0}),false);
    }
    assert.equal(actor.state,'leaving');assert.equal(actor.makingNoise,false);assert.equal(actor.laughing,false);
    assert.deepEqual(actor.noise.events,[]);assert.equal(actor.noise.sequence,1);near(actor.elapsed,7);
    actor.update(MISTRESS_DOCK_SECONDS);assert.equal(actor.state,'walking');assert.equal(actor.makingNoise,false);assert.deepEqual(actor.noise.events,[]);
  }
});

test('an explicit routine interruption silences noise without resetting routes, time, IDs or quiet deadlines',()=>{
  const actor=ai(),[event]=actor.update(6),before=snapshot(actor),bag=[...actor._bag],deadline=actor._noiseReadyAt;
  assert.equal(actor.makingNoise,true);actor.stopNoise();
  assert.equal(actor.makingNoise,false);assert.equal(actor.laughing,false);assert.deepEqual(actor.noise.events,[]);
  assert.equal(actor.noise.canHear(event,{x:0,y:0,z:0}),false);assert.equal(actor.noise.sequence,before.sequence);
  near(actor.elapsed,before.elapsed);near(actor.noise.elapsed,before.elapsed);assert.equal(actor.state,before.state);assert.equal(actor.activity,before.activity);
  assert.deepEqual(actor.position,before.position);assert.deepEqual(actor._bag,bag);assert.equal(actor._noiseReadyAt,deadline);
});

test('mistress noises are audible across both house floors but expire and do not reach yards',()=>{
  const actor=ai(),event=actor.update(6)[0];
  for(const listener of [{x:-23,y:0,z:19},{x:23,y:FLOOR_HEIGHT,z:-19}]) {
    assert.equal(actor.noise.canHear(event,listener),true);assert.deepEqual(actor.noise.audibleTo(listener),[event]);
  }
  assert.equal(actor.noise.canHear(event,{x:0,y:0,z:25}),false);
  actor.update(event.lifetime);assert.equal(actor.noise.canHear(event,{x:0,y:0,z:0}),false);
  assert.deepEqual(actor.noise.events,[]);
});

test('walking follows 3D waypoints without overshoot or per-frame path searches',()=>{
  const actor=ai();advanceUntil(actor,a=>a.state==='walking');
  const path=actor.route,calls=actor.navigation.calls,from={...actor.position};
  assert.ok(path.length>=2);actor.update(.2);
  near(Math.hypot(actor.position.x-from.x,actor.position.y-from.y,actor.position.z-from.z),.2*MISTRESS_WALK_SPEED);
  assert.equal(actor.navigation.calls,calls);assert.equal(actor.speed,MISTRESS_WALK_SPEED);assert.equal(actor.poseWeight,0);
  advanceUntil(actor,a=>a.state==='entering' || a.state==='acting');
  assert.deepEqual(actor.position,actor.definition.approach);
  assert.ok(actor.speed<=MISTRESS_WALK_SPEED);
});

test('docking gradually moves between the approach and furniture, then leaves before route walking',()=>{
  const actor=ai({random:()=>.999});actor._bag=['reading'];actor.update(actor.remaining);
  assert.equal(actor.state,'leaving');const start={...actor.renderPosition};
  actor.update(MISTRESS_DOCK_SECONDS/2);
  assert.equal(actor.state,'leaving');near(actor.poseWeight,.5);
  near(actor.renderPosition.z,(start.z+actor.position.z)/2);
  assert.ok(actor.speed>0 && actor.speed<MISTRESS_WALK_SPEED);
  actor.update(MISTRESS_DOCK_SECONDS/2);
  assert.equal(actor.state,'walking');assert.equal(actor.poseWeight,0);
  assert.deepEqual(actor.renderPosition,actor.position);
  const destination=actor.definition.approach;
  actor.update(Math.hypot(destination.x-actor.position.x,destination.y-actor.position.y,destination.z-actor.position.z)/MISTRESS_WALK_SPEED);
  assert.equal(actor.state,'entering');
  const approach={...actor.renderPosition};actor.update(MISTRESS_DOCK_SECONDS/2);
  near(actor.poseWeight,.5);assert.notDeepEqual(actor.renderPosition,approach);
  actor.update(MISTRESS_DOCK_SECONDS/2);
  assert.equal(actor.state,'acting');assert.equal(actor.poseWeight,1);assert.equal(actor.speed,0);
  assert.deepEqual(actor.renderPosition,actor.definition.seat);
});

test('pauses and invalid deltas freeze routes, activity timers and noise lifetime',()=>{
  const actor=ai();actor.update(6);const before=snapshot(actor);
  for(const dt of [0,-1,NaN,Infinity]) assert.deepEqual(actor.update(dt),[]);
  assert.deepEqual(actor.update(30,{active:false}),[]);assert.deepEqual(snapshot(actor),before);
  actor.update(.1);near(actor.elapsed,6.1);assert.equal(actor.noise.events.length,1);
});

test('regular and delayed updates preserve routine chronology without stale noise bursts',()=>{
  const fine=ai(),coarse=ai();
  for(let i=0;i<3000;i++) fine.update(.1);
  const emitted=coarse.update(300);
  assert.equal(coarse.activity,fine.activity);assert.equal(coarse.state,fine.state);
  near(coarse.position.x,fine.position.x);near(coarse.position.y,fine.position.y);near(coarse.position.z,fine.position.z);
  near(coarse.activityTime,fine.activityTime);near(coarse.poseWeight,fine.poseWeight);
  assert.equal(coarse.noise.sequence,fine.noise.sequence);
  assert.ok(emitted.every(event=>event.expiresAt>coarse.elapsed));
  assert.ok(coarse.noise.events.length<=MAX_NOISE_EVENTS);assert.deepEqual(emitted,coarse.noise.events);
});

test('reset returns to the couch and clears routes, sounds and elapsed time',()=>{
  const actor=ai();actor.update(260);assert.ok(actor.elapsed>0);actor.reset();
  assert.deepEqual(snapshot(actor),snapshot(ai()));assert.equal(actor.speed,0);assert.equal(actor.laughing,false);
  assert.equal(actor.blocked,false);assert.deepEqual(actor.route,[]);
});

test('disconnected destinations keep the mistress safe and retry without teleporting',()=>{
  const navigation={findPath:()=>[]},actor=ai({navigation});
  actor.update(actor.remaining+MISTRESS_DOCK_SECONDS);
  assert.equal(actor.blocked,true);assert.equal(actor.state,'acting');assert.equal(actor.activity,'phone');
  assert.deepEqual(actor.position,MISTRESS_ACTIVITIES[0].approach);
  assert.ok(actor.renderPosition.x===MISTRESS_ACTIVITIES[0].seat.x);assert.equal(actor.remaining,5);
});

test('all real furnished-house activities are reachable and the full routine uses the stairs safely',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);createConsumables(scene,world);
  const navigation=new MistressNavigation(world),actor=new MistressAI(world,{navigation,random:()=>.5});
  const visited=new Set(['phone']);let stairSamples=0;
  for(const activity of MISTRESS_ACTIVITIES) assert.equal(navigation.canStand(activity.approach),true,activity.id);
  for(let i=0;i<5500;i++) {
    const before=actor.state;actor.update(.1);
    if(actor.state==='acting') visited.add(actor.activity);
    if(actor.state==='walking') {
      assert.equal(navigation.canStand(actor.position),true,`${actor.activity} at ${JSON.stringify(actor.position)}`);
      assert.equal(actor.makingNoise,false,'walking, including stairs, cannot retain noise cover from the previous chore');
      assert.deepEqual(actor.noise.events,[]);
      if(actor.position.y>0 && actor.position.y<FLOOR_HEIGHT) stairSamples++;
    }
    assert.equal(actor.blocked,false);
    assert.ok(actor.speed<=MISTRESS_WALK_SPEED+1e-8);
    if(before==='walking' && actor.state==='walking') assert.deepEqual(actor.position,actor.renderPosition);
  }
  assert.equal(visited.size,MISTRESS_ACTIVITIES.length);assert.ok(stairSamples>0);
});

test('authored routine stops cover every existing aboveground room, balcony and both yards',()=>{
  const covered=new Set();
  for(const activity of MISTRESS_ACTIVITIES) {
    const at=activity.approach;
    assert.equal(roomAt(at.x,at.y,at.z)?.id,activity.room,activity.id);
    assert.equal(typeof activity.animation,'string');covered.add(activity.room);
  }
  assert.deepEqual([...covered].sort(),ROOMS.filter(room=>room.floor>=0).map(room=>room.id).sort());
});

test('resuming after a scold starts a random journey at the den stance without resetting time or noise IDs',()=>{
  const actor=ai(),origin={x:-11.4,y:0,z:12},[event]=actor.update(6);
  const sequence=actor.noise.sequence;
  assert.equal(actor.resumeFrom(origin,{yaw:1.3,elapsed:6.1}),true);
  assert.equal(actor.elapsed,6.1);assert.equal(actor.noise.elapsed,6.1);assert.equal(actor.noise.sequence,sequence);
  assert.deepEqual(actor.position,origin);assert.deepEqual(actor.renderPosition,origin);
  assert.equal(actor.state,'walking');assert.equal(actor.poseWeight,0);assert.equal(actor.yaw,1.3);
  assert.notEqual(actor.activity,'phone');assert.deepEqual(actor.noise.events,[]);assert.equal(actor.laughing,false);assert.equal(actor.makingNoise,false);
  assert.equal(actor.noise.canHear(event,{x:0,y:0,z:0}),false,'resuming movement cancels a still-live episode');
  assert.deepEqual(actor.route[0],origin);
  actor.update(.1);near(Math.hypot(actor.position.x-origin.x,actor.position.y-origin.y,actor.position.z-origin.z),.35);
  advanceUntil(actor,a=>a.noise.sequence>sequence);
  assert.ok(actor.noise.events.every(event=>event.id>sequence));
});

test('failed resume routing never snaps a standing mistress into a distant furniture pose',()=>{
  const actor=ai({navigation:{findPath:()=>[]}}),before=snapshot(actor);
  assert.equal(actor.resumeFrom({x:-11.4,y:0,z:12}),false);assert.deepEqual(snapshot(actor),before);
  assert.equal(actor.resumeFrom({x:NaN,y:0,z:12}),false);assert.deepEqual(snapshot(actor),before);
});
