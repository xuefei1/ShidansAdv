import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { World, RabbitController } from '../src/physics.js';
import { createHouse } from '../src/house.js';
import { ConsumableSystem, canReachConsumable } from '../src/consumable-system.js';
import { CONSUMABLE_TYPES, consumptionSeconds } from '../src/consumable-data.js';
import { WIRE_SLOTS, createChewablePlaces } from '../src/chewable-data.js';
import { createConsumables } from '../src/consumables.js';
import { PoopPhysics } from '../src/poop-physics.js';
import { Leaderboard, HappinessRun, LEADERBOARD_KEY, playerName } from '../src/happiness.js';
import { DayClock } from '../src/day-cycle.js';
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const seeded=seed=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const record=(id,score,name='Alex')=>({id,name,score,finishedAt:'2026-10-25T12:00:00.000Z'});
const runFor=board=>new HappinessRun(board,{id:()=>`run-${board.entries.length}`,now:()=> '2026-10-25T12:00:00.000Z'});
function removeItem(system,id,map=system.items) { const item=map.get(id); if(item?.collider) system.world.removeBox(item.collider); map.delete(id); }
function clearItems(system) { for(const id of [...system.items.keys()]) removeItem(system,id); }
const expired=()=>{const clock=new DayClock();clock.setActive(true,0);clock.update(600000);return clock;};
function beside(item,world,system=null) {
  for(let i=0;i<32;i++) {
    const x=item.x+Math.cos(i*Math.PI/16)*.9,z=item.z+Math.sin(i*Math.PI/16)*.9;
    const p=new RabbitController(world);Object.assign(p,{x,y:world.support(x,z,item.y+.02).y,z});
    if(world.query(x-.22,z-.22,x+.22,z+.22).some(b=>b.maxY>p.y+.01 && b.minY<p.y+.68 && b.maxX>x-.22 && b.minX<x+.22 && b.maxZ>z-.22 && b.minZ<z+.22)) continue;
    if(canReachConsumable(p,item,world) && (!system || system.nearest(p)?.id===item.id)) return p;
  }
  assert.fail(`Unreachable ${item.id}`);
}

test('all item rewards require a completed hold and award once, even at full energy',()=>{
  const board=new Leaderboard(memory()),run=runFor(board);run.start('Alex');
  for(const [type,points,energy] of [['carrot',10,20],['hay',0,40],['apple',50,25],['rabbitFood',80,20],['banana',40,20],['bread',20,30],['noodles',10,30],['cake',150,50],['book',20,10],['wire',150,0],['cardboard',100,20],['slippers',200,0]]) {
    const w=new World(),p=new RabbitController(w);Object.assign(p,{x:0,y:0,z:0});
    const item={id:type,type,x:.9,y:0,z:0};
    const s=new ConsumableSystem(w,{slots:[item],wires:[],randomLimits:{}}),seconds=consumptionSeconds(item);
    const before=run.score;
    s.begin(p);s.update(seconds-.1,p).forEach(e=>run.consume(e));assert.equal(run.score,before);assert.equal(p.energy.recovering,false);
    s.cancel();s.begin(p);s.update(seconds/2,p);assert.equal(s.fraction,.5);s.cancel();
    s.begin(p);const events=s.update(seconds,p);events.forEach(e=>run.consume(e));
    assert.equal(events.length,1);assert.equal(events[0].energy,energy);assert.equal(run.score,before+points);
    assert.equal(p.energy.recovering,energy>0);assert.equal(p.energy.value,100);
    s.update(1,p).forEach(e=>run.consume(e));assert.equal(run.score,before+points);
  }
  assert.equal(run.score,830);
});

