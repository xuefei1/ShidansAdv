import test from 'node:test';
import assert from 'node:assert/strict';
import {MistressFootsteps,MISTRESS_FOOTSTEP_STRIDES,MAX_MISTRESS_FOOTSTEPS,MISTRESS_FOOTSTEP_SECONDS} from '../src/mistress-awareness.js';

const p=(x=0,y=0,z=0)=>({x,y,z});
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,String(a)+' differs from '+String(b));
const actor=(position,speed=3.5,phase='routine',state='walking')=>({position,speed,phase,state});
function simulate(speed,phase,fps,seconds) {
  const steps=new MistressFootsteps();steps.update(.001,{player:p(0,0,2),mistress:actor(p(),speed,phase)});
  for(let frame=1;frame<=fps*seconds;frame++) {
    const position=p(speed*frame/fps);steps.update(1/fps,{player:{...position,z:2},mistress:actor(position,speed,phase)});
  }
  return steps;
}

test('walking and chasing cadence follows actual distance independently of frame rate',()=>{
  for(const [speed,phase,gait] of [[3.5,'routine','walk'],[3.5,'search','search'],[5.74,'chase','run'],[8.8,'chase','run']]) {
    const reference=simulate(speed,phase,120,3),expected=Math.floor(speed*3/MISTRESS_FOOTSTEP_STRIDES[gait]+1e-8);
    assert.equal(reference.cueSequence,expected);assert.equal(reference.sequence,expected);
    for(const fps of [5,10,30,60]) {
      const actual=simulate(speed,phase,fps,3);assert.equal(actual.cueSequence,expected);assert.equal(actual.sequence,expected);
      assert.deepEqual(actual.cues.map(cue=>cue.id),reference.cues.map(cue=>cue.id));
      for(let index=0;index<actual.cues.length;index++) {
        near(actual.cues[index].time,reference.cues[index].time);near(actual.cues[index].position.x,reference.cues[index].position.x);
        near(actual.cues[index].speed,speed);
      }
    }
  }
});

test('search has cautious steps and a faster chase emits more and firmer footsteps',()=>{
  const routine=simulate(3.5,'routine',60,3),search=simulate(3.5,'search',60,3),chase=simulate(5.74,'chase',60,3);
  assert.ok(chase.cueSequence>search.cueSequence&&search.cueSequence>routine.cueSequence);
  assert.equal(routine.cues[0].gait,'walk');assert.equal(search.cues[0].gait,'search');assert.equal(chase.cues[0].gait,'run');
  assert.ok(chase.cues[0].strength>routine.cues[0].strength);assert.ok(routine.cues[0].strength>search.cues[0].strength);
  assert.ok(simulate(8.8,'chase',60,3).cueSequence>chase.cueSequence,'faster rage travel increases cadence naturally');
});

test('accelerating footsteps begin slowly and tighten with measured travel rather than nominal speed',()=>{
  const steps=new MistressFootsteps();steps.update(.001,{player:p(0,0,2),mistress:actor(p(),0,'chase')});
  const all=[];
  for(let frame=1;frame<=180;frame++) {
    const t=frame/60,speed=Math.min(6,4*t),x=t<=1.5?2*t*t:4.5+6*(t-1.5);
    all.push(...steps.update(1/60,{player:p(x,0,2),mistress:actor(p(x),speed,'chase')}));
  }
  assert.equal(steps.cueSequence,Math.floor(13.5/MISTRESS_FOOTSTEP_STRIDES.run));
  assert.ok(all[1].time-all[0].time>all.at(-1).time-all.at(-2).time);
  assert.ok(all[0].speed<all.at(-1).speed);near(all.at(-1).speed,6);
  const limited=new MistressFootsteps();limited.update(.001,{player:p(),mistress:actor(p(),3.5)});
  for(let frame=1;frame<=240;frame++) {
    const x=1.75*frame/60;limited.update(1/60,{player:p(x,0,2),mistress:actor(p(x),3.5)});
  }
  assert.equal(limited.cueSequence,7);near(limited.cues[0].speed,1.75);
});

