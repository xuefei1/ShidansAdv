import test from 'node:test';
import assert from 'node:assert/strict';
import { NoiseSystem,canHearNoise,LOCAL_NOISE_RADIUS,NOISE_LIFETIME,SPRINT_NOISE_INTERVAL,EATING_NOISE_INTERVAL,MAX_NOISE_EVENTS } from '../src/noise.js';
import { CONSUMABLE_TYPES,DEN_HAY } from '../src/consumable-data.js';
import { HOUSE,FLOOR_HEIGHT,BOUNDS,RAMPS } from '../src/layout.js';
import { World,RabbitController } from '../src/physics.js';
import { ConsumableSystem } from '../src/consumable-system.js';

const player=(overrides={})=>({x:0,y:0,z:0,sprinting:false,...overrides});
const carrot={id:'carrot-test',type:'carrot'};

test('long-jump noise emits once per takeoff edge with a five-metre local scope',()=>{
  const noise=new NoiseSystem(),p=player();
  const emitted=noise.update(0,p,{longJump:true});
  assert.equal(emitted.length,1);assert.equal(emitted[0].kind,'long-jump');
  assert.equal(emitted[0].scope,'local');assert.equal(emitted[0].radius,5);assert.equal(LOCAL_NOISE_RADIUS,5);
  assert.deepEqual(noise.update(.05,p,{longJump:true}),[]);
  noise.update(0,p);assert.equal(noise.update(0,p,{longJump:true}).length,1);
  assert.equal(noise.sequence,2);
});

test('long-jump sound stays at the actual takeoff point, including a protected den launch',()=>{
  const rabbit=new RabbitController(new World()),noise=new NoiseSystem(),takeoff={x:rabbit.x,y:rabbit.y,z:rabbit.z};
  Object.assign(rabbit,{charging:true,jumpHeld:true,charge:.65});
  rabbit.update(.1,{x:1,jump:false});assert.equal(rabbit.lastJump,'long');assert.ok(rabbit.x>takeoff.x);
  const event=noise.update(.1,rabbit,{longJump:true})[0];assert.deepEqual(event.position,takeoff);
  rabbit.lastJumpPosition.x=99;assert.deepEqual(event.position,takeoff,'the source snapshot is immutable');
});

test('five-metre audibility is inclusive and uses three-dimensional distance',()=>{
  const noise=new NoiseSystem(),event=noise.update(0,player(),{longJump:true})[0];
  for(const listener of [player({x:5}),player({x:-5}),player({y:5}),player({z:5}),player({x:3,y:4})]) {
    assert.equal(noise.canHear(event,listener),true);
  }
  for(const listener of [player({x:5.000001}),player({y:5.000001}),player({x:4,y:4}),player({x:5,z:.001})]) {
    assert.equal(noise.canHear(event,listener),false);
  }
});

test('local noise can be heard outdoors and does not depend on house bounds',()=>{
  const noise=new NoiseSystem(),p=player({x:HOUSE.maxX+2,z:HOUSE.maxZ+7});
  const event=noise.update(0,p,{longJump:true})[0];
  assert.equal(noise.canHear(event,{...p,x:p.x+5}),true);
  assert.equal(noise.canHear(event,{...p,x:p.x+5.01}),false);
});

test('walking, standing with Shift and ordinary hops are silent',()=>{
  const noise=new NoiseSystem();
  for(const p of [player(),player({vx:4,vz:0}),player({run:true}),player({lastJump:'hop',vy:4.2,grounded:false})]) {
    assert.deepEqual(noise.update(.1,p),[]);
  }
  assert.equal(noise.sequence,0);
});

test('sprint noise begins immediately, pulses at bounded cadence and stops on release',()=>{
  const noise=new NoiseSystem(),p=player({sprinting:true,vx:8});
  assert.equal(SPRINT_NOISE_INTERVAL,.55);
  assert.equal(noise.update(0,p)[0].kind,'sprint');
  assert.deepEqual(noise.update(.549,p),[]);
  assert.equal(noise.update(.001,p).length,1);
  p.sprinting=false;assert.deepEqual(noise.update(1,p),[]);
  assert.equal(noise.sequence,2);
  p.sprinting=true;assert.equal(noise.update(0,p).length,1);
});