test('special and ordinary hay give no happiness, and zero-energy chewing never starts recovery',()=>{
  const w=new World(),p=new RabbitController(w),s=new ConsumableSystem(w,{wires:[],randomLimits:{}});
  s.begin(p);assert.equal(s.update(consumptionSeconds(s.denHay),p)[0].happiness,0);
  assert.equal(CONSUMABLE_TYPES.hay.happiness||0,0);
  for(const type of ['wire','slippers']) {
    Object.assign(p,{x:0,y:0,z:0});p.energy.value=7;
    const isolated=new ConsumableSystem(w,{slots:[{id:type,type,x:.8,y:0,z:0}],wires:[],randomLimits:{}});
    isolated.begin(p);isolated.update(consumptionSeconds(isolated.target),p);assert.equal(p.energy.value,7);assert.equal(p.energy.recovering,false);
  }
});

test('cake returns after 120 active seconds at its fixed spot, even while all other snacks remain',()=>{
  const {world}=createHouse(new THREE.Scene()),s=new ConsumableSystem(world,{random:seeded(8)});
  const cake=[...s.items.values()].find(item=>item.type==='cake'),p=beside(cake,world,s);
  p.energy.value=0;s.begin(p);assert.equal(s.update(consumptionSeconds(cake)-.01,p).length,0);assert.equal(s.pending.size,0);
  const [consumed]=s.update(.01,p);assert.equal(consumed.happiness,150);assert.equal(consumed.energy,50);
  assert.equal(s.count,40);assert.equal(s.restockCount,40);assert.equal(s.chewableCount,22);
  assert.deepEqual(s.update(0,p,0),[]); // Paused time cannot advance the cooldown.
  assert.equal(s.update(0,p,119.99).length,0);
  const [spawned]=s.update(0,p,.01);assert.equal(spawned.kind,'spawn');
  for(const key of ['id','type','x','y','z']) assert.equal(spawned.item[key],cake[key]);
  assert.ok(world.dynamicBoxes.has(spawned.item.collider));
  assert.equal(s.count,41);assert.equal(s.chewableCount,22);assert.equal(s.pending.size,0);
  assert.equal(s.update(0,p,600).length,0);assert.equal([...s.items.values()].filter(i=>i.type==='cake').length,1);
});

test('regular restocking cannot create cake or occupy its reserved spot during the cake cooldown',()=>{
  const w=new World(),p=new RabbitController(w);Object.assign(p,{x:0,y:0,z:0});
  const slots=[{id:'cake',type:'cake',x:.8,y:0,z:0},{id:'other-cake',type:'cake',x:3,y:0,z:0},
    {id:'bread',type:'bread',x:5,y:0,z:0},{id:'apple',type:'apple',x:8,y:0,z:0}];
  const s=new ConsumableSystem(w,{slots,wires:[],randomLimits:{},random:()=>.999});
  assert.equal([...s.items.values()].filter(i=>i.type==='cake').length,1);
  removeItem(s,'apple');s.update(0,p,60);assert.equal(s.restockCount,2);assert.equal(s.count,3);
  s.begin(p);s.update(consumptionSeconds(s.target),p,0);clearItems(s);
  const first=s.update(0,p,60);assert.equal(first.length,1);assert.notEqual(first[0].item.type,'cake');assert.notEqual(first[0].item.id,'cake');
  const second=s.update(0,p,60);assert.equal(second.filter(e=>e.item.type==='cake').length,1);
  assert.equal(s.restockCount,2);assert.equal(s.count,3);
  for(let i=0;i<3;i++) {
    s.begin(p);s.update(consumptionSeconds(s.target),p,0);s.update(0,p,120);
    assert.equal([...s.items.values()].filter(item=>item.type==='cake').length,1);
  }
  s.begin(p);s.update(consumptionSeconds(s.target),p,0);assert.equal(s.pending.size,1);s.reset();
  assert.equal(s.pending.size,0);s.update(0,p,120);assert.equal([...s.items.values()].filter(i=>i.type==='cake').length,1);
});