test('corner stops, idle time and gait changes cannot generate a stationary pulse or double step',()=>{
  const steps=new MistressFootsteps();steps.update(.01,{player:p(),mistress:actor(p())});
  steps.update(.2,{player:p(),mistress:actor(p(.9))});assert.equal(steps.cueSequence,0);
  for(let frame=0;frame<30;frame++)steps.update(1/60,{player:p(),mistress:actor(p(.9),0,'chase')});
  assert.equal(steps.cueSequence,0);
  steps.update(.1,{player:p(),mistress:actor(p(1),5.74,'chase')});assert.equal(steps.cueSequence,0);
  steps.update(.015/5.74,{player:p(),mistress:actor(p(1.015),5.74,'chase')});assert.equal(steps.cueSequence,1);
  for(let frame=0;frame<60;frame++)steps.update(1/60,{player:p(),mistress:actor(p(1.015),5.74,'chase')});
  assert.equal(steps.cueSequence,1,'nominal chase speed cannot make sound while blocked at the same position');
  steps.update(.1,{player:p(),mistress:actor(p(1.015),0,'routine','idle')});
  steps.update(.1,{player:p(),mistress:actor(p(1.5),3.5)});assert.equal(steps.cueSequence,1);
});

test('global cues remain available beyond five metres without leaking a hidden minimap location',()=>{
  const steps=new MistressFootsteps();steps.update(.01,{player:p(20),mistress:actor(p())});
  steps.update(1/3.5,{player:p(20),mistress:actor(p(1))});
  assert.equal(steps.cueSequence,1);assert.equal(steps.cues.length,1);assert.equal(steps.sequence,0);assert.equal(steps.events.length,0);assert.equal(steps.ripples.length,0);
  const cue=steps.cues[0];assert.equal(cue.radius,5);assert.equal(cue.phase,'routine');assert.ok(Number.isFinite(cue.speed));
  steps.update(1/3.5,{player:p(2),mistress:actor(p(2))});
  assert.equal(steps.cueSequence,2);assert.equal(steps.sequence,1);assert.equal(steps.events[0].cueId,2);assert.equal(steps.cues.at(-1).id,2);
});

test('source and listener teleports never synthesize an audible trail through intervening rooms',()=>{
  const steps=new MistressFootsteps();steps.update(.01,{player:p(-10),mistress:actor(p())});
  steps.update(1/3.5,{player:p(10),mistress:actor(p(1))});
  assert.equal(steps.sequence,0,'the listening path is rebased when a player teleports across the actor');assert.equal(steps.cueSequence,1);
  steps.update(.01,{player:p(100),mistress:actor(p(100))});assert.equal(steps.cueSequence,1,'actor teleport is not a movement segment');
  steps.update(1/3.5,{player:p(101),mistress:actor(p(101))});assert.equal(steps.cueSequence,2);assert.equal(steps.cues.at(-1).position.x,101);
  steps.update(3,{player:p(),mistress:actor(p(-16,0,12),0,'scolding','acting')});
  assert.equal(steps.cues.length,0);assert.equal(steps.events.length,0);
});

test('coarse frames keep only current bounded cues and do not replay missed footsteps later',()=>{
  const fine=simulate(3.5,'routine',60,3),coarse=new MistressFootsteps();
  coarse.update(.001,{player:p(0,0,2),mistress:actor(p())});coarse.update(3,{player:p(10.5,0,2),mistress:actor(p(10.5))});
  assert.equal(coarse.cueSequence,fine.cueSequence);assert.deepEqual(coarse.cues.map(cue=>cue.id),fine.cues.map(cue=>cue.id));
  for(let index=0;index<coarse.cues.length;index++)near(coarse.cues[index].time,fine.cues[index].time);
  const fast=new MistressFootsteps();fast.update(.01,{player:p(),mistress:actor(p(),1000,'chase')});
  fast.update(1,{player:p(1000),mistress:actor(p(1000),1000,'chase')});
  assert.ok(fast.cueSequence>MAX_MISTRESS_FOOTSTEPS);assert.equal(fast.cues.length,MAX_MISTRESS_FOOTSTEPS);
  assert.ok(fast.events.length<=MAX_MISTRESS_FOOTSTEPS);assert.ok(fast.cues.every(cue=>cue.expiresAt>fast.elapsed));
  const count=fast.cueSequence;assert.deepEqual(fast.update(.1,{player:p(1000),mistress:actor(p(1000),1000,'chase')}),[]);assert.equal(fast.cueSequence,count);
  fast.update(MISTRESS_FOOTSTEP_SECONDS,{player:p(1000),mistress:actor(p(1000),0,'routine','idle')});assert.equal(fast.cues.length,0);
});

test('all-step cues do not require a valid listener, but invalid data cannot grow heard state',()=>{
  const steps=new MistressFootsteps();steps.update(.01,{mistress:actor(p())});
  steps.update(1/3.5,{player:p(NaN),mistress:actor(p(1))});assert.equal(steps.cueSequence,1);assert.equal(steps.sequence,0);
  steps.update(1,{player:p(),mistress:actor(p(Infinity))});assert.equal(steps.cueSequence,1);
  steps.update(1,{player:p(),mistress:actor(p())});assert.equal(steps.cueSequence,1,'recovering from bad data only primes the source');
});
