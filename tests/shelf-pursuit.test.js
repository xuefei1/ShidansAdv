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
import {ConsumableSystem} from '../src/consumable-system.js';
import {NoiseSystem} from '../src/noise.js';
import {DEN,FLOOR_HEIGHT as H} from '../src/layout.js';

const p=(x,y,z)=>({x,y,z}),horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const scene=new THREE.Scene(),house=createHouse(scene);house.layers.forEach(batchStaticGeometry);
const {world}=house,water=createWaterFountains(scene,world),nav=new MistressNavigation(world);
const sight=new MistressSight([...house.layers,house.ceiling,...water.groups]),vision=new MistressVision(sight,world);
const shelf=nav.reachableShelves.find(surface=>surface.id==='linen-shelf');assert.ok(shelf);
const decks=[...shelf.decks].sort((a,b)=>a.maxY-b.maxY),from=p(17,H,-9.5);
const middle=(deck,y=deck.maxY)=>p((deck.minX+deck.maxX)/2+.3,y,(deck.minZ+deck.maxZ)/2);
const slots=decks.flatMap((deck,index)=>[{id:`tier-${index}`,type:'book',...middle(deck)},
  {id:`under-${index}`,type:'book',...middle(deck,H)}]);
const food=new ConsumableSystem(world,{slots,wires:[],randomLimits:{},randomPlaces:[],canSpawn:point=>!nav.isRabbitSafe(point)});