test('cake disappearance and timed respawn update the rendered instance without creating a second cake',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene),view=createConsumables(scene,world,{random:seeded(2)});
  const cake=[...view.system.items.values()].find(i=>i.type==='cake'),p=beside(cake,world,view.system);
  const mesh=scene.getObjectByName('cake collectibles');assert.equal(mesh.count,1);
  view.system.begin(p);view.handle(view.system.update(consumptionSeconds(cake),p));view.sync(.7);assert.equal(mesh.count,0);
  view.handle(view.system.update(0,p,120));view.sync(.7);assert.equal(mesh.count,1);
  view.handle(view.system.update(0,p,600));view.sync(.7);assert.equal(mesh.count,1);
});

test('fixed wires are supported and accessible beside every appliance category and both floors',()=>{
  const {world}=createHouse(new THREE.Scene());
  assert.equal(WIRE_SLOTS.length,10);
  for(const place of ['tv','oven','computer','desk','sofa-lamp']) assert.ok(WIRE_SLOTS.some(s=>s.id===`wire-${place}`));
  for(const item of WIRE_SLOTS) {
    assert.ok(Math.abs(world.support(item.x,item.z,item.y+.01).y-item.y)<.02,item.id);beside(item,world);
  }
});

test('random placement spans upstairs, balcony, yards and hidden passages without clipping furniture',()=>{
  const {world}=createHouse(new THREE.Scene()),places=createChewablePlaces(world);
  for(const region of [p=>p.y===4.2&&p.z> -20,p=>p.y===4.2&&p.z< -20,p=>p.y===0&&p.z>20,p=>p.y===0&&p.z< -25,p=>p.y===0&&p.x< -21&&p.z< -6]) assert.ok(places.some(region));
  const s=new ConsumableSystem(world,{random:seeded(52)});
  for(let i=0;i<12;i++) {
    s.reset();assert.equal(s.chewableCount,22);assert.equal(world.dynamicBoxes.size,64);
    for(const item of s.chewables.values()) beside(item,world);
    for(const type of ['cardboard','slippers']) assert.equal([...s.chewables.values()].filter(v=>v.type===type).length,type==='cardboard'?8:4);
  }
});

test('each chewable returns only after its own cooldown; wires keep their place and random items relocate',()=>{
  for(const type of ['wire','cardboard','slippers']) {
    const w=new World(),p=new RabbitController(w);Object.assign(p,{x:0,y:0,z:0});
    const s=new ConsumableSystem(w,{slots:[],wires:type==='wire'?[{id:'test',type,x:.9,y:0,z:0}]:[],randomLimits:type==='wire'?{}:{[type]:1},randomPlaces:[{x:.9,y:0,z:0},{x:4,y:0,z:0}],random:()=>0});
    const item=[...s.chewables.values()][0],delay=CONSUMABLE_TYPES[type].respawn;
    s.begin(p);s.update(consumptionSeconds(item)-.01,p);assert.equal(s.chewableCount,1);assert.equal(s.pending.size,0);
    s.update(.01,p);assert.equal(s.chewableCount,0);assert.equal(s.pending.size,1);
    assert.equal(s.update(delay-.01,p).filter(e=>e.kind==='spawn').length,0);
    const spawned=s.update(.01,p).find(e=>e.kind==='spawn').item;
    assert.equal(s.chewableCount,1);assert.equal(s.pending.size,0);assert.equal(spawned.id,item.id);
    assert.equal(spawned.x,type==='wire'?.9:4);
    s.update(300,p);assert.equal(s.chewableCount,1);
  }
});

test('slow frames advance respawn time without advancing a held chew; pause leaves timers untouched',()=>{
  const w=new World(),p=new RabbitController(w);Object.assign(p,{x:0,y:0,z:0});
  const s=new ConsumableSystem(w,{slots:[],wires:[{id:'wire',type:'wire',x:.9,y:0,z:0}],randomLimits:{}});
  s.begin(p);s.update(.05,p,300);assert.equal(s.progress,.05);assert.equal(s.chewableCount,1);
  s.update(2.95,p);assert.equal(s.chewableCount,0);
  s.update(0,p,0);assert.equal(s.chewableCount,0);s.update(0,p,30);assert.equal(s.chewableCount,1);
});