for(const [type,details] of Object.entries(CONSUMABLE_TYPES)) {
  test(`${type} consumption ${details.happiness>0?'makes house-wide noise':'is silent'} according to its listed happiness`,()=>{
    const noise=new NoiseSystem(),item={id:`${type}-test`,type};
    const emitted=noise.update(.1,player(),{consuming:item});
    assert.equal(emitted.length,details.happiness>0?1:0);
    if(details.happiness>0) {
      assert.equal(emitted[0].kind,'eat');assert.equal(emitted[0].scope,'house');assert.equal(emitted[0].radius,null);
      assert.equal(noise.canHear(emitted[0],{x:BOUNDS.minX,y:0,z:BOUNDS.minZ}),true);
      assert.equal(noise.canHear(emitted[0],{x:BOUNDS.maxX,y:FLOOR_HEIGHT,z:BOUNDS.maxZ}),true);
    }
  });
}

test('permanent den hay, eaten poop and drinking water are silent',()=>{
  const noise=new NoiseSystem();
  for(const consuming of [DEN_HAY,{id:'poop-1',type:'poop'},{id:'unknown',type:'future-unknown'},null]) {
    assert.deepEqual(noise.update(.1,player({drinking:true}),{consuming}),[]);
  }
  assert.equal(noise.sequence,0);
});

test('eating pulses during the hold rather than waiting for completion or item depletion',()=>{
  const noise=new NoiseSystem();
  assert.equal(EATING_NOISE_INTERVAL,.75);
  assert.equal(noise.update(0,player(),{consuming:carrot}).length,1);
  assert.deepEqual(noise.update(.749,player(),{consuming:carrot}),[]);
  assert.equal(noise.update(.001,player(),{consuming:carrot}).length,1);
  assert.deepEqual(noise.update(.1,player()),[]);
  assert.equal(noise.sequence,2);
  assert.equal(noise.update(0,player(),{consuming:carrot}).length,1,'a fresh hold starts a fresh audible pulse');
  assert.equal(noise.update(0,player(),{consuming:{id:'book-new',type:'book'}}).length,1,'changing items begins a new noise');
});

test('rewarding chewing reaches rooms, balconies, both yards and the lot boundary regardless of source distance',()=>{
  const noise=new NoiseSystem(),p=player({x:HOUSE.maxX+2,z:HOUSE.maxZ+10});
  const event=noise.update(0,p,{consuming:carrot})[0];
  for(const listener of [
    {x:HOUSE.minX,y:0,z:HOUSE.minZ},
    {x:HOUSE.maxX,y:FLOOR_HEIGHT,z:HOUSE.minZ},
    {x:HOUSE.minX,y:FLOOR_HEIGHT*2,z:HOUSE.maxZ},
    {x:HOUSE.minX-.001,y:0,z:0},
    {x:0,y:0,z:HOUSE.minZ-.001},
    {x:0,y:0,z:HOUSE.maxZ+.001},
    {x:0,y:FLOOR_HEIGHT,z:-22.5},
    {x:0,y:0,z:26},
    {x:0,y:0,z:-30},
    {x:BOUNDS.minX,y:0,z:BOUNDS.minZ},
    {x:BOUNDS.maxX,y:FLOOR_HEIGHT,z:BOUNDS.maxZ},
  ]) assert.equal(noise.canHear(event,listener),true);
});

test('chewing audibility remains continuous along both complete stairways and their landing transitions',()=>{
  const noise=new NoiseSystem(),event=noise.update(0,player({x:-17,y:FLOOR_HEIGHT,z:-14}),{consuming:carrot})[0];
  for(const ramp of RAMPS)for(let step=0;step<=100;step++) {
    const t=step/100,listener={x:(ramp.minX+ramp.maxX)/2,y:t*ramp.height,z:ramp.startZ+t*(ramp.endZ-ramp.startZ)};
    assert.equal(canHearNoise(event,listener),true,`${ramp.id} at ${t}`);
    assert.equal(noise.canHear(event,listener),true);assert.deepEqual(noise.audibleTo(listener),[event]);
  }
  noise.update(NOISE_LIFETIME,player());
  assert.deepEqual(noise.audibleTo({x:20.5,y:FLOOR_HEIGHT/2,z:-30}),[],'global scope does not extend expired sounds');
});

