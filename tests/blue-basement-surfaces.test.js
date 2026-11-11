import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse,batchStaticGeometry} from '../src/house.js';
import {BASEMENT_WALL_COLOR,MAZE_BASEMENT_SURFACE_COLOR} from '../src/basement.js';
import {BASEMENT} from '../src/layout.js';
import {createMirrorMaze,MAZE_GLASS_COLOR} from '../src/mirror-maze.js';

test('all four perimeter walls are the same sky blue in utility and maze basements, including batched geometry',()=>{
  const expected=new THREE.Color(BASEMENT_WALL_COLOR);
  assert.equal(BASEMENT_WALL_COLOR,0x87ceeb);
  for(const basementType of ['utility','mirror-maze']) {
    const house=createHouse(new THREE.Scene(),{basementType});
    const walls=[];
    house.basement.traverse(mesh=>{if(mesh.name.startsWith('basement-wall:'))walls.push(mesh);});
    assert.deepEqual(walls.map(wall=>wall.name).sort(),['basement-wall:east','basement-wall:front','basement-wall:rear','basement-wall:west']);
    for(const wall of walls) {
      assert.equal(wall.material.color.getHex(),BASEMENT_WALL_COLOR);
      assert.equal(wall.userData.collider.verticalBarrier,true);
      assert.ok(Math.abs(wall.userData.collider.minY-BASEMENT.y)<1e-9);
      assert.ok(Math.abs(wall.userData.collider.maxY-BASEMENT.ceilingY)<1e-9);
    }
    // Render batching bakes the tint into vertex colours, so the wall colour
    // must survive after the game combines the static basement geometry.
    const wallGroup=new THREE.Group();for(const wall of walls)wallGroup.attach(wall);
    batchStaticGeometry(wallGroup);
    wallGroup.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const colors=mesh.geometry.getAttribute('color');assert.ok(colors);
      for(let index=0;index<colors.count;index++) {
        assert.ok(Math.abs(colors.getX(index)-expected.r)<1e-6);
        assert.ok(Math.abs(colors.getY(index)-expected.g)<1e-6);
        assert.ok(Math.abs(colors.getZ(index)-expected.b)<1e-6);
      }
    });
  }
});

test('front and back pane hits share the same unlit blue surface despite opposed warm/cool lighting',()=>{
  const scene=new THREE.Scene(),house=createHouse(scene,{basementType:'mirror-maze'});
  const maze=createMirrorMaze({parent:house.basement,world:house.world,random:()=>.5});
  const warm=new THREE.DirectionalLight(0xffa000,10),cool=new THREE.DirectionalLight(0x0066ff,10);
  warm.position.set(8,2,6);cool.position.set(-8,2,-6);scene.add(warm,cool);
  maze.group.updateWorldMatrix(true,true);
  const wall=maze.layout.walls.find(wall=>wall.length>=maze.layout.bounds.cellSize),alongX=wall.axis==='x';
  const at=wall.start+maze.layout.bounds.cellSize*.5;
  const center=new THREE.Vector3(alongX?at:wall.coordinate,BASEMENT.y+1.25,alongX?wall.coordinate:at);
  const normal=new THREE.Vector3(alongX?0:1,0,alongX?1:0),panes=maze.panels.map(panel=>panel.mesh);
  const front=new THREE.Raycaster(center.clone().addScaledVector(normal,.3),normal.clone().negate(),0,.6).intersectObjects(panes)[0];
  const back=new THREE.Raycaster(center.clone().addScaledVector(normal,-.3),normal,0,.6).intersectObjects(panes)[0];
  assert.ok(front&&back);assert.equal(front.object,back.object);
  const material=front.object.material;
  assert.equal(material.isMeshBasicMaterial,true,'pane shading has no dependence on the opposed scene lights');
  assert.equal(material.color.getHex(),MAZE_GLASS_COLOR);
  assert.ok(material.color.b>material.color.g&&material.color.g>material.color.r,'both faces carry a blue tint');
  assert.equal(material.opacity,.92);assert.equal(material.forceSinglePass,true);
});

test('maze-only blue floor and ceiling paint preserves the ground-floor faces and utility concrete',()=>{
  const expected=new THREE.Color(MAZE_BASEMENT_SURFACE_COLOR),neutral=new THREE.Color(0xb4b2aa);
  for(const basementType of ['maze','mirror-maze','utility','future-content']) {
    const maze=['maze','mirror-maze'].includes(basementType),house=createHouse(new THREE.Scene(),{basementType});
    const floor=house.basement.getObjectByName('basement-floor');
    assert.equal(floor.material.color.getHex(),maze?MAZE_BASEMENT_SURFACE_COLOR:0x9b9e9b);
    assert.equal(floor.userData.collider.surface,'concrete');assert.equal(floor.userData.collider.maxY,BASEMENT.y);
    house.basementCeiling.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const normals=mesh.geometry.getAttribute('normal'),colors=mesh.geometry.getAttribute('color');
      if(!maze){assert.equal(colors,undefined);assert.equal(mesh.material.color.getHex(),0xb4b2aa);return;}
      assert.equal(mesh.material.vertexColors,true);
      for(let i=0;i<normals.count;i++) {
        const tint=normals.getY(i)<-.5?expected:neutral;
        for(const [axis,value] of [['X',tint.r],['Y',tint.g],['Z',tint.b]])assert.ok(Math.abs(colors[`get${axis}`](i)-value)<1e-6);
      }
    });
  }
});

test('maze ceiling underside stays blue after batching without overlay geometry or new colliders',()=>{
  const house=createHouse(new THREE.Scene(),{basementType:'maze'}),expected=new THREE.Color(MAZE_BASEMENT_SURFACE_COLOR),solids=house.world.solids.length;
  const oldVertices=house.basementCeiling.children.reduce((sum,mesh)=>sum+mesh.geometry.getAttribute('position').count,0);
  batchStaticGeometry(house.basementCeiling);
  let down=0,vertices=0;
  house.basementCeiling.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const normals=mesh.geometry.getAttribute('normal'),colors=mesh.geometry.getAttribute('color');vertices+=normals.count;
    for(let i=0;i<normals.count;i++)if(normals.getY(i)<-.5) {
      down++;
      assert.ok(Math.abs(colors.getX(i)-expected.r)<1e-6);assert.ok(Math.abs(colors.getY(i)-expected.g)<1e-6);assert.ok(Math.abs(colors.getZ(i)-expected.b)<1e-6);
    }
  });
  assert.equal(down,16);assert.equal(vertices,oldVertices);assert.equal(house.world.solids.length,solids);
});
