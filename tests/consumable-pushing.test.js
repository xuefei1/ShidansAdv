import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {World,RabbitController,DEN} from '../src/physics.js';
import {BOUNDS} from '../src/layout.js';
import {ConsumableSystem} from '../src/consumable-system.js';
import {consumptionSeconds,consumableDetails} from '../src/consumable-data.js';
import {createConsumables} from '../src/consumables.js';

const quiet={wires:[],randomLimits:{}};
const fixture=(type='cardboard',x=0,y=0,z=0)=>({id:`test-${type}`,type,x,y,z});
function run(system,rabbit,seconds,input={}) {
  const events=[];
  for(let i=0;i<Math.round(seconds*120);i++) {
    rabbit.update(1/120,input);events.push(...system.update(1/120,rabbit,0));
  }
  return events;
}
function setup(type='cardboard',world=new World(),position={x:0,y:0,z:0}) {
  const item=fixture(type,position.x,position.y,position.z),system=new ConsumableSystem(world,{...quiet,slots:[item]});
  const rabbit=new RabbitController(world);Object.assign(rabbit,{x:position.x-2,y:position.y,z:position.z});
  return {world,system,rabbit,item:system.items.get(item.id)};
}

test('walking and sprinting push hay, boxes and slippers instead of blocking or stepping onto them',()=>{
  for(const type of ['hay','cardboard','slippers']) for(const sprint of [false,true]) {
    const {system,rabbit,item}=setup(type),body=system.motion.bodies.get(item.collider);
    const baseline=setup(type);baseline.world.removeBox(baseline.item.collider);baseline.system.items.delete(baseline.item.id);
    run(baseline.system,baseline.rabbit,2,{x:1,run:sprint});
    let contacts=0,lowestSpeed=Infinity;
    for(let i=0;i<240;i++) {
      rabbit.update(1/120,{x:1,run:sprint});system.update(1/120,rabbit,0);
      if(rabbit.pushing) {contacts++;lowestSpeed=Math.min(lowestSpeed,Math.hypot(rabbit.vx,rabbit.vz));}
      assert.equal(rabbit.y,0,`${type}: pushing must not turn into stepping onto the item`);
    }
    assert.ok(contacts>0,`${type}: contact was exercised`);
    assert.ok(item.x>1,`${type}: prop moved forward`);assert.ok(rabbit.x>1,`${type}: rabbit continued through prop location`);
    assert.ok(rabbit.x<baseline.rabbit.x,`${type}: contact slightly slows travel`);
    assert.ok((rabbit.x+2)/(baseline.rabbit.x+2)>.7,`${type}: slowdown remains small`);
    assert.ok(lowestSpeed>0,`${type}: no wall-like stop`);assert.equal(body.box,item.collider);
    rabbit.reset();run(system,rabbit,2);
    assert.equal(system.motion.active.size,0,`${type}: released props eventually sleep`);
  }
});

test('a wall confines pushed props and lets them slide sideways while Shidan reaches the same wall',()=>{
  const w=new World(),wall=w.addBox(1.5,1,0,.2,2,8),{system,rabbit,item}=setup('cardboard',w);
  run(system,rabbit,3,{x:1});
  assert.ok(rabbit.x>.9);assert.ok(rabbit.x<=wall.minX-rabbit.radius+.015);
  assert.ok(item.collider.maxX<=wall.minX+.015,`Box clipped wall: ${item.collider.maxX}`);
  assert.ok(Math.abs(item.z)>.1,'A trapped prop slides sideways rather than pinning the rabbit');
  assert.ok([...system.motion.active].every(body=>Number.isFinite(body.item.x+body.item.y+body.item.z)));
});

test('an item pushed off a table falls to the floor and retains its registered collider',()=>{
  const w=new World();w.addBox(0,.4,0,2,.8,3);
  const {system,rabbit,item}=setup('hay',w,{x:.25,y:.8,z:0}),collider=item.collider;
  Object.assign(rabbit,{x:-.7,y:.8,z:0});
  run(system,rabbit,1.8,{x:1});rabbit.reset();run(system,rabbit,3);
  assert.ok(item.x>1,'The item crosses the tabletop edge');
  assert.ok(item.y<.015,`The item falls to floor: y=${item.y}`);
  assert.equal(item.collider,collider);assert.ok(w.dynamicBoxes.has(collider));
  assert.ok(system.motion.bodies.has(collider));assert.equal(system.motion.active.size,0);
});

