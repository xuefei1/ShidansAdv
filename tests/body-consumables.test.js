import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { ConsumableSystem } from '../src/consumable-system.js';
import { createConsumables } from '../src/consumables.js';
import { consumableDetails, consumptionSeconds, DEN_HAY } from '../src/consumable-data.js';
import { createPoopBalls } from '../src/poop.js';
import { MAX_POOP_BALLS, POOP_RADIUS } from '../src/poop-physics.js';
import { World, RabbitController } from '../src/physics.js';
import { DEN } from '../src/layout.js';
import { DayClock } from '../src/day-cycle.js';
import { WaterSystem } from '../src/water.js';
import { resetAdventure } from '../src/adventure-session.js';

const options = slots => ({slots,wires:[],randomLimits:{},randomPlaces:[]});
function fixture(slots = []) {
  const scene = new THREE.Scene(), world = new World(), player = new RabbitController(world);
  Object.assign(player,{x:.8,y:0,z:0,grounded:true}); player.energy.value = 20;
  const system = new ConsumableSystem(world,options(slots)), poop = createPoopBalls(scene,world);
  system.setExternalItems(poop);
  const advance = dt => {
    const events = system.update(dt,player,0);
    for (const event of events) poop.supply.grantFromConsumption(event,player);
    return events;
  };
  return {scene,world,player,system,poop,advance};
}
function complete(f) {
  f.system.begin(f.player);
  assert.ok(f.system.target,'a reachable item was selected');
  return f.advance(consumptionSeconds(f.system.target));
}

const rewards = {carrot:2,book:2,apple:2,hay:3,rabbitFood:2,banana:2,bread:2,noodles:5,cake:5,wire:0,cardboard:0,slippers:0};
for (const [type,reward] of Object.entries(rewards)) {
  test(`completing ${type} grants exactly ${reward} carried poop balls`, () => {
    const item = {id:`test-${type}`,type,x:0,y:0,z:0}, f = fixture([item]);
    assert.equal(consumableDetails(item).poop || 0,reward,'the food table matches the requested reward');
    f.system.begin(f.player); assert.equal(f.system.target.id,item.id);
    const seconds = consumptionSeconds(item);
    assert.deepEqual(f.advance(seconds-.01),[]); assert.equal(f.poop.supply.value,10);
    const events = f.advance(.01);
    assert.equal(events.length,1); assert.equal(events[0].kind,'consume'); assert.equal(events[0].poop,reward);
    assert.equal(f.poop.supply.value,10+reward); assert.equal(f.system.items.has(item.id),false);
    assert.deepEqual(f.advance(1),[]); assert.equal(f.poop.supply.value,10+reward,'holding after completion grants nothing more');
  });
}

test('special den hay refills energy each time but gives three carried balls once per actual den visit', () => {
  const f = fixture(); Object.assign(f.player,{x:DEN.x,z:DEN.z}); f.player.energy.value = 1;
  assert.equal(consumableDetails(DEN_HAY).poop,3);
  f.system.begin(f.player); assert.equal(f.system.target.id,'den-hay');
  assert.deepEqual(f.advance(consumptionSeconds(DEN_HAY)-.01),[]);
  assert.equal(f.player.energy.value,1); assert.equal(f.poop.supply.value,10);
  assert.equal(f.advance(.01)[0].item.id,'den-hay'); assert.equal(f.player.energy.value,100); assert.equal(f.poop.supply.value,13);
  f.player.energy.value = 2; complete(f); assert.equal(f.player.energy.value,100); assert.equal(f.poop.supply.value,13);
  f.player.x = DEN.x+DEN.radius+1; f.poop.update(0,f.player);
  Object.assign(f.player,{x:DEN.x,z:DEN.z}); f.poop.update(0,f.player);
  complete(f); assert.equal(f.poop.supply.value,16);
});

for(const [type,reward] of [['carrot',2],['hay',3],['noodles',5]]) {
  test(`a completed ${type} reward reports ${reward} but only fills the last carried slot`,()=>{
    const f=fixture([{id:`${type}-cap`,type,x:0,y:0,z:0}]);
    f.poop.supply.grant(9);assert.equal(f.poop.supply.value,19);
    assert.equal(complete(f)[0].poop,reward);assert.equal(f.poop.supply.value,20);
  });
}

