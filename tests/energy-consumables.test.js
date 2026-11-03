import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { Energy, PASSIVE_REGEN, highJumpCost } from '../src/energy.js';
import { RabbitController, World, DEN } from '../src/physics.js';
import { createHouse } from '../src/house.js';
import { CONSUMABLE_TYPES, CONSUMABLE_SLOTS, DEN_HAY, SNACK_TYPES, consumableDetails, consumptionSeconds, randomConsumableType } from '../src/consumable-data.js';
import { ConsumableSystem as FullConsumableSystem, canReachConsumable } from '../src/consumable-system.js';
import { createConsumables } from '../src/consumables.js';
class ConsumableSystem extends FullConsumableSystem { constructor(world,options={}) { super(world,{wires:[],randomLimits:{},...options}); } }
const close = (a,b,epsilon=1e-7) => assert.ok(Math.abs(a-b)<epsilon, `${a} ≠ ${b}`);
const { world } = createHouse(new THREE.Scene());
// The furnished map is shared only within this file; remove each test's collectible fixtures.
afterEach(()=>{for(const collider of [...world.dynamicBoxes]) world.removeBox(collider);});
function removeItem(system,id) { const item=system.items.get(id); if(item?.collider) system.world.removeBox(item.collider); system.items.delete(id); }
function clearItems(system) {for(const id of [...system.items.keys()]) removeItem(system,id);}
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
test('passive recovery is 0.01 per half second with precise fractional frames and a cap of 100', () => {
  const e=new Energy(50);e.update(.1);close(e.value,50.002);e.update(.4);close(e.value,50.01);
  e.update(.5);close(e.value,50.02);
  const fine=new Energy(50);for(let i=0;i<10;i++)fine.update(.1);close(fine.value,e.value);
  const coarse=new Energy(50);coarse.update(1);close(coarse.value,e.value);
  e.value=99.99; e.update(10); assert.equal(e.value,100);
});

