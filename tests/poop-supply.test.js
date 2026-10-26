import test from 'node:test';
import assert from 'node:assert/strict';
import { PoopSupply, INITIAL_POOP, MAX_CARRIED_POOP, POOP_COOLDOWN } from '../src/poop-supply.js';
import { DEN } from '../src/layout.js';

const denPosition = () => ({x:DEN.x,y:0,z:DEN.z});
const denHay = () => ({kind:'consume',item:{id:'den-hay',type:'hay',permanent:true},poop:10});

test('supply starts at ten and resets inventory, cooldown and visit allowance for a new day', () => {
  const supply = new PoopSupply();
  assert.equal(INITIAL_POOP,10); assert.equal(supply.value,10);
  supply.trySpend(20); supply.grantFromConsumption(denHay(),denPosition()); supply.reset();
  assert.equal(supply.value,10); assert.equal(supply.denHayRewardAvailable,true); assert.equal(supply.trySpend(0),true);
});
test('carrying capacity is fifty and excess rewards are discarded', () => {
  const supply = new PoopSupply();
  assert.equal(MAX_CARRIED_POOP,50); assert.equal(supply.grant(45),40); assert.equal(supply.value,50);
  assert.equal(supply.grant(15),0); supply.trySpend(0); assert.equal(supply.value,49);
});
test('empty inventory rejects drops without reserving a new cooldown', () => {
  const supply = new PoopSupply();
  for(let i=0;i<10;i++) assert.equal(supply.trySpend(i),true);
  assert.equal(supply.value,0); assert.equal(supply.trySpend(20),false);
  supply.grant(1); assert.equal(supply.trySpend(20),true); assert.equal(supply.value,0);
});
test('a successful drop starts a cooldown of exactly one second; rejected clicks do not extend it', () => {
  const supply = new PoopSupply();
  assert.equal(POOP_COOLDOWN,1); assert.equal(supply.trySpend(0),true);
  assert.equal(supply.trySpend(.1),false); assert.equal(supply.trySpend(.999),false); assert.equal(supply.value,9);
  assert.equal(supply.trySpend(1.000),true); assert.equal(supply.value,8);
  assert.equal(supply.trySpend(1.999),false); assert.equal(supply.trySpend(2.000),true);
});
test('invalid rewards and clock values cannot corrupt the inventory', () => {
  const supply = new PoopSupply();
  for(const value of [NaN,Infinity,-1]) { assert.equal(supply.grant(value),0); assert.equal(supply.trySpend(value),false); }
  assert.equal(supply.value,10);
});
test('only a completed food consumption grants its listed poop reward', () => {
  const supply = new PoopSupply(), player = denPosition(), item = {id:'carrot-test',type:'carrot'};
  assert.equal(supply.grantFromConsumption({kind:'spawn',item,poop:5},player),0);
  assert.equal(supply.grantFromConsumption({kind:'consume',item,poop:5},player),5);
  assert.equal(supply.grantFromConsumption({kind:'consume',item:{id:'wire-test',type:'wire'},poop:0},player),0);
  assert.equal(supply.value,15);
});
test('poop eating never grants new carried poop', () => {
  const supply = new PoopSupply();
  assert.equal(supply.grantFromConsumption({kind:'consume',item:{id:'poop-1',type:'poop'},poop:15},denPosition()),0);
  assert.equal(supply.value,10);
});
test('normal food rewards can come directly from the food data without an event override', () => {
  const supply = new PoopSupply();
  assert.equal(supply.grantFromConsumption({kind:'consume',item:{id:'hay-test',type:'hay'}},denPosition()),10);
  assert.equal(supply.value,20);
});
test('den hay grants ten once per visit and recharges after leaving and re-entering', () => {
  const supply = new PoopSupply(), player = denPosition();
  assert.equal(supply.grantFromConsumption(denHay(),player),10);
  assert.equal(supply.grantFromConsumption(denHay(),player),0); supply.observePosition(player);
  assert.equal(supply.grantFromConsumption(denHay(),player),0);
  player.x += DEN.radius+1; supply.observePosition(player);
  assert.equal(supply.grantFromConsumption(denHay(),player),0);
  Object.assign(player,denPosition()); supply.observePosition(player);
  assert.equal(supply.grantFromConsumption(denHay(),player),10); assert.equal(supply.value,30);
});
test('jumping vertically within the den does not create another visit', () => {
  const supply = new PoopSupply(), player = denPosition();
  supply.grantFromConsumption(denHay(),player); player.y = 2; supply.observePosition(player);
  player.y = 0; supply.observePosition(player);
  assert.equal(supply.grantFromConsumption(denHay(),player),0);
});
test('moving above the den on the upper floor does not count as re-entering', () => {
  const supply = new PoopSupply(), player = denPosition();
  supply.grantFromConsumption(denHay(),player); player.x += DEN.radius+1; supply.observePosition(player);
  Object.assign(player,denPosition(),{y:4.2}); supply.observePosition(player);
  assert.equal(supply.grantFromConsumption(denHay(),player),0);
  player.y = 0; supply.observePosition(player); assert.equal(supply.grantFromConsumption(denHay(),player),10);
});
test('den hay visit allowance is spent even when carried inventory is full', () => {
  const supply = new PoopSupply(), player = denPosition(); supply.grant(40);
  assert.equal(supply.grantFromConsumption(denHay(),player),0); assert.equal(supply.denHayRewardAvailable,false);
  supply.trySpend(0); assert.equal(supply.grantFromConsumption(denHay(),player),0); assert.equal(supply.value,49);
});
