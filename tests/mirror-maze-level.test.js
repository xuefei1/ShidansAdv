import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {World,RabbitController} from '../src/physics.js';
import {BASEMENT} from '../src/layout.js';
import {createMirrorMaze,MAZE_GLASS_OPACITY,MAZE_GLASS_COLOR} from '../src/mirror-maze.js';

function fixture() {
  const world=new World();world.basement=BASEMENT;
  world.addBox(0,-.11,0,48,.22,40,'wood');
  return {world,maze:createMirrorMaze({parent:new THREE.Group(),world,random:()=>.5})};
}
function rabbit(world,p) {
  const player=new RabbitController(world);Object.assign(player,{x:p.x,y:BASEMENT.y,z:p.z,surface:'concrete'});return player;
}
function moveTo(player,target,seconds=12) {
  for(let frame=0;frame<seconds*120;frame++) {
    const dx=target.x-player.x,dz=target.z-player.z,d=Math.hypot(dx,dz);
    if(d<.07&&Math.hypot(player.vx,player.vz)<.1)return true;
    player.update(1/120,{x:dx/Math.max(1,d),z:dz/Math.max(1,d)});
  }
  return false;
}
function path(layout,start,goal) {
  const previous=new Map([[start,null]]),queue=[start];
  for(let i=0;i<queue.length&&!previous.has(goal);i++)for(const next of layout.cells[queue[i]].links)if(!previous.has(next)){previous.set(next,queue[i]);queue.push(next);}
  const result=[];for(let id=goal;id!==null;id=previous.get(id))result.unshift(layout.cells[id]);return result;
}

test('physical openings and generated corridors reach the chamber from all four maze entrances',()=>{
  const {world,maze}=fixture();
  for(const gate of maze.layout.entrances) {
    const player=rabbit(world,gate.outside);
    for(const point of path(maze.layout,gate.cell,maze.layout.heart.cellIds[0]))assert.ok(moveTo(player,point),`blocked ${gate.side} corridor near ${point.id}, at ${player.x},${player.y},${player.z}`);
    assert.ok(moveTo(player,maze.layout.heart));assert.equal(player.y,BASEMENT.y);
  }
});

test('full-height privacy-glass barriers stop walking and charged jumps across a closed maze edge',()=>{
  const {world,maze}=fixture(),cells=maze.layout.cells;
  let a,b;
  for(const cell of cells) {
    const other=cells.find(next=>Math.abs(next.column-cell.column)+Math.abs(next.row-cell.row)===1&&!cell.links.includes(next.id));
    if(other){a=cell;b=other;break;}
  }
  const size=Math.hypot(b.x-a.x,b.z-a.z),player=rabbit(world,a),dx=(b.x-a.x)/size,dz=(b.z-a.z)/size;
  for(let i=0;i<120*2;i++)player.update(1/120,{x:dx,z:dz,run:true});
  assert.ok(Math.hypot(player.x-a.x,player.z-a.z)<size/2);
  for(let i=0;i<90;i++)player.update(1/120,{jump:true});player.update(1/120,{x:dx,z:dz});
  for(let i=0;i<120*3;i++)player.update(1/120,{x:dx,z:dz,run:true});
  assert.ok(Math.hypot(player.x-a.x,player.z-a.z)<size/2);assert.equal(player.y,BASEMENT.y);
});

