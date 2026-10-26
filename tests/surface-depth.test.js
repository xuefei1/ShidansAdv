import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {cameraNearPlane} from '../src/render-quality.js';
import {applySurfaceOverlay} from '../src/surface-materials.js';
import {batchStaticGeometry} from '../src/render-batching.js';
import {findCoplanarColorOverlaps} from './surface-audit.js';

// The projection's actual depth separation in a standard 24-bit depth buffer.
function depthSteps(near,distance,gap) {
  const camera=new THREE.PerspectiveCamera(46,16/9,near,260);
  const a=new THREE.Vector3(0,0,-distance).applyMatrix4(camera.projectionMatrix);
  const b=new THREE.Vector3(0,0,-distance-gap).applyMatrix4(camera.projectionMatrix);
  return Math.abs(a.z-b.z)/2*(2**24-1);
}
test('normal and survey cameras preserve more depth separation without clipping the squeezed chase camera',()=>{
  assert.equal(cameraNearPlane(.55),.06);assert.equal(cameraNearPlane(0),.06);
  assert.equal(cameraNearPlane(5),.18);assert.equal(cameraNearPlane(100,true),.75);
  assert.ok(cameraNearPlane(.9)>.06&&cameraNearPlane(.9)<.18);
  assert.ok(depthSteps(cameraNearPlane(5),60,.008)>depthSteps(.06,60,.008)*2.9);
  assert.ok(depthSteps(cameraNearPlane(100,true),100,.008)>depthSteps(.4,100,.008)*1.8);
});

test('intentional overlay depth bias survives batching without changing ordinary solid materials',()=>{
  const group=new THREE.Group(),baseMaterial=new THREE.MeshStandardMaterial({color:0x568030});
  const base=new THREE.Mesh(new THREE.BoxGeometry(2,1,2),baseMaterial);base.name='solid';group.add(base);
  const paint=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:0xd08340}));
  paint.name='paint';paint.rotation.x=-Math.PI/2;paint.position.y=.5;group.add(paint);
  assert.ok(findCoplanarColorOverlaps(group).length>0,'The fixture reproduces a competing painted surface');
  const source=paint.material;applySurfaceOverlay(paint);
  assert.equal(source.polygonOffset,false);assert.equal(baseMaterial.polygonOffset,false);
  assert.equal(paint.material.depthWrite,true);assert.equal(paint.material.depthTest,true);
  assert.equal(findCoplanarColorOverlaps(group).length,0);
  batchStaticGeometry(group,{cellSize:Infinity});
  const overlay=group.children.find(m=>m.material.polygonOffset);
  assert.ok(overlay);assert.equal(overlay.material.polygonOffsetFactor,0);assert.equal(overlay.material.polygonOffsetUnits,-2);
  assert.ok(depthSteps(cameraNearPlane(5),100,.05)>Math.abs(overlay.material.polygonOffsetUnits)*4,'Paint cannot leap in front of furniture five centimetres nearer, even across the house');
  assert.ok(group.children.some(m=>!m.material.polygonOffset));assert.equal(findCoplanarColorOverlaps(group).length,0);
});
