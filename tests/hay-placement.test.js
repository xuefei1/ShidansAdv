import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MISTRESS_ACTIVITIES} from '../src/mistress-ai.js';
import {CONSUMABLE_SLOTS,DEN_HAY,consumableDetails,consumptionSeconds} from '../src/consumable-data.js';
import {consumableCollider} from '../src/consumable-collision.js';
import {ConsumableSystem,canReachConsumable,RESTOCK_SECONDS} from '../src/consumable-system.js';
import {WIRE_SLOTS} from '../src/chewable-data.js';
import {RabbitController} from '../src/physics.js';
import {FLOOR_HEIGHT as H,roomAt} from '../src/layout.js';

const originals=[[-9,0,15.5],[-21.4,0,10],[18,0,-12],[11,0,-16],[6,0,-6],[-11,H,0]];
const added=CONSUMABLE_SLOTS.filter(item=>item.type==='hay'&&Number(item.id.slice(4))>=6);
const seeded=seed=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
function fixture() {
  const scene=new THREE.Scene(),{world}=createHouse(scene),fountains=createWaterFountains(scene,world),navigation=new MistressNavigation(world);
  return {world,fountains,navigation,canSpawn:point=>!navigation.isRabbitSafe(point)};
}
function remove(system,item) {
  system.motion.remove(item);system.world.removeBox(item.collider);delete item.collider;
  system.items.delete(item.id);system.chewables.delete(item.id);
}
function eaterFor(system,item) {
  const world=system.world;
  for(const radius of [.8,1])for(let step=0;step<32;step++) {
    const x=item.x+Math.sin(step*Math.PI/16)*radius,z=item.z+Math.cos(step*Math.PI/16)*radius,y=world.support(x,z,item.y+.02,true).y;
    if(Math.abs(y-item.y)>.02)continue;
    const blocked=world.query(x-.22,z-.22,x+.22,z+.22).some(box=>!box.pushable&&box.maxY>y+.005&&box.minY<y+.675&&
      Math.hypot(Math.max(box.minX,Math.min(box.maxX,x))-x,Math.max(box.minZ,Math.min(box.maxZ,z))-z)<.219);
    const player=new RabbitController(world);Object.assign(player,{x,y,z});
    if(!blocked&&canReachConsumable(player,item,world)&&system.nearest(player)===item)return player;
  }
  assert.fail(`No free eating stance for ${item.id}`);
}

test('six additional ordinary hay stacks cover all upstairs rooms and the balcony and yards while preserving existing pickups',()=>{
  const hay=CONSUMABLE_SLOTS.filter(item=>item.type==='hay');assert.equal(hay.length,12);assert.equal(added.length,6);
  for(const [index,[x,y,z]] of originals.entries())assert.deepEqual(hay[index],{id:`hay-${index}`,type:'hay',x,y,z});
  assert.deepEqual(added.map(item=>roomAt(item.x,item.y,item.z).id),['bedroom','reading','study','balcony','front-yard','yard']);
  assert.deepEqual(consumableDetails(hay[0]),{name:'Hay stack',energy:40,poop:3,color:0xd6b85c,verb:'Nibble'});
  assert.equal(consumptionSeconds(hay[0]),1.6);assert.equal(consumableDetails(DEN_HAY).energy,100);assert.equal(DEN_HAY.permanent,true);
});

test('all added hay has real support, full item clearance and a reachable route outside protected hiding or launch zones',()=>{
  const {world,fountains,navigation,canSpawn}=fixture();
  for(const item of added) {
    assert.ok(canSpawn(item),item.id);assert.equal(world.support(item.x,item.z,item.y+.01,true).y,item.y);
    const [x,y,z,w,h,d]=consumableCollider(item),bounds={minX:x-w/2,maxX:x+w/2,minY:y-h/2,maxY:y+h/2,minZ:z-d/2,maxZ:z+d/2};
    for(const box of world.solids) {
      const overlap=bounds.maxY>box.minY+.01&&bounds.minY<box.maxY-.01&&bounds.maxX>box.minX+.01&&bounds.minX<box.maxX-.01&&bounds.maxZ>box.minZ+.01&&bounds.minZ<box.maxZ-.01;
      assert.equal(overlap,false,`${item.id} intersects ${box.id}`);
    }
    for(const other of [...CONSUMABLE_SLOTS,...WIRE_SLOTS,...fountains.items])if(other.id!==item.id&&Math.abs(item.y-other.y)<.5)
      assert.ok(Math.hypot(item.x-other.x,item.z-other.z)>1.3,`${item.id} crowds ${other.id}`);
    for(const activity of MISTRESS_ACTIVITIES)if(Math.abs(activity.approach.y-item.y)<.5)
      assert.ok(Math.hypot(activity.approach.x-item.x,activity.approach.z-item.z)>1.5,`${item.id} crowds ${activity.id}`);
    for(const deck of world.solids.filter(box=>box.shelfDeck)) {
      const reserved=deck.reachableShelf.spawnKeepClear;
      assert.ok(Math.hypot(item.x-reserved.x,item.z-reserved.z)>reserved.radius,`${item.id} occupies the charged-jump launch`);
    }
    const from=item.y===H?{x:0,y:H,z:-.5}:{x:0,y:0,z:18};
    assert.equal(navigation.canStand(item),true);assert.ok(navigation.findPath(from,item).length>1,item.id);
  }
});

test('production spawning retains all twelve hay stacks and each new source can be eaten and replenished',t=>{
  const {world,canSpawn}=fixture(),system=new ConsumableSystem(world,{canSpawn,random:seeded(8)});
  t.after(()=>{for(const item of [...system.availableItems()])remove(system,item);});
  assert.equal(CONSUMABLE_SLOTS.length,47);assert.equal(system.count,46);assert.equal(system.restockCount,45);assert.equal(system.chewableCount,22);
  assert.equal([...system.items.values()].filter(item=>item.type==='hay').length,12);
  for(const slot of added) {
    const item=system.items.get(slot.id);assert.ok(item,`${slot.id} survives the shared production filter`);
    const player=eaterFor(system,item);system.begin(player);assert.equal(system.target,item);
    const [event]=system.update(consumptionSeconds(item),player,0);
    assert.equal(event.kind,'consume');assert.equal(event.energy,40);assert.equal(event.happiness,0);assert.equal(event.poop,3);
  }
  for(const item of [...system.items.values()])remove(system,item);
  for(const slot of added) {
    let calls=0;const index=Number(slot.id.slice(4));system.random=()=>calls++===0?0:(index+.25)/12;
    const [event]=system.update(0,new RabbitController(world),RESTOCK_SECONDS);
    assert.equal(event.kind,'spawn');assert.equal(event.item.id,slot.id);assert.equal(event.item.type,'hay');assert.ok(canSpawn(event.item));
    const player=eaterFor(system,event.item);system.begin(player);assert.equal(system.update(consumptionSeconds(event.item),player,0)[0].kind,'consume');
  }
  system.reset();assert.equal(system.count,46);assert.equal([...system.items.values()].filter(item=>item.type==='hay').length,12);
});
