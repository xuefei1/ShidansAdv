import test from 'node:test';
import assert from 'node:assert/strict';
import {Sound} from '../src/audio.js';

function context(state='suspended') {
  const voices=[],parameter=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
  return {state,currentTime:12,destination:{},voices,resumes:0,
    resume(){this.resumes++;this.state='running';return Promise.resolve();},
    createOscillator(){const voice={frequency:parameter(),stops:[],connect(){},disconnect(){},start(){},stop(time){this.stops.push(time);}};voices.push(voice);return voice;},
    createGain(){return {gain:parameter(),connect(){},disconnect(){}};},
    createDynamicsCompressor(){return {threshold:parameter(),knee:parameter(),ratio:parameter(),attack:parameter(),release:parameter(),connect(){}};},
    createWaveShaper(){return {connect(){}};},
  };
}

test('sound defaults on but creating and using the sound object never unlocks audio implicitly',async()=>{
  let created=0;const sound=new Sound({createContext:()=>{created++;return context();}});
  assert.equal(sound.enabled,true);assert.equal(sound.context,null);assert.equal(sound.diagnostics.contextState,'locked');
  sound.hop(true);sound.land();sound.step(true);sound.chime();assert.equal(created,0);
  assert.equal(await sound.unlock(),true);assert.equal(created,1);assert.equal(sound.context.resumes,1);
  assert.equal(await sound.unlock(),true);assert.equal(created,1);assert.equal(sound.context.resumes,1);
});

test('muting before unlock prevents context creation and later gestures do not re-enable the preference',async()=>{
  let created=0;const sound=new Sound({createContext:()=>{created++;return context();}});
  assert.equal(sound.toggle(),false);assert.equal(await sound.unlock(),false);
  assert.equal(sound.enabled,false);assert.equal(created,0);assert.equal(sound.context,null);
  assert.equal(sound.toggle(),true);await sound.unlock();assert.equal(created,1);assert.equal(sound.context.state,'running');
  assert.equal(sound.toggle(),false);sound.context.state='suspended';const resumes=sound.context.resumes;
  assert.equal(await sound.unlock(),false);assert.equal(sound.context.resumes,resumes);assert.equal(sound.enabled,false);
});

test('simultaneous gesture unlocks share one resume and muting during it remains muted',async()=>{
  const audio=context();let release;
  audio.resume=function(){this.resumes++;return new Promise(resolve=>{release=()=>{this.state='running';resolve();};});};
  const sound=new Sound({createContext:()=>audio}),first=sound.unlock(),second=sound.unlock();
  assert.equal(first,second);assert.equal(audio.resumes,1);
  sound.toggle();release();assert.equal(await first,false);assert.equal(sound.enabled,false);
  assert.equal(audio.voices.length,0,'resuming never schedules a muted chime');
});

test('unsupported audio and rejected resume resolve safely without unhandled failures',async()=>{
  for(const createContext of [()=>null,()=>{throw Error('unavailable');},()=>{
    const audio=context();audio.resume=()=>Promise.reject(Error('gesture required'));return audio;
  }]) {
    const sound=new Sound({createContext});assert.equal(await sound.unlock(),false);
    assert.equal(sound.enabled,true);assert.equal(sound.diagnostics.unlockFailures,1);
  }
});

test('mute stops already scheduled notes and unlock diagnostics are read-only',async()=>{
  const audio=context('running'),sound=new Sound({createContext:()=>audio});await sound.unlock();sound.chime();
  assert.equal(audio.voices.length,3);assert.equal(sound.toggle(),false);
  for(const voice of audio.voices)assert.equal(voice.stops.at(-1),audio.currentTime);
  const diagnostics=sound.diagnostics;assert.ok(Object.isFrozen(diagnostics));
  assert.throws(()=>{diagnostics.enabled=true;},TypeError);assert.equal(sound.enabled,false);
});

test('a closed context is recreated on the next enabled gesture',async()=>{
  const contexts=[],sound=new Sound({createContext:()=>{const audio=context('running');contexts.push(audio);return audio;}});
  await sound.unlock();sound.context.state='closed';assert.equal(await sound.unlock(),true);
  assert.equal(contexts.length,2);assert.equal(sound.context,contexts[1]);
});
