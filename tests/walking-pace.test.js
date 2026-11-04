import test from 'node:test';
import assert from 'node:assert/strict';
import {World,RabbitController} from '../src/physics.js';
import {Sound} from '../src/audio.js';
import {NoiseSystem} from '../src/noise.js';

const paces={bedding:[3.64,7.8],carpet:[3.9,8.5],wood:[3.9,8.2],stairs:[3.64,7],grass:[3.9,8.8],deck:[3.9,8.8],concrete:[3.9,8.8]};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function rabbitOn(surface) {
  const world=new World();world.ramps=[];
  const top=world.addBox(0,-.0995,0,40,.2,38,surface).maxY;
  const rabbit=new RabbitController(world);Object.assign(rabbit,{x:0,y:top,z:0,surface});
  return rabbit;
}
function tick(rabbit,seconds,input,observe=()=>{}) {
  for(let frame=0;frame<seconds*120;frame++){rabbit.update(1/120,input);observe();}
}

test('ordinary movement travels 30 percent faster on every terrain while preserving the original sprint caps',()=>{
  for(const [surface,[walk,run]] of Object.entries(paces)) {
    const rabbit=rabbitOn(surface),sprint=rabbitOn(surface);
    tick(rabbit,1,{x:1});tick(sprint,1,{x:1,run:true});
    assert.equal(rabbit.surface,surface);assert.equal(sprint.surface,surface);
    const walkingStart=rabbit.x,runningStart=sprint.x;
    tick(rabbit,1,{x:1});tick(sprint,1,{x:1,run:true});
    close(rabbit.x-walkingStart,walk);close(sprint.x-runningStart,run);
    close(rabbit.vx,walk);close(sprint.vx,run);
    assert.equal(rabbit.energy.value,100);assert.equal(rabbit.sprinting,false);assert.equal(sprint.sprinting,true);
  }
});

test('faster ordinary walking remains quiet on every terrain',()=>{
  for(const surface of Object.keys(paces)) {
    const rabbit=rabbitOn(surface),noise=new NoiseSystem(),sound=new Sound();let tones=0;
    sound.context={state:'running'};sound.tone=()=>tones++;
    tick(rabbit,2,{x:1},()=>{noise.update(1/120,rabbit);sound.step(surface==='wood',rabbit);});
    assert.equal(tones,0,surface);assert.equal(noise.sequence,0,surface);
    assert.equal(sound.diagnostics.rabbitFootstepsPlayed,0,surface);
  }
});
