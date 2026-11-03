import test from 'node:test';
import assert from 'node:assert/strict';
import {World,RabbitController} from '../src/physics.js';
import {FLOOR_HEIGHT as H} from '../src/layout.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
function platform() {
  const world=new World();world.ramps=[];world.addBox(0,.5,-29,2,1,2,'carpet');
  return world;
}
function placed(world,x,y,z,grounded=true) {
  const rabbit=new RabbitController(world);Object.assign(rabbit,{x,y,z,grounded,surface:'carpet'});return rabbit;
}
function advance(rabbit,seconds,dt,input={}) {
  let landings=0;
  for(let t=0;t<seconds-1e-8;t+=dt) {rabbit.update(dt,input);landings+=Number(rabbit.lastLanding);}
  return landings;
}

test('support uses a circular footprint only when requested and excludes tangent/corner false support',()=>{
  const world=platform();
  near(world.support(1.2,-29,1.001,true).y,0);
  near(world.support(1.2,-29,1.001,true,.22).y,1);
  near(world.support(1.22,-29,1.001,true,.22).y,0);
  near(world.support(1.15,-27.85,1.001,true,.22).y,1);
  near(world.support(1.16,-27.84,1.001,true,.22).y,0);
  const loose=world.addDynamicBox(1.2,1.1,-29,.3,.2,.3);loose.pushable=true;
  near(world.support(1.2,-29,1.3,true,.22).y,1);
});

test('feet retain an existing ledge without repeated landing cues and fall beyond its circular edge',()=>{
  for(const dt of [1/120,1/60,1/30,.1]) {
    const world=platform(),rabbit=placed(world,1.2,1,-29);
    assert.equal(advance(rabbit,2,dt),0);near(rabbit.y,1);assert.equal(rabbit.grounded,true);
    assert.equal(advance(rabbit,1,dt,{x:1}),1);near(rabbit.y,0);assert.ok(rabbit.x>2);
    for(const [x,z] of [[1.221,-29],[1.16,-27.84]]) {
      const outside=placed(world,x,1,z);advance(outside,1,dt);near(outside.y,0);
    }
  }
});

test('edge retention neither steps onto an adjacent higher prop nor changes centre-based airborne landings',()=>{
  const world=platform();world.addBox(1.1,1.06,-29,.2,.12,.5,'wood');
  const grounded=placed(world,.95,1,-29);advance(grounded,1,1/60);near(grounded.y,1);
  const falling=placed(world,.95,1.8,-29,false);advance(falling,1,1/60);near(falling.y,1);
  assert.equal(falling.grounded,true);
});

test('the original narrow bed seam settles once and remains escapable without a landing-sound buzz',()=>{
  // An isolated reproduction retains the old 15cm seam, independently of the
  // authored furniture fix, so future narrow seams exercise the physics guard.
  const world=new World();world.ramps=[];
  world.addBox(-15,H-.1,-14,20,.2,20,'carpet');
  world.addBox(-15,H+.25,-14,5.1,.5,4.7,'carpet');
  world.addBox(-15,H+.69,-14,4.95,.38,4.5,'carpet');
  world.addBox(-15,H+.305,-10.9,2.4,.61,1.2,'wood');
  for(const dt of [1/120,1/60,1/30,.1]) {
    const rabbit=placed(world,-16,H+.61,-11.85,false);
    assert.ok(advance(rabbit,1,dt)<=1,'the initial drop may land only once');
    assert.equal(advance(rabbit,3,dt),0,'idle contact must not alternate grounded/airborne');
    assert.equal(rabbit.grounded,true);near(rabbit.y,H+.5);
    advance(rabbit,2,dt,{x:-1});assert.ok(rabbit.x<-18);near(rabbit.y,H);
  }
});
