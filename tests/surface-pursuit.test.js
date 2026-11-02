import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {batchStaticGeometry} from '../src/render-batching.js';
import {RabbitController,SURFACES} from '../src/physics.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressPursuit} from '../src/mistress-pursuit.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {createMistressModel} from '../src/mistress-model.js';

const scene=new THREE.Scene(),{world,layers,ceiling}=createHouse(scene);layers.forEach(batchStaticGeometry);
const water=createWaterFountains(scene,world),navigation=new MistressNavigation(world);
const vision=new MistressVision(new MistressSight([...layers,ceiling,...water.groups]),world);
const from={x:-15.8,y:0,z:6.9};
const position=actor=>({x:actor.x,y:actor.y,z:actor.z});
function rabbitAt(point) {
  const rabbit=new RabbitController(world);Object.assign(rabbit,point,{surface:world.support(point.x,point.z,point.y+.01,true).surface});return rabbit;
}
function pursuerAt(stance,rabbit) {
  assert.equal(navigation.canStand(stance),true);
  const routine=new MistressAI(world,{navigation,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  assert.equal(routine.resumeFrom(stance,{yaw:Math.atan2(rabbit.x-stance.x,rabbit.z-stance.z)}),true);
  const model=createMistressModel();
  function eye() {
    const p=npc.renderPosition;model.root.position.set(p.x,p.y,p.z);model.root.rotation.y=npc.yaw;
    model.animate(npc.elapsed,{activity:npc.state==='walking'?'idle':(npc.definition?.animation??npc.activity),
      moving:npc.state==='walking',speed:npc.speed,activityTime:npc.activityTime,laughing:npc.laughing,poseWeight:npc.poseWeight});
    return model.getSightPoints()[0];
  }
  const physicalContact=()=>vision.contactClear(eye(),rabbit,{stance:npc.position,reachInteraction:navigation.reachInteraction(rabbit)});
  let sightAt=-Infinity,cachedSight=false;
  function context(perfectSight=false) {
    if(!perfectSight&&npc.elapsed-sightAt>=.1-1e-8) {
      cachedSight=vision.canSee({position:npc.renderPosition,eye:eye(),yaw:npc.yaw},rabbit);sightAt=npc.elapsed;
    }
    return {player:rabbit,seen:perfectSight||cachedSight,
      dayElapsed:0,sprintSpeed:SURFACES[rabbit.surface].run,contactClear:physicalContact};
  }
  function settleContact(ctx) {
    if(!npc.canAttemptCapture(rabbit))return;
    npc.update(0,ctx);
  }
  return {npc,context,settleContact,physicalContact};
}

for(const [perfectSight,sprint,fps] of [[true,false,60],[false,false,60],[true,true,60],[true,false,5]]) {
  test(`the mistress intercepts a continuously moving tabletop rabbit with ${perfectSight?'perfect':'actual forward-cone'} sight${sprint?' while holding Shift':''}${fps===5?' at 5 FPS with the shared travel budget':''}`,()=>{
    const radius=sprint?.4:.7,dt=1/fps,travelStep=Math.min(dt,.1);
    const rabbit=rabbitAt({x:14+radius,y:1.52,z:15}),{npc,context,settleContact}=pursuerAt({x:20.7,y:0,z:15},rabbit);
    assert.equal(context().seen,true,'the real initial view contains Shidan');
    let travelled=0,caught=false,sprinted=false;
    for(let frame=0;frame<30*fps;frame++) {
      // Match the host's ordering: NPC time/movement, fresh physical contact,
      // rabbit physics, then a zero-time observation and fresh contact again.
      let ctx=context(perfectSight);ctx.movementScale=travelStep/dt;npc.update(dt,ctx);settleContact(ctx);
      if(npc.phase==='caught'){caught=true;break;}
      const t=frame*travelStep,target={x:14+radius*Math.cos(4*t+.3),z:15+radius*Math.sin(4*t+.3)},before=position(rabbit);
      const gain=sprint?1:3;
      rabbit.update(dt,{x:(target.x-rabbit.x)*gain,z:(target.z-rabbit.z)*gain,run:sprint});
      sprinted||=rabbit.sprinting;
      travelled+=Math.hypot(rabbit.x-before.x,rabbit.z-before.z);
      assert.equal(rabbit.grounded,true);assert.ok(Math.abs(rabbit.y-1.52)<1e-7,'the path remains on the real table');
      ctx=context(perfectSight);npc.update(0,ctx);settleContact(ctx);
      if(npc.phase==='caught'){caught=true;break;}
    }
    assert.ok(travelled>.5,'the test must actually move the rabbit');
    if(sprint){assert.equal(sprinted,true);assert.ok(rabbit.energy.value>0,'capture must happen before sprint exhaustion');}
    assert.ok(caught,`a changing nearest edge must not cause endless orbiting: ${JSON.stringify({npc:npc.position,player:position(rabbit),phase:npc.phase})}`);
  });
}

test('the rabbit moving then stopping on the far half of a table remains catchable from the approach side',()=>{
  const rabbit=rabbitAt({x:14,y:1.52,z:15.9});
  for(let frame=0;frame<120&&rabbit.z>=14.3;frame++)rabbit.update(1/60,{z:(14.1-rabbit.z)*3});
  assert.ok(rabbit.z<14.3,'the rabbit must reach the opposite table half through the actual controller');
  const {npc,context,settleContact}=pursuerAt({x:20.7,y:0,z:15},rabbit);let caught=false;
  for(let frame=0;frame<30*60;frame++) {
    let ctx=context(true);npc.update(1/60,ctx);settleContact(ctx);
    if(npc.phase==='caught'){caught=true;break;}
    rabbit.update(1/60,{});
    assert.equal(rabbit.grounded,true);assert.ok(Math.abs(rabbit.y-1.52)<1e-7);
    ctx=context(true);npc.update(0,ctx);settleContact(ctx);
    if(npc.phase==='caught'){caught=true;break;}
  }
  assert.ok(caught,`the mistress must reach across the table: ${JSON.stringify({npc:npc.position,player:position(rabbit),phase:npc.phase})}`);
  assert.ok(npc.position.x>=world.fixtures.get('dining-top').maxX+.48,'she catches from her original side');
});

test('a heard under-table rabbit cannot evade physical contact by moving to the opposite half',()=>{
  const rabbit=rabbitAt({x:14,y:0,z:14.1}),{npc,context,settleContact}=pursuerAt({x:20.7,y:0,z:15},rabbit);
  const first=context();first.seen=false; // Isolate the initial hearing trigger; subsequent frames use real sight.
  first.noiseEvents=[{id:1,source:'shidan',kind:'eat',scope:'house',radius:null,
    position:position(rabbit),time:0,expiresAt:1.2}];npc.update(0,first);
  assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'eat');
  let searched=false,caught=false,travelled=0;
  function advanceNpc(dt,ctx) {
    npc.update(dt,ctx);settleContact(ctx);
  }
  for(let frame=0;frame<30*60;frame++) {
    let ctx=context();advanceNpc(1/60,ctx);
    if(npc.phase==='caught'){caught=true;break;}
    searched||=npc.phase==='search';
    const before=position(rabbit),goal=searched?
      {x:Math.max(12.9,Math.min(15.1,npc.position.x)),z:Math.max(14,Math.min(16,npc.position.z))}:{x:14,z:15.9};
    rabbit.update(1/60,{x:(goal.x-rabbit.x)*3,z:(goal.z-rabbit.z)*3});travelled+=Math.hypot(rabbit.x-before.x,rabbit.z-before.z);
    assert.equal(rabbit.grounded,true);assert.ok(Math.abs(rabbit.y)<1e-7,'the rabbit stays beneath the real slab');
    ctx=context();advanceNpc(0,ctx);
    if(npc.phase==='caught'){caught=true;break;}
  }
  assert.ok(travelled>.5,'the rabbit must move through the actual controller before the mistress reaches the table');
  assert.equal(caught,true,`cross-table contact must follow the moving rabbit: ${JSON.stringify({npc:npc.position,player:position(rabbit),phase:npc.phase})}`);
});

for(const [name,point] of [
  ['bed quilt',{x:-15,y:5.16,z:-14}],
  ['greenhouse roof',{x:-16,y:1.83,z:-33}],
  ['kitchen island',{x:14,y:1.5,z:7}],
  ['sofa cushion',{x:-17,y:.84,z:5.2}],
  ['raised garden bed',{x:-8,y:.515,z:-29}],
  ['coffee trunk',{x:-9,y:1.05,z:8.7}],
]) {
  test(`a grounded rabbit moving on the ${name} can be caught from its physically reachable stance`,()=>{
    const rabbit=rabbitAt(point);
    for(let step=0;step<30;step++)rabbit.update(1/120,{x:.4});
    assert.equal(rabbit.grounded,true);assert.ok(Math.hypot(rabbit.x-point.x,rabbit.z-point.z)>.1);
    const interaction=navigation.reachInteraction(rabbit);assert.ok(interaction,`${name} has a reach interaction`);
    const stance=navigation.pursuitTarget(rabbit,from);assert.ok(stance,`${name} has a human approach`);
    assert.equal(navigation.isRabbitSafe(rabbit,from),false);
    assert.ok(navigation.findPath(from,stance).length>1);
    const {npc,context,settleContact,physicalContact}=pursuerAt(stance,rabbit),ctx=context(true);
    ctx.contactClear=()=>false;npc.update(0,ctx);assert.equal(npc.phase,'chase','a false-returning callback cannot be mistaken for contact');
    assert.equal(npc.canAttemptCapture(rabbit),true,`${name} capture range must agree with its approach`);
    assert.equal(physicalContact(),true,`${name} has a physically clear hand path`);
    ctx.contactClear=physicalContact;settleContact(ctx);
    assert.equal(npc.phase,'caught');
  });
}

test('surface reach never turns the den or genuine low tunnels into catchable areas',()=>{
  for(const point of [{x:-16,y:0,z:12},{x:-22.5,y:0,z:-12},{x:-16,y:0,z:-33}]) {
    const rabbit=rabbitAt(point);for(let step=0;step<20;step++)rabbit.update(1/120,{x:.3});
    assert.equal(navigation.isRabbitSafe(rabbit,from),true,JSON.stringify(position(rabbit)));
    assert.equal(navigation.pursuitTarget(rabbit,from),null);
  }
});
