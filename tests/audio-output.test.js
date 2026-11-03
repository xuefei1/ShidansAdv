import test from 'node:test';
import assert from 'node:assert/strict';
import {Sound,EFFECTS_GAIN,MASTER_GAIN,MAX_VOLUME} from '../src/audio.js';

function context() {
  const parameters=()=>({events:[],setValueAtTime(value,time){this.events.push({kind:'set',value,time});},
    linearRampToValueAtTime(value,time){this.events.push({kind:'linear',value,time});},
    exponentialRampToValueAtTime(value,time){this.events.push({kind:'exponential',value,time});}});
  const gains=[],compressors=[],shapers=[],voices=[];
  return {state:'running',currentTime:1,destination:{},gains,compressors,shapers,voices,
    createGain(){const node={gain:parameters(),connections:[],connect(target){this.connections.push(target);},disconnect(){}};gains.push(node);return node;},
    createDynamicsCompressor(){const node={connect(target){this.target=target;}};for(const name of ['threshold','knee','ratio','attack','release'])node[name]=parameters();compressors.push(node);return node;},
    createWaveShaper(){const node={connect(target){this.target=target;}};shapers.push(node);return node;},
    createOscillator(){const node={frequency:parameters(),connect(target){this.target=target;},disconnect(){},start(){},stop(){}};voices.push(node);return node;},
  };
}

test('volume can be configured before unlock without creating a context or changing mute',()=>{
  let created=0;const sound=new Sound({createContext:()=>{created++;return context();}});
  assert.equal(sound.volume,1);assert.equal(sound.diagnostics.volume,1);
  assert.equal(sound.setVolume(2.5),2.5);assert.equal(sound.setVolume(20),MAX_VOLUME);
  assert.equal(sound.setVolume(-1),0);assert.equal(sound.setVolume(NaN),0);assert.equal(sound.setVolume(Infinity),0);
  assert.equal(created,0);assert.equal(sound.context,null);assert.equal(sound.enabled,true);
  sound.toggle();sound.setVolume(3);assert.equal(sound.enabled,false);assert.equal(created,0);
});

test('effects share a lazily built volume, compression and bounded output graph',async()=>{
  const audio=context(),sound=new Sound({createContext:()=>audio});sound.setVolume(1.5);await sound.unlock();
  assert.equal(audio.compressors.length,0,'unlock alone does not create signal nodes');
  sound.hop(true);sound.land();assert.equal(audio.compressors.length,1);assert.equal(audio.shapers.length,1);
  const master=audio.gains[1],compressor=audio.compressors[0],limiter=audio.shapers[0];
  assert.deepEqual(master.gain.events[0],{kind:'set',value:1.5*MASTER_GAIN,time:1});
  assert.equal(master.connections[0],compressor);assert.equal(compressor.target,limiter);assert.equal(limiter.target,audio.destination);
  assert.equal(compressor.threshold.events[0].value,-12);assert.equal(compressor.ratio.events[0].value,4);
  assert.equal(limiter.oversample,'none');assert.equal(limiter.curve.length,4097);
  assert.ok(Math.max(...limiter.curve)<=.960001);assert.ok(Math.min(...limiter.curve)>=-.960001);
  sound.setVolume(3);assert.equal(master.gain.events.at(-1).value,3*MASTER_GAIN);
});

test('sound envelope keeps a useful plateau and body with an exact zero tail',async()=>{
  const audio=context(),sound=new Sound({createContext:()=>audio});await sound.unlock();sound.tone(500,.1,.02,1);
  const envelope=audio.gains[0].gain.events,peak=.02*EFFECTS_GAIN;
  assert.deepEqual(envelope,[{kind:'set',value:0,time:1},{kind:'linear',value:peak,time:1.003},
    {kind:'set',value:peak,time:1.025},{kind:'linear',value:peak*.22,time:1.082},{kind:'linear',value:0,time:1.1}]);
  assert.equal(audio.voices[0].type,'triangle');
});

test('volume remains configured when a closed context is replaced and mute stops all preview notes',async()=>{
  const contexts=[],sound=new Sound({createContext:()=>{const audio=context();contexts.push(audio);return audio;}});
  sound.setVolume(2);await sound.unlock();sound.previewFootsteps();const original=sound.context;
  original.state='closed';await sound.unlock();sound.hop(false);
  assert.notEqual(sound.context,original);assert.equal(sound.context.gains[1].gain.events[0].value,MASTER_GAIN*2);
  const before=sound.diagnostics.footstepsPlayed;sound.toggle();assert.equal(sound.previewFootsteps(),false);
  assert.equal(sound.diagnostics.footstepsPlayed,before);
});

test('footstep preview never consumes or advances real movement cues',async()=>{
  const audio=context(),sound=new Sound({createContext:()=>audio});await sound.unlock();
  assert.equal(sound.previewFootsteps(),true);assert.equal(audio.voices.length,6);
  assert.equal(sound.diagnostics.footstepsPlayed,0);assert.equal(sound.diagnostics.lastFootstep,null);
  const event={source:'mistress',kind:'footstep',position:{x:0,y:0,z:0},time:0,expiresAt:1.2,speed:3.5,phase:'routine',gait:'walk'};
  assert.equal(sound.mistressFootstep(event,{x:5,y:0,z:0},0),true);assert.equal(sound.diagnostics.footstepsPlayed,1);
});
