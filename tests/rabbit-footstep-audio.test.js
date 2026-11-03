import test from 'node:test';
import assert from 'node:assert/strict';
import {World,RabbitController} from '../src/physics.js';
import {Sound} from '../src/audio.js';
import {NoiseSystem} from '../src/noise.js';

function setup() {
  const rabbit=new RabbitController(new World()),sound=new Sound(),noise=new NoiseSystem(),tones=[];
  Object.assign(rabbit,{x:-10,y:0,z:17,surface:'wood'});
  sound.context={state:'running'};sound.tone=(...args)=>tones.push(args);
  const advance=(seconds,input)=>{
    for(let frame=0;frame<Math.round(seconds*60);frame++) {
      rabbit.update(1/60,input);noise.update(1/60,rabbit);sound.step(true,rabbit);
    }
  };
  return {rabbit,sound,noise,tones,advance};
}

test('actual walking is silent, sprinting creates footsteps and local noise, and walking again stops new cues',()=>{
  const {rabbit,sound,noise,tones,advance}=setup();advance(1,{x:1});
  assert.ok(rabbit.x>-8);assert.equal(rabbit.sprinting,false);
  assert.equal(tones.length,0);assert.equal(noise.sequence,0);assert.equal(sound.diagnostics.rabbitFootstepsPlayed,0);
  advance(.8,{x:1,run:true});assert.equal(rabbit.sprinting,true);assert.ok(tones.length>0);
  assert.ok(noise.sequence>0);assert.ok(noise.events.every(event=>event.kind==='sprint'&&event.radius===5));
  const audio=tones.length,sequence=noise.sequence;advance(.5,{x:1});
  assert.equal(rabbit.sprinting,false);assert.equal(tones.length,audio);assert.equal(noise.sequence,sequence);
});

test('fast coasting after Shift release cannot create walking footstep sounds',()=>{
  const {rabbit,sound,noise,tones,advance}=setup();advance(.8,{x:1,run:true});
  assert.ok(rabbit.vx>6);const count=tones.length,sequence=noise.sequence;
  rabbit.update(1/60,{x:1});assert.ok(rabbit.vx>6);assert.equal(rabbit.sprinting,false);
  assert.equal(sound.step(true,rabbit),false);noise.update(1/60,rabbit);
  assert.equal(tones.length,count);assert.equal(noise.sequence,sequence);
});

test('stationary, airborne, invalid and muted footstep requests remain silent without unlocking audio',()=>{
  const {sound,tones}=setup(),running={sprinting:true,grounded:true,vx:8,vz:0};
  for(const player of [undefined,{}, {...running,sprinting:false},{...running,grounded:false},
    {...running,vx:0},{...running,vx:NaN}])assert.equal(sound.step(false,player),false);
  sound.enabled=false;assert.equal(sound.step(true,running),false);
  sound.enabled=true;sound.context=null;assert.equal(sound.step(true,running),false);
  assert.equal(sound.context,null);assert.equal(tones.length,0);assert.equal(sound.diagnostics.rabbitFootstepsPlayed,0);
});
