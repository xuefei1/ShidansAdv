import test from 'node:test';
import assert from 'node:assert/strict';
import {RoundStats,ROUND_CONSUMABLE_TYPES} from '../src/round-stats.js';
import {CONSUMABLE_TYPES} from '../src/consumable-data.js';
import {World,RabbitController} from '../src/physics.js';
import {WaterSystem} from '../src/water.js';

const consumption=(type,extra={})=>({kind:'consume',item:{id:`${type}-0`,type,...extra}});

test('a new round includes zero counts for every item and separates special den hay from ordinary hay',()=>{
  const stats=new RoundStats(),initial=stats.snapshot();
  assert.deepEqual(ROUND_CONSUMABLE_TYPES,['den-hay',...Object.keys(CONSUMABLE_TYPES),'poop']);
  assert.ok(Object.values(initial.consumed).every(value=>value===0));assert.equal(initial.consumedTotal,0);
  for(const type of Object.keys(CONSUMABLE_TYPES))assert.equal(stats.consume(consumption(type)),true);
  assert.equal(stats.consume(consumption('hay',{id:'den-hay',permanent:true})),true);
  assert.equal(stats.consume(consumption('poop')),true);
  const result=stats.snapshot();assert.ok(Object.values(result.consumed).every(value=>value===1));
  assert.equal(result.consumedTotal,ROUND_CONSUMABLE_TYPES.length);
  assert.equal(result.consumed.hay,1);assert.equal(result.consumed['den-hay'],1);assert.equal(result.consumed.poop,1);
});

test('only completed consumption events count, without double-counting the same event or losing respawns and repeat hay holds',()=>{
  const stats=new RoundStats(),carrot=consumption('carrot'),special=consumption('hay',{id:'den-hay',permanent:true});
  for(const kind of ['spawn','progress','cancel'])assert.equal(stats.consume({...carrot,kind}),false);
  assert.equal(stats.consume(carrot),true);assert.equal(stats.consume(carrot),false);
  assert.equal(stats.consume(consumption('carrot')),true,'a respawn with the same item ID is another complete meal');
  assert.equal(stats.consume(special),true);assert.equal(stats.consume(special),false);
  assert.equal(stats.consume(consumption('hay',{id:'den-hay',permanent:true})),true);
  assert.equal(stats.snapshot().consumed.carrot,2);assert.equal(stats.snapshot().consumed['den-hay'],2);
  assert.equal(stats.snapshot().consumedTotal,4);
});

test('successful drops and pee starts count once per object identity, independently of later removal',()=>{
  const stats=new RoundStats(),ball={id:1},pee={kind:'pee',amount:100,progress:0};
  assert.equal(stats.dropPoop(null),false);assert.equal(stats.dropPoop(false),false);
  assert.equal(stats.dropPoop(ball),true);assert.equal(stats.dropPoop(ball),false);
  assert.equal(stats.dropPoop({id:1}),true,'replacement identity is a separate successful drop');
  assert.equal(stats.peeStarted(null),false);assert.equal(stats.peeStarted(pee),true);assert.equal(stats.peeStarted(pee),false);
  stats.consume(consumption('poop'));stats.cleanup('poop');stats.cleanup('pee');
  const result=stats.snapshot();assert.equal(result.poopDropped,2);assert.equal(result.puddlesCreated,1);
  assert.equal(result.consumed.poop,1);assert.deepEqual(result.wasteCleaned,{poop:1,pee:1});
});

test('water and urine track actual anchored transfers, including a partial pee at round end',()=>{
  const world=new World(),player=new RabbitController(world);Object.assign(player,{x:0,y:0,z:0});
  const fountain={id:'test-fountain',x:.8,y:0,z:0},water=new WaterSystem(world,{items:[fountain]}),stats=new RoundStats();
  const advance=seconds=>{
    const before=water.bladder.value,drinking=water.drinking,peeing=water.peeing;
    water.advance(seconds,player);
    if(drinking)stats.drink(water.bladder.value-before);
    if(peeing)stats.urinate(before-water.bladder.value);
  };
  assert.equal(water.start(player),true);
  advance(.1);assert.equal(stats.snapshot().waterDrunk,1);assert.equal(water.remaining(fountain),99);
  advance(1/3);assert.equal(stats.snapshot().waterDrunk,4.333333333);
  water.stop();advance(5);assert.equal(stats.snapshot().waterDrunk,4.333333333,'a released hold adds no water');
  assert.equal(water.start(player),true);advance(20);
  assert.equal(stats.snapshot().waterDrunk,100);assert.equal(water.remaining(fountain),0);
  const event=water.pee(player);assert.ok(event);stats.peeStarted(event);advance(.123456789);
  const final=stats.snapshot();assert.equal(final.puddlesCreated,1);assert.equal(final.urineProduced,12.3456789);
  assert.equal(final.waterDrunk,100);assert.equal(water.bladder.value,87.6543211);
  advance(1);assert.equal(stats.snapshot().urineProduced,100);
  assert.equal(final.urineProduced,12.3456789,'a final partial-pee snapshot is detached from later updates');
});

