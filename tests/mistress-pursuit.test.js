import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { MistressAI,MISTRESS_ACTIVITIES,MISTRESS_DOCK_SECONDS } from '../src/mistress-ai.js';
import { MistressPursuit,chaseSpeedMultiplier,CAPTURE_SECONDS,CAPTURE_HEIGHT,CORNER_PAUSE_SECONDS,SCOLD_SECONDS,
  POOP_CLEAN_SECONDS,PEE_CLEAN_SECONDS,CLEANUP_REACH,PEE_RAGE_BONUS } from '../src/mistress-pursuit.js';
import { createHouse } from '../src/house.js';
import { createWaterFountains } from '../src/fountains.js';
import { createConsumables } from '../src/consumables.js';
import { DEN } from '../src/layout.js';
import { RabbitController,World,SURFACES } from '../src/physics.js';
import { NoiseSystem } from '../src/noise.js';

const p=(x=0,y=0,z=0)=>({x,y,z});
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);
const navigation=()=>({calls:0,
  isRabbitSafe:point=>!!point.safe,
  pursuitTarget:point=>point.safe?null:p(point.x,0,point.z),
  nearestReachable:point=>({...point}),
  randomNearby:point=>p(point.x+2,point.y,point.z+1),
  canStand:()=>true,segmentClear:()=>true,
  findPath(from,to){this.calls++;return [{...from},{...to}];},
});
function actor({random=()=>.5,nav=navigation(),seated=false}={}) {
  const routine=new MistressAI(null,{random:()=>.5,navigation:nav});
  const npc=new MistressPursuit(routine,{random});
  if(!seated) {
    routine.activity='mopping';routine.position=p();routine.renderPosition=p();routine.poseWeight=0;
    routine.yaw=0;routine._duration=1000000;routine._nextNoise=Infinity;
  }
  return npc;
}
function sound(id,position=p(0,0,4),kind='sprint',now=0) {
  return {id,source:'shidan',kind,scope:kind==='eat'?'house':'local',radius:kind==='eat'?null:5,
    position:{...position},time:now,expiresAt:now+1.2};
}
const quietContext={player:p(0,0,30),seen:false,contactClear:false};
function start(npc,player=p(0,0,30)) {npc.update(0,{player,seen:true});npc.takeEvents();return player;}
function search(npc,player=p(0,0,30)) {
  start(npc,player);npc.update(2,{player,seen:false});assert.equal(npc.phase,'chase');
  npc.update(.001,{player,seen:false});assert.equal(npc.phase,'search');npc.takeEvents();return player;
}
function waste(id,kind='poop',position=p(.5,0,0)) {
  let present=true,calls=0;
  const target={id,kind,position:{...position},get goal(){return p(this.position.x,0,this.position.z);},
    exists:()=>present,canClean:()=>true,remove(){calls++;if(!present)return false;present=false;return true;}};
  return {target,discard(){present=false;},get calls(){return calls;},get present(){return present;}};
}

test('sight or an audible fresh noise interrupts the routine without needing a simulation step',()=>{
  const seen=actor();seen.update(0,{player:p(0,0,20),seen:true});assert.equal(seen.phase,'chase');assert.equal(seen.lastDetection,'sight');
  assert.equal(seen.elapsed,0);assert.equal(seen.takeEvents()[0].kind,'chase-started');
  const heard=actor();heard.update(0,{player:p(0,0,4),noiseEvents:[sound(1)]});assert.equal(heard.phase,'chase');assert.equal(heard.lastDetection,'sprint');
  const quiet=actor();quiet.update(0,{player:p(0,0,6),noiseEvents:[sound(1,p(0,0,6))]});assert.equal(quiet.phase,'routine');
  quiet.update(0,{player:p(0,0,30),noiseEvents:[sound(2,p(0,0,30),'eat')]});assert.equal(quiet.phase,'chase','happiness chewing reaches across the house');
});

test('the den rejects sight while all inaccessible hiding areas reject noise origins',()=>{
  for(const player of [{...DEN,y:0},{...DEN,y:2}]) {
    const npc=actor();npc.update(0,{player,seen:true,noiseEvents:[sound(1,player,'eat')]});assert.equal(npc.phase,'routine');
  }
  const hidden=actor(),hiddenPlayer={...p(1,0,3),safe:true};
  hidden.update(0,{player:hiddenPlayer,seen:false,noiseEvents:[sound(1,hiddenPlayer,'eat')]});assert.equal(hidden.phase,'routine');
  const npc=actor(),player=p(0,0,4);
  npc.update(0,{player,noiseEvents:[sound(1,{x:DEN.x,y:0,z:DEN.z},'eat'),sound(2,{...player,safe:true},'eat')]});
  assert.equal(npc.phase,'routine','launch or eating noise emitted inside a safe area cannot alert after Shidan leaves');
});

test('every household noise masks hearing without replaying rejected pulses or masking vision',()=>{
  for(const kind of ['laugh','cook','vacuum','wash','shower','music','television','typing']) {
    const npc=actor();npc.noise.emit(kind,npc.renderPosition,0);assert.equal(npc.maskingNoise,true);
    const event=sound(1,p(0,0,4),'eat');event.expiresAt=10;
    npc.update(0,{player:p(0,0,4),noiseEvents:[event]});assert.equal(npc.phase,'routine');
    npc.update(1.3,{player:p(0,0,4),noiseEvents:[event]});assert.equal(npc.maskingNoise,false);assert.equal(npc.phase,'routine');
    npc.update(0,{player:p(0,0,4),noiseEvents:[sound(2,p(0,0,4),'eat',1.3)]});assert.equal(npc.phase,'chase');
    const vision=actor();vision.noise.emit(kind,vision.renderPosition,0);start(vision);assert.equal(vision.phase,'chase');
  }
});

test('only Shidan live events are heard and their independent clock is supported',()=>{
  const npc=actor();npc.update(20,quietContext);
  const player=p(0,0,4);
  npc.update(0,{player,noiseEvents:[sound(1,player,'eat',0)],noiseElapsed:2});assert.equal(npc.phase,'routine');
  npc.update(0,{player,noiseEvents:[{...sound(2,player,'eat'),source:'mistress'}],noiseElapsed:0});assert.equal(npc.phase,'routine');
  npc.update(0,{player,noiseEvents:[sound(3,player,'eat',0)],noiseElapsed:0});assert.equal(npc.phase,'chase');
});

