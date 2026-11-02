import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {ConsumableSystem,canReachConsumable} from '../src/consumable-system.js';
import {CONSUMABLE_SLOTS,consumptionSeconds} from '../src/consumable-data.js';
import {createChewablePlaces} from '../src/chewable-data.js';
import {RabbitController} from '../src/physics.js';
import {FLOOR_HEIGHT as H} from '../src/layout.js';

const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);
const nav=new MistressNavigation(world),canSpawn=point=>!nav.isRabbitSafe(point);
const shelfSlots=CONSUMABLE_SLOTS.filter(item=>['book-11','banana-2'].includes(item.id));
function remove(system,item) {system.motion.remove(item);world.removeBox(item.collider);system.items.delete(item.id);system.chewables.delete(item.id);}
function release(system) {for(const item of system.availableItems())if(item.collider)remove(system,item);}
function eaterFor(system,item) {
  for(const radius of [.7,.9,1.05])for(let step=0;step<32;step++) {
    const x=item.x+Math.sin(step*Math.PI/16)*radius,z=item.z+Math.cos(step*Math.PI/16)*radius,y=world.support(x,z,item.y+.02,true).y;
    if(Math.abs(y-item.y)>.02)continue;
    const player=new RabbitController(world);Object.assign(player,{x,y,z});
    const blocked=world.query(x-.22,z-.22,x+.22,z+.22).some(box=>!box.pushable&&box.maxY>y+.005&&box.minY<y+.675&&
      Math.hypot(Math.max(box.minX,Math.min(box.maxX,x))-x,Math.max(box.minZ,Math.min(box.maxZ,z))-z)<.219);
    if(!blocked&&canReachConsumable(player,item,world)&&system.nearest(player)===item)return player;
  }
  assert.fail(`No clear rabbit stance beside ${item.id}`);
}

test('both linen tiers have supported, edible fixed snacks without increasing the authored population',t=>{
  const system=new ConsumableSystem(world,{canSpawn,wires:[],randomLimits:{}});t.after(()=>release(system));
  assert.equal(CONSUMABLE_SLOTS.length,41);assert.equal(system.count,40);
  for(const [id,level] of [['book-11',H+.9],['banana-2',H+1.9]]) {
    const item=system.items.get(id);assert.ok(item);assert.ok(Math.abs(item.y-level)<1e-9);assert.ok(canSpawn(item));
    assert.ok(Math.abs(world.support(item.x,item.z,item.y+.02,true).y-item.y)<1e-9);
    const player=eaterFor(system,item);system.begin(player);const events=system.update(consumptionSeconds(item),player,0);
    assert.equal(events.length,1);assert.equal(events[0].item.id,id);assert.equal(system.items.has(id),false);
  }
});

test('regular low-stock replenishment can restore items on each exposed linen tier',t=>{
  let random=.7;const system=new ConsumableSystem(world,{slots:shelfSlots,canSpawn,wires:[],randomPlaces:[],randomLimits:{},random:()=>random});
  t.after(()=>release(system));
  for(const item of [...system.items.values()]) {const player=eaterFor(system,item);system.begin(player);system.update(consumptionSeconds(item),player,0);}
  assert.equal(system.count,0);
  const player=new RabbitController(world),[lower]=system.update(0,player,60);assert.equal(lower.item.id,'book-11');assert.ok(Math.abs(lower.item.y-(H+.9))<1e-9);
  random=.6;const [upper]=system.update(0,player,60);assert.equal(upper.item.id,'banana-2');assert.ok(Math.abs(upper.item.y-(H+1.9))<1e-9);
  assert.equal(system.count,2);assert.ok([...system.items.values()].every(canSpawn));
});

test('random cardboard and slippers can spawn and respawn on both tiers while the jump launch stays clear',t=>{
  const pool=createChewablePlaces(world).filter(canSpawn),lower=pool.find(point=>Math.abs(point.y-(H+.9))<1e-9),upper=pool.find(point=>Math.abs(point.y-(H+1.9))<1e-9);
  assert.ok(lower&&upper,'both elevated decks provide an eligible random location');
  const launch=world.fixtures.get('linen-shelf-upper').reachableShelf.spawnKeepClear;
  for(const point of [lower,upper])assert.ok(Math.hypot(point.x-launch.x,point.z-launch.z)>=launch.radius);
  const system=new ConsumableSystem(world,{slots:[],wires:[],randomPlaces:[lower,upper],randomLimits:{cardboard:1,slippers:1},random:()=>0,canSpawn});
  t.after(()=>release(system));assert.equal(system.chewableCount,2);
  for(const item of [...system.chewables.values()]) {const player=eaterFor(system,item);system.begin(player);system.update(consumptionSeconds(item),player,0);}
  assert.equal(system.chewableCount,0);const player=new RabbitController(world);
  assert.equal(system.update(0,player,59.999).length,0);const [box]=system.update(0,player,.001);assert.equal(box.item.type,'cardboard');
  assert.ok(Math.abs(box.item.y-(H+.9))<1e-9);assert.equal(system.update(0,player,29.999).length,0);
  const [slippers]=system.update(0,player,.001);assert.equal(slippers.item.type,'slippers');assert.ok(Math.abs(slippers.item.y-(H+1.9))<1e-9);
  assert.equal(system.chewableCount,2);assert.ok([...system.chewables.values()].every(canSpawn));
});