test('frosted glass uses one blue, light-independent 92%-opaque surface per wall with bounded coplanar batches',()=>{
  const {maze}=fixture();assert.ok(maze.panels.length>=20&&maze.panels.length<=30);
  assert.equal(maze.panes,maze.panels);assert.equal(maze.fallbackMaterial,maze.glassMaterial);
  assert.equal(MAZE_GLASS_OPACITY,.92);
  assert.equal(maze.glassMaterial.isMeshBasicMaterial,true,'warm and cool lights cannot tint opposite pane normals differently');
  assert.equal(maze.glassMaterial.color.getHex(),MAZE_GLASS_COLOR);
  assert.equal(maze.glassMaterial.opacity,.92);assert.ok(1-maze.glassMaterial.opacity>=.05&&1-maze.glassMaterial.opacity<=.10);
  assert.equal(maze.glassMaterial.transparent,true);assert.equal(maze.glassMaterial.forceSinglePass,true);
  assert.equal(maze.glassMaterial.side,THREE.DoubleSide);assert.equal(maze.glassMaterial.depthWrite,false);
  assert.equal(maze.glassMaterial.envMap,null);assert.equal(maze.glassMaterial.transmission,undefined);
  assert.equal(maze.glassMaterial.map.image.width,64);assert.equal(maze.glassMaterial.map.image.height,64);
  assert.equal(maze.glassMaterial.map.minFilter,THREE.LinearMipmapLinearFilter);
  assert.equal(maze.group.children[0].children.length,1);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
  let triangles=0;
  for(const panel of maze.panels) {
    const positions=panel.mesh.geometry.getAttribute('position');
    triangles+=positions.count/3;
    a.fromBufferAttribute(positions,0);b.fromBufferAttribute(positions,1);c.fromBufferAttribute(positions,2);
    normal.crossVectors(b.clone().sub(a),c.clone().sub(a)).normalize();assert.ok(normal.dot(panel.normal)>.9999);
    assert.equal(panel.mesh.userData.dynamicMaze,true);assert.equal(panel.mesh.userData.mazeGlass,true);
    assert.equal(panel.mesh.userData.mazeMirror,undefined);
    assert.equal(panel.mesh.material.isMeshBasicMaterial,true);
    assert.equal(panel.mesh.material.color.getHex(),MAZE_GLASS_COLOR);
    for(let i=0;i<positions.count;i++){a.fromBufferAttribute(positions,i);assert.ok(Math.abs(a.sub(panel.point).dot(panel.normal))<1e-5);}
  }
  assert.equal(triangles,maze.layout.walls.length*2,'a single centered plane replaces the old front/back mirror layers');
});

test('opaque frames leave pane centers clear so the 8% view is not hidden behind full wall cores',()=>{
  const {maze}=fixture();maze.group.updateWorldMatrix(true,true);
  const wall=maze.layout.walls.find(w=>w.length>=maze.layout.bounds.cellSize);
  const alongX=wall.axis==='x',at=wall.start+maze.layout.bounds.cellSize*.5;
  const origin=new THREE.Vector3(alongX?at:wall.coordinate+.25,BASEMENT.y+1.25,alongX?wall.coordinate+.25:at);
  const direction=new THREE.Vector3(alongX?0:-1,0,alongX?-1:0),ray=new THREE.Raycaster(origin,direction,0,.5);
  assert.equal(ray.intersectObject(maze.group.children[0],true).length,0,'only rails and posts are opaque');
  const panes=maze.panels.map(panel=>panel.mesh),front=ray.intersectObjects(panes);
  assert.equal(new Set(front.map(hit=>hit.object)).size,1);assert.ok(Math.abs(front[0].distance-.25)<1e-6);
  ray.ray.origin.addScaledVector(direction,.5);ray.ray.direction.negate();
  const back=ray.intersectObjects(panes);assert.equal(new Set(back.map(hit=>hit.object)).size,1);
  assert.equal(back[0].object,front[0].object,'both viewing sides share one opacity layer');
});

test('regeneration removes warm collision entries and only disposes geometry owned by the maze',()=>{
  const {world,maze}=fixture(),oldWalls=[...maze.walls],oldPanels=maze.panels,first=maze.revision;
  world.query(-20,-16,21,16);world.queryDynamic(-20,-16,21,16);
  let grainDisposed=0,glassDisposed=0;
  const grain=maze.glassMaterial.map;
  grain.addEventListener('dispose',()=>grainDisposed++);maze.glassMaterial.addEventListener('dispose',()=>glassDisposed++);
  const reflectionMaterial=new THREE.MeshBasicMaterial();let rendererMaterialDisposed=false;
  reflectionMaterial.addEventListener('dispose',()=>rendererMaterialDisposed=true);maze.panels[0].mesh.material=reflectionMaterial;
  for(let i=0;i<12;i++)maze.regenerate();
  assert.equal(grainDisposed,0);assert.equal(glassDisposed,0);assert.equal(maze.glassMaterial.map,grain);
  assert.equal(rendererMaterialDisposed,false);assert.notEqual(maze.panels,oldPanels);assert.equal(maze.revision,first+12);
  assert.equal(world.dynamicBoxes.size,maze.walls.length);assert.ok(oldWalls.every(w=>!world.solids.includes(w)));
  assert.ok(world.queryDynamic(-20,-16,22,16).every(w=>maze.walls.includes(w)));
  maze.dispose();assert.equal(world.dynamicBoxes.size,0);assert.equal(maze.group.parent,null);assert.equal(rendererMaterialDisposed,false);
  assert.equal(grainDisposed,1);assert.equal(glassDisposed,1);reflectionMaterial.dispose();
});