test('heard-only pursuit reaches a fixed sound snapshot before searching, without tracking an unseen player',()=>{
  const npc=actor(),source=p(0,0,20),event=sound(1,source,'eat'),player=p(20,0,20);
  npc.update(0,{player,noiseEvents:[event]});assert.equal(npc.investigating,true);
  assert.deepEqual(npc.investigationSource,source);assert.ok(Object.isFrozen(npc.investigationSource));
  event.position.x=99;event.position.z=99;
  npc.update(3,{player:p(-5,0,2),seen:false});
  assert.equal(npc.phase,'chase');assert.equal(npc.investigating,true,'the two-second sight-loss rule must not abort an unheard-source approach');
  assert.deepEqual(npc.investigationGoal,source);assert.deepEqual(npc.route.at(-1),source);
  for(let step=0;step<200&&npc.phase==='chase';step++)npc.update(.05,{player:{x:DEN.x,y:0,z:DEN.z},seen:false});
  assert.equal(npc.phase,'search');near(distance(npc.position,source),0);near(npc.searchRemaining,15);
});

test('fresh accepted sound replaces an investigation goal, including after earlier visual pursuit',()=>{
  const npc=actor(),player=start(npc,p(20,0,20));
  npc.update(1.5,{player,seen:false});near(npc.lostSightFor,1.5);
  const first=p(0,0,20);npc.update(0,{player,seen:false,noiseEvents:[sound(1,first,'eat',npc.elapsed)]});
  assert.equal(npc.investigating,true);npc.update(1,{player,seen:false});assert.equal(npc.phase,'chase');
  assert.deepEqual(npc.route.at(-1),first);
  const next=p(10,0,20),event=sound(2,next,'eat',npc.elapsed);
  npc.update(0,{player,noiseEvents:[event],seen:false});npc.update(.4,{player,seen:false});
  assert.deepEqual(npc.investigationSource,next);assert.deepEqual(npc.investigationGoal,next);assert.deepEqual(npc.route.at(-1),next);
});

test('confirmed sight takes priority over simultaneous noise and restores ordinary consecutive sight loss',()=>{
  const npc=actor(),player=p(20,0,20);
  npc.update(0,{player,noiseEvents:[sound(1,p(0,0,20),'eat')]});assert.equal(npc.investigating,true);
  npc.update(0,{player,seen:true,noiseEvents:[sound(2,p(5,0,20),'eat')]});
  assert.equal(npc.investigating,false);assert.equal(npc.lastDetection,'sight');
  npc.update(.4,{player,seen:true});assert.deepEqual(npc.route.at(-1),player);
  npc.update(2,{player,seen:false});assert.equal(npc.phase,'chase');
  npc.update(.001,{player,seen:false});assert.equal(npc.phase,'search');
});

test('more than two consecutive seconds without renewed sight or noise slows to searching',()=>{
  const npc=actor(),player=start(npc);
  npc.update(1,{player,seen:false});assert.equal(npc.phase,'chase');
  npc.update(.8,{player,seen:true});assert.equal(npc.lostSightFor,0,'seeing Shidan resets consecutive loss');
  npc.update(1,{player,seen:false});
  npc.update(1,{player,seen:false});
  assert.equal(npc.phase,'chase');near(npc.lostSightFor,2);
  npc.update(.001,{player,seen:false});assert.equal(npc.phase,'search');assert.ok(npc.speed<=3.5);
});

test('a zero-time renewed sighting immediately breaks consecutive sight loss',()=>{
  const npc=actor(),player=start(npc);
  npc.update(1.5,{player,seen:false});near(npc.lostSightFor,1.5);
  npc.update(0,{player,seen:true});near(npc.lostSightFor,0);
  npc.update(1,{player,seen:false});assert.equal(npc.phase,'chase');near(npc.lostSightFor,1);
});

test('entering an inaccessible area immediately enters search and cannot be detected there',()=>{
  const npc=actor(),player=start(npc);npc.update(.1,{player,seen:true});
  const safe={...player,safe:true};npc.update(0,{player:safe,seen:false,noiseEvents:[sound(1,safe,'eat')]});
  assert.equal(npc.phase,'search');near(npc.searchRemaining,15);
  npc.update(.5,{player:safe,seen:false});assert.equal(npc.phase,'search');
});

test('visible rabbits at inaccessible entrances remain noticed until actual sight breaks',()=>{
  const nav=navigation();nav.pursuitTarget=()=>null;nav.nearestReachable=()=>null;
  const npc=actor({nav}),player={...p(0,0,4),safe:true};
  npc.update(0,{player,seen:true});assert.equal(npc.phase,'chase');
  npc.update(3,{player,seen:true,contactClear:true});assert.equal(npc.phase,'chase');assert.equal(npc.speed,0);
  npc.update(0,{player,seen:false});assert.equal(npc.phase,'search');
});

test('search lasts a randomized ten to twenty seconds before a routed routine return',()=>{
  for(const [random,expected] of [[()=>0,10],[()=>.5,15],[()=>1,20]]) {
    const npc=actor({random}),player=search(npc);near(npc.searchRemaining,expected);
    npc.update(expected-.01,{player});assert.equal(npc.phase,'search');
    npc.update(.02,{player});assert.equal(npc.phase,'returning');assert.equal(npc.returnReason,'search');
  }
});

test('sprint re-alert has an exact two-second grace period and never replays a rejected pulse',()=>{
  const npc=actor(),player=p(0,0,30);search(npc,player);
  npc.update(1.999,{player});
  const event=sound(1,npc.renderPosition,'sprint',npc.elapsed);event.expiresAt=npc.elapsed+10;
  npc.update(0,{player,noiseEvents:[event]});assert.equal(npc.phase,'search');
  npc.update(.001,{player,noiseEvents:[event]});assert.equal(npc.phase,'search');near(npc.sprintHearingCooldown,0);
  npc.update(0,{player,noiseEvents:[sound(2,npc.renderPosition,'sprint',npc.elapsed)]});assert.equal(npc.phase,'chase');
  const chewing=actor();search(chewing);chewing.update(0,{player,noiseEvents:[sound(1,npc.renderPosition,'eat',chewing.elapsed)]});
  assert.equal(chewing.phase,'chase','other fresh noises remain detectable during the sprint-only grace period');
});

