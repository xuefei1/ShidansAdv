import test from 'node:test';
import assert from 'node:assert/strict';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressPursuit,CAPTURE_SECONDS,SCOLD_SECONDS} from '../src/mistress-pursuit.js';
import {MistressVision,inMistressViewCone} from '../src/mistress-vision.js';
import {DEN} from '../src/layout.js';

const point=(x=0,y=0,z=0)=>({x,y,z});
const den=()=>point(DEN.x,0,DEN.z);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} differs from ${b}`);
function scolding() {
  const navigation={isRabbitSafe:()=>false,canStand:()=>true,
    pursuitTarget:target=>point(target.x,0,target.z),
    nearestReachable:target=>({...target}),
    findPath:(from,to)=>[{...from},{...to}],
  };
  const routine=new MistressAI(null,{navigation,random:()=>.5});
  const npc=new MistressPursuit(routine,{random:()=>.5});
  Object.assign(routine,{activity:'mopping',position:point(),renderPosition:point(),yaw:0,poseWeight:0,_duration:1000000,_nextNoise:Infinity});
  const caught=point(.2,0,0);npc.update(0,{player:caught,seen:true,contactClear:true});
  assert.equal(npc.phase,'caught');npc.update(CAPTURE_SECONDS,{player:caught});
  assert.equal(npc.phase,'scolding');near(npc.scoldRemaining,SCOLD_SECONDS);npc.takeEvents();return npc;
}
const escaped=()=>point(DEN.x+DEN.radius+2,0,DEN.z+2);
const view=(player,{blocked=false}={})=>{
  const vision=new MistressVision({hasLineOfSight:()=>!blocked});
  return npc=>vision.canSee({position:npc.renderPosition,eye:point(npc.renderPosition.x,npc.renderPosition.y+2.3,npc.renderPosition.z),yaw:npc.yaw},player);
};

test('seeing Shidan escape during a rant immediately replaces scolding with pursuit',()=>{
  const npc=scolding(),origin={...npc.position};
  npc.update(.75,{player:den(),seen:true});assert.equal(npc.phase,'scolding');
  const player=escaped();assert.equal(inMistressViewCone(npc.renderPosition,npc.yaw,player),true);
  const elapsed=npc.elapsed;npc.update(0,{player,seen:view(player),contactClear:false});
  assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'sight');assert.equal(npc.investigating,false);
  assert.equal(npc.activity,'idle');assert.equal(npc.poseWeight,0);assert.equal(npc.playerLocked,false);
  assert.equal(npc.scoldRemaining,0);assert.equal(npc.returnReason,'');near(npc.elapsed,elapsed);
  assert.deepEqual(npc.position,origin,'interrupting the rant cannot teleport her back to the couch or den');
  assert.equal(npc.takeEvents().filter(event=>event.kind==='chase-started').length,1);
  npc.update(.1,{player,seen:view(player)});assert.ok(Math.hypot(npc.position.x-origin.x,npc.position.z-origin.z)>0);
});

test('a rabbit still in the den remains protected for the full five-second rant',()=>{
  const npc=scolding(),origin={...npc.position};
  for(const y of [0,1.8]) {
    npc.update(0,{player:{...den(),y},seen:true,contactClear:true});assert.equal(npc.phase,'scolding');
  }
  npc.update(SCOLD_SECONDS-.001,{player:den(),seen:true,contactClear:true});
  assert.equal(npc.phase,'scolding');near(npc.scoldRemaining,.001);assert.deepEqual(npc.position,origin);
  npc.update(.001,{player:den(),seen:true,contactClear:true});assert.equal(npc.phase,'routine');
  assert.equal(npc.state,'walking');assert.equal(npc.takeEvents().filter(event=>event.kind==='chase-started').length,0);
});

test('a quiet rant hears fresh rewarding chewing outside the forward cone and pauses normally',()=>{
  const npc=scolding(),origin={...npc.position};
  const behind=point(origin.x-Math.sin(npc.yaw)*3,0,origin.z-Math.cos(npc.yaw)*3);
  assert.equal(inMistressViewCone(origin,npc.yaw,behind),false);
  const noise={id:'rant-chew',source:'shidan',kind:'eat',scope:'house',radius:null,position:behind,time:npc.elapsed,expiresAt:npc.elapsed+100};
  const elapsed=npc.elapsed,remaining=npc.scoldRemaining;
  npc.update(30,{player:behind,seen:false,noiseEvents:[noise],active:false});
  near(npc.elapsed,elapsed);near(npc.scoldRemaining,remaining);assert.deepEqual(npc.position,origin);
  npc.update(0,{player:behind,seen:view(behind),noiseEvents:[noise]});
  assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'eat');assert.equal(npc.investigating,true);
  assert.equal(npc.scoldRemaining,0);near(npc.elapsed,elapsed);assert.deepEqual(npc.position,origin);
});

test('scolding still discards local movement sounds without replaying them later',()=>{
  const npc=scolding(),origin={...npc.position};
  const behind=point(origin.x-Math.sin(npc.yaw)*3,0,origin.z-Math.cos(npc.yaw)*3);
  const noise={id:'rant-sprint',source:'shidan',kind:'sprint',scope:'local',radius:5,position:behind,time:npc.elapsed,expiresAt:npc.elapsed+100};
  npc.update(SCOLD_SECONDS,{player:behind,seen:false,noiseEvents:[noise]});assert.equal(npc.phase,'routine');
  npc.update(0,{player:behind,seen:false,noiseEvents:[noise]});assert.equal(npc.phase,'routine');
  assert.equal(npc.takeEvents().filter(event=>event.kind==='chase-started').length,0);
});

test('rant detection still respects cone range and opaque cover before reacquiring clear sight',()=>{
  const npc=scolding(),player=escaped();
  const distant=point(npc.position.x+Math.sin(npc.yaw)*51,0,npc.position.z+Math.cos(npc.yaw)*51);
  npc.update(.1,{player:distant,seen:view(distant)});assert.equal(npc.phase,'scolding');
  npc.update(.1,{player,seen:view(player,{blocked:true})});assert.equal(npc.phase,'scolding');
  npc.update(0,{player,seen:view(player)});assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'sight');
});

test('an old household event cannot mask hearing during a quiet rant or disable visual detection',()=>{
  const npc=scolding(),player=escaped();npc.noise.emit('laugh',npc.renderPosition,npc.elapsed,5);
  assert.equal(npc.maskingNoise,false);npc.update(0,{player,seen:view(player)});
  assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'sight');assert.equal(npc.maskingNoise,false);
});
