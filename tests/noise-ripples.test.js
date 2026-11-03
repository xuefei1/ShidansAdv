import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { World } from '../src/physics.js';
import { FLOOR_HEIGHT, STAIRS } from '../src/layout.js';
import { createNoiseRipples, MAX_NOISE_RIPPLES, RIPPLE_SECONDS, RIPPLE_DELAY, RIPPLE_CLEARANCE } from '../src/noise-ripples.js';

const event = (id=1,kind='sprint',scope='local',position={x:0,y:0,z:0}) => ({id,kind,scope,position});
const setup = () => {const scene=new THREE.Scene(),world=new World();return {scene,world,ripples:createNoiseRipples(scene,world)};};
const matrixAt = (mesh,index=0) => {const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);return matrix;};
const pointAt = (mesh,index=0) => new THREE.Vector3().setFromMatrixPosition(matrixAt(mesh,index));
const scaleAt = (mesh,index=0) => new THREE.Vector3().setFromMatrixScale(matrixAt(mesh,index));
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-6,`${actual} differs from ${expected}`);

test('noise creates a small anchored expanding cue with delayed secondary rings',()=>{
  const {ripples}=setup(),source=event(1,'long-jump','local',{x:-8,y:0,z:12});
  ripples.emit([source]);assert.equal(ripples.count,2);assert.equal(ripples.visibleCount,1);
  source.position.x=30;
  ripples.update(.2);assert.equal(ripples.visibleCount,2);
  const point=pointAt(ripples.mesh);close(point.x,-8);close(point.y,RIPPLE_CLEARANCE);close(point.z,12);
  const firstScale=scaleAt(ripples.mesh);assert.ok(firstScale.x>.32 && firstScale.x<1.5);close(firstScale.y,1);
  const alpha=ripples.mesh.geometry.attributes.rippleOpacity.array[0];assert.ok(alpha>0 && alpha<.23);
  ripples.update(.2);assert.ok(scaleAt(ripples.mesh).x>firstScale.x);
});

test('house-wide chewing has three restrained gold rings instead of a house-sized sheet',()=>{
  const {ripples}=setup();ripples.emit([event(1,'eat','house')]);
  assert.equal(ripples.count,3);ripples.update(.4);assert.equal(ripples.visibleCount,3);
  assert.ok(scaleAt(ripples.mesh).x<2.05);
  const color=ripples.mesh.geometry.attributes.rippleTint;
  assert.ok(color.getX(0)>color.getZ(0),'warm gold distinguishes chewing');
  assert.ok(ripples.mesh.geometry.attributes.rippleOpacity.getX(0)<=.26);
});

test('mistress laughter and cooking use independent bounded ripple pools',()=>{
  const {scene,world,ripples}=setup(),household=createNoiseRipples(scene,world);
  household.emit([event(1,'laugh','house',{x:-15.8,y:0,z:5.3})]);
  ripples.emit([event(1,'sprint','local')]);
  household.emit([event(2,'cook','house',{x:20.7,y:0,z:10.5})]);
  assert.equal(household.count,6);assert.equal(ripples.count,2);
  household.update(.3);assert.equal(household.visibleCount,6);
  household.clear();assert.equal(household.count,0);assert.equal(ripples.count,2);
  assert.equal(scene.children.length,2);assert.equal(world.solids.length,0);
});

test('catch-up household pulses retain their age rather than starting a new ripple burst',()=>{
  const {ripples}=setup();ripples.emit([{...event(1,'cook','house'),time:3}],4);
  assert.equal(ripples.count,2);ripples.update(.2);assert.equal(ripples.count,0);
  ripples.emit([{...event(2,'laugh','house'),time:3}],5);assert.equal(ripples.count,0);
});

test('additional noisy mistress routines share the existing household ripple pool',()=>{
  const {ripples}=setup();
  for(const [index,kind] of ['vacuum','hum','typing','watering'].entries())ripples.emit([{...event(index+1,kind,'house'),source:'mistress'}]);
  assert.equal(ripples.count,12);ripples.update(.3);assert.equal(ripples.visibleCount,12);
  ripples.emit([{...event(10,'unknown','house'),source:'shidan'}]);assert.equal(ripples.count,12);
});

test('ripples age only with positive simulation time and disappear after their final delayed ring',()=>{
  const {ripples}=setup();ripples.emit([event(1,'eat','house')]);ripples.update(.2);
  const version=ripples.mesh.instanceMatrix.version,before=matrixAt(ripples.mesh).clone(),alpha=ripples.mesh.geometry.attributes.rippleOpacity.getX(0);
  for(const dt of [0,-1,NaN,Infinity])ripples.update(dt);
  assert.equal(ripples.mesh.instanceMatrix.version,version);assert.ok(matrixAt(ripples.mesh).equals(before));
  assert.equal(ripples.mesh.geometry.attributes.rippleOpacity.getX(0),alpha);
  ripples.update(RIPPLE_SECONDS+RIPPLE_DELAY*2);assert.equal(ripples.count,0);assert.equal(ripples.visibleCount,0);
});

test('the ripple pool stays bounded and clear permits a fresh round with recycled event IDs',()=>{
  const {ripples}=setup();
  for(let id=1;id<=1000;id++)ripples.emit([event(id,'eat','house',{x:id/10,y:0,z:0})]);
  assert.equal(ripples.count,MAX_NOISE_RIPPLES);assert.ok(ripples.visibleCount<=MAX_NOISE_RIPPLES);
  assert.equal(ripples.mesh.instanceMatrix.count,MAX_NOISE_RIPPLES);
  ripples.clear();assert.equal(ripples.count,0);assert.equal(ripples.visibleCount,0);
  ripples.emit([event(1)]);assert.equal(ripples.count,2);
  ripples.emit([event(1)]);assert.equal(ripples.count,2,'reusing an active event never duplicates rings');
});