test('the rendered item follows its moved body without rotating away from its collider',()=>{
  const scene=new THREE.Scene(),world=new World(),view=createConsumables(scene,world,{...quiet,slots:[fixture('carrot')]}),item=view.system.items.get('test-carrot');
  const mesh=scene.getObjectByName('carrot collectibles'),before=new THREE.Matrix4();mesh.getMatrixAt(0,before);
  const rabbit=new RabbitController(world);Object.assign(rabbit,{x:-2,y:0,z:0});const collider=item.collider;
  run(view.system,rabbit,2,{x:1});view.sync(.1);
  const after=new THREE.Matrix4();mesh.getMatrixAt(0,after);
  assert.ok(item.x>1);assert.ok(Math.abs(after.elements[12]-item.x)<1e-5);assert.ok(Math.abs(after.elements[13]-item.y)<1e-5);
  for(const index of [0,1,2,4,5,6,8,9,10])assert.ok(Math.abs(after.elements[index]-before.elements[index])<1e-6,'Orientation stays fixed');
  mesh.geometry.computeBoundingBox();const rendered=mesh.geometry.boundingBox.clone().applyMatrix4(after);
  for(const axis of ['X','Y','Z']) {
    assert.ok(rendered.min[axis.toLowerCase()]>=collider[`min${axis}`]-.015);
    assert.ok(rendered.max[axis.toLowerCase()]<=collider[`max${axis}`]+.015);
  }
  assert.equal(item.collider,collider);assert.deepEqual(world.queryDynamic(-40,-40,40,40),world.solids.filter(b=>world.dynamicBoxes.has(b)));
  assert.ok(world.queryDynamic(item.x,item.z).includes(collider));
});

test('moved cake and wires respawn at their authored positions and removed bodies never remain active',()=>{
  for(const type of ['cake','wire']) {
    const world=new World(),original=fixture(type),system=new ConsumableSystem(world,{...quiet,slots:type==='cake'?[original]:[],wires:type==='wire'?[original]:[]});
    const items=type==='cake'?system.items:system.chewables,item=items.get(original.id),rabbit=new RabbitController(world);
    Object.assign(rabbit,{x:-2,y:0,z:0});run(system,rabbit,1.2,{x:1});rabbit.reset();run(system,rabbit,2);
    assert.ok(item.x>.5);const collider=item.collider,body=system.motion.bodies.get(collider);
    Object.assign(rabbit,{x:item.x-.9,y:item.y,z:item.z});system.begin(rabbit);
    const consumed=run(system,rabbit,consumptionSeconds(item)).find(e=>e.kind==='consume');
    assert.ok(consumed,`${type}: movable item can still be consumed`);assert.equal(world.dynamicBoxes.has(collider),false);
    assert.equal(system.motion.bodies.has(collider),false);assert.equal(system.motion.active.has(body),false);
    system.update(0,rabbit,consumableDetails(item).respawn);
    const respawned=items.get(original.id);assert.equal(respawned.x,original.x);assert.equal(respawned.y,original.y);assert.equal(respawned.z,original.z);
    assert.notEqual(respawned.collider,collider);assert.equal(system.motion.bodies.size,2);
    for(let i=0;i<5;i++){system.reset();assert.equal(system.motion.active.size,0);assert.equal(system.motion.bodies.size,2);assert.equal(world.dynamicBoxes.size,2);}
  }
});

test('the den fence and lot boundary contain props while allowing the rabbit to keep moving',()=>{
  const w=new World(),system=new ConsumableSystem(w,{...quiet,slots:[]}),rabbit=new RabbitController(w),hay=system.denHay;
  const originalX=hay.x;Object.assign(rabbit,{x:DEN.x+.5,y:0,z:hay.z});run(system,rabbit,3,{x:-1});
  assert.ok(hay.x<originalX-.5);const b=hay.collider,radius=Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ)/2;
  assert.ok(Math.hypot(hay.x-DEN.x,hay.z-DEN.z)+radius<=DEN.radius+.02);
  const edge=setup('cardboard',new World(),{x:25,y:0,z:25});run(edge.system,edge.rabbit,3,{x:1,run:true});
  assert.ok(edge.item.collider.maxX<=BOUNDS.maxX);assert.ok(edge.item.collider.minX>=BOUNDS.minX);
  assert.ok(edge.rabbit.x<=BOUNDS.maxX-edge.rabbit.radius+.001);assert.ok(edge.rabbit.x>25);
});
