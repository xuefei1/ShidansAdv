import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { World, RabbitController } from '../src/physics.js';
import { createHouse } from '../src/house.js';
import { DEN, ROOMS, FLOOR_HEIGHT } from '../src/layout.js';
import { WaterSystem, FOUNTAIN_PLACEMENTS, canReachFountain, WATER_FILL_RATE, DRINK_COOLDOWN, PEE_SECONDS, FOUNTAIN_CAPACITY } from '../src/water.js';
import { createWaterFountains, MAX_PUDDLES, PUDDLE_CLEARANCE } from '../src/fountains.js';
import { findCoplanarColorOverlaps } from './surface-audit.js';
import { ConsumableSystem } from '../src/consumable-system.js';

const close=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);
const player=(x=.9,y=0,z=0)=>({x,y,z,grounded:true});
const fountain=(x=0,y=0,z=0)=>({id:'test-fountain',name:'Water fountain',x,y,z});
function setup() {
  const world=new World(),items=[fountain()];
  return {world,system:new WaterSystem(world,{items}),p:player(),item:items[0]};
}

test('bladder starts empty and a tenth of a second of drinking grants exactly 1%',()=>{
  const {system,p,item}=setup();
  assert.equal(WATER_FILL_RATE,10);assert.equal(system.bladder.value,0);
  assert.equal(FOUNTAIN_CAPACITY,100);assert.equal(system.remaining(item),100);
  assert.equal(system.start(p),true);system.advance(.1,p);
  assert.equal(system.bladder.value,1);assert.equal(system.remaining(item),99);assert.equal(system.drinking,true);
  system.advance(.15,p);assert.equal(system.bladder.value,2.5);assert.equal(system.remaining(item),97.5);
});
test('water fill is precise across fractional frames, caps at 100 and stops drinking',()=>{
  for(const fps of [30,60,144]) {
    const {system,p,item}=setup();system.start(p);
    for(let i=0;i<fps*7;i++)system.advance(1/fps,p);
    assert.equal(system.bladder.value,70);assert.equal(system.remaining(item),30);
    for(let i=0;i<fps*4;i++)system.advance(1/fps,p);
    assert.equal(system.bladder.value,100);assert.equal(system.remaining(item),0);assert.equal(system.drinking,false);
    assert.equal(system.start(p),false);system.advance(500,p);assert.equal(system.bladder.value,100);
  }
});
test('release, pauses and invalid deltas never give unearned water',()=>{
  const {system,p}=setup();system.start(p);system.advance(.25,p);system.stop();
  system.advance(7,p);assert.equal(system.bladder.value,2.5);
  system.start(p);for(const dt of [0,-1,Infinity,NaN])system.advance(dt,p);
  assert.equal(system.bladder.value,2.5);system.advance(.1,p);assert.equal(system.bladder.value,3.5);
});
test('the first held frame credits only time after the input event',()=>{
  const {system,p}=setup();system.start(p,.075);system.advance(.1,p);assert.equal(system.bladder.value,.25);
  system.advance(.1,p);assert.equal(system.bladder.value,1.25);
  system.stop();system.start(p,.2);system.advance(.1,p);assert.equal(system.bladder.value,1.25);
  system.advance(.15,p);assert.equal(system.bladder.value,1.75);
});
test('pee takes exactly one active second, empties linearly and starts the drinking restriction at the beginning',()=>{
  const {system,p}=setup();system.start(p);system.advance(2.5,p);
  const event=system.pee(p);
  assert.deepEqual(event,{kind:'pee',x:.9,y:0,z:0,amount:25,progress:0});
  assert.equal(system.bladder.value,25);assert.equal(system.drinking,false);assert.equal(system.peeing,true);
  assert.equal(PEE_SECONDS,1);assert.equal(system.peeRemaining,1);
  assert.equal(DRINK_COOLDOWN,60);assert.equal(system.cooldownRemaining,60);assert.equal(system.start(p),false);
  system.advance(.1,p);assert.equal(system.bladder.value,22.5);assert.equal(event.progress,.1);assert.equal(system.peeRemaining,.9);
  system.advance(.4,p);assert.equal(system.bladder.value,12.5);assert.equal(system.peeProgress,.5);
  system.advance(.499,p);assert.equal(system.peeing,true);assert.equal(system.peeRemaining,.001);
  close(system.bladder.value,.025);
  system.advance(.001,p);assert.equal(system.peeing,false);assert.equal(system.peeProgress,1);assert.equal(event.progress,1);
  assert.equal(system.bladder.value,0);assert.equal(system.peeRemaining,0);assert.equal(system.cooldownRemaining,59);
  system.advance(58.9,p);assert.equal(system.cooldownRemaining,.1);assert.equal(system.start(p),false);
  system.advance(0,p);assert.equal(system.cooldownRemaining,.1);
  system.advance(.1,p);assert.equal(system.cooldownRemaining,0);assert.equal(system.start(p),true);
  system.advance(.1,p);assert.equal(system.bladder.value,1);
});
test('one-second pee remains precise at different frame rates and across a large delta',()=>{
  for(const fps of [30,60,144]) {
    const {system,p}=setup();system.bladder.value=37.5;const event=system.pee(p);
    for(let i=0;i<fps/2;i++)system.advance(1/fps,p);
    assert.equal(system.peeProgress,.5);assert.equal(system.bladder.value,18.75);
    for(let i=0;i<fps/2;i++)system.advance(1/fps,p);
    assert.equal(system.peeing,false);assert.equal(system.bladder.value,0);assert.equal(event.progress,1);
    assert.equal(system.cooldownRemaining,59);
  }
  const {system,p}=setup();system.bladder.value=100;system.pee(p);system.advance(3.25,p);
  assert.equal(system.bladder.value,0);assert.equal(system.peeProgress,1);assert.equal(system.cooldownRemaining,56.75);
});
test('pee cannot be cancelled by drinking stop or pause, and blocks overlapping pee/drinking actions',()=>{
  const {system,p}=setup();system.bladder.value=70;const event=system.pee(p);
  system.advance(.25,p);system.stop();system.advance(0,p);
  assert.equal(system.peeing,true);assert.equal(system.bladder.value,52.5);assert.equal(system.peeRemaining,.75);
  assert.equal(system.start(p),false);assert.equal(system.drinking,false);assert.equal(system.pee(p),null);
  assert.equal(system.peeEvent,event);system.advance(.75,{...p,x:20,grounded:false});
  assert.equal(system.peeing,false);assert.equal(event.progress,1);assert.equal(system.bladder.value,0);
  system.bladder.value=5;assert.equal(system.pee(p),null,'The existing restriction prevents another Q action');
});
test('empty Q presses do not create events or extend the drinking cooldown',()=>{
  const {system,p}=setup();assert.equal(system.pee(p),null);assert.equal(system.cooldownRemaining,0);
  system.start(p);system.advance(.1,p);system.pee(p);system.advance(3,p);
  assert.equal(system.pee(p),null);assert.equal(system.cooldownRemaining,57);
});
test('full bladder consumes only the missing water and leaves the unused reservoir for a later visit',()=>{
  const {system,p,item}=setup();
  system.bladder.value=95;system.start(p);system.advance(20,p);
  assert.equal(system.bladder.value,100);assert.equal(system.remaining(item),95);assert.equal(system.drinking,false);
  assert.equal(system.start(p),false);system.advance(1000,p);assert.equal(system.remaining(item),95);
  system.pee(p);system.advance(60,p);system.advance(10,p);assert.equal(system.bladder.value,0);
  assert.equal(system.remaining(item),95);assert.equal(system.start(p),true);system.advance(20,p);
  assert.equal(system.bladder.value,95);assert.equal(system.remaining(item),0);assert.equal(system.drinking,false);
  assert.equal(system.start(p),false);assert.equal(system.nearest(p),item,'Empty stations remain discoverable for the prompt');
  system.advance(5000,p);assert.equal(system.remaining(item),0,'A depleted reservoir never regenerates during the round');
  assert.equal(system.items.length,1);assert.equal(system.items[0],item);
});
test('partial holds, pauses and cancellation preserve exact unused water without regeneration',()=>{
  const {system,p,item}=setup();system.start(p);system.advance(.123,p);system.stop();
  assert.equal(system.bladder.value,1.23);assert.equal(system.remaining(item),98.77);
  const revision=system.waterRevision;system.advance(500,p);assert.equal(system.remaining(item),98.77);assert.equal(system.waterRevision,revision);
  for(let i=0;i<17;i++) {
    system.start(p);system.advance(.07,p);system.advance(.033,p);system.stop();
    assert.equal(system.bladder.value+system.remaining(item),100);
  }
  assert.equal(system.bladder.value,18.74);assert.equal(system.remaining(item.id),81.26);
  system.start(p);system.advance(0,p);assert.equal(system.remaining(item),81.26);
  Object.assign(p,{x:10});system.advance(2,p);assert.equal(system.remaining(item),81.26);assert.equal(system.drinking,false);
});
test('each station has an independent reservoir and transfers only its own remaining water',()=>{
  const world=new World(),first=fountain(),second={...fountain(4),id:'second'};
  const system=new WaterSystem(world,{items:[first,second]}),a=player(),b=player(4.9);
  system.start(a);system.advance(2.5,a);system.stop();
  assert.equal(system.remaining(first),75);assert.equal(system.remaining(second),100);
  system.start(b);system.advance(1.5,b);system.stop();
  assert.equal(system.bladder.value,40);assert.equal(system.remaining(first),75);assert.equal(system.remaining(second),85);
  system.advance(1000,b);assert.equal(system.remaining(first),75);assert.equal(system.remaining(second),85);
  assert.equal(system.remaining('unknown-fountain'),0);system.reset();
  assert.equal(system.bladder.value,0);assert.equal(system.remaining(first),100);assert.equal(system.remaining(second),100);
});
test('walking away, changing floor or jumping cancels drinking and blocks remote interaction',()=>{
  for(const changed of [{x:3},{y:4.2},{grounded:false}]) {
    const {system,p}=setup();system.start(p);system.advance(.1,p);Object.assign(p,changed);system.advance(2,p);
    assert.equal(system.bladder.value,1);assert.equal(system.drinking,false);assert.equal(system.start(p),false);
  }
});
test('walls and the den fence prevent drinking through an obstruction',()=>{
  const {system,p,world,item}=setup();world.addBox(.45,.3,0,.1,.6,1);
  assert.equal(canReachFountain(p,item,world),false);assert.equal(system.nearest(p),null);
  const fenceSystem=new WaterSystem(new World(),{items:[fountain(DEN.x+DEN.radius+.4,0,DEN.z)]});
  assert.equal(fenceSystem.start(player(DEN.x+DEN.radius-.4,0,DEN.z)),false);
});
test('the closest reachable fountain is selected, with its own basin excluded from line of sight',()=>{
  const {world}=setup(),near=fountain(),far={...fountain(1.8),id:'far'};
  const basin=world.addBox(0,.155,0,.84,.31,.84);basin.fountainId=near.id;
  const system=new WaterSystem(world,{items:[near,far]});
  assert.equal(system.nearest(player(.7)),near);assert.equal(system.nearest(player(1.1)),far);
});
test('Q during a hop places the puddle on static support, ignoring movable food',()=>{
  const {world,system,p}=setup();world.addBox(.9,.25,0,1,.5,1);
  const food=world.addDynamicBox(.9,.6,0,.5,.2,.5);food.pushable=true;
  system.bladder.value=12;assert.equal(system.pee({...p,y:1.2,grounded:false}).y,.5);
});
test('new day resets water, cooldown and held interaction without removing fountains',()=>{
  const {system,p}=setup();system.start(p);system.advance(5,p);system.pee(p);system.reset();
  assert.equal(system.bladder.value,0);assert.equal(system.cooldownRemaining,0);assert.equal(system.elapsed,0);
  assert.equal(system.drinking,false);assert.equal(system.peeing,false);assert.equal(system.peeEvent,null);
  assert.equal(system.peeProgress,0);assert.equal(system.peeRemaining,0);assert.equal(system.items.length,1);assert.equal(system.start(p),true);
});

