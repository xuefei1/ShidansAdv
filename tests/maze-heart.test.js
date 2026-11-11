import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {World} from '../src/physics.js';
import {BASEMENT,DEN} from '../src/layout.js';
import {createMazeHeart,MAX_KISS_HEARTS,KISS_HEARTS_PER_SECOND,KISS_HEART_LIFETIME} from '../src/maze-heart.js';
import {createRabbit} from '../src/model.js';
import {AFFECTION_SECONDS,AFFECTION_HAPPINESS} from '../src/maze-affection.js';
import {NoiseSystem,canHearNoise} from '../src/noise.js';
import {Leaderboard,HappinessRun} from '../src/happiness.js';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressPursuit} from '../src/mistress-pursuit.js';
import {WaterSystem} from '../src/water.js';
import {PoopSupply,MAX_CARRIED_POOP} from '../src/poop-supply.js';

const p=(x=0,y=0,z=0)=>({x,y,z,grounded:true});
const layout={heart:{x:1,y:BASEMENT.y,z:0,radius:2.05}};
function fixture() {
  const world=new World();world.basement=BASEMENT;world.ramps=[];
  const parent=new THREE.Group(),heart=createMazeHeart({parent,world,layout}),rabbit=p(heart.item.x+.85,BASEMENT.y,heart.item.z);
  return {world,parent,heart,action:heart.action,rabbit};
}
function actor(position=p(0,0,0)) {
  const nav={isRabbitSafe:point=>!!point.safe,pursuitTarget:point=>point.safe?null:{...point},
    nearestReachable:point=>({...point}),randomNearby:point=>p(point.x+2,point.y,point.z+1),canStand:()=>true,
    segmentClear:()=>true,findPath:(from,to)=>[{...from},{...to}]};
  const routine=new MistressAI(null,{random:()=>.5,navigation:nav}),npc=new MistressPursuit(routine,{random:()=>.5});
  routine.activity='mopping';routine.position={...position};routine.renderPosition={...position};routine.poseWeight=0;
  routine.yaw=0;routine._duration=1000000;routine._nextNoise=Infinity;
  return npc;
}

test('the real plush requires the full five seconds, gives 500 once, and resets for a new adventure',()=>{
  const {heart,action,rabbit}=fixture(),run=new HappinessRun(new Leaderboard(null));run.start('Blue bunny fan');
  assert.equal(AFFECTION_SECONDS,5);assert.equal(AFFECTION_HAPPINESS,500);assert.equal(action.begin(rabbit),true);
  assert.equal(action.update(4.999,rabbit),0);assert.equal(action.completed,false);assert.ok(action.fraction<1);
  assert.equal(action.update(.000999,rabbit),0);assert.equal(action.completed,false);
  assert.equal(run.award(action.update(.000001,rabbit)),true);assert.equal(run.score,500);assert.equal(action.completed,true);
  assert.equal(action.fraction,1);assert.equal(action.active,false);
  assert.equal(action.update(20,rabbit),0);assert.equal(action.begin(rabbit),false);assert.equal(run.score,500);
  run.restart();heart.reset(layout);assert.equal(action.completed,false);assert.equal(action.progress,0);
  assert.equal(action.begin(rabbit),true);assert.equal(run.award(action.update(5,rabbit)),true);assert.equal(run.score,500);
});

test('releasing an incomplete cuddle discards all progress and a fresh full hold can retry',()=>{
  const {action,rabbit}=fixture();action.begin(rabbit);assert.equal(action.update(1.4,rabbit),0);
  action.cancel();assert.equal(action.progress,0);assert.equal(action.active,false);assert.equal(action.completed,false);
  assert.equal(action.update(5,rabbit),0);assert.equal(action.begin(rabbit),true);
  assert.equal(action.update(4.999,rabbit),0);assert.equal(action.update(.001,rabbit),500);
});

test('frame boundaries and the initial click delay never grant pre-click affection time',()=>{
  for(const fps of [30,60,144]) {
    const {action,rabbit}=fixture();action.begin(rabbit);
    for(let i=0;i<fps*5-1;i++)assert.equal(action.update(1/fps,rabbit),0);
    assert.equal(action.update(1/fps,rabbit),500);
  }
  const {action,rabbit}=fixture();action.begin(rabbit,.15);
  assert.equal(action.update(.1,rabbit),0);assert.equal(action.progress,0);
  assert.equal(action.update(.15,rabbit),0);assert.ok(Math.abs(action.progress-.1)<1e-9);
  assert.equal(action.update(4.899,rabbit),0);assert.equal(action.update(.001,rabbit),500);
  for(const delay of [NaN,Infinity,-Infinity]) {action.reset();action.begin(rabbit,delay);assert.equal(action.update(.001,rabbit),0);assert.equal(action.completed,false);}
});

