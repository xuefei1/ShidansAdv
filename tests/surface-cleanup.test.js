import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {batchStaticGeometry} from '../src/render-batching.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {MistressCleanupSight} from '../src/mistress-cleanup.js';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressPursuit,POOP_CLEAN_SECONDS,PEE_CLEAN_SECONDS} from '../src/mistress-pursuit.js';
import {DEN,FLOOR_HEIGHT as H} from '../src/layout.js';

const p=(x,y,z)=>({x,y,z});
const scene=new THREE.Scene(),{world,layers,ceiling}=createHouse(scene);layers.forEach(batchStaticGeometry);
const fountains=createWaterFountains(scene,world),navigation=new MistressNavigation(world);
const vision=new MistressVision(new MistressSight([...layers,ceiling,...fountains.groups]),world);
const from=p(-15.8,0,6.9),horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function fixture(kind,point) {
  const source={...point,y:point.y+(kind==='poop'?.065:0),progress:1,amount:100};
  const balls=kind==='poop'?[source]:[],puddles=kind==='pee'?[source]:[];
  const remove=(items,item)=>{const index=items.indexOf(item);if(index<0)return false;items.splice(index,1);return true;};
  const poop={physics:{balls},hasBall:ball=>balls.includes(ball),remove:ball=>remove(balls,ball)};
  const water={puddles,removePuddle:patch=>remove(puddles,patch)};
  return {source,sensor:new MistressCleanupSight({vision,navigation,poop,water})};
}

for(const [name,point] of [['bed quilt',p(-15,H+.96,-14)],['greenhouse roof',p(-16,1.83,-33)]])for(const kind of ['poop','pee']) {
  test(`${kind} at the centre of the ${name} has a valid cleanup descriptor and clear physical reach`,()=>{
    const {source,sensor}=fixture(kind,point),target=sensor.descriptor(kind,source,from),interaction=navigation.reachInteraction(target.position);
    assert.ok(interaction?.support);assert.equal(interaction.kind,'surface');
    const goal=target.goal;assert.ok(goal,'a wider furniture approach must not be rejected by the old 1.3 m limit');
    assert.ok(horizontal(goal,target.position)>1.3);assert.ok(horizontal(goal,target.position)<=interaction.reach+1e-6);
    assert.ok(Math.abs(goal.y-target.position.y)<=interaction.height+1e-6);assert.equal(navigation.canStand(goal),true);
    assert.ok(navigation.findPath(from,goal).length>1);assert.equal(target.canClean(goal),true);
    const observer={position:goal,stance:goal,eye:p(goal.x,goal.y+2.3,goal.z),yaw:Math.atan2(target.position.x-goal.x,target.position.z-goal.z)};
    assert.equal(sensor.scan(observer),target,'actual eye rays can notice this reachable object');
    const routine=new MistressAI(world,{navigation,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
    assert.equal(routine.resumeFrom(goal,{yaw:observer.yaw}),true);
    const context={player:p(DEN.x,0,DEN.z),cleanupTarget:target,movementScale:0},seconds=kind==='pee'?PEE_CLEAN_SECONDS:POOP_CLEAN_SECONDS;
    npc.update(seconds-.001,context);assert.equal(npc.phase,'cleanup');assert.equal(npc.state,'acting');assert.equal(target.exists(),true);
    npc.update(.001,context);assert.equal(target.exists(),false);assert.equal(npc.phase,'search');
    assert.equal(npc.rageBonus,kind==='pee'?.05:0);assert.equal(sensor.scan(observer,target),null);
  });
}

test('general furniture reach still rejects a newly blocked physical cleanup ray',()=>{
  const {source,sensor}=fixture('poop',p(-15,H+.96,-14)),target=sensor.descriptor('poop',source,from),goal=target.goal;
  assert.ok(goal);assert.equal(target.canClean(goal),true);
  const handY=Math.max(goal.y+1,Math.min(goal.y+2.2,target.position.y+.25));
  const barrier=world.addDynamicBox((goal.x+source.x)/2,(handY+target.position.y)/2,(goal.z+source.z)/2,.25,.6,.25);
  try {assert.equal(target.canClean(goal),false);assert.equal(target.goal,null);}finally {world.removeBox(barrier);}
  assert.ok(target.goal);assert.equal(target.canClean(goal),true);
});

test('lowered hand origins support the general support field and the legacy table field',()=>{
  for(const field of ['support','table']) {
    const origins=[],source=p(0,.065,3),interaction={[field]:{minY:.82},under:true,reach:2.25,height:2.4};
    const nav={isDen:()=>false,pursuitTarget:()=>p(0,0,2),[field==='support'?'reachInteraction':'tableInteraction']:()=>interaction};
    const sensor=new MistressCleanupSight({navigation:nav,vision:{canSeePoint:()=>true,canReachPoint:origin=>{origins.push(origin);return true;}},
      poop:{physics:{balls:[source]},hasBall:()=>true,remove:()=>true},water:{puddles:[]}});
    const target=sensor.descriptor('poop',source,p(0,0,0));assert.ok(target.goal);assert.equal(target.canClean(p(0,0,2)),true);
    assert.ok(origins.every(origin=>Math.abs(origin.y-.7)<1e-9));
  }
});

test('broader cleanup reach does not create goals inside the den or genuine low passages',()=>{
  for(const point of [p(DEN.x,0,DEN.z),p(-22.5,0,-12),p(-16,0,-33)]) {
    const {source,sensor}=fixture('poop',point),target=sensor.descriptor('poop',source,from);
    assert.equal(target.goal,null,JSON.stringify(point));
  }
});
