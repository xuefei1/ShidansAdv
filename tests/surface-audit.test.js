import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {findCoplanarColorOverlaps,collectOpaqueBoxOccluders} from './surface-audit.js';
import {batchStaticGeometry} from '../src/render-batching.js';

function plane(color,x=0,y=0,z=0) {
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial({color}));mesh.position.set(x,y,z);return mesh;
}
test('audit detects positive-area different-colour coplanar patches and reports their world geometry',()=>{
  const root=new THREE.Group();root.position.set(10,3,-4);root.rotation.y=.3;
  const red=plane(0xff0000),blue=plane(0x0000ff,.5);red.name='red panel';blue.name='blue panel';root.add(red,blue);
  const found=findCoplanarColorOverlaps(root);assert.ok(found.length>0);
  assert.ok(found.every(f=>f.area>0&&f.a.mesh==='red panel'&&f.b.mesh==='blue panel'));
  assert.ok(found[0].a.vertices[0][0]>8);assert.ok(found[0].normal.every(Number.isFinite));
});
test('shared edges, same-colour duplication, valid back-to-back seams and true intersections are ignored',()=>{
  for(const build of [
    root=>root.add(plane(0xff0000),plane(0x0000ff,2)),
    root=>root.add(plane(0xff0000),plane(0xff0000,.5)),
    root=>{const back=plane(0x0000ff);back.rotation.y=Math.PI;root.add(plane(0xff0000),back);},
    root=>{const crossing=plane(0x0000ff);crossing.rotation.y=.5;root.add(plane(0xff0000),crossing);},
  ]) {const root=new THREE.Group();build(root);assert.equal(findCoplanarColorOverlaps(root).length,0);}
});
test('a real gap remains valid while double-sided opposing surfaces still reveal a risk',()=>{
  const root=new THREE.Group();root.add(plane(0xff0000),plane(0x0000ff,0,0,.002));assert.equal(findCoplanarColorOverlaps(root).length,0);
  root.children[1].position.z=0;root.children[1].rotation.y=Math.PI;root.children[1].material.side=THREE.DoubleSide;
  assert.ok(findCoplanarColorOverlaps(root).length>0);
});
test('vertex-colour batching and instanced world matrices cannot hide competing surfaces',()=>{
  const batched=new THREE.Group();batched.add(plane(0xff0000),plane(0x0000ff,.5));batchStaticGeometry(batched,{cellSize:Infinity});
  assert.ok(findCoplanarColorOverlaps(batched).length>0);
  const scene=new THREE.Group(),instances=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial({color:0xff0000}),2);
  instances.setMatrixAt(0,new THREE.Matrix4().makeTranslation(8,1,2));instances.setMatrixAt(1,new THREE.Matrix4().makeTranslation(20,1,2));
  scene.add(instances,plane(0x0000ff,8,1,2));
  const found=findCoplanarColorOverlaps(scene);assert.ok(found.length>0);assert.ok(found.every(f=>f.a.instance===0));
});
test('intentional transparent/depth-free overlays and invisible objects are excluded by default',()=>{
  const root=new THREE.Group(),overlay=plane(0x0000ff);root.add(plane(0xff0000),overlay);
  overlay.material.transparent=true;overlay.material.depthWrite=false;assert.equal(findCoplanarColorOverlaps(root).length,0);
  overlay.material.transparent=false;overlay.material.depthWrite=true;overlay.visible=false;
  assert.equal(findCoplanarColorOverlaps(root).length,0);assert.ok(findCoplanarColorOverlaps(root,{includeInvisible:true}).length>0);
});
test('instance colours and opposing/backside material visibility participate in the audit',()=>{
  const scene=new THREE.Group(),instances=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),new THREE.MeshStandardMaterial(),2);
  instances.setMatrixAt(0,new THREE.Matrix4());instances.setMatrixAt(1,new THREE.Matrix4());
  instances.setColorAt(0,new THREE.Color(0xff0000));instances.setColorAt(1,new THREE.Color(0x0000ff));scene.add(instances);
  assert.ok(findCoplanarColorOverlaps(scene).length>0);
  const root=new THREE.Group(),back=plane(0x0000ff);back.rotation.y=Math.PI;back.material.side=THREE.BackSide;
  root.add(plane(0xff0000),back);assert.ok(findCoplanarColorOverlaps(root).length>0);
});
test('exposed-only audit hides patches proven inside a third opaque box, not distant or backing geometry',()=>{
  const root=new THREE.Group();root.add(plane(0xff0000),plane(0x0000ff,.5));
  const cover=new THREE.Mesh(new THREE.BoxGeometry(4,4,.2),new THREE.MeshStandardMaterial({color:0xffff00}));root.add(cover);
  assert.equal(findCoplanarColorOverlaps(root,{exposedOnly:true}).length,0);
  const captured=collectOpaqueBoxOccluders(root);batchStaticGeometry(root,{cellSize:Infinity});
  assert.equal(findCoplanarColorOverlaps(root,{exposedOnly:true,occluders:captured}).length,0);
  // A future ceiling far along the ray is not immediate closed-volume occlusion.
  const distant=new THREE.Group();distant.add(plane(0xff0000),plane(0x0000ff,.5));cover.position.z=2;distant.add(cover);
  assert.ok(findCoplanarColorOverlaps(distant,{exposedOnly:true}).length>0);
  cover.position.z=-.1;assert.ok(findCoplanarColorOverlaps(distant,{exposedOnly:true}).length>0);
});
test('partial opaque cover cannot hide an uncovered competing patch',()=>{
  const root=new THREE.Group();root.add(plane(0xff0000),plane(0x0000ff,.5));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),new THREE.MeshStandardMaterial()));
  assert.ok(findCoplanarColorOverlaps(root,{exposedOnly:true}).length>0);
});

test('different texture maps cannot conceal a coplanar colour conflict behind equal material tint',()=>{
  const root=new THREE.Group(),a=plane(0xffffff),b=plane(0xffffff,.5);
  a.material.map=new THREE.Texture();b.material.map=new THREE.Texture();root.add(a,b);
  assert.ok(findCoplanarColorOverlaps(root).length>0);
  b.position.z=.01;assert.equal(findCoplanarColorOverlaps(root).length,0);
});
test('legal camera half-space excludes ground undersides but still checks reachable upper-floor undersides',()=>{
  const scene=new THREE.Group(),a=plane(0xff0000),b=plane(0x0000ff,.5);a.rotation.x=b.rotation.x=Math.PI/2;scene.add(a,b);
  const options={exposedOnly:true,viewerBounds:{minX:-60,maxX:60,minY:.05,maxY:100,minZ:-70,maxZ:60}};
  assert.ok(findCoplanarColorOverlaps(scene).length>0);assert.equal(findCoplanarColorOverlaps(scene,options).length,0);
  a.position.y=b.position.y=4.2;assert.ok(findCoplanarColorOverlaps(scene,options).length>0);
});