test('global chewing does not widen household ambience or five-metre movement sounds',()=>{
  const source={x:20.5,y:FLOOR_HEIGHT/2,z:-30},noise=new NoiseSystem();
  const emitted=noise.update(0,player({...source,sprinting:true}),{longJump:true,consuming:carrot});
  assert.deepEqual(emitted.map(event=>event.kind),['long-jump','sprint','eat']);
  const distant={x:0,y:0,z:26};
  assert.deepEqual(noise.audibleTo(distant).map(event=>event.kind),['eat']);
  for(const event of emitted.filter(event=>event.scope==='local')) {
    assert.equal(canHearNoise(event,{...source,x:source.x+5}),true);
    assert.equal(canHearNoise(event,{...source,x:source.x+5.000001}),false);
  }
  const ambience={source:'mistress',kind:'cook',scope:'house',position:source};
  assert.equal(canHearNoise(ambience,{x:0,y:FLOOR_HEIGHT,z:0}),true);
  for(const listener of [source,distant,{x:BOUNDS.minX,y:0,z:0}])assert.equal(canHearNoise(ambience,listener),false);
});

test('audibleTo gives future agents only the live events inside their hearing scope',()=>{
  const noise=new NoiseSystem(),p=player({x:HOUSE.minX,z:HOUSE.minZ,sprinting:true});
  noise.update(0,p,{consuming:carrot,longJump:true});
  assert.deepEqual(noise.activeKinds,['long-jump','sprint','eat']);
  assert.equal(noise.audibleTo(p).length,3);
  assert.deepEqual(noise.audibleTo(player({x:HOUSE.maxX,z:HOUSE.maxZ})).map(e=>e.kind),['eat']);
  assert.deepEqual(noise.audibleTo(player({x:1000})).map(event=>event.kind),['eat']);
  p.sprinting=false;noise.update(NOISE_LIFETIME,p);
  assert.equal(noise.events.length,0);assert.deepEqual(noise.audibleTo(p),[]);assert.deepEqual(noise.activeKinds,[]);
});

test('event snapshots are immutable and do not follow Shidan or listener mutation',()=>{
  const noise=new NoiseSystem(),p=player(),event=noise.update(0,p,{longJump:true})[0];
  assert.equal(event.source,'shidan');assert.equal(Object.isFrozen(event),true);assert.equal(Object.isFrozen(event.position),true);
  assert.throws(()=>{event.radius=100;},TypeError);assert.throws(()=>{event.position.x=100;},TypeError);
  p.x=40;assert.equal(event.position.x,0);assert.equal(noise.canHear(event,player()),true);
  const copy=noise.events;copy.length=0;assert.equal(noise.events.length,1);
});

test('a paused update freezes event lifetime and continuous noise cadence',()=>{
  const noise=new NoiseSystem(),p=player({sprinting:true});
  const event=noise.update(0,p)[0];noise.update(.3,p);
  assert.deepEqual(noise.update(500,p,{active:false}),[]);assert.equal(noise.elapsed,.3);
  assert.equal(noise.events[0],event);assert.equal(noise.canHear(event,p),true);
  assert.deepEqual(noise.update(.249,p),[]);assert.equal(noise.update(.001,p).length,1);
});

test('zero-time locked input clears action gates without aging prior snapshots',()=>{
  const noise=new NoiseSystem(),p=player({sprinting:true});
  const emitted=noise.update(0,p,{consuming:carrot,longJump:true});
  assert.equal(emitted.length,3);assert.equal(noise.update(0,p,{locked:true}).length,0);
  assert.equal(noise.elapsed,0);assert.deepEqual(noise.events,emitted);
  assert.equal(noise.update(.05,p,{locked:true,consuming:carrot,longJump:true}).length,0);
  assert.equal(noise.sequence,3);
  assert.equal(noise.update(0,p,{consuming:carrot}).length,2,'new movement/hold starts immediately after unlocking');
});

test('invalid deltas or positions never fabricate noise or poison the clock',()=>{
  const noise=new NoiseSystem(),p=player({sprinting:true});
  for(const dt of [-1,NaN,Infinity]) assert.deepEqual(noise.update(dt,p,{longJump:true,consuming:carrot}),[]);
  assert.equal(noise.elapsed,0);assert.equal(noise.sequence,0);
  for(const invalid of [null,{},player({x:NaN}),player({y:Infinity})]) {
    assert.deepEqual(noise.update(.1,invalid,{longJump:true,consuming:carrot}),[]);
  }
  assert.equal(noise.sequence,0);assert.equal(Number.isFinite(noise.elapsed),true);
  for(const invalid of [null,{},player({z:NaN})]) assert.equal(canHearNoise({scope:'house',position:p},invalid),false);
  for(const invalid of [null,{},player({x:NaN}),player({y:Infinity})]) {
    assert.equal(canHearNoise({source:'shidan',kind:'eat',scope:'house',position:p},invalid),false);
    assert.equal(canHearNoise({source:'shidan',kind:'eat',scope:'house',position:invalid},p),false);
  }
  assert.equal(canHearNoise({scope:'unknown',position:p},p),false);
});

