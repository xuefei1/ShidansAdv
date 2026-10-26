import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse,batchStaticGeometry} from '../src/house.js';
import {RabbitController} from '../src/physics.js';
import {PoopPhysics} from '../src/poop-physics.js';
import {FLOOR_HEIGHT as H,STAIRS} from '../src/layout.js';
import {CEILING_VOLUMES} from '../src/house-roof.js';

test('solid ceilings cover both low wings, all upstairs rooms and the full central stair hall',()=>{
  const scene=new THREE.Scene(),{world,roof,ceiling,upper,group}=createHouse(scene);
  assert.equal(ceiling.children.length,1);assert.equal(ceiling.children[0].geometry.index.count/3,12);
  for(const v of CEILING_VOLUMES) {
    const b=world.fixtures.get(v.id);assert.ok(b);
    for(const key of ['minX','maxX','minZ','maxZ'])assert.ok(Math.abs(b[key]-v[key])<1e-6,`${v.id} ${key}`);
    assert.ok(Math.abs(b.minY-v.bottom)<1e-6);assert.ok(Math.abs(b.maxY-v.top)<1e-6);
  }
  upper.visible=false;
  assert.equal(roof.ceilings.parent,group);assert.equal(roof.shell.parent,group);
  assert.equal(roof.ceilings.visible,true);assert.equal(roof.shell.visible,true);
});

test('Shidan and poop balls cannot jump through either floor ceiling',()=>{
  const {world}=createHouse(new THREE.Scene());
  for(const [x,y,z,ceilingY] of [[-16,3.1,12,3.9],[14,3.1,15,3.9],[-15,H+3.1,-8,H+3.9],[0,H+3.1,12,H+3.9]]) {
    const r=new RabbitController(world);Object.assign(r,{x,y,z,vy:9,grounded:false});
    r.update(.1);assert.ok(r.y+r.height<=ceilingY+.001);
    const physics=new PoopPhysics(world),ball=physics.spawn({x,y:ceilingY-.2,z,vy:8});
    for(let i=0;i<12;i++) physics.update(1/120);
    assert.ok(ball.y+ball.radius<=ceilingY+.001);
  }
});

test('the tall hall leaves the full indoor staircase clear and the roof shell covers the exterior footprint',()=>{
  const scene=new THREE.Scene(),{world,roof}=createHouse(scene);
  for(let i=0;i<=40;i++) {
    const t=i/40,x=(STAIRS.minX+STAIRS.maxX)/2,z=STAIRS.startZ+t*(STAIRS.endZ-STAIRS.startZ),y=t*H;
    const blocked=roof.colliders.some(b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ&&y<b.maxY&&y+.68>b.minY);
    assert.equal(blocked,false,`stair progress ${t}`);
  }
  scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(let x=-23.5;x<24;x+=2) for(let z=-19.5;z<20;z+=2) {
    ray.set(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0));
    assert.ok(ray.intersectObject(roof.shell,true).length,`Roof coverage ${x},${z}`);
  }
});

test('roof and ceiling layers batch cheaply without altering the existing floor slab or glass batches',()=>{
  const {layers,roof,ceiling,group}=createHouse(new THREE.Scene());
  layers.forEach(batchStaticGeometry);
  const count=parent=>{let n=0;parent.traverse(m=>{if(m.isMesh)n++;});return n;};
  assert.ok(count(roof.ceilings)<=2);assert.ok(count(roof.shell)<=3);
  let triangles=0;roof.shell.traverse(m=>{if(m.isMesh)triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;});
  assert.ok(triangles<600,`Roof triangle count ${triangles}`);
  assert.equal(ceiling.children[0].geometry.index.count/3,12);
  const glass=[];group.traverse(m=>{if(m.name==='Batched window glass')glass.push(m);});assert.equal(glass.length,2);
});

test('both roof ridge orientations have outward normals and back-face shadow casting',()=>{
  const {roof}=createHouse(new THREE.Scene());
  const prisms=roof.shell.children.filter(m=>m.isMesh&&m.material.shadowSide===THREE.BackSide);
  assert.equal(prisms.length,1);
  const mesh=prisms[0],position=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal;
  assert.equal(mesh.material.side,THREE.FrontSide);assert.equal(position.count,4*24);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
  for(let start=0;start<position.count;start+=24) {
    const bounds=new THREE.Box3();for(let i=start;i<start+24;i++)bounds.expandByPoint(a.fromBufferAttribute(position,i));
    const centre=new THREE.Vector3((bounds.min.x+bounds.max.x)/2,bounds.min.y+(bounds.max.y-bounds.min.y)/3,(bounds.min.z+bounds.max.z)/2);
    for(let i=start;i<start+24;i+=3) {
      a.fromBufferAttribute(position,i);b.fromBufferAttribute(position,i+1);c.fromBufferAttribute(position,i+2);
      const faceCentre=a.add(b).add(c).multiplyScalar(1/3);
      n.fromBufferAttribute(normal,i);
      assert.ok(n.dot(faceCentre.sub(centre))>.01,`Inward face ${i/3}`);
    }
  }
});