test('range, floor, jumping and opaque walls cancel the hold and permit a full retry',()=>{
  const {world,heart,action,rabbit}=fixture();
  for(const moved of [{...rabbit,x:heart.item.x+1.151},{...rabbit,y:0},{...rabbit,grounded:false}]) {
    action.begin(rabbit);action.update(1.5,rabbit);assert.equal(action.update(.5,moved),0);
    assert.equal(action.progress,0);assert.equal(action.completed,false);assert.equal(action.begin(moved),false);
  }
  action.begin(rabbit);action.update(1,rabbit);
  const wall=world.addDynamicBox(heart.item.x+.45,BASEMENT.y+.4,heart.item.z,.10,.8,.8,'concrete');
  assert.equal(action.update(1,rabbit),0);assert.equal(action.active,false);assert.equal(action.begin(rabbit),false);
  world.removeBox(wall);assert.equal(action.begin(rabbit),true);assert.equal(action.update(5,rabbit),500);
});

test('actual capture and the pee action cancel an incomplete plush interaction',()=>{
  const {world,action,rabbit}=fixture(),npc=actor({...rabbit,x:rabbit.x-.5});
  action.begin(rabbit);action.update(1,rabbit);
  npc.update(0,{player:rabbit,seen:true,contactClear:true});assert.equal(npc.playerLocked,true);
  assert.equal(action.update(1,rabbit,{blocked:npc.playerLocked}),0);assert.equal(action.completed,false);
  action.begin(rabbit);action.update(1,rabbit);
  const water=new WaterSystem(world,{items:[]});water.bladder.value=100;assert.ok(water.pee(rabbit));
  assert.equal(water.peeing,true);assert.equal(action.update(1,rabbit,{blocked:water.peeing}),0);assert.equal(action.progress,0);
  water.advance(1,rabbit);assert.equal(water.peeing,false);assert.equal(action.begin(rabbit),true);assert.equal(action.update(5,rabbit),500);
});

test('the plush emits bounded floating hearts, and moving/resetting the scene leaves no old reward or collider',()=>{
  const {world,heart,action,rabbit}=fixture(),camera=new THREE.PerspectiveCamera();
  const toyBox=heart.item.collider;assert.equal(world.dynamicBoxes.has(toyBox),true);assert.equal(toyBox.pushable,undefined);
  action.begin(rabbit);heart.update(.1,camera);
  const particles=heart.group.children.find(child=>child.isInstancedMesh);assert.ok(particles.count>0);
  for(let i=0;i<100;i++)heart.update(.02,camera);assert.ok(particles.count<=MAX_KISS_HEARTS);assert.ok(particles.count>=36,'a continuous kiss has many more hearts than the previous ten');
  action.update(5,rabbit);heart.reset({heart:{...layout.heart,x:5,z:6}});
  assert.equal(action.completed,false);assert.equal(particles.count,0);assert.equal(heart.item.x,5);assert.equal(heart.item.z,5.15);
  assert.equal(heart.item.collider,toyBox);assert.equal((toyBox.minX+toyBox.maxX)/2,5);
  assert.ok(world.queryDynamic(toyBox.minX,toyBox.minZ,toyBox.maxX,toyBox.maxZ).includes(toyBox));
  assert.equal(heart.group.position.x,5);assert.equal(heart.group.position.z,6);
});

test('the yellow rug carries a large flat carrot drawing, not a food object or collider',()=>{
  const {world,heart}=fixture();heart.group.updateWorldMatrix(true,true);
  assert.equal(heart.rug.name,'Yellow carrot rug');assert.equal(heart.artwork.userData.rugPrint,true);
  assert.equal(heart.artwork.userData.collider,undefined);assert.equal(heart.artwork.userData.consumableId,undefined);
  const rugBounds=new THREE.Box3().setFromObject(heart.rug),printBounds=new THREE.Box3().setFromObject(heart.artwork);
  assert.ok(Math.abs(rugBounds.max.x-rugBounds.min.x-layout.heart.radius*2)<1e-6);
  assert.ok(printBounds.max.z-printBounds.min.z>2,'a large carrot covers the fabric');
  assert.ok(printBounds.max.y-printBounds.min.y<.02,'the illustration is flat ink');
  assert.equal(world.solids.length,1,'only the fixed plush has physical collision');
});

