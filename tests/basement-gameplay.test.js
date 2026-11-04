import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {RabbitController,SURFACES,DEN} from '../src/physics.js';
import {BASEMENT as B,BASEMENT_STAIRS as S} from '../src/layout.js';
import {PoopPhysics} from '../src/poop-physics.js';
import {PoopSupply} from '../src/poop-supply.js';
import {ConsumableSystem} from '../src/consumable-system.js';
import {CONSUMABLE_SLOTS} from '../src/consumable-data.js';
import {createWaterFountains} from '../src/fountains.js';
import {createTerrainBackdrop} from '../src/terrain-backdrop.js';

const scene=new THREE.Scene(),{world}=createHouse(scene);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} differs from ${b}`);
function rabbit(x,y,z) {
  const r=new RabbitController(world);Object.assign(r,{x,y,z,surface:world.support(x,z,y+.01,true).surface});return r;
}
function walk(r,x,z,dt=1/60,run=false) {
  for(let elapsed=0;elapsed<30;elapsed+=dt) {
    const dx=x-r.x,dz=z-r.z,d=Math.hypot(dx,dz),gain=Math.max(1,d);
    r.update(dt,{x:dx/gain,z:dz/gain,run});
    if(d<.06&&Math.hypot(r.vx,r.vz)<.2)return;
  }
  assert.fail(`blocked route to ${x},${z} at ${r.x},${r.y},${r.z}`);
}

test('the real basement flight supports walking and sprinting down/up at different frame rates',()=>{
  for(const dt of [1/120,1/60,1/30,.1])for(const run of [false,true]) {
    const x=(S.minX+S.maxX)/2,r=rabbit(x,0,S.endZ+.8);
    walk(r,x,S.startZ-1,dt,run);close(r.y,B.y);assert.equal(r.surface,'concrete');
    walk(r,x,S.endZ+.8,dt,run);close(r.y,0);assert.equal(r.grounded,true);
  }
});

test('descending the smooth basement flight does not replay landing sounds on every tread',()=>{
  const x=(S.minX+S.maxX)/2,r=rabbit(x,0,S.endZ+.5);let landings=0;
  for(let i=0;i<60*7;i++){r.update(1/60,{z:-1});landings+=Number(r.lastLanding);}
  close(r.y,B.y);assert.ok(r.z<S.startZ-.5);assert.ok(landings<=1,`${landings} repeated landings`);
});

test('concrete is grippy and supports paid charged jumps beneath the den without reset or fence effects',()=>{
  assert.equal(SURFACES.concrete.grip,true);assert.equal(SURFACES.concrete.longJump,true);
  const r=rabbit(DEN.x,B.y,DEN.z);r.vx=8.8;r.update(.1,{});close(r.x,DEN.x);close(r.vx,0);close(r.y,B.y);
  assert.equal(r.isFreeDenJump({x:1}),false);
  for(let i=0;i<80;i++)r.update(1/120,{jump:true});r.update(1/120,{x:1});
  assert.equal(r.lastJump,'long');assert.equal(r.lastJumpFree,false);assert.equal(r.hasFreeDenJump,true);assert.ok(r.energy.value<95);
  for(let i=0;i<240;i++)r.update(1/120,{x:1});
  assert.ok(r.x>DEN.x+DEN.radius+.5);close(r.y,B.y);
  const supply=new PoopSupply();supply.observePosition(rabbit(DEN.x,B.y,DEN.z));assert.equal(supply.insideDen,false);
});

test('basement routes pass under the original stair flight and dropped balls remain underground',()=>{
  const r=rabbit(-20,B.y,16);
  for(const [x,z] of [[-4,16],[-4,6],[8,6],[20,16],[20,-12],[-18,-12]])walk(r,x,z);
  close(r.y,B.y);
  const physics=new PoopPhysics(world);
  for(const [x,z] of [[2.5,8],[DEN.x+DEN.radius,DEN.z],[6,14]])physics.spawn({x,y:B.y+.3,z});
  for(let i=0;i<180;i++)physics.update(1/60);
  for(const ball of physics.balls){close(ball.y,B.y+ball.radius);assert.equal(ball.sleeping,true);}
});

test('initial pools and respawns reject basement and stairwell sources and fountains stay above ground',()=>{
  const localScene=new THREE.Scene(),local=createHouse(localScene),water=createWaterFountains(localScene,local.world);
  const underground={id:'basement-carrot',type:'carrot',x:3,y:B.y,z:15};
  const system=new ConsumableSystem(local.world,{slots:[...CONSUMABLE_SLOTS,underground],
    wires:[{...underground,id:'basement-wire',type:'wire'}],randomPlaces:[underground,{x:6,y:0,z:16}],randomLimits:{}});
  assert.equal(system.items.has(underground.id),false);assert.equal(system.items.has('book-5'),false);assert.equal(system.wires.length,0);
  assert.ok(system.randomPlaces.every(place=>place.y>=0));assert.ok([...system.items.values()].every(item=>item.y>=0));
  assert.equal(system.randomItem('test-box','cardboard').y,0);
  assert.equal(water.items.length,14);assert.ok(water.items.every(item=>item.y>=0));
  water.system.bladder.value=100;const puddle=water.pee(rabbit(4,B.y,15));water.advance(1,rabbit(4,B.y,15));
  close(puddle.y,B.y);assert.equal(puddle.progress,1);
});

test('the terrain backdrop has no plane through the basement stair opening',()=>{
  const mesh=createTerrainBackdrop();mesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3((S.minX+S.maxX)/2,2,-10),new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObject(mesh).length,0);
  ray.ray.origin.set(25,2,0);assert.ok(ray.intersectObject(mesh).length>0);
  assert.equal(mesh.geometry.getAttribute('position').count,24);
});
