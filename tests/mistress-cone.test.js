import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { World } from '../src/physics.js';
import { FLOOR_HEIGHT, STAIRS, BOUNDS } from '../src/layout.js';
import { createHouse } from '../src/house.js';
import { createMistressCone, MISTRESS_VIEW_RANGE, MISTRESS_VIEW_ANGLE, MISTRESS_CONE_CLEARANCE } from '../src/mistress-cone.js';

const setup=(world=new World())=>{const scene=new THREE.Scene();return {scene,world,cone:createMistressCone(scene,world)};};
const points=cone=>{
  const attribute=cone.mesh.geometry.attributes.position,result=[];
  for(let i=0;i<attribute.count;i++)result.push({x:attribute.getX(i),y:attribute.getY(i),z:attribute.getZ(i)});
  return result;
};
const close=(a,b,epsilon=1e-4)=>assert.ok(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);

test('the patterned sector uses the detector’s ninety-degree angle and finite fifty-metre range',()=>{
  const {world,cone}=setup();world.ramps=[];
  const origin={x:0,y:0,z:-30};cone.update(0,{position:origin,yaw:0});
  close(MISTRESS_VIEW_ANGLE,Math.PI/2);assert.equal(MISTRESS_VIEW_RANGE,50);
  const vertices=points(cone);
  for(const p of vertices) {
    const dx=p.x-origin.x,dz=p.z-origin.z;
    assert.ok(Math.hypot(dx,dz)<=50.00001);assert.ok(Math.abs(Math.atan2(dx,dz))<=Math.PI/4+.00001);
    close(p.y,MISTRESS_CONE_CLEARANCE);
  }
  assert.ok(vertices.some(p=>Math.abs(p.x)<1e-5&&Math.abs(p.z-20)<1e-5),'unblocked centre reaches fifty metres');
  assert.ok(cone.mesh.material.fragmentShader.includes('mod(radius+2.5,5.0)'),'range arcs remain obvious');
});

test('the sector rotates with the mistress rather than the player camera',()=>{
  const {world,cone}=setup();world.ramps=[];
  const origin={x:-25,y:0,z:0};cone.update(0,{position:origin,yaw:Math.PI/2});
  const vertices=points(cone);
  assert.ok(vertices.every(p=>p.x>=origin.x));
  assert.ok(vertices.some(p=>Math.abs(p.x-25)<.0001&&Math.abs(p.z)<.0001));
  const revision=cone.revision;cone.update(.1,{position:origin,yaw:Math.PI});assert.equal(cone.revision,revision+1);
  assert.ok(points(cone).every(p=>p.z<=origin.z+.0001));
});

test('opaque walls and tall furniture clip the floor pattern, while closed glass does not',()=>{
  const world=new World();world.ramps=[];
  const wall=world.addBox(0,2,5,40,4,.2);wall.id='opaque-wall';
  const {cone}=setup(world);cone.update(0,{position:{x:0,y:0,z:0},yaw:0});
  assert.ok(points(cone).every(p=>p.z<4.9));
  const glassWorld=new World();glassWorld.ramps=[];
  const glass=glassWorld.addBox(0,2,5,40,4,.06);glass.id='glass:front:0';
  const throughGlass=setup(glassWorld).cone;throughGlass.update(0,{position:{x:0,y:0,z:0},yaw:0});
  assert.ok(points(throughGlass).some(p=>p.z>20));
  const furniture=new World();furniture.ramps=[];furniture.addBox(0,1.4,3,4,2.8,1);
  const aroundShelf=setup(furniture).cone;aroundShelf.update(0,{position:{x:0,y:0,z:0},yaw:0});
  assert.ok(points(aroundShelf).filter(p=>Math.abs(p.x)<.00001).every(p=>p.z<2.5));
});

test('eye-height clipping and permanent-support filtering keep sitting and moving food stable',()=>{
  const world=new World();world.ramps=[];
  const support=world.addBox(0,.5,0,2,1,2);support.id='sofa';
  const loose=world.addDynamicBox(0,2,3,20,4,.2);loose.pushable=true;
  const {cone}=setup(world);cone.update(0,{position:{x:0,y:0,z:0},yaw:0,eyeHeight:2.1});
  assert.ok(points(cone).some(p=>p.z>20),'the support and movable props cannot erase her cone');
  const lowCover=new World();lowCover.ramps=[];lowCover.addBox(0,.75,3,20,1.5,.2);
  const lowCone=setup(lowCover).cone;lowCone.update(0,{position:{x:0,y:0,z:0},yaw:0,eye:{y:1.2}});
  assert.ok(points(lowCone).every(p=>p.z<2.9),'lying/seated eye height can be supplied by the model');
});

test('floor sampling follows stairs, upper carpet and the outdoor balcony without raising downstairs markings',()=>{
  const world=new World();
  world.addBox(0,FLOOR_HEIGHT-.14,-9,48,.28,22,'carpet');
  world.addBox(2,FLOOR_HEIGHT-.14,-22.5,44,.28,5,'deck');
  const {cone}=setup(world),x=(STAIRS.minX+STAIRS.maxX)/2,z=(STAIRS.startZ+STAIRS.endZ)/2;
  cone.update(0,{position:{x,y:FLOOR_HEIGHT/2,z},yaw:Math.PI});
  const rampPoints=points(cone).filter(p=>world.rampAt(p.x,p.z));
  assert.ok(rampPoints.length>0);assert.ok(rampPoints.some(p=>p.y>FLOOR_HEIGHT/2));
  for(const p of rampPoints)assert.ok(p.y>world.rampHeight(p.x,p.z)+.08);
  assert.ok(points(cone).some(p=>p.y>=FLOOR_HEIGHT&&p.z<2));
  cone.update(.1,{position:{x:0,y:0,z:1},yaw:Math.PI});
  assert.ok(points(cone).every(p=>p.y<FLOOR_HEIGHT),'ground-floor source cannot paint the upstairs slab');
  cone.update(.1,{position:{x:0,y:FLOOR_HEIGHT,z:-22.5},yaw:0});
  assert.ok(points(cone).some(p=>p.y>=FLOOR_HEIGHT&&p.z>=-25&&p.z<=-20));
});