test('the chase multiplier rises at two-minute boundaries and follows the supplied sprint speed',()=>{
  for(const [time,multiplier] of [[-1,.6],[0,.6],[119.999,.6],[120,.65],[239.999,.65],[240,.7],
    [359.999,.7],[360,.75],[479.999,.75],[480,.8],[600,.8],[10000,.8],[NaN,.6]]) {
    near(chaseSpeedMultiplier(time),multiplier);
    for(const {run} of Object.values(SURFACES)) {
      const npc=actor();npc.update(0,{...quietContext,dayElapsed:time,sprintSpeed:run});near(npc.chaseSpeed,run*multiplier);
    }
  }
  const npc=actor();start(npc);npc.update(1,{...quietContext,seen:true,sprintSpeed:8.5,dayElapsed:240});
  near(npc.chaseSpeed,5.95);assert.ok(npc.speed>3.5&&npc.speed<=5.95);
});

test('reset derives the starting chase speed from the same tier schedule before any update',()=>{
  const npc=actor();near(npc.chaseMultiplier,chaseSpeedMultiplier(0));near(npc.chaseSpeed,8.2*.6);
  npc.update(0,{...quietContext,dayElapsed:480,sprintSpeed:8.8});near(npc.chaseSpeed,8.8*.8);
  npc.reset();near(npc.chaseMultiplier,chaseSpeedMultiplier(0));near(npc.chaseSpeed,8.2*.6);
});

test('chasing follows cached 3D routes and does not replan every frame for a stationary target',()=>{
  const nav=navigation(),npc=actor({nav}),player=start(npc,p(0,0,30));
  for(let i=0;i<100;i++)npc.update(.02,{player,seen:true});
  assert.equal(nav.calls,1);assert.ok(npc.position.z>5&&npc.position.z<12);near(npc.position.x,0);
  assert.equal(npc.renderPosition.y,npc.position.y);assert.equal(npc.phase,'chase');
});

test('sharp corners slow the run, enforce a brief stop, then allow progress despite target replanning',()=>{
  const nav=navigation();nav.findPath=function(from,to){this.calls++;return from.z<4.999?[{...from},p(0,0,5),{...to}]:[{...from},{...to}];};
  const npc=actor({nav});let player=start(npc,p(10,0,5)),paused=false,braked=false,remaining=0,atPause=null;
  for(let i=0;i<250;i++) {
    if(i%20===0)player=p(10+i*.01,0,5);
    npc.update(.02,{player,seen:true});
    if(npc.position.z>3.5&&npc.position.z<4.95&&npc.speed<npc.chaseSpeed-.2)braked=true;
    if(npc.cornerPauseRemaining>0&&!paused) {paused=true;remaining=npc.cornerPauseRemaining;atPause={...npc.position};}
    else if(paused&&npc.cornerPauseRemaining>0)assert.deepEqual(npc.position,atPause);
    if(paused&&npc.position.x>1)break;
  }
  assert.ok(paused&&braked);near(remaining,CORNER_PAUSE_SECONDS);assert.ok(npc.position.x>1,'corner pause must not restart forever on replans');
});

test('capture requires close clear contact, locks for exactly three seconds, and emits one return event',()=>{
  const npc=actor(),player=start(npc,p(.4,0,0));
  npc.update(0,{player,seen:true,contactClear:false});assert.equal(npc.phase,'chase');
  npc.update(0,{player,seen:true,contactClear:true});assert.equal(npc.phase,'caught');assert.equal(npc.playerLocked,true);
  assert.equal(npc.takeEvents().filter(event=>event.kind==='caught').length,1);
  const before={...npc.position},playerBefore={...player};
  npc.update(CAPTURE_SECONDS-.001,{player,seen:true,contactClear:true});assert.equal(npc.phase,'caught');near(npc.captureRemaining,.001);
  assert.deepEqual(npc.position,before);assert.deepEqual(player,playerBefore,'resource/player reset remains the host responsibility');
  npc.update(.001,{player,seen:true,contactClear:true});assert.equal(npc.phase,'scolding');assert.equal(npc.playerLocked,false);
  near(npc.scoldRemaining,SCOLD_SECONDS);assert.equal(npc.activity,'angry');assert.equal(npc.state,'acting');assert.equal(npc.poseWeight,1);
  assert.equal(npc.takeEvents().filter(event=>event.kind==='return-den').length,1);assert.equal(npc.takeEvents().length,0);
});

test('capture cannot reach a high platform or bypass explicit opaque-contact rejection',()=>{
  const npc=actor(),high=p(.1,CAPTURE_HEIGHT+.01,0);start(npc,high);
  npc.update(0,{player:high,seen:true,contactClear:true});assert.equal(npc.phase,'chase');
  assert.equal(npc.canAttemptCapture(high),false);
  npc.update(0,{player:p(.1,0,0),seen:true,contactClear:false});assert.equal(npc.phase,'chase');
});

test('peeing blocks capture rays during chase and search while preserving sight and ordinary detection',()=>{
  const alerted=actor(),visible=p(.3,0,0);
  alerted.update(0,{player:visible,seen:true,peeing:true,contactClear:()=>assert.fail('a peeing rabbit cannot reach a capture ray')});
  assert.equal(alerted.phase,'chase','the pee action still permits initial visual detection');
  for(const searching of [false,true]) {
    const npc=actor(),player=p(.3,0,0);start(npc,player);
    if(searching)search(npc,player);
    let contacts=0;
    assert.equal(npc.canAttemptCapture(player),true);
    assert.equal(npc.canAttemptCapture(player,{peeing:true}),false);
    npc.update(.999,{player,seen:!searching,peeing:true,movementScale:0,contactClear:()=>{contacts++;return true;}});
    assert.equal(npc.phase,searching?'search':'chase');assert.equal(npc.playerLocked,false);assert.equal(contacts,0);
    assert.equal(npc.takeEvents().some(event=>event.kind==='caught'),false);
    npc.update(0,{player,seen:true,peeing:true,contactClear:()=>{contacts++;return true;}});
    assert.equal(npc.phase,'chase','peeing does not hide an otherwise visible rabbit');assert.equal(contacts,0);
    npc.update(0,{player,seen:true,peeing:false,contactClear:()=>{contacts++;return true;}});
    assert.equal(npc.phase,'caught','ordinary capture resumes when the action ends without reachable waste');assert.equal(contacts,1);
  }
});