test('shared ring geometry and material are stable with no collision or shadow additions',()=>{
  const {scene,world,ripples}=setup(),geometry=ripples.mesh.geometry,material=ripples.mesh.material;
  assert.equal(scene.children.length,1);assert.ok(ripples.mesh.isInstancedMesh);
  assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);assert.equal(material.depthTest,true);
  assert.equal(material.polygonOffset,true);assert.equal(material.polygonOffsetFactor,0);assert.equal(material.polygonOffsetUnits,-2);
  assert.equal(ripples.mesh.castShadow,false);assert.equal(ripples.mesh.receiveShadow,false);
  assert.equal(ripples.mesh.frustumCulled,false);assert.equal(world.solids.length,0);
  for(let id=0;id<30;id++){ripples.emit([event(id)]);ripples.update(.1);}
  assert.equal(ripples.mesh.geometry,geometry);assert.equal(ripples.mesh.material,material);assert.equal(scene.children.length,1);
  assert.ok(material.vertexShader.includes('instanceMatrix'));assert.ok(material.fragmentShader.includes('softEdge'));
});

test('floor markings follow real table and stair support and ignore a movable snack under Shidan',()=>{
  const {world,ripples}=setup();world.addBox(-10,.75,12,2,1.5,2);
  const snack=world.addDynamicBox(-10,1.6,12,.4,.2,.4);snack.pushable=true;
  ripples.emit([event(1,'eat','house',{x:-10,y:1.7,z:12})]);
  close(pointAt(ripples.mesh).y,1.5+RIPPLE_CLEARANCE);
  ripples.clear();
  const x=(STAIRS.minX+STAIRS.maxX)/2,z=(STAIRS.startZ+STAIRS.endZ)/2,y=FLOOR_HEIGHT/2;
  ripples.emit([event(2,'sprint','local',{x,y,z})]);close(pointAt(ripples.mesh).y,y+RIPPLE_CLEARANCE);
});

test('cutaway hiding removes upper interior rings while retaining ground and outdoor balcony cues',()=>{
  const {world,ripples}=setup();world.addBox(0,FLOOR_HEIGHT-.1,-10,10,.2,10);
  world.addBox(0,FLOOR_HEIGHT-.1,-22,10,.2,3);
  ripples.emit([event(1,'sprint','local',{x:0,y:0,z:12}),event(2,'eat','house',{x:0,y:FLOOR_HEIGHT,z:-10}),event(3,'sprint','local',{x:0,y:FLOOR_HEIGHT,z:-22})]);
  ripples.update(.3);assert.equal(ripples.visibleCount,7);
  ripples.setUpperVisible(false);assert.equal(ripples.visibleCount,4);
  for(let i=0;i<ripples.visibleCount;i++) {
    const position=pointAt(ripples.mesh,i);assert.ok(position.y<FLOOR_HEIGHT || position.z<-20);
  }
  const version=ripples.mesh.instanceMatrix.version;ripples.setUpperVisible(false);assert.equal(ripples.mesh.instanceMatrix.version,version);
  ripples.setUpperVisible(true);assert.equal(ripples.visibleCount,7);
});

test('invalid events are silent and support is sampled only once per accepted event',()=>{
  const scene=new THREE.Scene();let queries=0;
  const ripples=createNoiseRipples(scene,{support(x,z,maxHeight,ignorePushables){queries++;assert.equal(ignorePushables,true);return {y:0};}});
  ripples.emit([null,{},event(1,'walk'),event(2,'eat','house',{x:NaN,y:0,z:0})]);assert.equal(ripples.count,0);assert.equal(queries,0);
  ripples.emit([event(3,'eat','house')]);assert.equal(queries,1);
  for(let i=0;i<30;i++)ripples.update(1/60);assert.equal(queries,1);
});

test('walking footfalls use one subtle red ring and chasing footfalls use two stronger rings',()=>{
  const {ripples}=setup();
  const footfall=(id,gait)=>({...event(id,'footstep','local'),source:'mistress',gait});
  ripples.emit([footfall(1,'walk')]);assert.equal(ripples.count,1);ripples.update(.3);
  const slowAlpha=ripples.mesh.geometry.attributes.rippleOpacity.getX(0),slowRadius=scaleAt(ripples.mesh).x;
  const color=ripples.mesh.geometry.attributes.rippleTint;
  assert.ok(color.getX(0)>color.getZ(0));assert.ok(slowAlpha>0&&slowAlpha<.13);assert.ok(slowRadius<.85);
  ripples.clear();ripples.emit([footfall(1,'run')]);assert.equal(ripples.count,2);ripples.update(.3);
  assert.equal(ripples.visibleCount,2);assert.ok(ripples.mesh.geometry.attributes.rippleOpacity.getX(0)>slowAlpha);
  assert.ok(scaleAt(ripples.mesh).x>slowRadius);assert.ok(scaleAt(ripples.mesh).x<1.25);
  ripples.emit([footfall(1,'run')]);assert.equal(ripples.count,2,'one footfall never duplicates');
  ripples.update(RIPPLE_SECONDS+RIPPLE_DELAY);assert.equal(ripples.count,0);
});