function rabbitAt(point) {
  const rabbit=new RabbitController(world);Object.assign(rabbit,p(point.x,point.y,point.z),{surface:'carpet'});return rabbit;
}
function pursuer(rabbit) {
  const routine=new MistressAI(world,{navigation:nav,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  assert.equal(routine.resumeFrom(from,{yaw:Math.atan2(rabbit.x-from.x,rabbit.z-from.z)}),true);
  const model=createMistressModel();let sightAt=-Infinity,cachedSight=false;
  function eye() {
    const point=npc.renderPosition;model.root.position.set(point.x,point.y,point.z);model.root.rotation.y=npc.yaw;
    model.animate(npc.elapsed,{activity:npc.state==='walking'?'idle':npc.activity,moving:npc.state==='walking',
      speed:npc.speed,activityTime:npc.activityTime,poseWeight:npc.poseWeight,laughing:npc.laughing});
    return model.getSightPoints()[0];
  }
  const contact=()=>vision.contactClear(eye(),rabbit,{stance:npc.position,reachInteraction:nav.reachInteraction(rabbit)});
  function context() {
    if(npc.elapsed-sightAt>=.1-1e-8) {
      cachedSight=vision.canSee({position:npc.renderPosition,eye:eye(),yaw:npc.yaw},rabbit);sightAt=npc.elapsed;
    }
    return {player:rabbit,seen:cachedSight,sprintSpeed:SURFACES[rabbit.surface].run,contactClear:contact};
  }
  return {npc,context,contact};
}
function legallyFits(point) {
  for(const box of world.query(point.x-.22,point.z-.22,point.x+.22,point.z+.22)) {
    if(world.dynamicBoxes.has(box)||point.y>=box.maxY-.01||point.y+.68<=box.minY+.01)continue;
    const x=Math.max(box.minX,Math.min(box.maxX,point.x)),z=Math.max(box.minZ,Math.min(box.maxZ,point.z));
    if(horizontal(point,{x,z})<.219)return false;
  }
  return true;
}

test('both linen tiers and the ground beneath are reachable surfaces rather than a protected passage',()=>{
  assert.equal(decks.length,2);assert.equal(food.items.size,4,'the production safety predicate allows books at both shelf levels');
  assert.equal(world.fixtures.has('linen-tunnel-ceiling'),false);
  assert.equal(nav.canStand(p(22.5,H,-17)),true,'the old upstairs passage is open to the mistress');
  assert.ok(nav.findPath(from,p(23.015,H,-13)).length>1,'the east aisle has a connected floor route');
  for(const deck of decks)for(const point of [middle(deck),middle(deck,H)]) {
    assert.equal(nav.isRabbitSafe(point,from),false);const interaction=nav.reachInteraction(point);assert.equal(interaction.kind,'shelf');
    assert.equal(interaction.under,point.y===H);const goal=nav.pursuitTarget(point,from);assert.ok(goal);
    assert.equal(goal.y,H);assert.equal(nav.canStand(goal),true);assert.ok(horizontal(goal,point)<=3.2);
  }
  for(const box of nav.obstacles.filter(box=>box.rabbitRamp)) {
    assert.equal(nav.canStand(p((box.minX+box.maxX)/2,H,(box.minZ+box.maxZ)/2)),false,'human routes avoid every ramp step');
    assert.equal(nav.canStand(p((box.minX+box.maxX)/2,box.maxY,(box.minZ+box.maxZ)/2)),false,'human routes never stand on rabbit ramps');
  }
});

for(const [index,deck] of decks.entries())for(const under of [false,true]) {
  test(`real rewarding consumption alerts and catches a moving rabbit ${under?'beneath':'on'} linen tier ${index+1}`,()=>{
    const item=food.items.get(`${under?'under':'tier'}-${index}`),rabbit=rabbitAt(item),noise=new NoiseSystem();
    const anchor=p(item.x,item.y,item.z);
    food.begin(rabbit);assert.equal(food.target?.id,item.id);food.update(.1,rabbit,0);assert.ok(food.progress>0);
    noise.update(.1,rabbit,{consuming:food.target});assert.equal(noise.events.at(-1)?.kind,'eat');
    const {npc,context,contact}=pursuer(rabbit);
    npc.update(0,{...context(),seen:false,noiseEvents:noise.events,noiseElapsed:noise.elapsed});
    assert.equal(npc.phase,'chase');assert.equal(npc.lastDetection,'eat');let travelled=0;
    for(let frame=0;frame<15*60&&npc.phase!=='caught';frame++) {
      npc.update(1/60,context());
      assert.equal(nav.canStand(npc.position),true,`human at ${JSON.stringify(npc.position)}`);assert.equal(npc.position.y,H,'the mistress stays on the room floor');
      if(npc.phase==='caught')break;
      const before=p(rabbit.x,rabbit.y,rabbit.z),t=frame/60;
      rabbit.update(1/60,{x:(anchor.x+.15*Math.sin(t*3)-rabbit.x)*2,z:(anchor.z+.15*Math.cos(t*3)-rabbit.z)*2});
      travelled+=horizontal(before,rabbit);assert.equal(rabbit.grounded,true,`rabbit at ${JSON.stringify(p(rabbit.x,rabbit.y,rabbit.z))}`);
      assert.ok(Math.abs(rabbit.y-anchor.y)<1e-7);
      npc.update(0,context());
    }
    assert.ok(travelled>.01,'the rabbit actually moves while being pursued');assert.equal(npc.phase,'caught');assert.equal(contact(),true);
  });
}

test('dense physically legal samples on and below both decks have clear floor approaches without safe pockets',()=>{
  let checked=0;
  for(const deck of decks)for(const y of [H,deck.maxY])for(let ix=0;ix<=14;ix++)for(let iz=0;iz<=16;iz++) {
    const point=p(deck.minX+(deck.maxX-deck.minX)*ix/14,y,deck.minZ+(deck.maxZ-deck.minZ)*iz/16);
    if(!legallyFits(point))continue;checked++;const label=JSON.stringify(point),goal=nav.pursuitTarget(point,from);
    assert.ok(goal,label);assert.equal(nav.isRabbitSafe(point,from),false,label);assert.equal(nav.canStand(goal),true,label);
    assert.equal(goal.y,H);assert.ok(horizontal(goal,point)<=3.2,label);
    assert.equal(vision.contactClear(p(goal.x,goal.y+2.3,goal.z),point,
      {stance:goal,reachInteraction:nav.reachInteraction(point)}),true,label);
  }
  assert.ok(checked>500);
  for(const point of [p(DEN.x,0,DEN.z),p(-16,0,-33)])assert.equal(nav.isRabbitSafe(point,from),true);
});
