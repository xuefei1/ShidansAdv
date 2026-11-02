import test from 'node:test';
import assert from 'node:assert/strict';
import {Sound} from '../src/audio.js';

const point={x:0,y:0,z:0};
const event=(kind='laugh',seconds=5)=>({id:1,source:'mistress',kind,position:point,time:0,expiresAt:seconds});
function recorder() {
  const sound=new Sound(),tones=[];
  sound.enabled=true;sound.context={};
  sound.tone=(frequency,duration,gain,slide,delay=0)=>tones.push({frequency,duration,gain,slide,delay});
  return {sound,tones};
}

test('optional household sound continues throughout a long episode and stops at its expiry',()=>{
  const {sound,tones}=recorder(),noise=event();
  sound.householdEpisode(noise,0,point);assert.ok(tones.length>0);
  tones.length=0;sound.householdEpisode(noise,4,point);assert.ok(tones.length>0,'a long laugh is still audible four seconds later');
  tones.length=0;sound.householdEpisode(noise,5,point);assert.equal(tones.length,0);
  sound.householdEpisode(null,6,point);assert.equal(tones.length,0);
});

test('paused time and delayed frames never queue a backlog of household sounds',()=>{
  const {sound,tones}=recorder(),noise=event();
  sound.householdEpisode(noise,0,point);const singleCue=tones.length;
  for(let i=0;i<100;i++)sound.householdEpisode(noise,0,point);
  assert.equal(tones.length,singleCue,'no new sounds while active time is frozen');
  sound.householdEpisode(noise,4,point);assert.equal(tones.length,singleCue*2,'a late frame plays one current cue');
  sound.householdEpisode(noise,4.1,point);assert.equal(tones.length,singleCue*2);
});

test('laugh, cooking and chore tones are clipped to the remaining noise window',()=>{
  for(const kind of ['laugh','cook','hum','rustle','water','typing','shake','garden','sweep']) {
    const {sound,tones}=recorder(),noise=event(kind);
    sound.householdEpisode(noise,4.95,point);assert.ok(tones.length>0,kind);
    for(const tone of tones)assert.ok(tone.delay+tone.duration<=.050000001,`${kind} plays beyond its cover window`);
  }
});

test('a fresh round can replay a new episode even when its numerical ID is reused',()=>{
  const {sound,tones}=recorder();
  sound.householdEpisode({...event(),expiresAt:305},300,point);const count=tones.length;
  sound.householdEpisode(event(),0,point);assert.equal(tones.length,count*2);
});

test('muted household audio remains silent and distance attenuates optional cues',()=>{
  const {sound,tones}=recorder(),noise=event();sound.enabled=false;
  sound.householdEpisode(noise,0,point);assert.equal(tones.length,0);
  sound.enabled=true;sound.householdEpisode(noise,0,point);const near=tones[0].gain;
  tones.length=0;sound.householdEpisode(noise,1,{x:100,y:0,z:0});assert.ok(tones[0].gain<near);
});