test('capture teleports to a den-side stance, scolds for five seconds, then resumes a random routine there',()=>{
  const npc=actor();npc.noise.emit('cook',npc.position,0);
  const player=start(npc,p(.2,0,0));npc.update(0,{player,seen:true,contactClear:true});npc.update(3,{player});
  assert.equal(npc.phase,'scolding');const stance={...npc.position};
  assert.ok(Math.hypot(stance.x-DEN.x,stance.z-DEN.z)>DEN.radius);
  assert.ok(Math.hypot(stance.x-DEN.x,stance.z-DEN.z)<DEN.radius+1);
  near(Math.atan2(DEN.x-stance.x,DEN.z-stance.z),npc.yaw);
  const event=sound(1,stance,'sprint',npc.elapsed);event.expiresAt=100;
  npc.update(1,{player:stance,seen:false,contactClear:true,noiseEvents:[event]});
  assert.equal(npc.phase,'scolding','unseen sounds do not interrupt her rant while Shidan is already free to move');
  assert.deepEqual(npc.position,stance);near(npc.activityTime,1);near(npc.scoldRemaining,4);
  const elapsed=npc.elapsed;npc.update(30,{player:stance,active:false});near(npc.elapsed,elapsed);near(npc.scoldRemaining,4);
  npc.update(3.999,{player:stance,seen:false,contactClear:true,noiseEvents:[event]});assert.equal(npc.phase,'scolding');
  npc.update(.001,{player:{x:DEN.x,y:0,z:DEN.z}});
  assert.equal(npc.phase,'routine');assert.equal(npc.state,'walking');
  assert.deepEqual(npc.position,stance);assert.deepEqual(npc.renderPosition,stance);near(npc.elapsed,8);
  assert.notDeepEqual(npc.renderPosition,MISTRESS_ACTIVITIES[0].seat,'resuming cannot teleport her to the couch');
  near(npc.routine.elapsed,npc.elapsed);assert.equal(npc.noise.sequence,1);assert.equal(npc.noise.events.length,0);
  npc.update(0,{player:stance,seen:false,noiseEvents:[event]});assert.equal(npc.phase,'routine','scolding cannot bank a noise to replay afterwards');
});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

test('a seated activity undocks before walking instead of teleporting through its furniture',()=>{
  const npc=actor({seated:true}),initial={...npc.renderPosition};start(npc,p(-10,0,6));
  assert.equal(npc.state,'leaving');assert.deepEqual(npc.renderPosition,initial);
  npc.update(.6,{player:p(-10,0,6),seen:true});near(npc.poseWeight,.5);
  assert.notDeepEqual(npc.renderPosition,initial);assert.equal(npc.speed,0);
  npc.update(.6,{player:p(-10,0,6),seen:true});near(npc.poseWeight,0);assert.equal(npc.state,'walking');
  assert.deepEqual(npc.renderPosition,npc.position);
});

test('pause and invalid time deltas preserve all pursuit clocks, routes, capture and events',()=>{
  const npc=actor();start(npc);npc.update(.6,{...quietContext,seen:true});
  const snapshot=()=>({elapsed:npc.elapsed,phase:npc.phase,position:{...npc.position},route:npc.route,speed:npc.speed});
  const before=snapshot();for(const dt of [-1,NaN,Infinity])npc.update(dt,quietContext);
  npc.update(0);assert.deepEqual(snapshot(),before,'a zero-time call without a player does not invent a safe-area transition');
  npc.update(30,{...quietContext,active:false});assert.deepEqual(snapshot(),before);
  npc.reset();assert.equal(npc.elapsed,0);assert.equal(npc.phase,'routine');assert.equal(npc.activity,'phone');assert.equal(npc.noise.sequence,0);
  assert.equal(npc.captureRemaining,0);assert.equal(npc.takeEvents().length,0);
});

test('the furnished level supports safe hiding and an outdoor pursuit without leaving the human graph',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);createConsumables(scene,world);
  const routine=new MistressAI(world,{random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  const player=p(0,0,25);start(npc,player);
  for(let i=0;i<250;i++) {
    npc.update(.05,{player,seen:true});
    assert.equal(npc.navigation.canStand(npc.position),true,`human must stay on its graph at ${JSON.stringify(npc.position)}`);
  }
  assert.ok(npc.position.z>20,'mistress follows Shidan through the main entrance');
  const hidden=p(-22.5,0,-12);npc.update(0,{player:hidden,seen:false});assert.equal(npc.phase,'search');
});

test('a real different-room noise is investigated for longer than two seconds and searched only on arrival',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);createConsumables(scene,world);
  const npc=new MistressPursuit(new MistressAI(world,{random:()=>.5}),{random:()=>.5});
  const source={...MISTRESS_ACTIVITIES.find(activity=>activity.id==='cooking').approach},player=p(3,0,-30);
  npc.update(0,{player,noiseEvents:[sound(1,source,'eat')]});assert.equal(npc.investigating,true);
  npc.update(3.1,{player,seen:false});assert.equal(npc.phase,'chase');assert.equal(npc.investigating,true);
  assert.ok(distance(npc.position,source)>1,'the source is still in a different room after the old two-second timeout');
  const goal={...npc.investigationGoal};assert.deepEqual(goal,source);
  for(let frame=0;frame<1000&&npc.phase==='chase';frame++) {
    npc.update(.05,{player,seen:false});assert.equal(npc.navigation.canStand(npc.position),true);
  }
  assert.equal(npc.phase,'search');near(distance(npc.position,goal),0);near(npc.searchRemaining,15);
});

