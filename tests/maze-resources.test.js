import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {World,RabbitController,DEN} from '../src/physics.js';
import {BASEMENT} from '../src/layout.js';
import {MazeSupplies,mazeFountainPlacements} from '../src/maze-supplies.js';
import {generateMirrorMaze,mazeRandom} from '../src/mirror-maze-layout.js';
import {ConsumableSystem,canReachConsumable} from '../src/consumable-system.js';
import {createConsumables} from '../src/consumables.js';
import {createWaterFountains} from '../src/fountains.js';
import {consumableDetails,consumptionSeconds} from '../src/consumable-data.js';

const empty={slots:[],wires:[],randomLimits:{},randomPlaces:[]};
function world() {const w=new World();w.basement=BASEMENT;w.ramps=[];return w;}
const player=(w,item,dx=.8)=>{const rabbit=new RabbitController(w);Object.assign(rabbit,{x:item.x+dx,y:item.y,z:item.z,grounded:true});return rabbit;};
const complete=(system,rabbit,item)=>{system.begin(rabbit);assert.equal(system.target,item);return system.update(consumptionSeconds(item),rabbit,0).find(e=>e.kind==='consume');};

test('every generated maze has 10–20 distinct random supplies and special hay, with no consumable carpet carrot',()=>{
  for(let seed=0;seed<100;seed++) {
    const layout=generateMirrorMaze(mazeRandom(seed)),supplies=new MazeSupplies(layout,mazeRandom(seed+500));supplies.reset();
    assert.ok(supplies.initialCount>=10&&supplies.initialCount<=20);
    assert.equal(supplies.count,supplies.initialCount);
    assert.equal([...supplies.availableItems()].length,supplies.initialCount+1);
    assert.equal(supplies.items.has('maze-heart-carrot'),false);
    assert.equal(new Set([...supplies.items.values()].map(p=>`${p.x},${p.z}`)).size,supplies.count);
    for(const item of supplies.items.values()){assert.equal(item.y,BASEMENT.y);assert.equal(item.oneShot,true);assert.equal(item.mazeItem,true);}
    assert.equal(supplies.hay.fixed,true);assert.equal(supplies.hay.mazeHay,true);
    assert.equal(supplies.hay.x,layout.heart.x-1.05);
  }
});

test('maze food awards the usual complete-item stats without joining house counts or regeneration',()=>{
  const w=world(),layout=generateMirrorMaze(mazeRandom(7));
  const system=new ConsumableSystem(w,{...empty,slots:[{id:'house-carrot',type:'carrot',x:8,y:0,z:12}],mazeLayout:layout,random:()=>.62});
  assert.equal(system.count,1);assert.equal(system.chewableCount,0);assert.equal(system.restockCount,1);
  const cake=[...system.mazeSupplies.items.values()].find(item=>item.type==='cake');assert.ok(cake);
  const rabbit=player(w,cake),before=system.mazeCount,event=complete(system,rabbit,cake);
  assert.equal(event.happiness,150);assert.equal(event.energy,50);assert.equal(event.poop,5);
  assert.equal(system.count,1);assert.equal(system.mazeCount,before-1);assert.equal(system.pending.size,0);
  assert.equal(w.solids.some(box=>box.consumableId===cake.id),false);
  system.update(0,rabbit,3600);assert.equal(system.mazeCount,before-1);assert.equal(system.pending.size,0);
  assert.equal(system.mazeSupplies.items.has(cake.id),false);
});

test('cancelling a maze snack leaves it available and center hay refills fully without den immunity',()=>{
  const w=world(),layout=generateMirrorMaze(mazeRandom(4)),system=new ConsumableSystem(w,{...empty,mazeLayout:layout,random:mazeRandom(1)});
  const snack=system.mazeSupplies.items.values().next().value,rabbit=player(w,snack);
  system.begin(rabbit);assert.deepEqual(system.update(consumptionSeconds(snack)-.01,rabbit,0),[]);system.cancel();
  assert.equal(system.mazeSupplies.has(snack),true);assert.equal(complete(system,rabbit,snack).happiness,consumableDetails(snack).happiness||0);
  const hay=system.mazeSupplies.hay;Object.assign(rabbit,{x:hay.x-.8,z:hay.z});rabbit.energy.value=1;
  assert.equal(canReachConsumable(rabbit,hay,w),true);assert.equal(hay.collider.pushable,undefined);assert.equal(hay.collider.mazeFixture,true);
  assert.equal(complete(system,rabbit,hay).happiness,0);assert.equal(rabbit.energy.value,100);assert.equal(system.mazeSupplies.hay,hay);
  rabbit.energy.value=4;complete(system,rabbit,hay);assert.equal(rabbit.energy.value,100);
  assert.equal(canReachConsumable({...rabbit,y:0},hay,w),false,'ground-floor den rules never extend through the ceiling');
});