test('random respawns reserve depleted wire locations and all independent caps survive simultaneous cooldowns',()=>{
  const {world}=createHouse(new THREE.Scene()),s=new ConsumableSystem(world,{random:seeded(3)});
  for(const item of [...s.chewables.values()]) {
    const p=beside(item,world,s);s.begin(p);s.update(consumptionSeconds(item),p,0);
  }
  assert.equal(s.chewableCount,0);assert.equal(s.pending.size,22);
  const p=new RabbitController(world);
  s.update(0,p,30);assert.equal(s.chewableCount,10);
  s.update(0,p,30);assert.equal(s.chewableCount,18);
  s.update(0,p,30);assert.equal(s.chewableCount,22);assert.equal(s.pending.size,0);
  s.update(0,p,600);assert.equal(s.chewableCount,22);
  const wire=WIRE_SLOTS[0];removeItem(s,wire.id,s.chewables);
  s.randomPlaces=[{x:wire.x,y:wire.y,z:wire.z},{x:24.9,y:0,z:30.9}];
  const generated=s.randomItem('new-box','cardboard');assert.equal(generated.x,24.9);
});

test('boxes collide with rabbit and balls, then remove their support and wake sleeping balls when eaten',()=>{
  const w=new World(),s=new ConsumableSystem(w,{slots:[],wires:[],randomLimits:{cardboard:1},randomPlaces:[{x:0,y:0,z:0},{x:3,y:0,z:0}],random:()=>0});
  const item=[...s.chewables.values()][0],r=beside(item,w),physics=new PoopPhysics(w);
  const box=item.collider;assert.ok(w.query(0,0).includes(box));assert.equal(w.support(0,0,1).y,box.maxY);
  const top=box.maxY,ball=physics.spawn({x:0,y:top+.065,z:0});
  for(let i=0;i<180;i++)physics.update(1/120);assert.equal(ball.sleeping,true);
  s.begin(r);s.update(consumptionSeconds(item),r);assert.equal(w.dynamicBoxes.size,1);assert.equal(w.query(0,0).includes(box),false);
  for(let i=0;i<180;i++)physics.update(1/120);assert.ok(ball.y<.07);
  s.update(60,r);const newItem=[...s.chewables.values()][0];assert.equal(w.dynamicBoxes.size,2);
  const newBall=physics.spawn({x:newItem.x,y:newItem.collider.maxY+.065,z:newItem.z});for(let i=0;i<180;i++)physics.update(1/120);
  assert.ok(Math.abs(newBall.y-(newItem.collider.maxY+.065))<.01);s.reset();assert.equal(w.dynamicBoxes.size,2);
});

test('new item visuals stay in fixed instance batches and reset removes old animation instances',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene),view=createConsumables(scene,world,{random:seeded(4)});
  const groups=[scene.getObjectByName('Consumables floor 0'),scene.getObjectByName('Consumables floor 1')];
  const total=()=>groups.flatMap(g=>g.children).reduce((n,m)=>n+m.count,0);
  assert.equal(total(),64);assert.equal(groups.flatMap(g=>g.children).length,25);
  for(const type of ['wire','cardboard','slippers']) {
    const item=[...view.system.chewables.values()].find(i=>i.type===type),p=beside(item,world,view.system);
    view.system.begin(p);view.handle(view.system.update(consumptionSeconds(item),p));view.sync(.7);
  }
  assert.equal(total(),61);view.reset();assert.equal(total(),64);assert.equal(world.dynamicBoxes.size,64);
});