const scene=new THREE.Scene(),house=createHouse(scene),previousSolids=[...house.world.solids];
const water=createWaterFountains(scene,house.world);
const overlaps=(a,b)=>a.maxX>b.minX&&a.minX<b.maxX&&a.maxZ>b.minZ&&a.minZ<b.maxZ&&a.maxY>b.minY&&a.minY<b.maxY;
test('all 14 spaces including the balcony and front/back yards have one supported fountain',()=>{
  assert.equal(water.items.length,ROOMS.length);assert.equal(water.items.length,14);
  assert.equal(new Set(water.items.map(item=>item.id)).size,14);
  assert.equal(FOUNTAIN_PLACEMENTS.length,14);
  for(const room of ROOMS) {
    const matches=water.items.filter(item=>item.room===room.id);assert.equal(matches.length,1,room.id);
    const f=matches[0];assert.ok(f.x>room.minX+.42&&f.x<room.maxX-.42&&f.z>room.minZ+.42&&f.z<room.maxZ-.42,room.id);
    close(house.world.support(f.x,f.z,f.y+.001,true).y,room.floor*FLOOR_HEIGHT);
    assert.ok(Math.hypot(f.x-DEN.x,f.z-DEN.z)>DEN.radius+.45);
  }
});
test('authored fountains neither overlap existing furnishings nor obstruct their approach routes',()=>{
  for(const f of water.items) {
    const volume={minX:f.x-.46,maxX:f.x+.46,minY:f.y+.01,maxY:f.y+.65,minZ:f.z-.46,maxZ:f.z+.46};
    assert.equal(previousSolids.filter(box=>overlaps(box,volume)).length,0,`${f.id} overlaps an existing fixture`);
    const approaches=Array.from({length:16},(_,i)=>player(f.x+Math.cos(i*Math.PI/8)*.9,f.y,f.z+Math.sin(i*Math.PI/8)*.9));
    assert.ok(approaches.filter(p=>{
      const body={minX:p.x-.22,maxX:p.x+.22,minY:p.y+.01,maxY:p.y+.68,minZ:p.z-.22,maxZ:p.z+.22};
      return canReachFountain(p,f,house.world)&&house.world.support(p.x,p.z,p.y+.24,true).y===p.y&&!house.world.query(body.minX,body.minZ,body.maxX,body.maxZ).some(box=>overlaps(body,box));
    }).length>=8,`${f.id} needs several clear drinking approaches`);
  }
});
test('fixed food, den hay and cable spawn volumes stay clear of every fountain',()=>{
  const isolated=new THREE.Scene(),{world}=createHouse(isolated),fixtures=createWaterFountains(isolated,world);
  const consumables=new ConsumableSystem(world,{randomLimits:{}});
  for(const item of consumables.availableItems()) for(const fountain of fixtures.items) {
    assert.ok(fountain.colliders.every(collider=>!overlaps(collider,item.collider)),`${item.id} overlaps ${fountain.id}`);
  }
});
test('fountain bodies block the actual rabbit and remain permanent static fixtures',()=>{
  const f=water.items.find(item=>item.room==='front-yard'),rabbit=new RabbitController(house.world);
  Object.assign(rabbit,{x:f.x-1.5,y:f.y,z:f.z});
  const snapshot=f.colliders.map(box=>({...box}));
  for(let i=0;i<240;i++)rabbit.update(1/120,{x:1});
  assert.ok(rabbit.x<=f.collider.minX-rabbit.radius+.01);
  assert.deepEqual(f.colliders,snapshot);
  for(const collider of f.colliders) {
    assert.ok(house.world.solids.includes(collider));assert.equal(house.world.dynamicBoxes.has(collider),false);
    assert.equal(collider.pushable,undefined);assert.equal(house.world.fixtures.get(collider.id),collider);
  }
});
test('fourteen fountain shells share three static draws and water uses six bounded shared draws without coplanar conflicts',()=>{
  const isolated=new THREE.Scene(),fixtures=createWaterFountains(isolated,new World());
  const meshes=fixtures.groups.map(group=>group.children.find(mesh=>mesh.name.startsWith('Water fountains')));
  assert.equal(meshes.length,3);assert.ok(meshes.every(mesh=>mesh.isInstancedMesh));
  assert.equal(meshes.reduce((sum,mesh)=>sum+mesh.count,0),14);
  assert.equal(new Set(meshes.map(mesh=>mesh.geometry)).size,1);
  assert.equal(fixtures.waterMeshes.length,3);assert.equal(fixtures.streamMeshes.length,3);
  assert.equal(new Set(fixtures.waterMeshes.map(mesh=>mesh.geometry)).size,1);
  assert.equal(new Set(fixtures.streamMeshes.map(mesh=>mesh.geometry)).size,1);
  assert.deepEqual(findCoplanarColorOverlaps(isolated,{exposedOnly:true}),[]);
});
test('finite pools shrink, empty stations lose their water/stream, and a new day refills all 14 without rebuilding fixtures',()=>{
  const isolated=new THREE.Scene(),world=new World(),fixtures=createWaterFountains(isolated,world);
  const item=fixtures.items.find(f=>f.room==='front-yard'),p=player(item.x+.9,item.y,item.z);
  const basin=fixtures.groups[2].getObjectByName('Water fountains layer 2'),liquid=fixtures.waterMeshes[2],stream=fixtures.streamMeshes[2];
  const solids=[...world.solids],shellUUID=basin.uuid,poolUUID=liquid.uuid,streamUUID=stream.uuid;
  const matrixFor=(mesh,fountain)=>{
    for(let i=0;i<mesh.count;i++) {
      const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
      if(Math.abs(matrix.elements[12]-fountain.x)<.001 && Math.abs(matrix.elements[14]-fountain.z)<.001)return {matrix,index:i};
    }
    return null;
  };
  for(const fountain of fixtures.items)assert.equal(fixtures.system.remaining(fountain),100);
  const full=matrixFor(liquid,item);assert.ok(full);assert.equal(liquid.count,3);assert.equal(stream.count,3);
  fixtures.system.start(p);fixtures.advance(2.5,p);fixtures.system.stop();
  assert.equal(fixtures.system.bladder.value,25);assert.equal(fixtures.system.remaining(item),75);
  const partial=matrixFor(liquid,item);assert.ok(partial.matrix.elements[0]<full.matrix.elements[0]);
  const tint=new THREE.Color();liquid.getColorAt(partial.index,tint);assert.ok(tint.r<1&&tint.g<1&&tint.b<1,'Lower water is visibly duller');
  const revision=liquid.instanceMatrix.version;fixtures.advance(100,p);
  assert.equal(liquid.instanceMatrix.version,revision,'Idle stations never upload reservoir matrices');
  assert.equal(fixtures.system.remaining(item),75);
  fixtures.system.start(p);fixtures.advance(7.5,p);
  assert.equal(fixtures.system.bladder.value,100);assert.equal(fixtures.system.remaining(item),0);
  assert.equal(matrixFor(liquid,item),null);assert.equal(matrixFor(stream,item),null);
  assert.equal(liquid.count,2);assert.equal(stream.count,2);assert.equal(basin.count,3,'Empty bowls stay visible and solid');
  fixtures.pee(p);fixtures.advance(.25,p);assert.equal(fixtures.system.peeing,true);fixtures.reset();
  assert.equal(fixtures.system.bladder.value,0);assert.equal(fixtures.system.cooldownRemaining,0);assert.equal(fixtures.system.peeing,false);
  assert.equal(fixtures.puddles.length,0);assert.equal(liquid.count,3);assert.equal(stream.count,3);
  assert.deepEqual(matrixFor(liquid,item).matrix.elements,full.matrix.elements);
  for(const fountain of fixtures.items)assert.equal(fixtures.system.remaining(fountain),100);
  assert.equal(basin.uuid,shellUUID);assert.equal(liquid.uuid,poolUUID);assert.equal(stream.uuid,streamUUID);
  assert.equal(world.solids.length,solids.length);world.solids.forEach((collider,index)=>assert.equal(collider,solids[index]));
});
test('puddles persist, have bounded instanced rendering, respect upper-floor hiding and reset on a new day',()=>{
  water.reset();const p=player(11,0,29.5);
  assert.equal(water.pee(p),null);
  for(let i=0;i<MAX_PUDDLES+7;i++) {water.system.bladder.value=25;water.pee({...p,x:11+i*.001});water.advance(60,p);}
  assert.equal(water.puddles.length,MAX_PUDDLES);assert.equal(water.puddleMeshes.reduce((sum,mesh)=>sum+mesh.count,0),MAX_PUDDLES);
  assert.equal(water.puddles[0].x,11.007);
  water.system.bladder.value=50;water.pee(player(-10,FLOOR_HEIGHT,-5));
  const upper=water.puddleMeshes[1],matrix=new THREE.Matrix4();upper.getMatrixAt(0,matrix);
  close(matrix.elements[13],FLOOR_HEIGHT+PUDDLE_CLEARANCE,1e-6); // GPU matrices use float32.
  for(const mesh of water.puddleMeshes) {assert.equal(mesh.isInstancedMesh,true);assert.equal(mesh.material.polygonOffset,true);assert.equal(mesh.material.depthWrite,false);}
  water.setUpperVisible(false);assert.equal(water.groups[1].visible,false);assert.equal(water.groups[2].visible,true);
  water.setUpperVisible(true);assert.equal(water.groups[1].visible,true);
  water.reset();assert.equal(water.puddles.length,0);assert.equal(water.puddleMeshes.reduce((sum,mesh)=>sum+mesh.count,0),0);
});
test('puddles grow over the pee second with a larger saturated gold surface, contrasting rim and reflection in three bounded draws',()=>{
  const isolated=new THREE.Scene(),fixtures=createWaterFountains(isolated,new World()),p=player(0,0,0);
  fixtures.system.bladder.value=100;const event=fixtures.pee(p),mesh=fixtures.puddleMeshes[0];
  const initial=new THREE.Matrix4(),middle=new THREE.Matrix4(),final=new THREE.Matrix4();
  mesh.getMatrixAt(0,initial);fixtures.advance(.5,p);mesh.getMatrixAt(0,middle);
  assert.equal(event.progress,.5);assert.equal(fixtures.puddles[0],event);assert.equal(fixtures.system.bladder.value,50);
  fixtures.advance(.5,p);mesh.getMatrixAt(0,final);
  assert.ok(middle.elements[0]>initial.elements[0]);assert.ok(final.elements[0]>middle.elements[0]);
  assert.ok(final.elements[0]*2>2.5,'Full bladder produces an easily visible puddle more than 2.5m wide');
  const revision=mesh.instanceMatrix.version;fixtures.advance(1,p);
  assert.equal(mesh.instanceMatrix.version,revision,'Static completed puddles do not upload matrices each frame');
  const geometry=mesh.geometry,color=geometry.getAttribute('color'),position=geometry.getAttribute('position'),shades=new Set();
  for(let i=0;i<color.count;i++) shades.add([color.getX(i),color.getY(i),color.getZ(i)].map(v=>v.toFixed(3)).join(','));
  assert.equal(shades.size,3,'Gold fill, contrast rim and reflection share the same draw');
  assert.ok(geometry.boundingBox.max.z-geometry.boundingBox.min.z>.01,'Real height separation protects the contrasting details');
  assert.ok(position.count>0);assert.equal(mesh.material.vertexColors,true);assert.ok(mesh.material.opacity>.7);
  assert.equal(fixtures.puddleMeshes.length,3);assert.equal(new Set(fixtures.puddleMeshes.map(m=>m.geometry)).size,1);
  fixtures.reset();assert.equal(fixtures.system.peeing,false);assert.equal(fixtures.puddles.length,0);
});
test('same-location puddles retain stable instance order and blend without depth writes while opaque props occlude them',()=>{
  const isolated=new THREE.Scene(),fixtures=createWaterFountains(isolated,new World()),p=player(0,0,0);
  fixtures.system.bladder.value=100;const first=fixtures.pee(p);fixtures.advance(60,p);
  const mesh=fixtures.puddleMeshes[0],original=new THREE.Matrix4();mesh.getMatrixAt(0,original);
  fixtures.system.bladder.value=25;const second=fixtures.pee(p);fixtures.advance(.5,p);
  const growing=new THREE.Matrix4(),preserved=new THREE.Matrix4();mesh.getMatrixAt(0,preserved);mesh.getMatrixAt(1,growing);
  assert.deepEqual(preserved.elements,original.elements,'A new overlapping patch never reorders or shifts the old instance');
  assert.equal(preserved.elements[13],growing.elements[13],'Both patches occupy the same support plane');
  assert.equal(mesh.count,2);assert.equal(fixtures.puddles[0],first);assert.equal(fixtures.puddles[1],second);
  fixtures.advance(.5,p);mesh.getMatrixAt(0,preserved);assert.deepEqual(preserved.elements,original.elements);
  assert.equal(mesh.material.transparent,true);assert.equal(mesh.material.blending,THREE.NormalBlending);
  assert.equal(mesh.material.depthWrite,false,'Overlapping gold/rim/reflection fragments must not fight over the depth buffer');
  assert.equal(mesh.material.depthTest,true,'Transparent patches remain hidden behind ordinary opaque geometry');
  assert.equal(mesh.material.depthFunc,THREE.LessEqualDepth);assert.equal(mesh.material.polygonOffset,true);
  assert.equal(mesh.material.polygonOffsetFactor,0);assert.equal(mesh.material.polygonOffsetUnits,-2);
  // Exercise the actual instanced triangles: the two patches overlap below
  // this opaque prop, while both remain present on the exposed floor beside it.
  const prop=new THREE.Mesh(new THREE.BoxGeometry(.6,.1,.6),new THREE.MeshStandardMaterial({color:0x829c73}));
  prop.position.y=.2;isolated.add(prop);isolated.updateMatrixWorld(true);
  assert.equal(prop.material.depthWrite,true);assert.equal(prop.material.transparent,false);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObjects([prop,mesh],false)[0].object,prop,'Opaque prop lies in front of both puddle surfaces');
  ray.set(new THREE.Vector3(.7,3,0),new THREE.Vector3(0,-1,0));
  assert.deepEqual([...new Set(ray.intersectObject(mesh,false).map(hit=>hit.instanceId))],[0,1],'Two overlapping instances remain independently rendered beside the occluder');
});
