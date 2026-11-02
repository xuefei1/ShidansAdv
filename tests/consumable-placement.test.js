import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {ConsumableSystem,RESTOCK_SECONDS,canReachConsumable} from '../src/consumable-system.js';
import {CONSUMABLE_SLOTS,CONSUMABLE_TYPES,consumptionSeconds} from '../src/consumable-data.js';
import {consumableCollider} from '../src/consumable-collision.js';
import {WIRE_SLOTS,createChewablePlaces} from '../src/chewable-data.js';
import {World,RabbitController} from '../src/physics.js';

const seeded=seed=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);
const navigation=new MistressNavigation(world),canSpawn=place=>!navigation.isRabbitSafe(place);
const player={x:-16,y:0,z:12,grounded:true};
const cakeSource=Object.freeze({x:14.3,y:1.52,z:15.4});
const boxFor=item=>{
  const [x,y,z,w,h,d]=consumableCollider(item);
  return {minX:x-w/2,maxX:x+w/2,minY:y-h/2,maxY:y+h/2,minZ:z-d/2,maxZ:z+d/2};
};
const overlaps=(a,b)=>a.maxY>b.minY+.01&&a.minY<b.maxY-.01&&a.maxX>b.minX+.01&&a.minX<b.maxX-.01&&a.maxZ>b.minZ+.01&&a.minZ<b.maxZ-.01;
function remove(system,item) {
  system.motion.remove(item);system.world.removeBox(item.collider);delete item.collider;
  system.items.delete(item.id);system.chewables.delete(item.id);
}
function assertEligible(system) {
  for(const item of system.availableItems())if(!item.permanent)assert.ok(canSpawn(item),item.id);
}
function release(system) {for(const item of [...system.availableItems()])remove(system,item);}

test('real-world food, cable and random spawn pools exclude rabbit-only hiding places',t=>{
  const rawPlaces=createChewablePlaces(world),eligiblePlaces=rawPlaces.filter(canSpawn),system=new ConsumableSystem(world,{canSpawn,random:seeded(8)});
  t.after(()=>release(system));
  assert.equal(system.slots.length,40);assert.equal(system.wires.length,WIRE_SLOTS.length);
  assert.deepEqual(system.randomPlaces,eligiblePlaces);assert.ok(eligiblePlaces.length<rawPlaces.length);
  assert.deepEqual(CONSUMABLE_SLOTS.filter(place=>!canSpawn(place)).map(item=>item.id),['book-5']);
  for(const hiding of [{x:-22.5,y:0,z:-12},{x:-16,y:0,z:-33}]) {
    assert.equal(canSpawn(hiding),false);
    assert.ok(![...system.slots,...system.wires,...system.randomPlaces].some(place=>place.x===hiding.x&&place.y===hiding.y&&place.z===hiding.z));
  }
  for(const place of [...system.slots,...system.wires,...system.randomPlaces])assert.ok(canSpawn(place));
  const cake=system.items.get('cake-0');assert.ok(cake,'the shared production spawn filter keeps the kitchen-table cake');
  assert.deepEqual({x:cake.x,y:cake.y,z:cake.z},cakeSource);
  assert.ok(system.slots.some(item=>item.id==='book-6'&&item.y>4.2),'reachable elevated bed snack remains');
  assert.equal(system.items.size,40);assert.equal(system.chewables.size,22);assertEligible(system);
  assert.deepEqual([...new Set([...system.availableItems()].map(item=>item.type))].sort(),Object.keys(CONSUMABLE_TYPES).sort());
  assert.equal(canSpawn(system.denHay),false);assert.equal(system.denHay.permanent,true);
  system.reset();assertEligible(system);assert.equal(system.items.size,40);
});

test('authored food and books stay on exposed tabletops without clipping furniture or one another',()=>{
  const tabletop=['apple-0','banana-0','banana-1','bread-0','noodles-0','cake-0','book-10','noodles-1'];
  for(const id of tabletop) {
    const item=CONSUMABLE_SLOTS.find(slot=>slot.id===id);assert.ok(item,id);
    assert.equal(item.y,id==='book-10'||id==='noodles-1'?5.66:id==='apple-0'||id==='banana-0'?1.44:1.52,id);
    assert.ok(canSpawn(item),`${id} is exposed to the mistress on its tabletop`);
    assert.ok(Math.abs(world.support(item.x,item.z,item.y+.01,true).y-item.y)<1e-9,`${id} rests on its real table`);
    const box=boxFor(item);
    for(const staticBox of world.solids) {
      if(world.dynamicBoxes.has(staticBox))continue;
      assert.equal(overlaps(box,staticBox),false,`${id} clips ${staticBox.id??'furniture'}`);
    }
    for(const other of [...CONSUMABLE_SLOTS,...WIRE_SLOTS])if(other.id!==id) {
      assert.equal(overlaps(box,boxFor(other)),false,`${id} clips ${other.id}`);
    }
  }
  assert.deepEqual(CONSUMABLE_SLOTS.find(slot=>slot.id==='carrot-0'),{id:'carrot-0',type:'carrot',x:-12.5,y:0,z:17.6});
  assert.deepEqual(CONSUMABLE_SLOTS.find(slot=>slot.id==='book-3'),{id:'book-3',type:'book',x:-17,y:0,z:-15.5});
});

