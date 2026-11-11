import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse,batchStaticGeometry} from '../src/house.js';
import {createMirrorMaze} from '../src/mirror-maze.js';
import {MAZE_LAYOUTS,getMazeLayout} from '../src/maze-layout-catalog.js';
import {mazeCeilingLampPlacements,LAMP_PLACEMENTS} from '../src/house-lamps.js';
import {BASEMENT} from '../src/layout.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} differs from ${b}`);
const overlaps=(a,b)=>['X','Y','Z'].every(axis=>Math.min(a[`max${axis}`],b[`max${axis}`])-Math.max(a[`min${axis}`],b[`min${axis}`])>1e-6);
const asBox=b=>({minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z});
const assemblyColors=[0xa78a63,0x998365,0xf3debd].map(hex=>new THREE.Color(hex));

function fixture(layout) {
  const house=createHouse(new THREE.Scene(),{basementType:'maze',basementLayout:layout});
  const maze=createMirrorMaze({parent:house.basement,world:house.world,layoutProvider:()=>layout});
  house.group.updateWorldMatrix(true,true);
  return {...house,maze};
}

test('all five maze grids give the six existing lamps the same clear cell-center positions',()=>{
  let first;
  for(const design of MAZE_LAYOUTS) {
    const layout=getMazeLayout(design.id),placements=mazeCeilingLampPlacements(layout);
    assert.equal(placements.length,6);
    const positions=placements.map(({id,x,y,z,cellId})=>({id,x,y,z,cellId}));
    if(first)assert.deepEqual(positions,first,'a new layout does not leave baked lights at obsolete coordinates');else first=positions;
    for(const lamp of placements) {
      const cell=layout.cells[lamp.cellId];assert.ok(cell);
      assert.equal(lamp.x,cell.x);assert.equal(lamp.z,cell.z);assert.equal(lamp.y,BASEMENT.y+3.48);
      assert.ok([2,7,13].includes(cell.column));assert.ok([2,9].includes(cell.row));
    }
  }
  assert.deepEqual(mazeCeilingLampPlacements(null),LAMP_PLACEMENTS.filter(lamp=>lamp.floor===-1),'utility-room positions remain authored independently');
});

test('every actual pendant assembly, shade collider and diffuser clears maze walls and the stair enclosure in all five designs',()=>{
  for(const design of MAZE_LAYOUTS) {
    const layout=getMazeLayout(design.id),house=fixture(layout),fixtures=house.lamps.fixtures.filter(lamp=>lamp.floor===-1);
    assert.equal(house.lamps.fixtures.length,24);assert.equal(house.lamps.groups.get(-1).count,6);
    for(const [index,lamp] of fixtures.entries()) {
      const visual=new THREE.Box3(),parts=[];
      house.basement.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.lampId===lamp.id){visual.union(new THREE.Box3().setFromObject(mesh));parts.push(mesh);}});
      assert.equal(parts.length,3,'cap, suspension rod and shade form one aligned assembly');
      const collider=house.lamps.colliders.find(box=>box.lampId===lamp.id);assert.ok(collider);
      close((collider.minX+collider.maxX)/2,lamp.x);close((collider.minZ+collider.maxZ)/2,lamp.z);
      const transform=new THREE.Matrix4();house.lamps.groups.get(-1).getMatrixAt(index,transform);
      const glow=new THREE.Vector3().setFromMatrixPosition(transform);close(glow.x,lamp.x);close(glow.y,lamp.y-.025);close(glow.z,lamp.z);
      visual.expandByPoint(new THREE.Vector3(lamp.x-.42,lamp.y-.0475,lamp.z-.42));
      visual.expandByPoint(new THREE.Vector3(lamp.x+.42,lamp.y-.0025,lamp.z+.42));
      const envelope=asBox(visual);
      assert.ok(envelope.maxY<BASEMENT.ceilingY-.005,'the mount stays below the painted ceiling');
      for(const wall of house.world.solids.filter(box=>box.verticalBarrier||box.mazeWall)) {
        assert.equal(overlaps(envelope,wall),false,`${design.id}: ${lamp.id} overlaps ${wall.id}`);
        assert.equal(overlaps(collider,wall),false,`${design.id}: shade collider overlaps ${wall.id}`);
      }
    }
  }
});

test('static batching preserves the relocated lamp geometry and live fixture/diffuser coordinates',()=>{
  for(const design of MAZE_LAYOUTS) {
    const house=fixture(getMazeLayout(design.id)),fixtures=house.lamps.fixtures.filter(lamp=>lamp.floor===-1);
    const expected=new Map(fixtures.map(lamp=>[lamp.id,new THREE.Box3()]));
    house.basement.traverse(mesh=>{if(mesh.isMesh&&expected.has(mesh.userData.lampId))expected.get(mesh.userData.lampId).union(new THREE.Box3().setFromObject(mesh));});
    batchStaticGeometry(house.basement);house.group.updateWorldMatrix(true,true);
    const actual=new Map(fixtures.map(lamp=>[lamp.id,new THREE.Box3()])),point=new THREE.Vector3();
    house.basement.traverse(mesh=>{
      const colors=mesh.geometry?.getAttribute('color'),positions=mesh.geometry?.getAttribute('position');
      if(!mesh.isMesh||!colors||!positions)return;
      for(let index=0;index<colors.count;index++) {
        if(!assemblyColors.some(color=>Math.abs(color.r-colors.getX(index))<1e-6&&Math.abs(color.g-colors.getY(index))<1e-6&&Math.abs(color.b-colors.getZ(index))<1e-6))continue;
        point.fromBufferAttribute(positions,index).applyMatrix4(mesh.matrixWorld);
        const lamp=fixtures.find(lamp=>Math.hypot(point.x-lamp.x,point.z-lamp.z)<.50);
        assert.ok(lamp,'every batched lamp vertex stays at its selected cell');actual.get(lamp.id).expandByPoint(point);
      }
    });
    for(const lamp of fixtures)for(const side of ['min','max'])for(const axis of ['x','y','z'])close(actual.get(lamp.id)[side][axis],expected.get(lamp.id)[side][axis]);
  }
});
