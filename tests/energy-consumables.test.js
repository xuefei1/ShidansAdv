import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { Energy, PASSIVE_REGEN, highJumpCost } from '../src/energy.js';
import { RabbitController, World, DEN } from '../src/physics.js';
import { createHouse } from '../src/house.js';
import { CONSUMABLE_TYPES, CONSUMABLE_SLOTS, randomConsumableType } from '../src/consumable-data.js';
import { ConsumableSystem, canReachConsumable } from '../src/consumable-system.js';
import { createConsumables } from '../src/consumables.js';
const close = (a,b,epsilon=1e-7) => assert.ok(Math.abs(a-b)<epsilon, `${a} ≠ ${b}`);
const { world } = createHouse(new THREE.Scene());
function tick(r,seconds,input={}) { for(let i=0;i<Math.round(seconds*120);i++) r.update(1/120,input); }
function player() { return { x:0,y:0,z:0,grounded:true,energy:new Energy(20) }; }
const snack = (id='snack',type='hay',x=.6,y=0,z=0) => ({id,type,x,y,z});

test('a full energy bar sustains exactly 30 seconds of uninterrupted sprinting at different frame rates', () => {
  for (const fps of [30,60,144]) {
    const e = new Energy();
    for(let i=0;i<15*fps;i++) e.update(1/fps,true);
    close(e.value,50);
    for(let i=0;i<14*fps;i++) e.update(1/fps,true);
    close(e.value,100/30);
    for(let i=0;i<fps;i++) e.update(1/fps,true);
    assert.equal(e.value,0);
  }
});
test('the actual controller drains energy only while sprinting, then falls back to ordinary speed', () => {
  const r = new RabbitController(new World()); Object.assign(r,{x:0,z:-29});
  let direction = 1;
  for(let i=0;i<30*120;i++) {
    if(r.x>15) direction=-1; if(r.x< -15) direction=1;
    r.update(1/120,{x:direction,run:true});
    if(i===15*120-1) close(r.energy.value,50);
  }
  assert.equal(r.energy.value,0); assert.equal(r.sprintExhausted,true);
  r.update(1/60,{x:direction,run:true}); close(Math.abs(r.vx),3); assert.equal(r.sprinting,false);
  tick(r,1,{}); r.update(1/120,{x:direction,run:true}); assert.equal(r.sprinting,true);
});
test('passive recovery is 0.01 per second and never exceeds 100', () => {
  const e=new Energy(50); e.update(.5); close(e.value,50.005); e.update(.5); close(e.value,50.01);
  e.value=99.99; e.update(10); assert.equal(e.value,100);
});
test('ordinary movement, tap hops, stationary Shift, blocked sprint and crouching are free', () => {
  const r=new RabbitController(world); r.energy.value=20;
  tick(r,.5,{x:1}); close(r.energy.value,20.005);
  tick(r,.05,{jump:true}); tick(r,.6); close(r.energy.value,20+1.15*PASSIVE_REGEN);
  const before=r.energy.value; tick(r,.5,{run:true}); close(r.energy.value,before+.005);
  const crouch=r.energy.value; tick(r,.5,{run:true,jump:true,x:1}); close(r.energy.value,crouch+.005);
  r.reset(); Object.assign(r,{x:DEN.x+DEN.radius-.24,z:DEN.z});
  const blocked=r.energy.value; tick(r,1,{x:1,run:true}); close(r.energy.value,blocked+.01);
});
test('charged jumps cost 5–10 by charge, and cannot spend more energy than remains', () => {
  close(highJumpCost(.22),5); close(highJumpCost(.435),7.5); close(highJumpCost(.65),10); close(highJumpCost(10),10);
  for(const charge of [.25,.435,.8]) {
    const r=new RabbitController(world); r.energy.value=20;
    Object.assign(r,{charge,charging:true,jumpHeld:true}); r.update(1/120,{});
    assert.equal(r.lastJump,'long'); close(r.energy.value,20-highJumpCost(charge)+PASSIVE_REGEN/120);
  }
  const poor=new RabbitController(world); poor.energy.value=7;
  Object.assign(poor,{charge:.8,charging:true,jumpHeld:true}); poor.update(1/120,{});
  assert.equal(poor.lastJump,'hop'); assert.equal(poor.jumpEnergyBlocked,true); assert.ok(poor.energy.value>=7);
  const wood=new RabbitController(world); Object.assign(wood,{x:-10,z:16,charge:.8,charging:true,jumpHeld:true}); wood.energy.value=20;
  wood.update(1/120,{}); assert.equal(wood.lastJump,'hop'); close(wood.energy.value,20+PASSIVE_REGEN/120);
});
test('returning home preserves energy, exhaustion and pending food recovery', () => {
  const r=new RabbitController(world); r.energy.value=12; r.energy.consume(10); r.sprintExhausted=true;
  r.reset(); assert.equal(r.energy.value,12); assert.equal(r.energy.recovering,true); assert.equal(r.sprintExhausted,true);
  tick(r,1); close(r.energy.value,22.01);
});
test('all nine consumables restore the requested amounts over one second, capped at 100', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(CONSUMABLE_TYPES).map(([id,t])=>[id,t.energy])),{hay:10,carrot:5,rabbitFood:20,bread:25,apple:15,banana:20,book:2,cake:50,noodles:30});
  for(const type of Object.values(CONSUMABLE_TYPES)) {
    const e=new Energy(10); e.consume(type.energy); assert.equal(e.value,10);
    e.update(.5); close(e.value,10+type.energy/2+.005); assert.equal(e.recovering,true);
    e.update(.5); close(e.value,10+type.energy+.01); assert.equal(e.recovering,false);
  }
  const full=new Energy(95); full.consume(50); full.update(.5); assert.equal(full.value,100); full.update(1); assert.equal(full.value,100);
});
test('food recovery remains correct across overlapping rewards and uneven frames', () => {
  const e=new Energy(0); e.consume(10); e.update(.3); e.consume(20); e.update(.4); e.update(.9);
  close(e.value,30+1.6*PASSIVE_REGEN); assert.equal(e.recovering,false);
});
test('initial population is fixed, includes every kind, and larger rewards are scarcer', () => {
  assert.equal(CONSUMABLE_SLOTS.length,41); assert.equal(new Set(CONSUMABLE_SLOTS.map(s=>s.id)).size,41);
  const counts={}; for(const s of CONSUMABLE_SLOTS) counts[s.type]=(counts[s.type]||0)+1;
  for(const [a,ta] of Object.entries(CONSUMABLE_TYPES)) for(const [b,tb] of Object.entries(CONSUMABLE_TYPES)) {
    if(ta.energy<tb.energy) assert.ok(counts[a]>=counts[b]);
    if(ta.energy===tb.energy) assert.equal(counts[a],counts[b]);
  }
  assert.ok(CONSUMABLE_SLOTS.some(s=>s.y>=4.2));
});
test('every authored snack is supported and reachable on the real furnished map', () => {
  for(const item of CONSUMABLE_SLOTS) {
    close(world.support(item.x,item.z,item.y+.01).y,item.y,.015);
    let reachable=false;
    for(let i=0;i<16;i++) {
      const angle=i*Math.PI/8, x=item.x+Math.cos(angle)*.75,z=item.z+Math.sin(angle)*.75;
      const y=world.support(x,z,item.y+.2).y;
      const occupied=world.query(x-.22,z-.22,x+.22,z+.22).some(b=>y<b.maxY-.01 && y+.68>b.minY+.01 && x+.22>b.minX && x-.22<b.maxX && z+.22>b.minZ && z-.22<b.maxZ);
      if(!occupied && canReachConsumable({x,y,z,grounded:true},item,world)) reachable=true;
    }
    assert.ok(reachable,`Unreachable ${item.id}`);
  }
});
test('the den and its fence remain empty at startup and during random restocking', () => {
  const outside = item => Math.hypot(item.x-DEN.x,item.z-DEN.z) >= DEN.radius+.4;
  assert.ok(CONSUMABLE_SLOTS.every(outside));
  const slots = [...CONSUMABLE_SLOTS,
    snack('den','hay',DEN.x,0,DEN.z),
    snack('fence','cake',DEN.x+DEN.radius+.1,0,DEN.z)];
  const s=new ConsumableSystem(world,{slots}), p=player();
  assert.equal(s.count,41); assert.ok([...s.items.values()].every(outside));
  for(let i=0;i<200;i++) {
    s.items.clear(); s.random=()=>(i+.5)/200;
    const [event]=s.update(60,p);
    assert.equal(event.kind,'spawn'); assert.ok(outside(event.item));
  }
});
test('releasing a short hold cancels it; a fresh full hold consumes exactly once', () => {
  const p=player(), s=new ConsumableSystem(new World(),{slots:[snack()]});
  s.begin(p); s.update(.9,p); s.cancel(); assert.equal(s.count,1); assert.equal(p.energy.recovering,false);
  s.begin(p); s.update(.5,p); assert.equal(s.count,1); const events=s.update(.5,p);
  assert.equal(events[0].kind,'consume'); assert.equal(s.count,0); assert.equal(p.energy.value,20);
  assert.equal(p.energy.recoveries.length,1); s.update(2,p); assert.equal(p.energy.recoveries.length,1);
});
test('the first partial frame never credits time before the mouse press', () => {
  const p=player(), s=new ConsumableSystem(new World(),{slots:[snack()]});
  s.begin(p,.02); s.update(1,p); close(s.progress,.98); assert.equal(s.count,1);
  s.update(.019,p); assert.equal(s.count,1); s.update(.001,p); assert.equal(s.count,0);
});
test('walking away, leaving the floor, or cancelling input discards hold progress', () => {
  for(const change of [p=>p.x=5,p=>p.grounded=false,p=>p.y=4.2]) {
    const p=player(), s=new ConsumableSystem(new World(),{slots:[snack()]});
    s.begin(p); s.update(.6,p); change(p); s.update(.4,p);
    assert.equal(s.count,1); assert.equal(s.progress,0); assert.equal(p.energy.recovering,false);
  }
  const p=player(), s=new ConsumableSystem(new World(),{slots:[snack('a'),snack('b','carrot',-.6)]});
  s.begin(p); s.update(.7,p); s.cancel(); s.update(30,p); assert.equal(s.count,2);
});
test('walls, ceilings and the den fence prevent eating through obstacles', () => {
  const w=new World(), p=player(), item=snack('a','hay',1);
  assert.ok(canReachConsumable(p,item,w)); w.addBox(.5,.5,0,.1,1,2);
  assert.equal(canReachConsumable(p,item,w),false);
  assert.equal(canReachConsumable(p,{...item,y:4.2},new World()),false);
  assert.equal(canReachConsumable({x:DEN.x+3.6,y:0,z:DEN.z,grounded:true},snack('f','hay',DEN.x+4.4,0,DEN.z),new World()),false);
});
test('restock waits 60 seconds below two, generates one per minute, and stops at two', () => {
  const s=new ConsumableSystem(new World(),{random:()=>0}), p=player();
  s.update(600,p); assert.equal(s.count,41); s.items.clear();
  s.update(59.9,p); assert.equal(s.count,0); s.update(.1,p); assert.equal(s.count,1);
  s.update(59.9,p); assert.equal(s.count,1); s.update(.1,p); assert.equal(s.count,2);
  s.update(600,p); assert.equal(s.count,2);
  s.items.delete(s.items.keys().next().value); s.update(59,p); assert.equal(s.count,1); s.update(1,p); assert.equal(s.count,2);
});
test('every respawn kind remains possible even when its original slot is occupied', () => {
  const s=new ConsumableSystem(world,{random:()=>.95}), p=player();
  const cake=CONSUMABLE_SLOTS.find(s=>s.type==='cake'); s.items=new Map([[cake.id,cake]]);
  // Select the centre of the cake's weighted interval.
  const entries=Object.entries(CONSUMABLE_TYPES), total=entries.reduce((n,[,t])=>n+1/t.energy,0);
  let before=0; for(const [id,t] of entries) { if(id==='cake') break; before+=1/t.energy; }
  s.random=()=> (before+1/100)/total;
  const [event]=s.update(60,p); assert.equal(s.count,2); assert.equal(event.item.type,'cake'); assert.notEqual(event.item.id,cake.id);
});
test('respawn probabilities are inversely proportional to energy', () => {
  const samples=100000, counts={};
  for(let i=0;i<samples;i++) { const type=randomConsumableType(()=>(i+.5)/samples); counts[type]=(counts[type]||0)+1; }
  const sum=Object.values(CONSUMABLE_TYPES).reduce((n,t)=>n+1/t.energy,0);
  for(const [id,t] of Object.entries(CONSUMABLE_TYPES)) close(counts[id]/samples,(1/t.energy)/sum,2/samples);
});
test('collectible renderer batches all kinds and removes consumed geometry after its effect', () => {
  const scene=new THREE.Scene(), view=createConsumables(scene,world);
  let total=()=>scene.children.slice(0,2).flatMap(g=>g.children).reduce((n,m)=>n+m.count,0);
  assert.equal(total(),41); assert.equal(scene.children[0].children.length,9);
  const item=CONSUMABLE_SLOTS[0]; view.handle([{kind:'consume',item}]); view.sync(.3); assert.equal(total(),41);
  view.sync(.4); assert.equal(total(),40); view.setUpperVisible(false); assert.equal(scene.children[1].visible,false);
});
