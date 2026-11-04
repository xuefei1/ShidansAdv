import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {MistressNavigation,MISTRESS_HEIGHT} from '../src/mistress-navigation.js';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressPursuit,PEE_CLEAN_SECONDS} from '../src/mistress-pursuit.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {MistressCleanupSight} from '../src/mistress-cleanup.js';
import {createMistressCone} from '../src/mistress-cone.js';
import {RabbitController} from '../src/physics.js';
import {ConsumableSystem} from '../src/consumable-system.js';
import {NoiseSystem} from '../src/noise.js';
import {BASEMENT,BASEMENT_STAIRS as stairs,DEN,FLOOR_HEIGHT as H,RAMPS} from '../src/layout.js';

const scene=new THREE.Scene(),{world,layers,ceiling}=createHouse(scene),water=createWaterFountains(scene,world);
const nav=new MistressNavigation(world),vision=new MistressVision(new MistressSight([...layers,ceiling,...water.groups]),world);
const p=(x,y,z)=>({x,y,z}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);
const bottom=p((stairs.minX+stairs.maxX)/2,BASEMENT.y,stairs.startZ),top=p(bottom.x,0,stairs.endZ);
const stairPoint=t=>p(bottom.x,BASEMENT.y+H*t,stairs.startZ+(stairs.endZ-stairs.startZ)*t);
function actor(stance) {
  const routine=new MistressAI(world,{navigation:nav,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  assert.equal(routine.resumeFrom(stance),true);return npc;
}
function contact(npc,player) {
  const stance=npc.renderPosition;
  return vision.contactClear(p(stance.x,stance.y+2.3,stance.z),player,{stance:npc.position,reachInteraction:nav.reachInteraction(player)});
}
function checkRoute(route) {
  assert.ok(route.length>1);
  for(let i=1;i<route.length;i++) {
    const a=route[i-1],b=route[i],steps=Math.ceil(distance(a,b)/.1);
    assert.equal(nav.segmentClear(a,b),true);
    for(let step=0;step<=steps;step++) {
      const t=step/steps,q=p(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);
      assert.equal(nav.canStand(q),true,JSON.stringify(q));
      near(world.support(q.x,q.z,q.y+.015,true,nav.radius).y,q.y,.13);
      if(q.y>BASEMENT.y+.13&&q.y<-.13) {
        assert.ok(q.x>=stairs.minX+nav.radius&&q.x<=stairs.maxX-nav.radius,'floor changes stay inside the real flight');
        near(q.y,BASEMENT.y+(q.z-stairs.startZ)/(stairs.endZ-stairs.startZ)*H);
      }
    }
  }
}

test('human routes connect the basement to every existing floor and both yards in both directions',()=>{
  const basement=p(0,BASEMENT.y,0);
  for(const destination of [p(-15.8,0,6.9),p(0,H,-8),p(0,H,-22),p(3,0,-30),p(0,0,25)]) {
    for(const [from,to] of [[basement,destination],[destination,basement]]) {
      const route=nav.findPath(from,to);checkRoute(route);
      assert.ok(route.some(q=>distance(q,bottom)<1e-6));assert.ok(route.some(q=>distance(q,top)<1e-6));
    }
  }
  assert.equal(nav.hasFloor(p(-22.4,0,-12)),false,'the stair hole is not an invisible ground floor');
  assert.equal(nav.canStand(p(0,BASEMENT.y,-22)),false,'the basement does not extend beneath the yard');
  assert.equal(nav.segmentClear(p(0,BASEMENT.y,0),p(0,0,0)),false,'floor slabs block vertical shortcuts');
});

test('basement occupancy below the den and former passage does not inherit a protected or elevated-floor classification',()=>{
  const from=p(-15.8,0,6.9),below=p(DEN.x,BASEMENT.y,DEN.z);
  assert.equal(nav.isDen(below),false);assert.equal(nav.canStand(below),true);assert.equal(nav.isRabbitSafe(below,from),false);
  assert.equal(nav.segmentClear(p(DEN.x-5,BASEMENT.y,DEN.z),p(DEN.x+5,BASEMENT.y,DEN.z)),true);
  near(nav.floorPoint(p(-22.4,H,-12)).y,H);
  for(const t of [.1,.5,.9]) {
    const q=stairPoint(t);assert.equal(nav.canStand(q),true);assert.equal(nav.isRabbitSafe(q,from),false);near(nav.floorPoint(q).y,q.y);
  }
  for(const q of [p(DEN.x,0,DEN.z),p(-16,0,-33)])assert.equal(nav.isRabbitSafe(q,from),true);
});

test('clear contact catches in the basement and along its stairs, while pee and intervening floors remain protective',()=>{
  const cases=[[p(-16,BASEMENT.y,12),p(-15.5,BASEMENT.y,12)]];
  for(const t of [.2,.5,.8])cases.push([stairPoint(t),stairPoint(t+.04)]);
  for(const [stance,player] of cases) {
    const npc=actor(stance);npc.update(0,{player,seen:true,peeing:true,contactClear:()=>contact(npc,player)});
    assert.equal(npc.phase,'chase');assert.equal(npc.canAttemptCapture(player,{peeing:true}),false);
    assert.equal(contact(npc,player),true);
    npc.update(0,{player,seen:true,peeing:false,contactClear:()=>contact(npc,player)});assert.equal(npc.phase,'caught');
  }
  const npc=actor(p(0,BASEMENT.y,0)),above=p(0,0,0);
  npc.update(0,{player:above,seen:true,contactClear:true});assert.equal(npc.phase,'chase');assert.equal(npc.canAttemptCapture(above),false);
  assert.equal(contact(npc,above),false,'the real ground slab blocks the hand ray');
});

test('a real rewarding item pushed downstairs alerts a ground-floor mistress and is pursued to a basement catch',()=>{
  // Generated loot stays upstairs. An existing movable item can still be
  // pushed down the new stairs and keeps its ordinary consumption/noise rules.
  const food=new ConsumableSystem(world,{slots:[{id:'pushed-book',type:'book',...p(0,0,0)}],wires:[],randomPlaces:[],randomLimits:{}});
  const item=food.items.get('pushed-book');assert.ok(item);
  world.moveDynamicBox(item.collider,0,BASEMENT.y,0);item.y=BASEMENT.y;
  const player=new RabbitController(world);Object.assign(player,p(0,BASEMENT.y,0));player.surface='concrete';
  food.begin(player);food.update(.1,player,0);assert.ok(food.progress>0);
  const noise=new NoiseSystem();noise.update(.1,player,{consuming:food.target});assert.equal(noise.events.at(-1)?.kind,'eat');food.cancel();
  const npc=actor(p(-15.8,0,6.9));let entered=false,caught=false;
  for(let frame=0;frame<2000;frame++) {
    npc.update(.05,{player,seen:false,noiseEvents:noise.events,noiseElapsed:noise.elapsed,contactClear:()=>contact(npc,player)});
    noise.update(.05,player,{});entered ||= npc.position.y<BASEMENT.y+.2;
    assert.equal(nav.canStand(npc.position),true);
    if(npc.phase==='caught'){caught=true;break;}
    assert.equal(npc.phase,'chase','hearing investigates the remembered source even after more than two seconds');
  }
  assert.equal(entered,true);assert.equal(caught,true);assert.equal(npc.lastDetection,'eat');
  food.motion.clear();world.removeBox(item.collider);world.removeBox(food.denHay.collider);
});

test('searching stays on reachable basement support, hears fresh noise and can return to the normal couch routine',()=>{
  const player=p(6,BASEMENT.y,0),npc=actor(p(0,BASEMENT.y,0));
  npc.update(0,{player,seen:true});npc.update(2.001,{player,seen:false,movementScale:0});assert.equal(npc.phase,'search');
  for(let i=0;i<20;i++){npc.update(.05,{player,seen:false});assert.ok(npc.position.y<-.3);assert.equal(nav.canStand(npc.position),true);}
  const noise=new NoiseSystem();noise.update(0,player,{consuming:{id:'book',type:'book'}});
  npc.update(0,{player,noiseEvents:noise.events,noiseElapsed:noise.elapsed});assert.equal(npc.investigating,true);
  const returning=actor(p(0,BASEMENT.y,0));returning.update(0,{player,seen:true});
  returning.update(2.001,{player,seen:false,movementScale:0});returning.update(15.001,{player,seen:false,movementScale:0});
  assert.equal(returning.phase,'returning');
  for(let i=0;i<2500&&returning.phase!=='routine';i++)returning.update(.05,{player,seen:false});
  assert.equal(returning.phase,'routine');near(returning.position.y,0);
});

test('basement puddles retain physical cleanup and the complete fifteen-second timer',()=>{
  const patch={...p(.6,BASEMENT.y,0),progress:1,amount:100},puddles=[patch];
  const sensor=new MistressCleanupSight({navigation:nav,vision,poop:{physics:{balls:[]}},water:{puddles,
    removePuddle:source=>{const at=puddles.indexOf(source);if(at<0)return false;puddles.splice(at,1);return true;}}});
  const npc=actor(p(0,BASEMENT.y,0)),target=sensor.scan({position:npc.position,stance:npc.position,eye:p(0,BASEMENT.y+2.3,0),yaw:Math.PI/2});
  assert.ok(target);assert.ok(target.goal);assert.equal(target.canClean(npc.position),true);
  const context={player:p(DEN.x,0,DEN.z),cleanupTarget:target,movementScale:0};
  npc.update(PEE_CLEAN_SECONDS-.001,context);assert.equal(npc.phase,'cleanup');near(npc.cleanupRemaining,.001);assert.equal(puddles.length,1);
  npc.update(.001,context);assert.equal(puddles.length,0);near(npc.rageBonus,.05);
});

test('the floor cone projects below ground and does not erase the basement beneath the den',()=>{
  const cone=createMistressCone(scene,world),source=p(DEN.x,BASEMENT.y,DEN.z);
  cone.update(0,{position:source,yaw:0,upperVisible:false});assert.equal(cone.mesh.visible,true);
  const positions=cone.mesh.geometry.attributes.position;
  assert.ok(Array.from({length:positions.count},(_,i)=>positions.getY(i)).every(y=>y<-.1));
  assert.ok(cone.mesh.geometry.drawRange.count>0);
  cone.update(.1,{position:source,yaw:0,basementVisible:false});assert.equal(cone.mesh.visible,false);cone.dispose();
});

test('the three-floor stair heuristic stays admissible for whole flights and targets between basement landings',()=>{
  const samples=[p(0,BASEMENT.y,0),p(-15.8,0,6.9),p(0,H,-8),stairPoint(.2),stairPoint(.8)];
  for(const from of samples)for(const to of samples) {
    const path=nav.findPath(from,to);assert.ok(path.length);
    const cost=path.reduce((sum,q,index)=>sum+(index?distance(path[index-1],q):0),0);
    assert.ok(nav.makeHeuristic(to)(from)<=cost+1e-6);
  }
  assert.equal(RAMPS.length,3);assert.equal(MISTRESS_HEIGHT,2.72);
});
