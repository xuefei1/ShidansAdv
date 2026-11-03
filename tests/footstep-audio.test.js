import test from 'node:test';
import assert from 'node:assert/strict';
import {Sound,MISTRESS_STEP_AUDIO_RANGE,MAX_FOOTSTEP_AUDIO_AGE} from '../src/audio.js';
import {MistressFootsteps} from '../src/mistress-awareness.js';

const listener={x:0,y:0,z:0};
const footstep=(time=0,overrides={})=>Object.freeze({id:1,cueId:1,source:'mistress',kind:'footstep',
  position:Object.freeze({x:0,y:0,z:0}),time,lifetime:1.2,expiresAt:time+1.2,
  speed:3.5,phase:'routine',gait:'walk',strength:1,foot:'left',scope:'local',radius:5,...overrides});
function recorder() {
  const sound=new Sound(),tones=[];sound.context={state:'running'};
  sound.tone=(frequency,duration,gain,slide,delay=0)=>tones.push({frequency,duration,gain,slide,delay});return {sound,tones};
}

test('routine, search and chase have distinct heel/toe cues with a firmer and tighter running impact',()=>{
  const profiles={};
  for(const [phase,gait]of [['routine','walk'],['search','search'],['chase','run']]) {
    const {sound,tones}=recorder();assert.equal(sound.mistressFootstep(footstep(0,{phase,gait}),listener,0),true);
    assert.equal(tones.length,2);profiles[phase]=tones;assert.equal(sound.diagnostics.lastFootstep.phase,phase);
  }
  assert.ok(profiles.chase[0].gain>profiles.routine[0].gain);assert.ok(profiles.routine[0].gain>profiles.search[0].gain);
  assert.ok(profiles.chase[1].delay<profiles.routine[1].delay);assert.ok(profiles.routine[1].delay<profiles.search[1].delay);
  assert.notEqual(profiles.chase[0].frequency,profiles.search[0].frequency);
});

test('footstep audio fades smoothly with full 3D distance and is not limited by the minimap radius',()=>{
  const levels=[];
  for(const distance of [0,5,10,15,18]) {
    const {sound,tones}=recorder(),played=sound.mistressFootstep(footstep(),{x:distance,y:0,z:0},0);
    assert.equal(played,distance<18);levels.push(tones[0]?.gain??0);
  }
  for(let i=1;i<levels.length;i++)assert.ok(levels[i]<levels[i-1]);
  const horizontal=recorder(),vertical=recorder();
  horizontal.sound.mistressFootstep(footstep(),{x:10,y:0,z:0},0);vertical.sound.mistressFootstep(footstep(),{x:0,y:10,z:0},0);
  assert.equal(horizontal.tones[0].gain,vertical.tones[0].gain);
  assert.deepEqual(MISTRESS_STEP_AUDIO_RANGE,{routine:18,search:18,run:22});
  for(const [distance,expected]of [[20,true],[22,false],[23,false]]) {
    const {sound}=recorder();assert.equal(sound.mistressFootstep(footstep(0,{phase:'chase',gait:'run'}),{x:distance,y:0,z:0},0),expected);
  }
});

test('measured movement speed and strength affect impact without inventing extra footfalls',()=>{
  const slow=recorder(),fast=recorder();
  slow.sound.mistressFootstep(footstep(0,{speed:2}),listener,0);
  fast.sound.mistressFootstep(footstep(0,{speed:7}),listener,0);
  assert.equal(slow.tones.length,2);assert.equal(fast.tones.length,2);
  assert.ok(fast.tones[0].gain>slow.tones[0].gain);assert.ok(fast.tones[0].frequency>slow.tones[0].frequency);
  assert.equal(fast.sound.diagnostics.lastFootstep.speed,7);
});

test('duplicate, out-of-order, stale and simultaneous historical cues cannot create an audio burst',()=>{
  const {sound,tones}=recorder(),first=footstep(0);
  assert.equal(sound.mistressFootstep(first,listener,0),true);assert.equal(sound.mistressFootstep(first,listener,.1),false);
  assert.equal(sound.mistressFootstep(footstep(.05),listener,.05),true);
  assert.equal(sound.mistressFootstep(footstep(.04),listener,.06),false,'an older cue cannot replay after a newer one');
  assert.equal(sound.mistressFootstep(footstep(.1),listener,1),false,'old live ripple snapshots are not current audio');
  assert.equal(sound.mistressFootstep(footstep(1),listener,1),true);
  assert.equal(sound.mistressFootstep(footstep(1,{id:2}),listener,1),false,'one current audio cue per active instant');
  assert.equal(tones.length,6);assert.equal(sound.diagnostics.footstepsPlayed,3);
  const edge=recorder();assert.equal(edge.sound.mistressFootstep(footstep(),listener,MAX_FOOTSTEP_AUDIO_AGE),true);
  assert.equal(recorder().sound.mistressFootstep(footstep(),listener,MAX_FOOTSTEP_AUDIO_AGE+.00001),false);
});

test('muted and locked footsteps are discarded and fresh rounds can reuse cue IDs and time zero',()=>{
  const {sound,tones}=recorder(),muted=footstep(0);sound.enabled=false;
  assert.equal(sound.mistressFootstep(muted,listener,0),false);sound.enabled=true;
  assert.equal(sound.mistressFootstep(muted,listener,.1),false);
  const locked=footstep(1);sound.context=null;assert.equal(sound.mistressFootstep(locked,listener,1),false);
  sound.context={state:'running'};assert.equal(sound.mistressFootstep(locked,listener,1.1),false);
  const old=footstep(100);assert.equal(sound.mistressFootstep(old,listener,100),true);
  assert.equal(sound.mistressFootstep(footstep(0),listener,0),true,'new object identity can start the next round');
  assert.equal(sound.mistressFootstep(old,listener,0),false);assert.equal(tones.length,4);
});

test('invalid or stationary footstep metadata never schedules audio',()=>{
  const {sound,tones}=recorder();
  for(const cue of [null,{},footstep(0,{kind:'eat'}),footstep(0,{source:'shidan'}),
    footstep(0,{speed:0}),footstep(0,{speed:NaN}),footstep(0,{position:{x:Infinity,y:0,z:0}}),footstep(1)]) {
    assert.equal(sound.mistressFootstep(cue,listener,0),false);
  }
  assert.equal(sound.mistressFootstep(footstep(),{x:NaN,y:0,z:0},0),false);assert.equal(tones.length,0);
});

test('all-footfall cues remain audible beyond five metres without exposing a minimap location',()=>{
  const {sound,tones}=recorder(),steps=new MistressFootsteps(),player={x:0,y:0,z:10};
  const mistress={position:{x:0,y:0,z:0},state:'walking',speed:3.5,phase:'routine'};
  steps.update(.1,{player,mistress});mistress.position={x:1.05,y:0,z:0};steps.update(.3,{player,mistress});
  assert.equal(steps.events.length,0);assert.ok(steps.cues.length>0);
  const cue=steps.cues.at(-1);assert.equal(sound.mistressFootstep(cue,player,steps.elapsed),true);assert.equal(tones.length,2);
  assert.ok(sound.diagnostics.lastFootstep.distance>5);assert.equal(sound.diagnostics.lastFootstep.gait,'walk');
});
