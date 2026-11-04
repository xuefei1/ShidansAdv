import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {RabbitController,SURFACES} from '../src/physics.js';
import {WATER_REACH} from '../src/water.js';
import {DEN,FLOOR_HEIGHT as H} from '../src/layout.js';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressPursuit} from '../src/mistress-pursuit.js';
import {MistressNavigation,MISTRESS_FOUNTAIN_REACH} from '../src/mistress-navigation.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {createMistressModel} from '../src/mistress-model.js';
import {createRabbit} from '../src/model.js';
import {visualHeadroom} from '../src/rabbit-clearance.js';

const scene=new THREE.Scene(),{world,layers,ceiling}=createHouse(scene);
const water=createWaterFountains(scene,world),navigation=new MistressNavigation(world);
const vision=new MistressVision(new MistressSight([...layers,ceiling,...water.groups]),world);
const home={x:-15.8,y:0,z:6.9},position=rabbit=>({x:rabbit.x,y:rabbit.y,z:rabbit.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

function drinker(fountain,radius=.65,angle=0,height=0) {
  const rabbit=new RabbitController(world);
  Object.assign(rabbit,{x:fountain.x+Math.sin(angle)*radius,y:fountain.y+height,z:fountain.z+Math.cos(angle)*radius,
    facing:angle+Math.PI,surface:fountain.floor?'carpet':'wood'});
  for(let frame=0;frame<20;frame++)rabbit.update(1/60,{});
  return rabbit;
}

function pursuer(rabbit,stance) {
  const routine=new MistressAI(world,{navigation,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  assert.equal(routine.resumeFrom(stance,{yaw:Math.atan2(rabbit.x-stance.x,rabbit.z-stance.z)}),true);
  const model=createMistressModel(),rabbitModel=createRabbit();let contacts=0;
  function observer() {
    const p=npc.renderPosition;model.root.position.set(p.x,p.y,p.z);model.root.rotation.y=npc.yaw;
    model.animate(npc.elapsed,{activity:npc.state==='walking'?'idle':npc.definition?.animation??npc.activity,
      moving:npc.state==='walking',speed:npc.speed,poseWeight:npc.poseWeight,activityTime:npc.activityTime,laughing:npc.laughing});
    return {position:p,eye:model.getSightPoints()[0],yaw:npc.yaw};
  }
  const contact=()=>vision.contactClear(observer().eye,rabbit,{stance:npc.position,reachInteraction:navigation.reachInteraction(rabbit)});
  function context() {
    rabbitModel.root.position.set(rabbit.x,rabbit.y,rabbit.z);rabbitModel.root.rotation.y=rabbit.facing;
    rabbitModel.animate(npc.elapsed,0,rabbit.grounded,0,rabbit.y,water.system.drinking?'drink':'idle',visualHeadroom(world,rabbit));
    return {player:rabbit,peeing:water.system.peeing,seen:vision.canSee(observer(),rabbit,{samples:rabbitModel.getSightPoints()}),
      sprintSpeed:SURFACES[rabbit.surface].run,dayElapsed:0,contactClear:()=>{contacts++;return contact();}};
  }
  return {npc,context,contact,get contacts(){return contacts;}};
}

for(const fountain of water.items) {
  test(`held drinking remains catchable by a real routed mistress at ${fountain.id}`,()=>{
    water.reset();const rabbit=drinker(fountain);assert.equal(water.system.start(rabbit),true);
    assert.equal(water.system.target.id,fountain.id);
    const goal=navigation.pursuitTarget(rabbit,home,{preferFrom:true});assert.ok(goal);
    const stance=navigation.nearbyCandidates(goal,3).filter(node=>navigation.components[node.id]===navigation.mainComponent&&
      Math.abs(node.y-goal.y)<.05&&distance(node,goal)>1.6&&distance(node,goal)<2.8&&navigation.segmentClear(node,goal))
      .sort((a,b)=>distance(a,goal)-distance(b,goal))[0];
    assert.ok(stance,'a clear human approach must exist beside this actual fountain');
    const f=pursuer(rabbit,stance);let caught=false;
    for(let frame=0;frame<60*8;frame++) {
      const context=f.context();f.npc.update(1/60,context);
      if(f.npc.canAttemptCapture(rabbit,context))f.npc.update(0,context);
      assert.equal(navigation.canStand(f.npc.position),true,'the mistress never walks through the bowl or adjacent wall');
      if(f.npc.phase==='caught'){caught=true;break;}
      water.advance(1/60,rabbit);rabbit.update(1/60,{});
      assert.equal(water.system.drinking,true,'capture must happen during the ongoing hold');
    }
    assert.equal(caught,true,JSON.stringify({fountain:fountain.id,rabbit:position(rabbit),npc:f.npc.position,phase:f.npc.phase}));
    assert.equal(water.system.drinking,true);assert.ok(water.system.bladder.value>0&&water.system.bladder.value<100);
    assert.ok(f.contacts>0);assert.equal(f.contact(),true,'a genuine physical hand-to-body path allows the catch');
    assert.ok(distance(f.npc.position,rabbit)<=MISTRESS_FOUNTAIN_REACH+.05);
  });
}

test('all legal sampled drinking stances have a nearby clear capture approach, including bowls and narrow wall-side gaps',()=>{
  water.reset();const graph=navigation.nodes;let checked=0,overOrdinaryReach=0;
  for(const fountain of water.items)for(const height of [0,.31])for(const radius of [0,.2,.4,.65,.8,1,1.14])for(let index=0;index<24;index++) {
    const rabbit=drinker(fountain,radius,index/24*Math.PI*2,height);
    if(!water.system.canDrink(rabbit,fountain))continue;
    const goal=navigation.pursuitTarget(rabbit,home,{preferFrom:true}),interaction=navigation.reachInteraction(rabbit);
    assert.ok(goal,`${fountain.id} has no human approach at ${JSON.stringify(position(rabbit))}`);
    assert.equal(navigation.canStand(goal),true);assert.equal(navigation.isRabbitSafe(rabbit,home),false);
    assert.equal(interaction.kind,'fountain');assert.equal(interaction.key,fountain.id);assert.equal(interaction.reach,1.2);
    assert.ok(distance(goal,rabbit)<=MISTRESS_FOUNTAIN_REACH+.01);
    assert.equal(vision.contactClear({x:goal.x,y:goal.y+2.3,z:goal.z},rabbit,{stance:goal,reachInteraction:interaction}),true);
    overOrdinaryReach+=Number(Math.hypot(goal.x-rabbit.x,goal.z-rabbit.z)>.8);checked++;
  }
  assert.ok(checked>3000);assert.ok(overOrdinaryReach>0,'the regression includes positions the former 0.8 m catch could never reach');
  assert.equal(navigation.nodes,graph,'queries use the same static graph');
});

test('fountain hand reach stays local and on the correct floor, while den and true tunnels remain protected',()=>{
  for(const fountain of water.items) {
    assert.equal(navigation.fountainAt({x:fountain.x,y:fountain.y,z:fountain.z+WATER_REACH+.001}),null);
    assert.notEqual(navigation.fountainAt({x:fountain.x,y:fountain.y+H,z:fountain.z})?.id,fountain.id,
      'a different fountain directly upstairs may be reachable, but this bowl never extends between floors');
  }
  const fountain=water.items.find(item=>item.room==='front-yard'),rabbit=drinker(fountain),goal=navigation.pursuitTarget(rabbit,home);
  const f=pursuer(rabbit,goal);f.npc.update(0,{player:rabbit,seen:true,peeing:true,contactClear:true});
  assert.equal(f.npc.phase,'chase');assert.equal(f.npc.canAttemptCapture(rabbit,{peeing:true}),false);
  assert.equal(f.npc.canAttemptCapture(rabbit,{peeing:false}),true,'drinking grants no capture immunity');
  for(const player of [{x:DEN.x,y:0,z:DEN.z},{x:-16,y:0,z:-33}]) {
    assert.equal(navigation.isRabbitSafe(player,home),true);assert.equal(f.npc.canAttemptCapture(player),false);
  }
});

test('a physical wall or closed pane still blocks the fountain catch even when navigation remembers a reachable goal',()=>{
  water.reset();const fountain=water.items.find(item=>item.room==='front-yard'),rabbit=drinker(fountain);
  const goal=navigation.pursuitTarget(rabbit,home),f=pursuer(rabbit,goal);
  f.npc.update(0,{player:rabbit,seen:true,contactClear:false});assert.equal(f.npc.canAttemptCapture(rabbit),true);
  assert.equal(f.contact(),true);
  const alongX=Math.abs(goal.x-rabbit.x)>Math.abs(goal.z-rabbit.z);
  const barrier=world.addDynamicBox((goal.x+rabbit.x)/2,1.5,(goal.z+rabbit.z)/2,alongX?.08:3,3,alongX?3:.08);
  barrier.id='glass:fountain-capture-regression';
  try {
    assert.equal(f.contact(),false);f.npc.update(.1,{...f.context(),seen:true,movementScale:0});
    assert.equal(f.npc.phase,'chase','remembered sight cannot override the blocked physical ray');
  } finally {world.removeBox(barrier);}
  f.npc.update(0,f.context());assert.equal(f.npc.phase,'caught');
});
