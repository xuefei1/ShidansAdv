import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {createConsumables} from '../src/consumables.js';
import {batchStaticGeometry} from '../src/render-batching.js';
import {RabbitController,SURFACES} from '../src/physics.js';
import {MistressAI,MISTRESS_ACTIVITIES} from '../src/mistress-ai.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MistressPursuit} from '../src/mistress-pursuit.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision,inMistressViewCone} from '../src/mistress-vision.js';
import {createMistressModel} from '../src/mistress-model.js';
import {createRabbit} from '../src/model.js';
import {visualHeadroom} from '../src/rabbit-clearance.js';

const scene=new THREE.Scene(),{world,layers,ceiling}=createHouse(scene);layers.forEach(batchStaticGeometry);
const water=createWaterFountains(scene,world),navigation=new MistressNavigation(world);
createConsumables(scene,world,{canSpawn:point=>!navigation.isRabbitSafe(point),random:()=>.5});
const vision=new MistressVision(new MistressSight([...layers,ceiling,...water.groups]),world);
const table=world.solids.find(box=>box.id==='dining-top');

function farRabbit() {
  const rabbit=new RabbitController(world);Object.assign(rabbit,{x:12.3,y:1.52,z:14.7,surface:'wood'});
  for(let frame=0;frame<30;frame++)rabbit.update(1/120,{z:.3});
  assert.equal(rabbit.grounded,true);assert.ok(Math.abs(rabbit.y-1.52)<1e-8);assert.ok(rabbit.z>14.8);
  return rabbit;
}
function kitchenMistress(rabbit,phase='routine',position={x:18,y:0,z:15}) {
  const routine=new MistressAI(world,{navigation,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  assert.equal(routine.resumeFrom(position,{yaw:Math.atan2(rabbit.x-position.x,rabbit.z-position.z)}),true);
  const model=createMistressModel(),rabbitModel=createRabbit();
  function observer() {
    const p=npc.renderPosition;model.root.position.set(p.x,p.y,p.z);model.root.rotation.y=npc.yaw;
    model.animate(npc.elapsed,{activity:npc.state==='walking'?'idle':npc.definition?.animation??npc.activity,
      moving:npc.state==='walking',speed:npc.speed,poseWeight:npc.poseWeight,activityTime:npc.activityTime,laughing:npc.laughing});
    return {position:npc.renderPosition,eye:model.getSightPoints()[0],yaw:npc.yaw};
  }
  function samples() {
    rabbitModel.root.position.set(rabbit.x,rabbit.y,rabbit.z);rabbitModel.root.rotation.y=rabbit.facing;
    rabbitModel.animate(npc.elapsed,Math.hypot(rabbit.vx,rabbit.vz),rabbit.grounded,rabbit.charge/.8,
      world.support(rabbit.x,rabbit.z,rabbit.y+.01,true).y,'idle',visualHeadroom(world,rabbit));
    return rabbitModel.getSightPoints();
  }
  const contact=()=>vision.contactClear(observer().eye,rabbit,{stance:npc.position,reachInteraction:navigation.reachInteraction(rabbit)});
  const context=()=>({player:rabbit,seen:vision.canSee(observer(),rabbit,{samples:samples()}),contactClear:contact,
    dayElapsed:0,sprintSpeed:SURFACES[rabbit.surface].run});
  if(phase==='search') {
    npc.update(0,{player:rabbit,seen:true,contactClear:()=>false});
    npc.update(2.001,{player:rabbit,seen:false,contactClear:()=>false,movementScale:0});assert.equal(npc.phase,'search');
  }
  return {npc,routine,observer,context,contact,samples};
}

for(const phase of ['routine','search']) {
  test(`a moving rabbit on the far kitchen tabletop interrupts ${phase} through actual forward-cone sight`,()=>{
    const rabbit=farRabbit(),{npc,observer,context,samples}=kitchenMistress(rabbit,phase);
    const view=observer();assert.equal(npc.phase,phase);assert.equal(inMistressViewCone(view.position,view.yaw,rabbit),true);
    assert.equal(vision.canSee(view,rabbit,{samples:samples()}),true,'standing visibility is clear across the real table and chairs');
    npc.update(0,context());assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'sight');
  });

  test(`the mistress catches across the kitchen table from its original east side after ${phase}`,()=>{
    const rabbit=farRabbit(),{npc,context,contact}=kitchenMistress(rabbit,phase);let caught=false;
    for(let frame=0;frame<60*8;frame++) {
      let ctx=context();npc.update(1/60,ctx);
      if(npc.canAttemptCapture(rabbit))npc.update(0,ctx);
      if(npc.phase==='caught'){caught=true;break;}
      const targetZ=14.8+.2*Math.sin(frame/60*2);rabbit.update(1/60,{z:(targetZ-rabbit.z)*3});
      assert.equal(rabbit.grounded,true);assert.ok(Math.abs(rabbit.y-1.52)<1e-8);
      ctx=context();npc.update(0,ctx);if(npc.canAttemptCapture(rabbit))npc.update(0,ctx);
      if(npc.phase==='caught'){caught=true;break;}
    }
    assert.ok(caught,`visible far-half rabbit was never caught: ${JSON.stringify({npc:npc.position,player:{x:rabbit.x,y:rabbit.y,z:rabbit.z},phase:npc.phase})}`);
    assert.ok(rabbit.x<13,'the rabbit remains on the opposite half');
    assert.ok(npc.position.x>=table.maxX+.48,'she must not need to circle to the rabbit’s side');
    assert.ok(Math.hypot(npc.position.x-rabbit.x,npc.position.z-rabbit.z)>3.5,'this exercises a grab across the table');
    assert.equal(contact(),true,'the real physical reach remains unobstructed');
  });
}

test('the seated eating routine sees a far tabletop rabbit inside its real cone and still respects turning away',()=>{
  const rabbit=farRabbit();Object.assign(rabbit,{x:12.5,z:13.8});
  const {npc,routine,observer,samples}=kitchenMistress(rabbit),eating=MISTRESS_ACTIVITIES.find(activity=>activity.id==='eating');
  Object.assign(routine,{activity:'eating',state:'acting',position:{...eating.approach},renderPosition:{...eating.seat},
    yaw:eating.yaw,poseWeight:1,activityTime:4});
  const view=observer();assert.ok(view.eye.y<2.2,'use the actual seated eye');
  assert.equal(inMistressViewCone(view.position,view.yaw,rabbit),true);assert.equal(vision.canSee(view,rabbit,{samples:samples()}),true);
  assert.equal(vision.canSee({...view,yaw:view.yaw+Math.PI},rabbit,{samples:samples()}),false);
  assert.equal(npc.phase,'routine');
});

test('across-table interaction cannot detect or catch through a real physical obstruction',()=>{
  const rabbit=farRabbit(),{npc,observer,context,contact,samples}=kitchenMistress(rabbit,'routine',{x:17.2,y:0,z:15});
  const barrier=world.addDynamicBox(16.8,2,15,.18,4,4);
  try {
    assert.equal(inMistressViewCone(npc.renderPosition,npc.yaw,rabbit),true);
    assert.equal(vision.canSee(observer(),rabbit,{samples:samples()}),false);assert.equal(contact(),false);
    npc.update(0,context());assert.equal(npc.phase,'routine');
    npc.update(0,{player:rabbit,seen:true,contactClear:contact});
    assert.equal(npc.phase,'chase','even remembered sight cannot override a blocked hand callback');
  } finally {world.removeBox(barrier);}
});
