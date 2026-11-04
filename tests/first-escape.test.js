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
function launch(r,input={},charge=.8) {
  Object.assign(r,{charge,charging:true,jumpHeld:true});r.update(1/120,input);
}

test('an outward charged jump from the den is free and can escape even at zero energy',()=>{
  for(const energy of [0,23,100]) {
    const {world}=createHouse(new THREE.Scene()),r=new RabbitController(world);r.energy.value=energy;
    assert.equal(r.hasFreeDenJump,true);assert.equal(r.jumpCost(.8,{x:1}),0);
    launch(r,{x:1});assert.equal(r.lastJump,'long');assert.equal(r.lastJumpFree,true);assert.equal(r.hasFreeDenJump,true);
    close(r.energy.value,Math.min(100,energy+PASSIVE_REGEN/120));
    tick(r,.8,{x:1});tick(r,.7);
    assert.ok(r.x>DEN.x+DEN.radius);assert.equal(r.grounded,true);assert.equal(r.isFreeDenJump(),false);
    assert.equal(r.lastJumpFree,false);
  }
});

test('stationary, inward, outward and sideways den launches remain free at every charge after repeated landings',()=>{
  const r=new RabbitController(new World());r.energy.value=0;
  for(const charge of [.25,.435,.8]) for(const input of [{},{x:-1},{x:1},{z:1}]) {
    r.reset();r.x=DEN.x+1;
    const before=r.energy.value;assert.equal(r.isFreeDenJump(input),true);assert.equal(r.jumpCost(charge,input),0);
    launch(r,input,charge);assert.equal(r.lastJump,'long');assert.equal(r.lastJumpFree,true);assert.equal(r.jumpEnergyBlocked,false);
    close(r.energy.value,before+PASSIVE_REGEN/120);
  }
  r.reset();r.energy.value=0;
  for(let i=0;i<3;i++) {
    const before=r.energy.value;launch(r);assert.equal(r.lastJumpFree,true);close(r.energy.value,before+PASSIVE_REGEN/120);
    tick(r,1.2);assert.equal(r.grounded,true);assert.equal(r.isFreeDenJump(),true);
  }
});

test('outside, upstairs and basement launches retain the normal energy cost and low-energy fallback',()=>{
  for(const position of [{x:0,y:0,z:-29},{x:DEN.x,y:4.2,z:DEN.z},{x:DEN.x,y:-4.2,z:DEN.z}]) {
    const w=position.y<0 ? createHouse(new THREE.Scene()).world : new World();
    if(position.y>0)w.addBox(position.x,position.y-.1,position.z,2,.2,2,'carpet');
    const r=new RabbitController(w);Object.assign(r,position);r.energy.value=20;
    assert.equal(r.isFreeDenJump(),false);assert.equal(r.jumpCost(.8),highJumpCost(.8));
    launch(r,{x:1});assert.equal(r.lastJump,'long');assert.equal(r.lastJumpFree,false);close(r.energy.value,10+PASSIVE_REGEN/120);
  }
  const poor=new RabbitController(new World());Object.assign(poor,{x:0,z:-29});poor.energy.value=0;
  launch(poor);assert.equal(poor.lastJump,'hop');assert.equal(poor.lastJumpFree,false);assert.equal(poor.jumpEnergyBlocked,true);
});

test('den eligibility requires grounded feet within the ground-floor circular enclosure',()=>{
  const r=new RabbitController(new World());
  for(const y of [-4.2,-.051,DEN.fenceHeight,4.2]) {r.y=y;assert.equal(r.isFreeDenJump(),false);}
  for(const y of [-.05,0,.7]) {r.y=y;assert.equal(r.isFreeDenJump(),true);}
  r.y=0;r.x=DEN.x+DEN.radius;assert.equal(r.isFreeDenJump(),false);
  r.x=DEN.x;r.grounded=false;assert.equal(r.isFreeDenJump(),false);
});

test('tap hops, cancelled charges and returning home never restrict subsequent free den launches',()=>{
  const r=new RabbitController(new World());r.energy.value=0;
  launch(r,{x:1},.05);assert.equal(r.lastJump,'hop');assert.equal(r.lastJumpFree,false);
  r.reset();Object.assign(r,{charging:true,charge:.8,jumpHeld:true});r.releaseInput();r.update(1/120,{x:1});
  assert.equal(r.lastJump,null);assert.equal(r.isFreeDenJump(),true);
  launch(r);assert.equal(r.lastJumpFree,true);r.reset();launch(r);assert.equal(r.lastJumpFree,true);
});

test('sprinting still spends energy independently, and resetting a day preserves unlimited free den jumps',()=>{
  const r=new RabbitController(new World());r.energy.value=50;
  launch(r,{x:1,run:true});assert.equal(r.lastJumpFree,true);assert.ok(r.energy.value<50);
  r.reset();assert.equal(r.isFreeDenJump(),true);
  let consumableResets=0,poopResets=0;
  resetAdventure({clock:new DayClock(),controller:r,consumables:{reset(){consumableResets++;}},poop:{reset(){poopResets++;}}},123);
  assert.equal(r.isFreeDenJump(),true);assert.equal(r.energy.value,100);assert.equal(consumableResets,1);assert.equal(poopResets,1);
  launch(r);assert.equal(r.lastJumpFree,true);assert.equal(r.hasFreeDenJump,true);
});