test('pulse counts and timestamps are frame-rate independent at 30, 60 and 144 fps',()=>{
  const outputs=[];
  for(const fps of [30,60,144]) {
    const noise=new NoiseSystem(),p=player({sprinting:true});
    const emitted=[...noise.update(0,p,{consuming:carrot})];
    for(let i=0;i<fps*6;i++)emitted.push(...noise.update(1/fps,p,{consuming:carrot}));
    assert.equal(emitted.filter(e=>e.kind==='sprint').length,11);
    assert.equal(emitted.filter(e=>e.kind==='eat').length,9);
    outputs.push(emitted.map(e=>[e.kind,Number(e.time.toFixed(6))]));
  }
  assert.deepEqual(outputs[1],outputs[0]);assert.deepEqual(outputs[2],outputs[0]);
});

test('delayed updates retain only still-audible pulses and never build an unbounded backlog',()=>{
  const noise=new NoiseSystem(),p=player({sprinting:true});
  noise.update(0,p,{consuming:carrot});
  const emitted=noise.update(3600000,p,{consuming:carrot});
  assert.ok(emitted.length<=MAX_NOISE_EVENTS);assert.ok(noise.events.length<=MAX_NOISE_EVENTS);
  assert.ok(noise.events.every(event=>event.expiresAt>noise.elapsed));
  assert.ok(noise.events.every(event=>event.time<=noise.elapsed+1e-8));
  for(let i=0;i<1000;i++) {
    noise.update(0,p,{locked:true});noise.update(0,p,{longJump:true});
  }
  assert.equal(noise.events.length,MAX_NOISE_EVENTS);
});

test('reset removes old noise, clears cadence/IDs and restores an immediate fresh action',()=>{
  const noise=new NoiseSystem(),p=player({sprinting:true});
  const event=noise.update(0,p,{consuming:carrot,longJump:true})[0];
  noise.update(.8,p,{consuming:carrot});noise.reset();
  assert.equal(noise.elapsed,0);assert.equal(noise.sequence,0);assert.deepEqual(noise.events,[]);
  assert.equal(noise.canHear(event,p),false);
  const next=noise.update(0,p,{longJump:true});assert.equal(next.length,2);assert.equal(next[0].id,1);
});

test('real rabbit controller long jumps and sprint movement feed local noise while tap hops remain silent',()=>{
  const world=new World(),rabbit=new RabbitController(world),noise=new NoiseSystem();
  rabbit.update(.05,{jump:true});rabbit.update(.05,{jump:false});
  assert.equal(rabbit.lastJump,'hop');assert.deepEqual(noise.update(.05,rabbit,{longJump:rabbit.lastJump==='long'}),[]);
  rabbit.reset();for(let i=0;i<8;i++)rabbit.update(.1,{jump:true});
  rabbit.update(.05,{x:1,jump:false});assert.equal(rabbit.lastJump,'long');
  assert.equal(noise.update(.05,rabbit,{longJump:rabbit.lastJump==='long'})[0].kind,'long-jump');
  rabbit.reset();rabbit.update(.05,{x:1,run:true});assert.equal(rabbit.sprinting,true);
  assert.equal(noise.update(.05,rabbit).some(e=>e.kind==='sprint'),true);
  rabbit.update(.05,{run:true});assert.equal(rabbit.sprinting,false);assert.deepEqual(noise.update(.05,rabbit),[]);
});

test('a real partial eating hold generates noise before its rewards and cancellation stops new pulses',()=>{
  const world=new World(),rabbit=new RabbitController(world),noise=new NoiseSystem();
  const item={id:'held-carrot',type:'carrot',x:0,y:0,z:0};
  const food=new ConsumableSystem(world,{slots:[item],wires:[],randomLimits:{},randomPlaces:[]});
  Object.assign(rabbit,{x:.9,y:0,z:0,grounded:true});food.begin(rabbit);
  assert.equal(food.target.id,item.id);assert.deepEqual(food.update(.1,rabbit,0),[]);
  assert.equal(noise.update(.1,rabbit,{consuming:food.target})[0].kind,'eat');
  assert.equal(food.count,1);assert.equal(rabbit.energy.recovering,false);
  food.cancel();noise.update(1,rabbit,{consuming:food.target});assert.equal(noise.sequence,1);
  noise.update(.2,rabbit);assert.equal(noise.events.length,0);
});