test('the blue plush is distinctly smaller than Shidan and its collider follows its visible bounds',()=>{
  const {heart}=fixture(),rabbit=createRabbit();heart.group.updateWorldMatrix(true,true);rabbit.root.updateWorldMatrix(true,true);
  const toyBounds=new THREE.Box3().setFromObject(heart.toy),rabbitBounds=new THREE.Box3().setFromObject(rabbit.root),collider=heart.item.collider;
  const toySize=toyBounds.getSize(new THREE.Vector3()),rabbitSize=rabbitBounds.getSize(new THREE.Vector3());
  assert.ok(toySize.y>.6&&toySize.y<.8,`plush height ${toySize.y}`);
  assert.ok(toySize.y<rabbitSize.y*.75,`${toySize.y} versus Shidan ${rabbitSize.y}`);
  assert.ok(Math.abs(toyBounds.min.y-BASEMENT.y)<1e-6);
  for(const axis of ['x','y','z'])for(const side of ['min','max'])assert.ok(Math.abs(toyBounds[side][axis]-collider[`${side}${axis.toUpperCase()}`])<1e-6);
});

test('plush ears attach high on the head and flare outward from their roots',()=>{
  const {heart}=fixture();heart.group.updateWorldMatrix(true,true);
  assert.equal(heart.ears.length,2);
  const headCenter=heart.toy.localToWorld(new THREE.Vector3(0,.76,.04));
  const headTop=heart.toy.localToWorld(new THREE.Vector3(0,1.02,.04));
  const bounds=new THREE.Box3().setFromObject(heart.toy);
  for(const [index,ear] of heart.ears.entries()) {
    const side=index===0?-1:1,root=ear.getWorldPosition(new THREE.Vector3()),tip=ear.localToWorld(new THREE.Vector3(0,.50,0));
    assert.ok(root.y>headCenter.y+.075&&root.y<=headTop.y,'the root belongs on the upper skull, above the cheek');
    assert.ok(side*(tip.x-root.x)>.05,'the tip points away from the center of the head');
    assert.ok(tip.y>headTop.y+.18,'the visible ear extends above the head');
    assert.ok(bounds.containsPoint(tip),'the ear tip belongs to the rendered plush bounds');
  }
});

test('heart density is independent of frame rate, bounded after long frames, and drains after release',()=>{
  const counts=[];
  for(const dt of [1/144,1/60,1/30,.1,.5]) {
    const {heart,action,rabbit}=fixture(),camera=new THREE.PerspectiveCamera();action.begin(rabbit);
    const steps=Math.round(3/dt);for(let i=0;i<steps;i++)heart.update(dt,camera);
    counts.push(heart.heartCount);assert.ok(heart.heartCount>=38&&heart.heartCount<=40,`${dt}: ${heart.heartCount}`);
    assert.ok(heart.heartCount<MAX_KISS_HEARTS);
    action.cancel();heart.update(KISS_HEART_LIFETIME+.01,camera);assert.equal(heart.heartCount,0);
  }
  assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
  const {heart,action,rabbit}=fixture();action.begin(rabbit);heart.update(3600,new THREE.PerspectiveCamera());
  assert.ok(heart.heartCount>=38&&heart.heartCount<=MAX_KISS_HEARTS);assert.equal(KISS_HEARTS_PER_SECOND,24);
});

test('affection makes globally audible noise immediately, even before completing or after retry/reset',()=>{
  const {action,rabbit}=fixture(),noise=new NoiseSystem();action.begin(rabbit);
  const events=noise.update(.1,rabbit,{affection:action.active});assert.equal(events.length,1);assert.equal(events[0].kind,'affection');
  assert.equal(events[0].scope,'house');assert.equal(events[0].radius,null);assert.equal(canHearNoise(events[0],p(900,20,900)),true);
  assert.equal(action.update(.1,rabbit),0,'noise does not wait for a reward');action.cancel();
  assert.deepEqual(noise.update(.1,rabbit,{affection:action.active}),[]);
  action.begin(rabbit);assert.equal(noise.update(.1,rabbit,{affection:true}).length,1);
  noise.update(1,rabbit,{affection:true});noise.reset();
  assert.equal(noise.update(.001,rabbit,{affection:true}).length,1,'new round must not retain the old pulse cadence');
  noise.reset();assert.deepEqual(noise.update(.1,rabbit,{affection:true,locked:true}),[]);
});

test('an unmasked mistress hears plush affection from anywhere, including search during sprint grace',()=>{
  const {rabbit}=fixture(),noise=new NoiseSystem(),npc=actor(p(22,0,30));
  let events=noise.update(.001,rabbit,{affection:true});npc.update(0,{player:rabbit,seen:false,noiseEvents:events,noiseElapsed:noise.elapsed});
  assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'affection');assert.equal(npc.investigating,true);
  assert.deepEqual(npc.investigationSource,{x:rabbit.x,y:rabbit.y,z:rabbit.z});
  const searching=actor(p(22,0,30));searching.update(0,{player:rabbit,seen:true});
  searching.update(2.001,{player:rabbit,seen:false});assert.equal(searching.phase,'search');
  const renewed=new NoiseSystem();events=renewed.update(.001,rabbit,{affection:true});
  searching.update(0,{player:rabbit,seen:false,noiseEvents:events,noiseElapsed:renewed.elapsed});
  assert.equal(searching.phase,'chase');assert.equal(searching.lastDetection,'affection');assert.equal(searching.investigating,true);
});