test('real rewarding chewing immediately interrupts first-floor searching and only fresh pulses retarget it',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);
  const routine=new MistressAI(world,{random:()=>.5}),nav=routine.navigation;
  const food=createConsumables(scene,world,{canSpawn:place=>!nav.isRabbitSafe(place)});
  const npc=new MistressPursuit(routine,{random:()=>.5}),rabbit=new RabbitController(world),noise=new NoiseSystem();
  Object.assign(rabbit,p(-17,0,-15.5));
  start(npc,rabbit);npc.update(2.001,{player:rabbit,seen:false});
  assert.equal(npc.phase,'search');assert.ok(npc.sprintHearingCooldown>1.99);assert.equal(npc.maskingNoise,false);
  assert.equal(nav.componentAt(npc.position),nav.mainComponent);assert.equal(nav.isRabbitSafe(rabbit,npc.position),false);
  function chew() {
    food.system.begin(rabbit);const progress=food.system.progress;
    const resourceEvents=food.system.update(.1,rabbit,0);
    const eating=food.system.progress>progress?food.system.target:resourceEvents.find(event=>event.kind==='consume')?.item;
    assert.ok(eating,'a real consumable hold must progress before noise is generated');
    const emitted=noise.update(.1,rabbit,{consuming:eating});
    assert.equal(emitted.at(-1)?.kind,'eat');assert.equal(emitted.at(-1)?.scope,'house');
    return eating;
  }
  assert.equal(chew().id,'book-3');const source={x:rabbit.x,y:rabbit.y,z:rabbit.z},time=npc.elapsed;
  npc.update(0,{player:rabbit,seen:false,noiseEvents:noise.events,noiseElapsed:noise.elapsed});
  assert.equal(npc.phase,'chase');assert.equal(npc.investigating,true);assert.equal(npc.lastDetection,'eat');near(npc.elapsed,time);
  assert.deepEqual(npc.investigationSource,source,'chewing bypasses the sprint-only grace period immediately');
  npc.update(.05,{player:rabbit,seen:false});const firstGoal={...npc.investigationGoal};
  food.system.cancel();noise.update(.8,rabbit,{consuming:null});
  Object.assign(rabbit,p(-12.1,0,17.2));
  npc.update(.4,{player:rabbit,seen:false,noiseEvents:noise.events,noiseElapsed:noise.elapsed});
  assert.deepEqual(npc.investigationSource,source);assert.deepEqual(npc.route.at(-1),firstGoal,'silent movement cannot steer the last heard source');
  assert.equal(chew().id,'carrot-0');
  npc.update(0,{player:rabbit,seen:false,noiseEvents:noise.events,noiseElapsed:noise.elapsed});
  const latest={x:rabbit.x,y:rabbit.y,z:rabbit.z};assert.deepEqual(npc.investigationSource,latest);
  npc.update(.4,{player:rabbit,seen:false});assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'eat');
  assert.deepEqual(npc.route.at(-1),npc.investigationGoal);assert.notDeepEqual(npc.investigationGoal,firstGoal);
});

test('the post-capture scolding stance is valid beside the furnished den and resumes without another teleport',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);createConsumables(scene,world);
  const npc=new MistressPursuit(new MistressAI(world,{random:()=>.5}),{random:()=>.5}),routine=npc.routine;
  routine.activity='mopping';routine.position=p(-11.4,0,12);routine.renderPosition={...routine.position};routine.poseWeight=0;
  const player=p(-11.1,0,12);start(npc,player);npc.update(0,{player,seen:true,contactClear:true});
  assert.equal(npc.phase,'caught');npc.update(3,{player});assert.equal(npc.phase,'scolding');
  const stance={...npc.position};assert.equal(npc.navigation.canStand(stance),true);assert.equal(npc.navigation.isDen(stance),false);
  assert.ok(Math.hypot(stance.x-DEN.x,stance.z-DEN.z)<DEN.radius+1);
  near(npc.yaw,Math.atan2(DEN.x-stance.x,DEN.z-stance.z));
  npc.update(5,{player:{x:DEN.x,y:0,z:DEN.z},movementScale:0});
  assert.equal(npc.phase,'routine');assert.equal(npc.state,'walking');assert.deepEqual(npc.position,stance);assert.deepEqual(npc.renderPosition,stance);
});

test('real furnished-house diagonal doorway turns trigger pursuit pauses',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);createConsumables(scene,world);
  const npc=new MistressPursuit(new MistressAI(world,{random:()=>.5}),{random:()=>.5});
  const player=p(3,0,-30),corners=[p(-14,0,7),p(-13.5,0,6.5)],pauses=[];let wasPaused=false;
  start(npc,player);
  for(let frame=0;frame<1000&&pauses.length<2;frame++) {
    npc.update(.02,{player,seen:true});
    const paused=npc.cornerPauseRemaining>0;
    if(paused&&!wasPaused) {pauses.push({...npc.position});assert.equal(npc.speed,0);}
    wasPaused=paused;
  }
  // This real route splits a right-angle exit into 48.2° and 42.1° turns,
  // separated by .71m. A 50° threshold missed both of these escape chances.
  assert.equal(pauses.length,2);
  for(let index=0;index<corners.length;index++)near(distance(pauses[index],corners[index]),0);
});

test('the shared movement budget preserves chase-to-sprint ratios at 60, 10 and 5 FPS',()=>{
  const run=SURFACES.grass.run;
  for(const fps of [60,10,5])for(const [day,multiplier] of [[0,.6],[120,.65],[240,.7],[360,.75],[480,.8]]) {
    const rabbit=new RabbitController(new World());Object.assign(rabbit,p(0,0,22));
    const npc=actor();start(npc,p(0,0,30));npc.update(1,{player:p(0,0,30),seen:true,sprintSpeed:run,dayElapsed:day});
    const rabbitStart=rabbit.z,npcStart=npc.position.z,wallDt=1/fps;
    for(let frame=0;frame<fps;frame++) {
      const movementDt=Math.min(.1,wallDt);
      rabbit.update(movementDt,{z:1,run:true});
      let left=wallDt,budget=movementDt;
      while(left>1e-9) {
        const step=Math.min(.05,left),travel=Math.min(step,budget);left-=step;budget-=travel;
        npc.update(step,{player:rabbit,seen:true,sprintSpeed:run,dayElapsed:day+(frame+1)*wallDt-left,movementScale:travel/step});
      }
    }
    const rabbitTravel=rabbit.z-rabbitStart,npcTravel=npc.position.z-npcStart;
    near(npcTravel/rabbitTravel,multiplier,1e-5);
    near(npc.elapsed,2);assert.ok(npcTravel<rabbitTravel,`${fps} FPS must never turn a slower chaser into a faster one`);
  }
});

test('zero travel advances the routine clock and task timers without moving a routed walker',()=>{
  const routine=new MistressAI(null,{navigation:navigation(),random:()=>.5});
  routine.update(6,{movementScale:0});assert.equal(routine.noise.sequence,1);near(routine.elapsed,6);near(routine.remaining,26);
  routine.update(routine.remaining+MISTRESS_DOCK_SECONDS,{movementScale:0});assert.equal(routine.state,'walking');
  const before={...routine.position},time=routine.elapsed;
  routine.update(9,{movementScale:0});assert.deepEqual(routine.position,before);near(routine.elapsed,time+9);
  assert.equal(routine.state,'walking');assert.equal(routine.speed,3.5);
  routine.update(1,{movementScale:.5});near(distance(routine.position,before),1.75);near(routine.elapsed,time+10);
});

