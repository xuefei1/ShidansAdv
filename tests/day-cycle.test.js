import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {DayClock,DAY_SECONDS,NIGHT_START,dayState,formatCountdown} from '../src/day-cycle.js';
import {createHouse,batchStaticGeometry} from '../src/house.js';
import {createDayLighting,LOCAL_LIGHT_LIMIT} from '../src/day-lighting.js';
import {LAMP_PLACEMENTS} from '../src/house-lamps.js';
import {createConsumables} from '../src/consumables.js';
import {createPoopBalls} from '../src/poop.js';
import {RabbitController,DEN} from '../src/physics.js';
import {resetAdventure} from '../src/adventure-session.js';

test('the real-time day lasts exactly ten minutes even with delayed frames',()=>{
  const clock=new DayClock(1000); clock.setActive(true,1000);
  clock.update(1000+480000); assert.equal(clock.remaining,120); assert.equal(clock.finished,false);
  clock.update(600999); assert.ok(clock.remaining>0); clock.update(601000);
  assert.equal(clock.remaining,0); assert.equal(clock.finished,true); assert.equal(clock.active,false);
  clock.update(9999999); assert.equal(clock.elapsed,DAY_SECONDS);
});
test('title, menus, overview and hidden time never count toward the day',()=>{
  const clock=new DayClock(0); clock.update(500000); assert.equal(clock.remaining,600);
  clock.setActive(true,500000); clock.setActive(false,510000); assert.equal(clock.remaining,590);
  clock.update(900000); clock.setActive(true,1000000); clock.update(1001250); assert.equal(clock.remaining,588.75);
  clock.setActive(false,1001500); assert.equal(clock.remaining,588.5);
});
test('clock reset is inactive at noon; stale or invalid timestamps cannot add time',()=>{
  const clock=new DayClock(100); clock.setActive(true,100); clock.update(1100);
  for(const now of [1000,NaN,Infinity,-100]) clock.update(now);
  clock.update(2100); assert.equal(clock.elapsed,2);
  clock.reset(5000); assert.equal(clock.remaining,600); assert.equal(clock.active,false);
  clock.update(10000); assert.equal(clock.remaining,600);
});
test('countdown formatting never shows zero before the actual deadline',()=>{
  assert.equal(formatCountdown(600),'10:00'); assert.equal(formatCountdown(599.9),'10:00');
  assert.equal(formatCountdown(120),'2:00'); assert.equal(formatCountdown(.01),'0:01'); assert.equal(formatCountdown(0),'0:00');
});
test('daylight fades smoothly, with complete night and lamp light at two minutes remaining',()=>{
  assert.equal(NIGHT_START,480); assert.equal(dayState(0).phase,'Noon');
  assert.equal(dayState(240).phase,'Afternoon'); assert.equal(dayState(390).phase,'Dusk');
  let previous=dayState(0);
  for(let elapsed=.5;elapsed<=600;elapsed+=.5) {
    const state=dayState(elapsed);
    for(const key of ['dusk','night','lamps','stars']) { assert.ok(state[key]>=previous[key]); assert.ok(state[key]-previous[key]<.01); }
    previous=state;
  }
  for(const elapsed of [480,540,600]) {
    const state=dayState(elapsed); assert.equal(state.phase,'Night');
    assert.equal(state.night,1); assert.equal(state.stars,1); assert.equal(state.lamps,1);
  }
});

test('both floors have physical ceiling/floor lamps that survive static batching',()=>{
  const scene=new THREE.Scene(),house=createHouse(scene);
  assert.equal(house.lamps.fixtures.length,18);
  for(const floor of [0,1]) for(const kind of ['ceiling','floor']) assert.ok(LAMP_PLACEMENTS.some(l=>l.floor===floor && l.kind===kind));
  for(const fixture of LAMP_PLACEMENTS) {
    assert.ok(house.lamps.colliders.some(b=>fixture.x>=b.minX && fixture.x<=b.maxX && fixture.z>=b.minZ && fixture.z<=b.maxZ && fixture.y+.18>=b.minY && fixture.y+.18<=b.maxY));
  }
  house.layers.forEach(batchStaticGeometry);
  for(const floor of [0,1]) {
    const glow=scene.getObjectByName(`Lamp diffusers floor ${floor}`);
    assert.ok(glow.isInstancedMesh); assert.equal(glow.material,house.lamps.glowMaterial);
    assert.equal(glow.count,LAMP_PLACEMENTS.filter(l=>l.floor===floor).length);
  }
});

test('night lighting keeps a fixed unshadowed light pool and stable sun direction',()=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0,140,260);
  const house=createHouse(scene),sun=new THREE.DirectionalLight(),fill=new THREE.DirectionalLight(),hemisphere=new THREE.HemisphereLight();
  sun.position.set(-18,42,22);const direction=sun.position.clone();
  const lighting=createDayLighting(scene,{sun,fill,hemisphere},house.lamps),camera=new THREE.PerspectiveCamera();
  const r=new RabbitController(house.world);
  lighting.update(0,r,camera); const noonIntensity=sun.intensity;
  assert.ok(lighting.slots.every(s=>s.light.intensity===0));
  lighting.update(480,r,camera); assert.ok(sun.intensity<noonIntensity);
  assert.equal(lighting.stars.material.opacity,.9); assert.equal(lighting.moon.material.opacity,1);
  assert.ok(lighting.slots.every(s=>s.light.intensity>0 && !s.light.castShadow && s.light.visible));
  assert.equal(lighting.slots.length,LOCAL_LIGHT_LIMIT); assert.ok(sun.position.equals(direction));
  const selected=lighting.slots.map(s=>s.fixture.id);camera.position.set(30,30,-30);camera.lookAt(0,0,0);
  lighting.update(500,r,camera,1/60);assert.deepEqual(lighting.slots.map(s=>s.fixture.id),selected);
  assert.ok(lighting.sky.position.equals(camera.position));
  Object.assign(r,{x:1,y:4.2,z:-10}); for(let i=0;i<60;i++)lighting.update(510,r,camera,1/60);
  assert.ok(lighting.slots.every(s=>s.fixture.floor===1));
});

test('timeout resets clock, energy, snacks, hay and ball physics without rebuilding the house',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene),controller=new RabbitController(world);
  const consumables=createConsumables(scene,world),poop=createPoopBalls(scene,world),clock=new DayClock();
  controller.energy.value=3;controller.energy.consume(20);controller.sprintExhausted=true;
  consumables.system.items.clear();consumables.system.restockTime=55;consumables.system.begin(controller);
  poop.drop(controller);poop.sync();clock.setActive(true,0);clock.update(600000);
  const objects=scene.children.slice();resetAdventure({clock,controller,consumables,poop},600000);
  assert.equal(clock.remaining,600);assert.equal(clock.active,false);
  assert.equal(controller.energy.value,100);assert.equal(controller.energy.recovering,false);assert.equal(controller.sprintExhausted,false);
  assert.equal(controller.x,DEN.x);assert.equal(controller.z,DEN.z);
  assert.equal(consumables.system.count,41);assert.equal(consumables.system.target,null);assert.equal(consumables.system.restockTime,0);
  assert.equal(consumables.system.nearest(controller).id,'den-hay');
  assert.equal(poop.physics.count,0);assert.equal(poop.physics.grid.cells.size,0);assert.equal(poop.physics.active.size,0);
  assert.equal(scene.getObjectByName('Persistent poop balls').count,0);assert.deepEqual(scene.children,objects);
  poop.drop(controller);poop.sync();assert.equal(poop.physics.count,1);assert.equal(scene.getObjectByName('Persistent poop balls').count,1);
});