test('triangles never form a hanging translucent sheet across an upstairs floor edge',()=>{
  const world=new World();world.ramps=[];world.addBox(0,FLOOR_HEIGHT-.14,-9,48,.28,22,'carpet');
  const {cone}=setup(world);cone.update(0,{position:{x:0,y:FLOOR_HEIGHT,z:-1},yaw:0});
  const geometry=cone.mesh.geometry,position=geometry.attributes.position,index=geometry.index;
  assert.ok(points(cone).some(p=>p.y<FLOOR_HEIGHT));assert.ok(points(cone).some(p=>p.y>=FLOOR_HEIGHT));
  for(let i=0;i<geometry.drawRange.count;i+=3) {
    const heights=[0,1,2].map(offset=>position.getY(index.getX(i+offset)));
    assert.ok(Math.max(...heights)-Math.min(...heights)<.35);
  }
});

test('cutaway and play visibility hide the right floor, while chase and masking change only uniforms',()=>{
  const {cone}=setup(),position={x:0,y:FLOOR_HEIGHT,z:-10};
  cone.update(0,{position,yaw:0,upperVisible:false});assert.equal(cone.mesh.visible,false);
  cone.update(0,{position,yaw:0,upperVisible:true});assert.equal(cone.mesh.visible,true);
  const version=cone.mesh.geometry.attributes.position.version,routine=cone.mesh.material.uniforms.coneColor.value.clone();
  cone.update(.01,{position,yaw:0,phase:'chase'});
  assert.ok(cone.mesh.material.uniforms.coneColor.value.r>routine.r);assert.equal(cone.mesh.geometry.attributes.position.version,version);
  cone.update(.01,{position,yaw:0,masked:true});assert.ok(cone.mesh.material.uniforms.coneColor.value.b>cone.mesh.material.uniforms.coneColor.value.r);
  cone.update(0,{position,yaw:0,visible:false});assert.equal(cone.mesh.visible,false);
  cone.update(0,{position:{x:0,y:FLOOR_HEIGHT,z:-22},yaw:0,upperVisible:false});assert.equal(cone.mesh.visible,true,'outdoor balcony remains a visible layer');
});

test('projection is throttled, pools stay fixed and reset reuses warmed geometry and shader',()=>{
  const {scene,world,cone}=setup(),geometry=cone.mesh.geometry,material=cone.mesh.material;
  const position=geometry.attributes.position,index=geometry.index,coordinates=geometry.attributes.conePoint;
  const solidCount=world.solids.length;cone.update(0,{position:{x:0,y:0,z:0},yaw:0});
  const first=cone.revision;
  for(let step=1;step<=9;step++)cone.update(.01,{position:{x:step*.01,y:0,z:0},yaw:0});
  assert.equal(cone.revision,first);cone.update(.011,{position:{x:.1,y:0,z:0},yaw:0});assert.equal(cone.revision,first+1);
  for(let step=0;step<100;step++)cone.update(.1,{position:{x:Math.sin(step)*2,y:0,z:0},yaw:step*.1});
  assert.equal(cone.mesh.geometry,geometry);assert.equal(cone.mesh.material,material);
  assert.equal(geometry.attributes.position,position);assert.equal(geometry.attributes.conePoint,coordinates);assert.equal(geometry.index,index);
  assert.equal(scene.children.length,1);assert.equal(world.solids.length,solidCount);assert.ok(position.count<400);
  assert.equal(cone.mesh.castShadow,false);assert.equal(cone.mesh.receiveShadow,false);
  assert.equal(material.depthWrite,false);assert.equal(material.depthTest,true);assert.equal(material.polygonOffset,true);
  cone.clear();assert.equal(geometry.drawRange.count,0);assert.equal(cone.mesh.visible,false);
  cone.update(0,{position:{x:0,y:0,z:0},yaw:0});assert.ok(geometry.drawRange.count>0);assert.equal(cone.mesh.geometry,geometry);
});

test('invalid positions and time are harmless, and the shader keeps the protected den unpainted',()=>{
  const {cone}=setup();cone.update(0,{position:{x:0,y:0,z:0},yaw:0});const revision=cone.revision;
  for(const dt of [NaN,Infinity,-1])cone.update(dt,{position:{x:10,y:0,z:10},yaw:0});
  assert.equal(cone.revision,revision);
  cone.update(0,{position:{x:NaN,y:0,z:0},yaw:0});assert.equal(cone.mesh.visible,false);
  assert.ok(cone.mesh.material.fragmentShader.includes('distance(worldPoint.xz,den.xy)<den.z'));
});

test('the full furnished house clips the living-room sector at its opaque walls',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene),cone=createMistressCone(scene,world);
  cone.update(0,{position:{x:-15.8,y:0,z:6.9},yaw:Math.PI/2,eyeHeight:2.3});
  assert.ok(points(cone).every(p=>Number.isFinite(p.x+p.y+p.z)));
  assert.ok(points(cone).every(p=>p.x<=BOUNDS.maxX+.001&&p.z<=BOUNDS.maxZ+.001));
  assert.ok(cone.ranges.some(range=>range<10));
});