test('lost-sight, searching and capture timers use wall time even with no travel budget',()=>{
  const npc=actor(),player=start(npc);const before={...npc.position};
  npc.update(2,{player,movementScale:0});assert.equal(npc.phase,'chase');assert.deepEqual(npc.position,before);
  npc.update(.001,{player,movementScale:0});assert.equal(npc.phase,'search');near(npc.searchRemaining,15);
  npc.update(1,{player,movementScale:0});near(npc.searchRemaining,14);assert.deepEqual(npc.position,before);
  const caught=actor(),close=p(.3,0,0);start(caught,close);caught.update(0,{player:close,seen:true,contactClear:true});
  caught.update(2.999,{player:close,movementScale:0});assert.equal(caught.phase,'caught');near(caught.captureRemaining,.001);
  caught.update(.001,{player:close,movementScale:0});assert.equal(caught.phase,'scolding');
  assert.equal(caught.takeEvents().filter(event=>event.kind==='return-den').length,1);
  const returnedFrom={...caught.position};caught.update(2,{player:close,movementScale:0});
  assert.equal(caught.phase,'scolding');assert.deepEqual(caught.position,returnedFrom);near(caught.elapsed,5);near(caught.scoldRemaining,3);
});

test('search and couch-return travel share the movement scale without scaling their deadlines',()=>{
  const normal=actor(),slow=actor();search(normal);search(slow);
  const from={...normal.position};normal.update(.2,{...quietContext,movementScale:1});slow.update(.2,{...quietContext,movementScale:.5});
  near(distance(slow.position,from)/distance(normal.position,from),.5);near(slow.searchRemaining,normal.searchRemaining);
  const first=actor(),second=actor(),player=p(0,0,30);
  for(const npc of [first,second]) {search(npc,player);npc.update(15,{player,movementScale:0});assert.equal(npc.phase,'returning');}
  const initial={...first.position};first.update(.5,{player,movementScale:1});second.update(.5,{player,movementScale:.5});
  assert.ok(distance(second.position,initial)>0&&distance(second.position,initial)<distance(first.position,initial));
  near(first.elapsed,second.elapsed);
});

test('a sharp-corner pause uses real time and a later lap pauses at the same corner again',()=>{
  const nav=navigation(),a=p(0,0,5);
  nav.findPath=function(from,to){this.calls++;return [{...from},a,p(4,0,5),p(4,0,9),p(0,0,9),a,{...to}];};
  const npc=actor({nav}),player=start(npc,p(-4,0,5));let visits=0,wasPaused=false,checkedWallPause=false;
  for(let frame=0;frame<1800&&visits<2;frame++) {
    npc.update(.01,{player,seen:true});
    const paused=npc.cornerPauseRemaining>0;
    if(paused&&!wasPaused&&distance(npc.position,a)<1e-5) {
      visits++;
      if(!checkedWallPause) {
        const current={...npc.position};npc.update(.2,{player,seen:true,movementScale:0});
        near(npc.cornerPauseRemaining,CORNER_PAUSE_SECONDS-.2);assert.deepEqual(npc.position,current);checkedWallPause=true;
      }
    }
    wasPaused=npc.cornerPauseRemaining>0;
  }
  assert.equal(visits,2,'a route loop must not permanently disable a corner pause');
});

test('visible waste interrupts a chase, stays targeted out of view and is cleaned without capturing Shidan',()=>{
  assert.equal(POOP_CLEAN_SECONDS,.2);
  const npc=actor(),player=start(npc,p(.3,0,0)),mess=waste('poop-1','poop',p(0,0,12));
  npc.update(0,{player,seen:true,contactClear:true,cleanupTarget:mess.target});
  assert.equal(npc.phase,'cleanup');assert.equal(npc.playerLocked,false);assert.equal(npc.cleanupTargetId,'poop-1');
  assert.equal(npc.cleanupKind,'poop');assert.equal(npc.activity,'cleaning');near(npc.cleanupRemaining,POOP_CLEAN_SECONDS);
  assert.equal(npc.cleanupTarget,mess.target);
  // Moving a physical ball updates the retained descriptor even when it is
  // no longer offered by the visibility scan.
  mess.target.position.x=8;mess.target.position.z=4;
  let arrived=false;
  for(let frame=0;frame<500&&!arrived;frame++) {
    npc.update(.02,{player,seen:true,contactClear:true});
    arrived=npc.state==='acting';assert.equal(npc.phase,'cleanup');
  }
  assert.ok(arrived);assert.equal(npc.poseWeight,1);assert.equal(npc.speed,0);
  assert.ok(Math.hypot(npc.position.x-8,npc.position.z-4)<=CLEANUP_REACH);near(npc.activityTime,0);
  const stance={...npc.position};npc.update(POOP_CLEAN_SECONDS-.001,{player,seen:true,contactClear:true,movementScale:0});
  assert.equal(npc.phase,'cleanup');near(npc.cleanupRemaining,.001);assert.deepEqual(npc.position,stance);
  npc.update(.001,{player,seen:true,contactClear:true,movementScale:0});
  assert.equal(mess.calls,1);assert.equal(mess.present,false);assert.equal(npc.phase,'chase');assert.equal(npc.playerLocked,false);
  const finished=npc.takeEvents().filter(event=>event.kind==='cleanup-finished');
  assert.equal(finished.length,1);assert.equal(finished[0].cleanupKind,'poop');assert.equal(finished[0].id,'poop-1');near(npc.rageBonus,0);
  npc.update(1,{player,cleanupTarget:mess.target});assert.equal(mess.calls,1,'a removed ball cannot be cleaned twice');
});

test('pee preempts unfinished poop work, cannot be preempted by poop, and needs fifteen active seconds',()=>{
  const npc=actor(),poop=waste('poop'),pee=waste('pee','pee'),player=p(0,0,30);
  npc.update(POOP_CLEAN_SECONDS*.6,{player,cleanupTarget:poop.target});near(npc.cleanupRemaining,POOP_CLEAN_SECONDS*.4);
  npc.update(0,{player,cleanupTarget:pee.target});assert.equal(npc.cleanupKind,'pee');near(npc.cleanupRemaining,PEE_CLEAN_SECONDS);
  assert.equal(poop.calls,0);assert.equal(poop.present,true);
  npc.update(4,{player,cleanupTarget:poop.target,movementScale:0});assert.equal(npc.cleanupKind,'pee');near(npc.cleanupRemaining,11);
  const elapsed=npc.elapsed;npc.update(30,{player,active:false});near(npc.elapsed,elapsed);near(npc.cleanupRemaining,11);
  npc.update(10.999,{player,movementScale:0});assert.equal(npc.phase,'cleanup');near(npc.cleanupRemaining,.001);
  npc.update(.001,{player,movementScale:0});assert.equal(npc.phase,'search');assert.equal(pee.calls,1);near(npc.rageBonus,PEE_RAGE_BONUS);
  assert.equal(npc.cleanupKind,'');assert.equal(npc.cleanupTargetId,null);near(npc.cleanupRemaining,0);
});