test('paused, negative and invalid time never grants recovery or consumes pending food recovery',()=>{
  const e=new Energy(40);e.consume(10);
  for(const dt of [0,-.1,NaN,Infinity,-Infinity])e.update(dt);
  assert.equal(e.value,40);assert.deepEqual(e.recoveries,[{rate:10,remaining:1}]);
  e.update(.5);close(e.value,45.01);close(e.recoveries[0].remaining,.5);
});
test('ordinary movement, tap hops, stationary Shift, blocked sprint and crouching are free', () => {
  const r=new RabbitController(world); r.energy.value=20;
  tick(r,.5,{x:1}); close(r.energy.value,20.01);
  tick(r,.05,{jump:true}); tick(r,.6); close(r.energy.value,20+1.15*PASSIVE_REGEN);
  const before=r.energy.value; tick(r,.5,{run:true}); close(r.energy.value,before+.01);
  const crouch=r.energy.value; tick(r,.5,{run:true,jump:true,x:1}); close(r.energy.value,crouch+.01);
  r.reset(); Object.assign(r,{x:DEN.x+DEN.radius-.24,z:DEN.z});
  const blocked=r.energy.value; tick(r,1,{x:1,run:true}); close(r.energy.value,blocked+.02);
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
  tick(r,1); close(r.energy.value,22.02);
});
test('all nine consumables restore the requested amounts over one second, capped at 100', () => {
  assert.deepEqual(Object.fromEntries([...SNACK_TYPES,'cake'].map(id=>[id,CONSUMABLE_TYPES[id].energy])),{hay:40,carrot:20,rabbitFood:20,bread:30,apple:25,banana:20,book:10,noodles:30,cake:50});
  for(const type of [...SNACK_TYPES,'cake'].map(id=>CONSUMABLE_TYPES[id])) {
    const e=new Energy(10); e.consume(type.energy); assert.equal(e.value,10);
    e.update(.5); close(e.value,10+type.energy/2+.01); assert.equal(e.recovering,true);
    e.update(.5); close(e.value,10+type.energy+.02); assert.equal(e.recovering,false);
  }
  const full=new Energy(95); full.consume(50); full.update(.5); assert.equal(full.value,100); full.update(1); assert.equal(full.value,100);
});
test('food recovery remains correct across overlapping rewards and uneven frames', () => {
  const e=new Energy(0); e.consume(10); e.update(.3); e.consume(20); e.update(.4); e.update(.9);
  close(e.value,30+1.6*PASSIVE_REGEN); assert.equal(e.recovering,false);
});
test('initial snack population has 47 authored items including twelve ordinary hay stacks', () => {
  assert.equal(CONSUMABLE_SLOTS.length,47); assert.equal(new Set(CONSUMABLE_SLOTS.map(s=>s.id)).size,47);
  const counts={}; for(const s of CONSUMABLE_SLOTS) counts[s.type]=(counts[s.type]||0)+1;
  assert.deepEqual(counts,{book:12,carrot:8,hay:12,apple:4,rabbitFood:3,banana:3,bread:2,noodles:2,cake:1});
  assert.ok(CONSUMABLE_SLOTS.some(s=>s.y>=4.2));
});
test('every authored snack is supported and reachable on the real furnished map', () => {
  for(const item of [...CONSUMABLE_SLOTS, DEN_HAY]) {
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
test('finite snacks stay outside the den at startup and during random restocking', () => {
  const outside = item => Math.hypot(item.x-DEN.x,item.z-DEN.z) >= DEN.radius+.4;
  assert.ok(CONSUMABLE_SLOTS.every(outside));
  const slots = [...CONSUMABLE_SLOTS,
    snack('den','hay',DEN.x,0,DEN.z),
    snack('fence','cake',DEN.x+DEN.radius+.1,0,DEN.z)];
  const s=new ConsumableSystem(world,{slots}), p=player();
  assert.equal(s.count,47); assert.ok([...s.items.values()].every(outside));
  for(let i=0;i<200;i++) {
    clearItems(s); s.random=()=>(i+.5)/200;
    const [event]=s.update(60,p);
    assert.equal(event.kind,'spawn'); assert.ok(outside(event.item));
  }
});
test('releasing a short hold cancels it; a fresh full hold consumes exactly once', () => {
  const p=player(), s=new ConsumableSystem(new World(),{slots:[snack()]});
  s.begin(p); s.update(.9,p); s.cancel(); assert.equal(s.count,1); assert.equal(p.energy.recovering,false);
  const seconds=consumptionSeconds(snack());
  s.begin(p); s.update(seconds/2,p); assert.equal(s.count,1); const events=s.update(seconds/2,p);
  assert.equal(events[0].kind,'consume'); assert.equal(s.count,0); assert.equal(p.energy.value,20);
  assert.equal(p.energy.recoveries.length,1); s.update(2,p); assert.equal(p.energy.recoveries.length,1);
});
test('the first partial frame never credits time before the mouse press', () => {
  const p=player(), s=new ConsumableSystem(new World(),{slots:[snack()]});
  const seconds=consumptionSeconds(snack());
  s.begin(p,.02); s.update(seconds,p); close(s.progress,seconds-.02); assert.equal(s.count,1);
  s.update(.019,p); assert.equal(s.count,1); s.update(.001,p); assert.equal(s.count,0);
});

test('ordinary hay requires 1.6 seconds and then restores forty energy with three carried balls', () => {
  const item=snack(), p=player(), s=new ConsumableSystem(new World(),{slots:[item]});
  assert.equal(consumptionSeconds(item),1.6);
  assert.equal(consumableDetails(item).happiness||0,0); assert.equal(consumableDetails(item).poop,3);
  assert.equal(consumableDetails(DEN_HAY).energy,100); assert.equal(consumptionSeconds(DEN_HAY),4);
  s.begin(p); assert.deepEqual(s.update(1.599,p),[]); assert.equal(s.count,1); assert.equal(p.energy.recovering,false);
  const [event]=s.update(.001,p);
  assert.equal(event.energy,40); assert.equal(event.happiness,0); assert.equal(event.poop,3); assert.equal(s.count,0);
  assert.deepEqual(p.energy.recoveries,[{rate:40,remaining:1}]);
  p.energy.update(.5); close(p.energy.value,40.01); assert.equal(p.energy.recovering,true);
  p.energy.update(.5); close(p.energy.value,60.02); assert.equal(p.energy.recovering,false);
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
  s.update(600,p); assert.equal(s.count,47); clearItems(s);
  s.update(59.9,p); assert.equal(s.count,0); s.update(.1,p); assert.equal(s.count,1);
  s.update(59.9,p); assert.equal(s.count,1); s.update(.1,p); assert.equal(s.count,2);
  s.update(600,p); assert.equal(s.count,2);
  removeItem(s,s.items.keys().next().value); s.update(59,p); assert.equal(s.count,1); s.update(1,p); assert.equal(s.count,2);
});
test('a regular respawn kind remains possible when its original slots are occupied', () => {
  const s=new ConsumableSystem(world), p=player();
  const bread=[...s.items.values()].find(s=>s.type==='bread');
  s.slots=s.slots.filter(slot=>slot.type!=='bread' || slot.id===bread.id);
  for(const id of [...s.items.keys()]) if(id!==bread.id) removeItem(s,id);
  const entries=SNACK_TYPES.map(id=>[id,CONSUMABLE_TYPES[id]]), total=entries.reduce((n,[,t])=>n+1/t.energy,0);
  let before=0; for(const [id,t] of entries) { if(id==='bread') break; before+=1/t.energy; }
  s.random=()=> (before+1/60)/total;
  const [event]=s.update(60,p); assert.equal(s.count,2); assert.equal(event.item.type,'bread'); assert.notEqual(event.item.id,bread.id);
});
test('respawn probabilities are inversely proportional to energy', () => {
  const samples=100000, counts={};
  for(let i=0;i<samples;i++) { const type=randomConsumableType(()=>(i+.5)/samples); counts[type]=(counts[type]||0)+1; }
  const sum=SNACK_TYPES.map(id=>CONSUMABLE_TYPES[id]).reduce((n,t)=>n+1/t.energy,0);
  for(const [id,t] of SNACK_TYPES.map(id=>[id,CONSUMABLE_TYPES[id]])) close(counts[id]/samples,(1/t.energy)/sum,2/samples);
  close(counts.hay/counts.book,.25,.001); close(counts.hay/counts.apple,.625,.001);
});
test('collectible renderer batches all kinds and removes consumed geometry after its effect', () => {
  const scene=new THREE.Scene(), view=createConsumables(scene,world,{wires:[],randomLimits:{}});
  let total=()=>scene.children.slice(0,2).flatMap(g=>g.children).reduce((n,m)=>n+m.count,0);
  assert.equal(total(),48); assert.equal(scene.children[0].children.length,13);
  const item=CONSUMABLE_SLOTS[0]; view.handle([{kind:'consume',item}]); view.sync(.3); assert.equal(total(),48);
  view.sync(.4); assert.equal(total(),47); view.setUpperVisible(false); assert.equal(scene.children[1].visible,false);
});

test('special hay refills an exhausted rabbit at home and permits an actual den escape', () => {
  const r=new RabbitController(world), s=new ConsumableSystem(world);
  r.energy.value=0; r.sprintExhausted=true; r.reset();
  assert.equal(s.nearest(r).id,DEN_HAY.id);
  s.begin(r); assert.equal(s.update(consumptionSeconds(s.denHay)-.01,r).length,0); assert.equal(r.energy.value,0);
  const [event]=s.update(.01,r);
  assert.equal(event.item.id,DEN_HAY.id); assert.equal(r.energy.value,100);
  tick(r,.75,{jump:true}); r.update(1/120,{x:1}); assert.equal(r.lastJump,'long');
  tick(r,.8,{x:1}); tick(r,.6); assert.ok(r.x>DEN.x+DEN.radius);
  assert.equal(r.grounded,true); assert.equal(r.surface,'wood');
});

test('special hay remains available across repeated uses, full energy, and returning home', () => {
  const r=new RabbitController(world), s=new ConsumableSystem(world);
  for(const startingEnergy of [0,37,99,100,0]) {
    r.reset(); r.energy.value=startingEnergy; r.energy.consume(10);
    s.begin(r); const [event]=s.update(consumptionSeconds(s.denHay),r);
    assert.equal(event.item.id,DEN_HAY.id); assert.equal(r.energy.value,100);
    assert.equal(r.energy.recovering,false); assert.equal(s.count,47);
    assert.equal(s.nearest(r).id,DEN_HAY.id);
    // Staying held never grants another refill without a fresh press.
    r.energy.spend(10); assert.deepEqual(s.update(2,r),[]); assert.equal(r.energy.value,90);
  }
});

test('interrupted special-hay holds grant no energy and restart from zero', () => {
  for(const interrupt of [(r,s)=>s.cancel(),r=>r.x+=2,r=>r.grounded=false]) {
    const r=new RabbitController(world), s=new ConsumableSystem(world); r.energy.value=0;
    s.begin(r); s.update(.6,r); interrupt(r,s); s.update(.4,r);
    assert.equal(r.energy.value,0); assert.equal(s.progress,0);
    r.reset(); s.begin(r); s.update(consumptionSeconds(s.denHay)/2,r); assert.equal(r.energy.value,0);
    s.update(consumptionSeconds(s.denHay)/2,r); assert.equal(r.energy.value,100);
  }
});

test('special hay requires grounded reach inside the den and respects obstructions', () => {
  const r=new RabbitController(world), s=new ConsumableSystem(world);
  assert.equal(canReachConsumable(r,DEN_HAY,world),true);
  for(const offset of [{x:DEN.x+DEN.radius+.1},{y:4.2},{grounded:false}]) {
    assert.equal(canReachConsumable({...r,...offset},DEN_HAY,world),false);
  }
  const blocked=new World(); blocked.addBox(DEN.x-.45,.5,DEN.z,.1,1,2);
  assert.equal(canReachConsumable(r,DEN_HAY,blocked),false);
  // Even a reachable permanent item beside the fence cannot be used from outside.
  assert.equal(canReachConsumable({...r,x:DEN.x+DEN.radius+.1},
    {...DEN_HAY,x:DEN.x+DEN.radius-.1,z:DEN.z},new World()),false);
  assert.equal(s.nearest({...r,x:DEN.x+2}),null);
});

test('permanent den hay never suppresses the finite-snack restock timer', () => {
  const r=new RabbitController(world), s=new ConsumableSystem(world,{random:()=>0});
  clearItems(s); s.update(59,r); s.begin(r);
  const events=s.update(consumptionSeconds(s.denHay),r);
  assert.deepEqual(events.map(e=>e.kind),['spawn','consume']);
  assert.equal(s.count,1); assert.equal(s.nearest(r).id,DEN_HAY.id);
  s.update(60,r); assert.equal(s.count,2); assert.equal([...s.availableItems()].length,3);
  assert.ok([...s.items.values()].every(item=>!item.permanent && item.id!==DEN_HAY.id));
});

test('special hay stays rendered after eating and uses only one additional drawing batch', () => {
  const scene=new THREE.Scene(), view=createConsumables(scene,world,{wires:[],randomLimits:{}}), r=new RabbitController(world);
  const hay=scene.getObjectByName('Special den hay'); assert.equal(hay.count,1);
  const original=new THREE.Matrix4(); hay.getMatrixAt(0,original);
  for(let i=0;i<3;i++) {
    view.system.begin(r); view.handle(view.system.update(consumptionSeconds(view.system.denHay),r));
    view.sync(.3); assert.equal(hay.count,1); view.sync(1); assert.equal(hay.count,1);
    assert.equal(view.system.count,47);
  }
  const matrix=new THREE.Matrix4(); hay.getMatrixAt(0,matrix);
  close(matrix.elements[0],original.elements[0]); close(matrix.elements[12],DEN_HAY.x,1e-6);
  view.setUpperVisible(false); assert.equal(hay.parent.visible,true);
  assert.equal(scene.children[0].children.length+scene.children[1].children.length,25);
});