test('a name is required; completed rounds persist once, rank by score, and a new round starts at zero',()=>{
  const storage=memory(),board=new Leaderboard(storage),run=runFor(board);
  assert.equal(run.start('  '),false);assert.equal(run.start('  Alex   Rabbit  '),true);assert.equal(run.name,'Alex Rabbit');
  run.consume({kind:'spawn',happiness:1000});run.consume({kind:'consume',happiness:150});
  assert.equal(run.finish(new DayClock()),null);assert.equal(board.entries.length,0);
  assert.equal(run.start('Different name'),true);assert.equal(run.name,'Alex Rabbit');assert.equal(run.score,150);
  const result=run.finish(expired());assert.equal(result.score,150);assert.equal(run.finish(expired()),null);assert.equal(board.entries.length,1);
  const reloaded=new Leaderboard(storage);assert.equal(reloaded.entries[0].score,150);assert.equal(reloaded.name,'Alex Rabbit');
  run.start('Bea');assert.equal(run.score,0);run.consume({kind:'consume',happiness:200});run.finish(expired());
  assert.deepEqual(new Leaderboard(storage).entries.map(e=>e.name),['Bea','Alex Rabbit']);
});

test('zero-score finished runs are recorded; in-progress runs are not; failed storage retains the score',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}},board=new Leaderboard(storage),run=runFor(board);
  assert.equal(board.saved,false);run.start('Alex');assert.equal(board.entries.length,0);
  run.finish(expired());assert.equal(board.entries.length,1);assert.equal(board.entries[0].score,0);assert.equal(board.saved,false);
});

test('leaderboard handles corrupt entries, duplicate saves, sequential tabs and literal markup names',()=>{
  const storage=memory();storage.setItem(LEADERBOARD_KEY,'broken JSON');
  const board=new Leaderboard(storage);assert.equal(board.saved,false);
  const other=new Leaderboard(storage);board.record(record('a',10,'<img src=x>'));other.record(record('b',20));board.record(record('a',10,'<img src=x>'));
  assert.equal(board.entries.length,2);assert.equal(board.entries[1].name,'<img src=x>');assert.equal(board.saved,true);
  storage.setItem(LEADERBOARD_KEY,JSON.stringify([record('ok',20),record('bad',-2),record('bad2',1.5),{name:'bad'}]));
  assert.deepEqual(new Leaderboard(storage).entries.map(e=>e.id),['ok']);
  assert.equal(playerName('  A\u0000  B  '),'A B');assert.equal([...playerName('🐰'.repeat(30))].length,24);
});

test('final rank uses the full leaderboard with competition ties and separate runs under the same name',()=>{
  const board=new Leaderboard(memory());
  for(let index=0;index<14;index++)board.record(record(`older-${index}`,200-index*10,'Alex'));
  board.record(record('tie-a',80,'Alex'));board.record(record('tie-b',80,'Alex'));
  assert.equal(board.entries.length,16);
  assert.equal(board.rank({score:80}),13,'twelve strictly higher runs put every 80-point run at rank thirteen');
  assert.equal(board.rank({score:0}),17,'rank is not limited to the top ten displayed rows');
  assert.equal(board.rank({score:200}),1);assert.equal(board.rank(210),1);
  const reloaded=new Leaderboard(board.storage);assert.equal(reloaded.rank({score:80}),13);
  for(const bad of [null,undefined,-1,1.5,NaN,Infinity,'80',{}, {score:-1}])assert.equal(board.rank(bad),null);
});

test('a finished score can be ranked once after storage failure without recording an unfinished restart',()=>{
  const storage={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}},board=new Leaderboard(storage);
  board.record(record('earlier',100));const run=runFor(board);run.start('Alex');run.consume({kind:'consume',happiness:80});
  const result=run.finish(expired());assert.equal(board.saved,false);assert.equal(board.rank(result),2);assert.equal(board.entries.length,2);
  assert.equal(run.finish(expired()),null);assert.equal(board.entries.length,2);
  run.restart();assert.equal(board.entries.length,2);assert.equal(run.score,0);assert.equal(board.rank(result),2);
});