test('unfinished pee cannot preempt pending poop work until its live descriptor becomes ready',()=>{
  const npc=actor(),poop=waste('poop'),pee=waste('pee','pee'),player=p(0,0,30);
  pee.target.ready=false;
  npc.update(POOP_CLEAN_SECONDS*.25,{player,cleanupTarget:poop.target});
  const before=npc.cleanupRemaining;npc.update(0,{player,cleanupTarget:pee.target,peeing:true});
  assert.equal(npc.cleanupKind,'poop');near(npc.cleanupRemaining,before);assert.equal(pee.calls,0);
  pee.target.ready=true;npc.update(0,{player,cleanupTarget:pee.target,peeing:false});
  assert.equal(npc.cleanupKind,'pee');near(npc.cleanupRemaining,15);assert.equal(poop.calls,0);
});

test('cleanup cancellation and failed removal never award rage or remove another waste object',()=>{
  const player=p(0,0,30),npc=actor(),removed=waste('pee-old','pee');
  npc.update(4,{player,cleanupTarget:removed.target});removed.discard();npc.update(0,{player});
  assert.equal(npc.phase,'search');near(npc.rageBonus,0);assert.equal(removed.calls,0);
  const replacement=waste('pee-new','pee');npc.update(0,{player,cleanupTarget:replacement.target});
  replacement.target.remove=()=>false;npc.update(PEE_CLEAN_SECONDS,{player});
  assert.equal(npc.phase,'search');near(npc.rageBonus,0);assert.equal(replacement.present,true);
  assert.equal(npc.takeEvents().filter(event=>event.kind==='cleanup-finished').length,0);
});

test('counter-height waste can be reached but physical obstructions and invalid live goals cancel cleanup',()=>{
  const player=p(0,0,30),npc=actor(),counter=waste('counter','poop',p(.5,1.5,0));
  npc.update(POOP_CLEAN_SECONDS,{player,cleanupTarget:counter.target});assert.equal(counter.calls,1);
  const blocked=waste('blocked','pee');blocked.target.canClean=()=>false;
  npc.update(0,{player,cleanupTarget:blocked.target});npc.update(1,{player});assert.equal(blocked.calls,0);assert.equal(npc.phase,'search');
  const moved=waste('moved','pee',p(0,0,20));npc.update(.2,{player,cleanupTarget:moved.target});
  Object.defineProperty(moved.target,'goal',{get:()=>null});npc.update(.4,{player});
  assert.equal(npc.phase,'search');assert.equal(moved.calls,0);near(npc.rageBonus,0);
  const hidden=waste('nearby-hidden','poop',{...npc.position});Object.defineProperty(hidden.target,'goal',{get:()=>null});
  npc.update(0,{player,cleanupTarget:hidden.target});npc.update(.6,{player});
  assert.equal(npc.phase,'search');assert.equal(hidden.calls,0,'a null goal overrides an otherwise reachable nearby position');
  const tooHigh=waste('unreachable','pee',p(0,2.1,0));npc.update(0,{player,cleanupTarget:tooHigh.target});npc.update(1,{player});
  assert.equal(npc.phase,'search');assert.equal(tooHigh.calls,0);
});

test('cleanup remembers the latest accepted chewing source ahead of sight and consumes other noises',()=>{
  const npc=actor(),player=p(0,0,30),mess=waste('poop'),first=p(0,0,15),latest=p(12,0,20);
  npc.update(0,{player,noiseEvents:[sound(1,first,'eat')],cleanupTarget:mess.target});assert.equal(npc.phase,'cleanup');
  const elapsed=POOP_CLEAN_SECONDS*.4;npc.update(elapsed,{player});
  npc.update(0,{player,noiseElapsed:elapsed,noiseEvents:[sound(2,latest,'eat',elapsed),sound(3,npc.position,'sprint',elapsed)]});
  assert.equal(npc.phase,'cleanup');assert.equal(npc.investigating,false);
  npc.update(POOP_CLEAN_SECONDS-elapsed,{player,seen:true});assert.equal(npc.phase,'chase');assert.equal(npc.investigating,true);
  assert.deepEqual(npc.investigationSource,latest);assert.equal(npc.lastDetection,'eat');
  npc.update(.1,{player,seen:false});assert.deepEqual(npc.route.at(-1),npc.investigationGoal);
  assert.notDeepEqual(npc.route.at(-1),player,'cleanup dispatch must not follow the current unseen player');
});

test('masked chewing and already-consumed capture pulses cannot replay during a later scold',()=>{
  const player=p(0,0,30),npc=actor(),mess=waste('poop'),event=sound(1,p(10,0,20),'eat');
  event.expiresAt=100;npc.noise.emit('wash',npc.renderPosition,0);
  npc.update(POOP_CLEAN_SECONDS,{player,cleanupTarget:mess.target,noiseEvents:[event]});
  assert.equal(npc.phase,'search');assert.equal(npc.investigating,false);
  npc.update(1.2,{player,noiseEvents:[event]});assert.equal(npc.phase,'search','the masked pulse remains consumed after the wash sound expires');
  const caught=actor(),close=p(.2,0,0),pee=waste('pee','pee');start(caught,close);
  caught.update(0,{player:close,seen:true,contactClear:true});
  caught.update(.5,{player:close,seen:true,cleanupTarget:pee.target,noiseEvents:[event]});assert.equal(caught.phase,'caught');
  caught.update(2.5,{player:close,cleanupTarget:pee.target});assert.equal(caught.phase,'scolding');
  caught.update(.5,{player:close,seen:false,cleanupTarget:pee.target});assert.equal(caught.phase,'scolding');assert.equal(pee.calls,0);
});

