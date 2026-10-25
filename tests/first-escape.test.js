import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { RabbitController, World, DEN } from '../src/physics.js';
import { createHouse } from '../src/house.js';
import { highJumpCost, PASSIVE_REGEN } from '../src/energy.js';
import { resetAdventure } from '../src/adventure-session.js';
import { DayClock } from '../src/day-cycle.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const tick=(r,seconds,input={})=>{for(let i=0;i<Math.round(seconds*120);i++)r.update(1/120,input);};
function launch(r,input={x:1},charge=.8) {
  Object.assign(r,{charge,charging:true,jumpHeld:true});r.update(1/120,input);
}

test('the first outward charged jump from the den is free and can escape even at zero energy',()=>{
  for(const energy of [0,23,100]) {
    const {world}=createHouse(new THREE.Scene()),r=new RabbitController(world);r.energy.value=energy;
    assert.equal(r.hasFreeDenJump,true);assert.equal(r.jumpCost(.8,{x:1}),0);
    launch(r);assert.equal(r.lastJump,'long');assert.equal(r.lastJumpFree,true);assert.equal(r.hasFreeDenJump,false);
    close(r.energy.value,Math.min(100,energy+PASSIVE_REGEN/120));
    tick(r,.8,{x:1});tick(r,.7);
    assert.ok(r.x>DEN.x+DEN.radius);assert.equal(r.grounded,true);
    assert.equal(r.lastJumpFree,false);
  }
});

test('stationary, inward, and outside charged jumps retain their normal cost without taking the allowance',()=>{
  const placements=[
    [{x:DEN.x,z:DEN.z},{}],
    [{x:DEN.x+1,z:DEN.z},{x:-1}],
    [{x:0,z:-29},{x:1}],
  ];
  for(const [position,input] of placements) {
    const r=new RabbitController(new World());Object.assign(r,position);r.energy.value=20;
    assert.equal(r.isFreeDenJump(input),false);assert.equal(r.jumpCost(.8,input),highJumpCost(.8));
    launch(r,input);assert.equal(r.lastJump,'long');assert.equal(r.lastJumpFree,false);assert.equal(r.hasFreeDenJump,true);
    close(r.energy.value,10+PASSIVE_REGEN/120);
  }
  const above=new RabbitController(new World());above.y=4.2;
  assert.equal(above.isFreeDenJump({x:1}),false);above.y=0;above.grounded=false;
  assert.equal(above.isFreeDenJump({x:1}),false);
});

test('tap hops and cancelled charges preserve the allowance; home resets cannot renew a used allowance',()=>{
  const r=new RabbitController(new World());r.energy.value=30;
  launch(r,{x:1},.05);assert.equal(r.lastJump,'hop');assert.equal(r.hasFreeDenJump,true);
  r.reset();Object.assign(r,{charging:true,charge:.8,jumpHeld:true});r.releaseInput();r.update(1/120,{x:1});
  assert.equal(r.hasFreeDenJump,true);assert.equal(r.lastJump,null);
  launch(r);assert.equal(r.hasFreeDenJump,false);r.reset();
  launch(r);assert.equal(r.lastJumpFree,false);assert.equal(r.lastJump,'long');
  assert.equal(r.hasFreeDenJump,false);assert.ok(r.energy.value<21);
});

test('sprinting costs energy independently of the free launch and a fresh day restores exactly one allowance',()=>{
  const r=new RabbitController(new World());r.energy.value=50;
  launch(r,{x:1,run:true});assert.equal(r.lastJumpFree,true);assert.ok(r.energy.value<50);
  r.reset();assert.equal(r.hasFreeDenJump,false);
  let consumableResets=0,poopResets=0;
  resetAdventure({clock:new DayClock(),controller:r,consumables:{reset(){consumableResets++;}},poop:{reset(){poopResets++;}}},123);
  assert.equal(r.hasFreeDenJump,true);assert.equal(r.energy.value,100);assert.equal(consumableResets,1);assert.equal(poopResets,1);
  launch(r);assert.equal(r.lastJumpFree,true);assert.equal(r.hasFreeDenJump,false);
});