test('all real fixed and random cooldown respawns use eligible sources and preserve caps',t=>{
  const system=new ConsumableSystem(world,{canSpawn,random:seeded(19)});
  t.after(()=>release(system));
  for(let cycle=0;cycle<2;cycle++) {
    const respawning=[...system.chewables.values(),...[...system.items.values()].filter(item=>item.type==='cake')];
    for(const item of respawning) {
      remove(system,item);system.pending.set(item.id,{item,at:system.elapsed+120});
    }
    const events=system.update(0,player,120);
    assert.equal(events.length,23);assert.equal(system.pending.size,0);assertEligible(system);
    assert.equal([...system.chewables.values()].filter(item=>item.type==='wire').length,10);
    assert.equal([...system.chewables.values()].filter(item=>item.type==='cardboard').length,8);
    assert.equal([...system.chewables.values()].filter(item=>item.type==='slippers').length,4);
    assert.equal([...system.items.values()].filter(item=>item.type==='cake').length,1);
    const cake=system.items.get('cake-0');assert.deepEqual({x:cake.x,y:cake.y,z:cake.z},cakeSource);
    assert.deepEqual(cake.spawnPosition,cakeSource);
    for(const item of system.chewables.values())if(item.type==='wire')assert.deepEqual({x:item.x,y:item.y,z:item.z},item.spawnPosition);
  }
});

test('a cake pushed off its kitchen table returns there after exactly 120 seconds without a random placement pool',t=>{
  const system=new ConsumableSystem(world,{canSpawn,randomPlaces:[],randomLimits:{},random:seeded(73)});
  t.after(()=>release(system));
  const cake=system.items.get('cake-0'),initialCount=system.count;assert.ok(cake);
  assert.equal(CONSUMABLE_TYPES.cake.respawn,120);assert.deepEqual(cake.spawnPosition,cakeSource);
  // Move this actual loose item to its former clear floor position. Consuming
  // it there must not replace its authored table origin with the pushed pose.
  system.motion.shift(system.motion.bodies.get(cake.collider),18-cake.x,-cake.y,12-cake.z);
  const eater=new RabbitController(world);Object.assign(eater,{x:18.8,y:0,z:12});
  assert.equal(canReachConsumable(eater,cake,world),true);system.begin(eater);assert.equal(system.target,cake);
  assert.deepEqual(system.update(consumptionSeconds(cake)-.01,eater,0),[]);
  const consumed=system.update(.01,eater,0);assert.equal(consumed.length,1);assert.equal(consumed[0].kind,'consume');
  assert.equal(system.items.has('cake-0'),false);assert.equal(system.count,initialCount-1);
  assert.equal(system.update(0,eater,119.999).filter(event=>event.item.type==='cake').length,0);
  const respawn=system.update(0,eater,.001);assert.equal(respawn.length,1);assert.equal(respawn[0].item.type,'cake');
  const returned=system.items.get('cake-0');assert.deepEqual({x:returned.x,y:returned.y,z:returned.z},cakeSource);
  assert.deepEqual(returned.spawnPosition,cakeSource);assert.ok(canSpawn(returned));
  assert.equal([...system.items.values()].filter(item=>item.type==='cake').length,1);
  assert.deepEqual(system.update(0,eater,600),[],'elapsed time alone cannot create duplicate cakes');
  system.reset();assert.deepEqual(system.items.get('cake-0').spawnPosition,cakeSource);
  assert.equal([...system.items.values()].filter(item=>item.type==='cake').length,1);
});

test('low-stock food replenishment never restores the excluded hidden-passage slots',t=>{
  const system=new ConsumableSystem(world,{canSpawn,random:seeded(42)});
  t.after(()=>release(system));
  for(const item of [...system.items.values()])remove(system,item);
  assert.equal(system.restockCount,0);
  const events=system.update(0,player,RESTOCK_SECONDS*2);
  assert.equal(events.length,2);assert.equal(system.restockCount,2);assertEligible(system);
  assert.ok(events.every(event=>event.item.id!=='book-5'));
});

test('spawn filtering leaves permanent hay, external poop and player-pushed existing items intact',()=>{
  const world=new World();let calls=0;
  const system=new ConsumableSystem(world,{canSpawn:place=>{calls++;return place.x>=0;},
    slots:[{id:'safe',type:'carrot',x:2,y:0,z:0},{id:'hidden',type:'book',x:-2,y:0,z:0}],
    wires:[],randomPlaces:[],randomLimits:{}});
  assert.equal(system.items.size,1);const item=system.items.get('safe');
  system.motion.shift(system.motion.bodies.get(item.collider),-5,0,0);
  const external={id:'dropped',type:'poop',x:-10,y:0,z:0};
  system.setExternalItems({*availableItems(){yield external;}});
  const before=calls;system.update(0,player,0);
  assert.equal(calls,before,'no spawn navigation work during an ordinary frame');
  assert.equal(system.items.get('safe'),item);assert.equal(item.x,-3);
  assert.ok([...system.availableItems()].includes(external));assert.ok([...system.availableItems()].includes(system.denHay));
});

test('invalid fixed respawn sources and empty random pools do not retry indefinitely',()=>{
  const world=new World();let enabled=true,calls=0;
  const system=new ConsumableSystem(world,{canSpawn:()=>{calls++;return enabled;},
    slots:[{id:'cake',type:'cake',x:0,y:0,z:0}],wires:[],randomPlaces:[],randomLimits:{}});
  const cake=system.items.get('cake');remove(system,cake);
  system.pending.set('cake',{item:cake,at:1});
  system.pending.set('box',{item:{id:'box',type:'cardboard',x:2,y:0,z:0},at:1});
  enabled=false;assert.deepEqual(system.update(0,player,1),[]);assert.equal(system.pending.size,0);
  const before=calls;for(let frame=0;frame<120;frame++)system.update(0,player,0);
  assert.equal(calls,before);assert.equal(system.items.size,0);
});
