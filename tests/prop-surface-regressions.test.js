import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createConsumableModel} from '../src/consumables.js';
import {CONSUMABLE_TYPES} from '../src/consumable-data.js';
import {createRabbit,cube} from '../src/model.js';
import {findCoplanarColorOverlaps} from './surface-audit.js';

const report=findings=>findings.slice(0,4).map(f=>`${f.a.mesh} triangle ${f.a.triangle} / ${f.b.triangle}, area ${f.area}`).join('\n');

test('each consumable model has no competing differently coloured coplanar patches',()=>{
  for(const type of Object.keys(CONSUMABLE_TYPES)) {
    const mesh=createConsumableModel(type),findings=findCoplanarColorOverlaps(mesh);
    assert.equal(findings.length,0,`${type}: ${report(findings)}`);
    assert.ok(mesh.geometry.index.count>0);assert.equal(mesh.material.transparent,false);
  }
  const findings=findCoplanarColorOverlaps(createConsumableModel('hay',true));
  assert.equal(findings.length,0,`Permanent hay: ${report(findings)}`);
});

test('book binding ends stay inset from both differently coloured pages and covers',()=>{
  const mesh=createConsumableModel('book'),position=mesh.geometry.getAttribute('position'),colors=mesh.geometry.getAttribute('color');
  const bindingColor=new THREE.Color(0x658996);let count=0;
  for(let i=0;i<position.count;i++) {
    if(Math.abs(colors.getX(i)-bindingColor.r)>1e-6||Math.abs(colors.getY(i)-bindingColor.g)>1e-6||Math.abs(colors.getZ(i)-bindingColor.b)>1e-6)continue;
    assert.ok(Math.abs(position.getZ(i))<=.220001);count++;
  }
  assert.ok(count>=24,'The inset binding remains part of the book model');
  // The original flush binding reproduces the reported colour competition.
  const original=new THREE.Group();
  cube(original,0xf2e4c7,0,.10,0,.39,.13,.46);
  for(const y of [.025,.18])cube(original,0x8eafbb,0,y,0,.45,.035,.5);
  cube(original,0x658996,-.21,.10,0,.035,.16,.5);
  assert.ok(findCoplanarColorOverlaps(original).length>0);
});

test('Shidan has no differently coloured coplanar patches across idle, run, crouch, jump and blink poses',()=>{
  const rabbit=createRabbit();
  const poses=[[0,0,true,0],[.73,5,true,0],[1.37,0,true,1],[2.41,6,false,.5],[Math.PI/(2*.77),0,true,0]];
  for(const pose of poses) {
    rabbit.animate(...pose);const findings=findCoplanarColorOverlaps(rabbit.root);
    assert.equal(findings.length,0,`${pose.join(',')}: ${report(findings)}`);
  }
  let meshes=0;rabbit.root.traverse(m=>{if(m.isMesh)meshes++;});assert.equal(meshes,11);
});