test('a real dropped ball shares held consumption and gives exactly five energy once without new poop', () => {
  const f = fixture(); f.player.facing = 0;
  assert.ok(f.poop.drop(f.player,0)); assert.equal(f.poop.supply.value,9);
  for(let i=0;i<120;i++) f.poop.update(1/60,f.player);
  f.system.begin(f.player); assert.equal(f.system.target.type,'poop');
  assert.equal(consumptionSeconds(f.system.target),1);
  assert.deepEqual(f.advance(.99),[]); assert.equal(f.player.energy.recoveries.length,0); assert.equal(f.poop.physics.count,1);
  const events = f.advance(.01);
  assert.equal(events.length,1); assert.equal(events[0].energy,5); assert.equal(events[0].happiness,0); assert.equal(events[0].poop,0);
  assert.equal(f.poop.physics.count,0); assert.equal(f.poop.supply.value,9);
  assert.deepEqual(f.player.energy.recoveries,[{rate:5,remaining:1}]);
  assert.deepEqual(f.advance(2),[]); f.player.energy.update(1);
  assert.ok(Math.abs(f.player.energy.value-25.01)<1e-9); assert.equal(f.poop.supply.value,9);
});

for(const reason of ['removed','evicted']) {
  test(`a poop target ${reason} during a hold cancels without a phantom reward`, () => {
    const f = fixture();
    const ball = f.poop.physics.spawn({x:0,y:POOP_RADIUS,z:0});
    f.system.begin(f.player); assert.equal(f.system.target.ball,ball);
    f.advance(.5); const target = f.system.target;
    if(reason==='removed') f.poop.physics.remove(ball);
    else for(let i=0;i<MAX_POOP_BALLS;i++) f.poop.physics.spawn({x:10,y:POOP_RADIUS,z:10});
    assert.equal(f.poop.has(target),false);
    assert.deepEqual(f.advance(.5),[]); assert.equal(f.system.target,null); assert.equal(f.player.energy.recoveries.length,0);
    assert.equal(f.poop.supply.value,10);
  });
}

for(const includeWater of [false,true]) {
  test(`a fresh adventure restores ten carried balls and keeps scene objects${includeWater ? ', including resetting water' : ' without requiring water'}`, () => {
    const scene = new THREE.Scene(), world = new World(), controller = new RabbitController(world);
    const consumables = createConsumables(scene,world,options([{id:'reset-carrot',type:'carrot',x:0,y:0,z:0}]));
    const poop = createPoopBalls(scene,world), clock = new DayClock(); consumables.system.setExternalItems(poop);
    const water = includeWater ? new WaterSystem(world,{items:[{id:'test-fountain',x:1,y:0,z:0}]}) : undefined;
    if(water) {
      Object.assign(controller,{x:.8,y:0,z:0,grounded:true}); assert.equal(water.start(controller),true);
      water.advance(10,controller); assert.equal(water.bladder.value,100); assert.ok(water.pee(controller));
      assert.equal(water.cooldownRemaining,60);
    }
    poop.drop(controller,0); poop.supply.grant(40); poop.sync();
    controller.energy.value = 1; controller.energy.consume(5); clock.setActive(true,0); clock.update(600000);
    const objects = scene.children.slice(), geometry = scene.getObjectByName('Persistent poop balls').geometry;
    resetAdventure({clock,controller,consumables,poop,water},600000);
    assert.deepEqual(scene.children,objects); assert.equal(scene.getObjectByName('Persistent poop balls').geometry,geometry);
    assert.equal(poop.supply.value,10); assert.equal(poop.physics.count,0); assert.equal(poop.supply.denHayRewardAvailable,true);
    assert.equal(controller.energy.value,100); assert.equal(controller.energy.recoveries.length,0);
    assert.equal(clock.remaining,600); assert.equal(clock.active,false); assert.equal(consumables.system.target,null);
    assert.equal(consumables.system.external,poop); assert.equal(consumables.system.items.has('reset-carrot'),true);
    if(water) { assert.equal(water.bladder.value,0); assert.equal(water.cooldownRemaining,0); assert.equal(water.drinking,false); }
    assert.ok(poop.drop(controller,0)); assert.equal(poop.supply.value,9);
  });
}