test('mistress noise masks affection without queuing old pulses; fresh quiet pulses still alert her',()=>{
  const {rabbit}=fixture(),noise=new NoiseSystem(),npc=actor(p(22,0,30));
  npc.noise.emit('laugh',npc.renderPosition,0,1);assert.equal(npc.maskingNoise,true);
  const first=noise.update(.001,rabbit,{affection:true});npc.update(0,{player:rabbit,seen:false,noiseEvents:first,noiseElapsed:noise.elapsed});
  assert.equal(npc.phase,'routine');npc.update(1.01,{player:rabbit,seen:false,noiseEvents:first,noiseElapsed:noise.elapsed});
  assert.equal(npc.maskingNoise,false);assert.equal(npc.phase,'routine');
  const next=noise.update(.75,rabbit,{affection:true});npc.update(0,{player:rabbit,seen:false,noiseEvents:next,noiseElapsed:noise.elapsed});
  assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'affection');
  const visual=actor(p(22,0,30));visual.noise.emit('cook',visual.renderPosition,0,1);
  visual.update(0,{player:rabbit,seen:true,noiseEvents:first,noiseElapsed:noise.elapsed});assert.equal(visual.phase,'chase','noise cover never disables vision');
});

test('a quiet angry rant still hears a new plush interaction outside the den',()=>{
  const {rabbit}=fixture(),npc=actor({...rabbit,x:rabbit.x-.5}),noise=new NoiseSystem();
  npc.update(0,{player:rabbit,seen:true,contactClear:true});assert.equal(npc.phase,'caught');
  npc.update(3,{player:rabbit,seen:false});assert.equal(npc.phase,'scolding');assert.equal(npc.maskingNoise,false);
  const events=noise.update(.01,rabbit,{affection:true});
  npc.update(0,{player:rabbit,seen:false,noiseEvents:events,noiseElapsed:noise.elapsed});
  assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'affection');assert.equal(npc.investigating,true);
});

test('heart hay gives three carried balls once per grounded carpet visit, independently from the den',()=>{
  const supply=new PoopSupply(),heart=layout.heart,rabbit=p(heart.x,heart.y,heart.z),item={id:'maze-heart-hay',type:'hay',permanent:true,mazeHay:true};
  const event={kind:'consume',item,poop:3};assert.equal(supply.grantFromConsumption(event,rabbit),0);
  supply.observeMazePosition(rabbit,heart);assert.equal(supply.grantFromConsumption(event,rabbit),3);assert.equal(supply.value,13);
  assert.equal(supply.grantFromConsumption(event,rabbit),0);assert.equal(supply.denHayRewardAvailable,true);
  supply.observeMazePosition({...rabbit,y:heart.y+1,grounded:false},heart);
  assert.equal(supply.grantFromConsumption(event,rabbit),0,'jumping above the carpet is still one visit');
  supply.observeMazePosition({...rabbit,x:heart.x+heart.radius+.01},heart);
  supply.observeMazePosition({...rabbit,grounded:false},heart);assert.equal(supply.insideMazeHeart,false);
  supply.observeMazePosition(rabbit,heart);assert.equal(supply.grantFromConsumption(event,rabbit),3);assert.equal(supply.value,16);
  supply.observePosition({...DEN,y:0});assert.equal(supply.grantFromConsumption({kind:'consume',item:{id:'den-hay',type:'hay',permanent:true},poop:3},{...DEN,y:0}),3);
  assert.equal(supply.value,19);assert.equal(supply.mazeHayRewardAvailable,false);
});

test('full supply still uses that carpet visit reward; only leaving/reentering or a new round renews it',()=>{
  const supply=new PoopSupply(),heart=layout.heart,rabbit=p(heart.x,heart.y,heart.z),event={kind:'consume',item:{type:'hay',mazeHay:true,permanent:true},poop:3};
  supply.value=MAX_CARRIED_POOP;supply.observeMazePosition(rabbit,heart);
  assert.equal(supply.grantFromConsumption(event,rabbit),0);assert.equal(supply.mazeHayRewardAvailable,false);
  assert.equal(supply.trySpend(0),true);assert.equal(supply.grantFromConsumption(event,rabbit),0);assert.equal(supply.value,19);
  supply.observeMazePosition({...rabbit,y:0},heart);supply.observeMazePosition(rabbit,heart);
  assert.equal(supply.grantFromConsumption(event,rabbit),1);assert.equal(supply.value,MAX_CARRIED_POOP);
  supply.reset();assert.equal(supply.insideMazeHeart,false);assert.equal(supply.value,10);
  supply.observeMazePosition(rabbit,heart);assert.equal(supply.grantFromConsumption(event,rabbit),3);
});
