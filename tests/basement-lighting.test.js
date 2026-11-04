import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouseLamps,LAMP_PLACEMENTS} from '../src/house-lamps.js';
import {createDayLighting,LOCAL_LIGHT_LIMIT} from '../src/day-lighting.js';
import {World} from '../src/physics.js';
import {BASEMENT,BASEMENT_STAIRS,FLOOR_HEIGHT as H} from '../src/layout.js';
import {upperRoomsVisible,basementRoomsVisible} from '../src/visibility.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function setup(){
  const scene=new THREE.Scene();scene.background=new THREE.Color();scene.fog=new THREE.Fog(0,140,260);
  const parents={ground:new THREE.Group(),upper:new THREE.Group(),basement:new THREE.Group(),world:new World()};
  scene.add(parents.ground,parents.upper,parents.basement);
  const lamps=createHouseLamps(parents),sun=new THREE.DirectionalLight(),fill=new THREE.DirectionalLight(),hemisphere=new THREE.HemisphereLight();
  return {scene,parents,lamps,lighting:createDayLighting(scene,{sun,fill,hemisphere},lamps),camera:new THREE.PerspectiveCamera()};
}

test('six basement pendants mount below the slab, with their own glow batch and physical shades',()=>{
  const {parents,lamps}=setup(),fixtures=LAMP_PLACEMENTS.filter(f=>f.floor===-1);
  assert.equal(fixtures.length,6);assert.equal(lamps.groups.get(-1).parent,parents.basement);
  assert.equal(lamps.groups.get(-1).count,6);assert.notEqual(lamps.basementGlowMaterial,lamps.glowMaterial);
  for(const fixture of fixtures){
    assert.equal(fixture.kind,'ceiling');close(fixture.y,BASEMENT.y+3.48);
    const shade=parents.basement.getObjectByName(fixture.id);assert.ok(shade);
    assert.ok(lamps.colliders.some(b=>fixture.x>=b.minX&&fixture.x<=b.maxX&&fixture.z>=b.minZ&&fixture.z<=b.maxZ&&fixture.y+.18>=b.minY&&fixture.y+.18<=b.maxY));
  }
  parents.basement.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(parents.basement);assert.ok(bounds.max.y<BASEMENT.ceilingY-.005);
});

test('basement lights have a dim noon baseline and warm to full night without extra point lights',()=>{
  const {scene,lamps,lighting,camera}=setup(),player={x:0,y:BASEMENT.y,z:0};
  lighting.update(0,player,camera);
  assert.equal(lighting.slots.length,LOCAL_LIGHT_LIMIT);assert.ok(lighting.slots.every(s=>s.fixture.floor===-1));
  close(lamps.glowMaterial.emissiveIntensity,0);close(lamps.basementGlowMaterial.emissiveIntensity,.22*2.8);
  const noon=lighting.slots[0].light.intensity,noonColor=lighting.slots[0].light.color.clone();close(noon,.22*32);
  lighting.update(480,player,camera);close(lighting.slots[0].light.intensity,32);
  close(lamps.basementGlowMaterial.emissiveIntensity,2.8);assert.ok(!lighting.slots[0].light.color.equals(noonColor));
  let points=0;scene.traverse(object=>{if(object.isPointLight){points++;assert.equal(object.castShadow,false);}});assert.equal(points,4);
});

test('all four light slots follow the current floor even at basement corners and across floor transitions',()=>{
  const {lamps,lighting,camera}=setup();
  for(const x of [-23,0,23])for(const z of [-19,0,19]){
    lighting.update(480,{x,y:BASEMENT.y,z},camera);
    assert.ok(lighting.slots.every(s=>s.fixture.floor===-1&&s.light.position.y<0));
  }
  for(const [floor,y]of [[0,0],[1,H],[-1,BASEMENT.y]]){
    lighting.update(480,{x:0,y,z:-10},camera,.016);
    assert.ok(lighting.slots.every(s=>s.fixture.floor===floor));
  }
  lighting.update(0,{x:0,y:0,z:0},camera);assert.ok(lighting.slots.every(s=>s.light.intensity===0));
  close(lamps.basementGlowMaterial.emissiveIntensity,.22*2.8);
});

test('the basement stairs reveal their own level throughout travel without revealing upstairs',()=>{
  const r=BASEMENT_STAIRS,x=(r.minX+r.maxX)/2;let visible=false;
  for(const t of [...Array.from({length:31},(_,i)=>i/30),...Array.from({length:31},(_,i)=>1-i/30)]){
    const player={x,y:r.baseY+t*r.height,z:r.startZ+t*(r.endZ-r.startZ)};
    visible=basementRoomsVisible(player,visible);assert.equal(visible,true,`basement progress ${t}`);
    assert.equal(upperRoomsVisible(player),false,`upstairs incorrectly revealed at basement progress ${t}`);
  }
  assert.equal(basementRoomsVisible({x,y:0,z:r.endZ+.7}),true);
  assert.equal(basementRoomsVisible({x,y:0,z:r.endZ+1.1}),true,'reveal the stairwell before its upper lip enters the camera');
  assert.equal(basementRoomsVisible({x,y:0,z:r.endZ+2},true),false);
  assert.equal(basementRoomsVisible({x:2.5,y:0,z:16}),false);
  assert.equal(upperRoomsVisible({x:2.5,y:0,z:16}),true);
});
