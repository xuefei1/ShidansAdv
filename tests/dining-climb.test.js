import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {RabbitController} from '../src/physics.js';

const {world}=createHouse(new THREE.Scene());
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} differs from ${expected}`);
function advance(rabbit,seconds,fps,input) {
  for(let i=0;i<Math.ceil(seconds*fps);i++)rabbit.update(1/fps,input);
}
function tapHop(rabbit,fps) {
  advance(rabbit,.05,fps,{x:1,jump:true});advance(rabbit,.8,fps,{x:1});
}

test('the final dining step overlaps the table edge and keeps continuous support beneath the approach',()=>{
  const step=world.solids.find(box=>box.id==='dining-climb'),table=world.solids.find(box=>box.id==='dining-top');
  assert.ok(step&&table);assert.ok(step.maxX-table.minX>=.049,'no unsupported strip before the table');
  close(step.maxY,1.12);close(table.maxY-step.maxY,.4);
  assert.ok(step.maxY<table.minY,'the chest and tabletop retain distinct physical/render heights');
  for(let x=10;x<=table.minX;x+=.025)close(world.support(x,15,step.maxY+.001,true).y,step.maxY);
});

test('walking to the final ledge stays grounded and a tap hop lands on the dining table across frame rates',()=>{
  for(const fps of [120,60,30,10])for(const z of [14.5,15,15.5]) {
    const rabbit=new RabbitController(world);Object.assign(rabbit,{x:10.7,y:1.12,z,surface:'wood'});
    for(let frame=0;frame<fps;frame++) {
      rabbit.update(1/fps,{x:1});
      assert.equal(rabbit.grounded,true,`${fps} FPS / z=${z}: approach must not fall into a gap`);close(rabbit.y,1.12);
    }
    assert.ok(rabbit.x>11.3&&rabbit.x<11.6,'she can wait immediately beside the tabletop');
    tapHop(rabbit,fps);
    assert.equal(rabbit.grounded,true,`${fps} FPS / z=${z}`);close(rabbit.y,1.52);
    assert.ok(rabbit.x>12&&rabbit.x<16.2,'the hop reaches the table interior');close(rabbit.z,z);
  }
});

test('three ordinary hops traverse the complete book, stool and chest route onto the table',()=>{
  for(const fps of [120,60,30,10]) {
    const rabbit=new RabbitController(world);Object.assign(rabbit,{x:8.4,y:.32,z:15,surface:'wood'});
    advance(rabbit,.8,fps,{x:1});close(rabbit.y,.32);assert.equal(rabbit.grounded,true);
    for(const height of [.72,1.12,1.52]) {
      tapHop(rabbit,fps);assert.equal(rabbit.grounded,true,`${fps} FPS / ${height} m step`);close(rabbit.y,height);
    }
    assert.ok(rabbit.x>12);assert.equal(rabbit.energy.value,100,'the ordinary wood-surface hops need no energy');
  }
});