test('fractional totals remain precise across many frames and multiple bladder fills',()=>{
  const stats=new RoundStats();
  for(let frame=0;frame<300;frame++){stats.drink(1/3);stats.urinate(.1);}
  assert.equal(stats.snapshot().waterDrunk,100);assert.equal(stats.snapshot().urineProduced,30);
  stats.drink(100);stats.drink(17.25);stats.urinate(70);
  assert.equal(stats.snapshot().waterDrunk,217.25);assert.equal(stats.snapshot().urineProduced,100);
});

test('movement, captures and cleaned waste aggregate successful facts without counting idle sprint input',()=>{
  const stats=new RoundStats();stats.jump('hop');stats.jump('long');stats.jump('long');stats.caught();stats.caught();
  stats.cleanup('poop');stats.cleanup('pee');stats.cleanup('pee');
  assert.equal(stats.travel(.1,{sprinting:true,speed:0}),false);
  for(let frame=0;frame<10;frame++)stats.travel(.1,{sprinting:true,speed:8});
  stats.travel(2,{speed:3});
  const result=stats.snapshot();assert.equal(result.hops,1);assert.equal(result.longJumps,2);assert.equal(result.captures,2);
  assert.equal(result.sprintSeconds,1);assert.equal(result.distanceTravelled,14);assert.deepEqual(result.wasteCleaned,{poop:1,pee:2});
});

test('invalid inputs cannot change round statistics',()=>{
  const stats=new RoundStats(),initial=stats.snapshot();
  for(const value of [null,undefined,false,0,NaN,Infinity,-1,'1',{}]) {
    assert.equal(stats.drink(value),false);assert.equal(stats.urinate(value),false);
    assert.equal(stats.consume(value),false);assert.equal(stats.dropPoop(value),false);assert.equal(stats.peeStarted(value),false);
    assert.equal(stats.cleanup(value),false);assert.equal(stats.jump(value),false);
  }
  for(const event of [{kind:'consume'},{kind:'consume',item:{}},consumption('unknown'),consumption('__proto__'),{kind:'consume',item:{type:{toString(){throw Error('bad');}}}}])assert.equal(stats.consume(event),false);
  for(const event of [{},{kind:'pee',amount:0},{kind:'pee',amount:-100},{kind:'wrong',amount:100}])assert.equal(stats.peeStarted(event),false);
  assert.equal(stats.dropPoop({id:-1}),false);assert.equal(stats.dropPoop({id:1.5}),false);
  for(const [dt,options] of [[-1,{}],[NaN,{}],[1,null],[1,{speed:-1}],[1,{speed:Infinity}],[1,{speed:8,sprinting:'yes'}]])assert.equal(stats.travel(dt,options),false);
  assert.deepEqual(stats.snapshot(),initial);
});

test('snapshots are deeply frozen, detached and preserved when a fresh round resets every statistic',()=>{
  const stats=new RoundStats(),event=consumption('apple'),ball={id:1},pee={kind:'pee',amount:100};
  stats.consume(event);stats.dropPoop(ball);stats.peeStarted(pee);stats.drink(100);stats.urinate(60);stats.caught();stats.cleanup('pee');stats.jump('long');stats.travel(1,{sprinting:true,speed:8});
  const final=stats.snapshot();assert.equal(Object.isFrozen(final),true);assert.equal(Object.isFrozen(final.consumed),true);assert.equal(Object.isFrozen(final.wasteCleaned),true);
  assert.throws(()=>{final.consumed.apple=999;},TypeError);assert.throws(()=>{final.wasteCleaned.pee=99;},TypeError);
  stats.reset();assert.deepEqual(stats.snapshot(),new RoundStats().snapshot());
  assert.equal(final.consumed.apple,1);assert.equal(final.poopDropped,1);assert.equal(final.urineProduced,60);
  assert.equal(stats.consume(event),true);assert.equal(stats.dropPoop(ball),true);assert.equal(stats.peeStarted(pee),true,'round reset clears identity guards');
});