test('each successful pee clean adds a persistent top-sprint bonus to chase, search and routine walking',()=>{
  const npc=actor(),player=p(0,0,30);
  for(let count=1;count<=2;count++) {
    const pee=waste(`pee-${count}`,'pee');npc.update(PEE_CLEAN_SECONDS,{player,cleanupTarget:pee.target,sprintSpeed:7,topSprintSpeed:8.8,movementScale:0});
    assert.equal(pee.calls,1);near(npc.rageBonus,.05*count);near(npc.rageSpeedBonus,.44*count);
    near(npc.chaseSpeed,7*.6+.44*count);near(npc.walkSpeed,3.5+.44*count);assert.equal(npc.phase,'search');
  }
  const at={...npc.position};npc.update(.2,{player,sprintSpeed:7,topSprintSpeed:8.8});
  near(distance(npc.position,at),.2,1e-6);assert.ok(npc.speed>0&&npc.speed<=npc.walkSpeed);
  // Search timeout and the ordinary couch route retain rage. The next regular
  // task then uses the same boosted walk speed rather than resetting it.
  npc.update(15,{player,movementScale:0});assert.equal(npc.phase,'returning');
  for(let frame=0;frame<1000&&npc.phase!=='routine';frame++)npc.update(.05,{player});
  assert.equal(npc.phase,'routine');near(npc.rageBonus,.1);
  for(let frame=0;frame<1000&&npc.state!=='walking';frame++)npc.update(.05,{player});
  assert.equal(npc.state,'walking');const from={...npc.position};npc.update(.1,{player});
  near(distance(npc.position,from),(3.5+.88)*.1);near(npc.speed,3.5+.88);
  npc.update(0,{player,sprintSpeed:8.5,topSprintSpeed:8.8,dayElapsed:480});near(npc.chaseSpeed,8.5*.8+.88);
  npc.reset();near(npc.rageBonus,0);near(npc.rageSpeedBonus,0);near(npc.walkSpeed,3.5);
});

test('an actual multiroom waste distraction follows human routes, corner pauses and its retained live target',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);
  const npc=new MistressPursuit(new MistressAI(world,{random:()=>.5}),{random:()=>.5});
  const position={...MISTRESS_ACTIVITIES.find(activity=>activity.id==='cooking').approach},mess=waste('kitchen-poop','poop',position);
  const player={x:DEN.x,y:0,z:DEN.z};let paused=false;
  npc.update(0,{player,cleanupTarget:mess.target});assert.equal(npc.phase,'cleanup');assert.equal(npc.state,'leaving');
  for(let frame=0;frame<1600&&npc.phase==='cleanup';frame++) {
    npc.update(.02,{player});assert.equal(npc.navigation.canStand(npc.position),true);
    paused ||= npc.cornerPauseRemaining>0;
  }
  assert.equal(mess.calls,1);assert.equal(npc.phase,'search');assert.ok(paused,'cleanup running must still pause at real doorways');
  assert.ok(npc.elapsed>2);near(npc.rageBonus,0);
});

test('routine walking accepts a travel speed without accelerating activity clocks or bypassing movement budgets',()=>{
  const routine=new MistressAI(null,{navigation:navigation(),random:()=>.5});
  routine.update(6,{walkingSpeed:4.38,movementScale:0});near(routine.elapsed,6);near(routine.remaining,26);
  routine.update(routine.remaining+MISTRESS_DOCK_SECONDS,{walkingSpeed:4.38,movementScale:0});assert.equal(routine.state,'walking');
  const at={...routine.position},time=routine.elapsed;routine.update(1,{walkingSpeed:4.38,movementScale:.5});
  near(distance(routine.position,at),2.19);near(routine.elapsed,time+1);near(routine.speed,4.38);
  const stopped={...routine.position};routine.update(2,{walkingSpeed:0});assert.deepEqual(routine.position,stopped);near(routine.elapsed,time+3);
  routine.update(.1);near(routine.speed,3.5);
});

test('contact callbacks inspect the current moved position and false callbacks never act as a clear ray',()=>{
  const npc=actor(),player=start(npc,p(0,0,4)),positions=[];
  npc.update(1,{player,seen:true,contactClear:current=>{positions.push({...current.position});return true;}});
  assert.equal(npc.phase,'caught');assert.ok(positions.length>0);
  assert.ok(positions[0].z>=player.z-.8,'a ray must not be called until the moving NPC is in real capture range');
  assert.ok(positions[0].z>0,'the callback observes movement from this update, not the frame-start pose');
  const blocked=actor(),close=start(blocked,p(.3,0,0));let checks=0;
  blocked.update(2.01,{player:close,seen:false,movementScale:0,contactClear:()=>{checks++;return false;}});
  assert.equal(blocked.phase,'search');assert.equal(blocked.playerLocked,false);assert.ok(checks>0);
  blocked.update(.2,{player:close,seen:false,movementScale:0,contactClear:()=>false});assert.equal(blocked.phase,'search');
});

test('fresh physical contact wins at the visual-loss boundary and remains valid during alert searching',()=>{
  const npc=actor(),far=start(npc);npc.update(1.99,{player:far,movementScale:0});npc.takeEvents();
  const close=p(.3,0,0),phases=[];
  npc.update(.05,{player:close,seen:false,contactClear:current=>{phases.push(current.phase);return true;}});
  assert.equal(npc.phase,'caught');assert.deepEqual(phases,['chase']);
  assert.equal(npc.takeEvents().some(event=>event.kind==='search-started'),false,'do not roam away before checking a reachable rabbit');
  const searching=actor();search(searching);const nearPlayer={...searching.position,x:searching.position.x+.3};
  searching.update(0,{player:nearPlayer,seen:false,contactClear:()=>true});assert.equal(searching.phase,'caught');
});

test('contact callbacks are skipped outside reach, in true shelter and during cleanup or an existing capture',()=>{
  let calls=0;const ray=()=>{calls++;return true;};
  const far=actor(),player=start(far);far.update(.1,{player,seen:true,contactClear:ray});assert.equal(calls,0);
  const sheltered=actor(),hidden={...p(.3,0,0),safe:true};start(sheltered,hidden);
  sheltered.update(.1,{player:hidden,seen:true,contactClear:ray});assert.equal(calls,0);
  const cleaning=actor(),mess=waste('cleanup');cleaning.update(.1,{player:p(.3,0,0),seen:true,cleanupTarget:mess.target,contactClear:ray});
  assert.equal(cleaning.phase,'cleanup');assert.equal(calls,0);
  const captured=actor(),close=start(captured,p(.3,0,0));captured.update(0,{player:close,seen:true,contactClear:true});
  captured.update(.1,{player:close,seen:true,contactClear:ray});assert.equal(captured.phase,'caught');assert.equal(calls,0);
});
