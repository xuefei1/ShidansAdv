import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {MistressNavigation,MISTRESS_RADIUS} from '../src/mistress-navigation.js';
import {withinInteractionReach,TABLE_REACH_HEIGHT} from '../src/table-refuges.js';

const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);
const navigation=new MistressNavigation(world),from={x:-15.8,y:0,z:6.9};

test('picnic benches leave clear human-width aisles and connected grid stances beside both long sides',()=>{
  const table=world.solids.find(box=>box.id==='picnic-top');
  const rear=world.solids.find(box=>box.id==='picnic-bench--35');
  const front=world.solids.find(box=>box.id==='picnic-bench--29');
  assert.ok(table&&rear&&front);
  assert.ok(table.minZ-rear.maxZ>2*MISTRESS_RADIUS+.2);
  assert.ok(front.minZ-table.maxZ>2*MISTRESS_RADIUS+.2);
  for(const z of [-34,-30]) {
    const stance={x:10,y:0,z};
    assert.equal(navigation.canStand(stance),true);assert.equal(navigation.componentAt(stance),navigation.mainComponent);
    const path=navigation.findPath(from,stance);assert.ok(path.length>1);
    for(let i=1;i<path.length;i++)assert.equal(navigation.segmentClear(path[i-1],path[i]),true);
    const target={x:10,y:1.6,z:-32};assert.ok(withinInteractionReach(target,stance,navigation.reachInteraction(target)));
  }
});

test('a human has a nearby valid stance for the picnic centre on and beneath the tabletop',()=>{
  for(const y of [0,1.6]) {
    const target={x:10,y,z:-32},interaction=navigation.tableInteraction(target);
    assert.ok(interaction);assert.equal(interaction.under,y===0);
    const stance=navigation.pursuitTarget(target,from);assert.ok(stance,`reachable picnic centre at y=${y}`);
    assert.equal(navigation.canStand(stance),true);assert.ok(navigation.findPath(from,stance).length>1);
    assert.ok(withinInteractionReach(target,stance,interaction));
    assert.ok(Math.hypot(stance.x-target.x,stance.z-target.z)<=2.05,'a close side stance exists without reaching across the full table length');
    assert.ok(Math.abs(stance.y-target.y)<=TABLE_REACH_HEIGHT);
    assert.equal(navigation.isRabbitSafe(target,from),false);
  }
});
