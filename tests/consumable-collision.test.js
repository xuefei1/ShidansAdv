import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {CONSUMABLE_TYPES,DEN_HAY,consumptionSeconds} from '../src/consumable-data.js';
import {ConsumableSystem,canReachConsumable} from '../src/consumable-system.js';
import {createConsumables} from '../src/consumables.js';
import {createHouse} from '../src/house.js';
import {World,RabbitController} from '../src/physics.js';
import {PoopPhysics,POOP_RADIUS} from '../src/poop-physics.js';
const close=(a,b,epsilon=.015)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const options={wires:[],randomLimits:{}};

test('reward-based durations have a one-second floor and use the full listed rewards',()=>{
  const expected={carrot:1,hay:1.6,apple:2,rabbitFood:2.4,banana:1.6,bread:1.6,noodles:1.4,book:1,cake:5,wire:3,cardboard:2.8,slippers:4};
  for(const [type,seconds] of Object.entries(expected)) assert.equal(consumptionSeconds({type}),seconds,type);
  assert.equal(consumptionSeconds(DEN_HAY),4);
  for(const type of Object.keys(CONSUMABLE_TYPES)) {
    const w=new World(),s=new ConsumableSystem(w,{...options,slots:[{id:type,type,x:0,y:0,z:0}]}),r=new RabbitController(w);
    Object.assign(r,{x:.9,y:0,z:0});r.energy.value=100;
    s.begin(r);s.update(consumptionSeconds({type})-.01,r);assert.equal(s.count,1);assert.equal(r.energy.recovering,false);
    const events=s.update(.01,r);assert.equal(s.count,0);assert.equal(events[0].kind,'consume');
    assert.equal(events[0].energy,CONSUMABLE_TYPES[type].energy);assert.equal(events[0].happiness,CONSUMABLE_TYPES[type].happiness||0);
  }
});

test('all visible consumables have enclosing colliders and remain reachable on the furnished level',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene),view=createConsumables(scene,world);
  assert.equal(world.dynamicBoxes.size,70);
  const indices=new Map();
  for(const item of view.system.availableItems()) {
    const floor=item.y>=4.1?1:0,group=scene.getObjectByName(`Consumables floor ${floor}`);
    const mesh=group.children.find(m=>m.name===(item.permanent?'Special den hay':`${item.type} collectibles`));
    const index=indices.get(mesh)||0;indices.set(mesh,index+1);
    const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);
    mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox.clone().applyMatrix4(matrix),solid=item.collider;
    for(const axis of ['X','Y','Z']) {
      assert.ok(b.min[axis.toLowerCase()]>=solid[`min${axis}`]-.015,`${item.id} min${axis}`);
      assert.ok(b.max[axis.toLowerCase()]<=solid[`max${axis}`]+.015,`${item.id} max${axis}`);
    }
    let reachable=false;
    for(let i=0;i<32;i++) {
      const x=item.x+Math.cos(i*Math.PI/16)*.9,z=item.z+Math.sin(i*Math.PI/16)*.9;
      const y=world.support(x,z,item.y+.03).y;
      const blocked=world.query(x-.22,z-.22,x+.22,z+.22).some(b=>b.maxY>y+.01&&b.minY<y+.68&&b.maxX>x-.22&&b.minX<x+.22&&b.maxZ>z-.22&&b.minZ<z+.22);
      if(!blocked&&canReachConsumable({x,y,z,grounded:true},item,world)) reachable=true;
    }
    assert.ok(reachable,`Reachable ${item.id}`);
  }
  for(let i=0;i<5;i++) {view.reset();assert.equal(world.dynamicBoxes.size,70);}
});

test('each consumable supports poop balls, and eating removes only its own solid',()=>{
  for(const type of Object.keys(CONSUMABLE_TYPES)) {
    const w=new World(),s=new ConsumableSystem(w,{...options,slots:[{id:type,type,x:0,y:0,z:0}]}),item=s.items.get(type),top=item.collider.maxY;
    const physics=new PoopPhysics(w),ball=physics.spawn({x:0,y:top+.4,z:0});
    for(let i=0;i<240;i++) physics.update(1/120);
    close(ball.y,top+POOP_RADIUS);
    const eater=new RabbitController(w);Object.assign(eater,{x:.9,y:0,z:0});
    s.begin(eater);s.update(consumptionSeconds(item),eater);
    assert.equal(w.dynamicBoxes.size,1);assert.equal([...w.dynamicBoxes][0].consumableId,'den-hay');
    for(let i=0;i<240;i++) physics.update(1/120);
    close(ball.y,POOP_RADIUS);
  }
});

test('the permanent den hay keeps its collider through use, and fixed respawns restore collision',()=>{
  const w=new World(),s=new ConsumableSystem(w,{...options,slots:[{id:'cake',type:'cake',x:0,y:0,z:0}]}),r=new RabbitController(w);
  const solid=s.denHay.collider;s.begin(r);s.update(4,r);
  assert.equal(s.denHay.collider,solid);assert.ok(w.dynamicBoxes.has(solid));
  const cake=s.items.get('cake'),cakeSolid=cake.collider;Object.assign(r,{x:.9,y:0,z:0});
  s.begin(r);s.update(5,r);assert.equal(w.dynamicBoxes.has(cakeSolid),false);
  s.update(0,r,120);assert.equal(w.dynamicBoxes.size,2);assert.notEqual(s.items.get('cake').collider,cakeSolid);
  assert.equal(s.items.get('cake').collider.consumableId,'cake');
});