test('reset clears previous maze bodies and follows the next layout without growing scene or pool counts',()=>{
  const w=world(),scene=new THREE.Scene();let layout=generateMirrorMaze(mazeRandom(1));
  const consumables=createConsumables(scene,w,{...empty,mazeLayout:()=>layout,random:mazeRandom(8)});
  const old=[...consumables.system.mazeSupplies.availableItems()].map(item=>item.collider),nodes=scene.children.slice();
  layout=generateMirrorMaze(mazeRandom(2));consumables.reset();
  for(const collider of old)assert.equal(w.dynamicBoxes.has(collider),false);
  assert.equal(consumables.system.count,0);assert.ok(consumables.system.mazeCount>=10&&consumables.system.mazeCount<=20);
  assert.deepEqual(scene.children,nodes);
  consumables.setFloorView(-1);consumables.sync();
  let visibleInstances=0;scene.traverse(mesh=>{if(mesh.isInstancedMesh&&mesh.name.includes('collectibles'))visibleInstances+=mesh.count;});
  assert.equal(visibleInstances,consumables.system.mazeCount);
  assert.equal(consumableDetails(consumables.system.mazeSupplies.hay).energy,100);
});

test('loose basement supplies can be pushed through the den footprint above them',()=>{
  const w=world(),layout={spawnPoints:[{x:DEN.x+DEN.radius-.4,y:BASEMENT.y,z:DEN.z}],heart:{x:1,y:BASEMENT.y,z:0}};
  const system=new ConsumableSystem(w,{...empty,mazeLayout:layout,random:()=>0}),item=system.mazeSupplies.items.get('maze-snack-0');
  const rabbit=player(w,item,-1.3);
  for(let i=0;i<240;i++){rabbit.update(1/120,{x:1});system.update(1/120,rabbit,0);}
  assert.ok(item.x>DEN.x+DEN.radius+.4,`food stopped at the phantom den boundary: ${item.x}`);
  assert.equal(item.collider.pushable,true);assert.equal(item.y,BASEMENT.y);
});

test('four maze fountains conserve water, remain fixed and refill/move safely for the next scene',()=>{
  const w=world(),scene=new THREE.Scene();let layout=generateMirrorMaze(mazeRandom(12));
  const water=createWaterFountains(scene,w,{mazeLayout:()=>layout}),items=water.items.filter(item=>item.mazeFixture);
  assert.equal(items.length,4);assert.equal(water.items.length,18);assert.equal(water.groups.length,4);
  for(const item of items)for(const box of item.colliders){assert.equal(box.mazeFixture,true);assert.equal(w.dynamicBoxes.has(box),true);assert.equal(box.pushable,undefined);}
  const fountain=items[0],rabbit=player(w,fountain,.9);assert.equal(water.system.start(rabbit),true);
  water.advance(.1,rabbit);assert.equal(water.system.bladder.value,1);assert.equal(water.system.remaining(fountain),99);
  water.system.stop();assert.equal(water.system.remaining(items[1]),100);
  water.setFloorView(-1);assert.equal(water.waterMeshes[0].visible,false);assert.equal(water.waterMeshes[3].visible,true);
  const box=fountain.collider,oldX=fountain.x,oldCenter=(box.minX+box.maxX)/2;
  layout={...layout,fountainPoints:layout.fountainPoints.map(p=>({...p,x:p.x+2}))};water.reset();
  assert.equal(fountain.x,oldX+2);assert.equal((box.minX+box.maxX)/2,oldCenter+2);assert.equal(fountain.collider,box);
  assert.ok(w.queryDynamic(box.minX,box.minZ,box.maxX,box.maxZ).includes(box));
  assert.equal(water.system.remaining(fountain),100);assert.equal(water.system.bladder.value,0);
  assert.equal(water.waterMeshes[3].count,4);assert.equal(mazeFountainPlacements(layout).length,4);
});

test('a maze fountain under the den perimeter is reachable without a phantom ground-floor fence',()=>{
  const w=world(),layout={fountainPoints:[{x:DEN.x+DEN.radius-.2,y:BASEMENT.y,z:DEN.z}]};
  const water=createWaterFountains(new THREE.Scene(),w,{mazeLayout:layout}),fountain=water.items.find(i=>i.mazeFixture);
  const rabbit=player(w,fountain,.9);assert.equal(water.system.start(rabbit),true);water.advance(1,rabbit);
  assert.equal(water.system.bladder.value,10);assert.equal(water.system.remaining(fountain),90);
});
