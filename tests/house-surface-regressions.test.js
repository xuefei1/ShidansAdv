import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse,batchStaticGeometry} from '../src/house.js';
import {cube} from '../src/model.js';
import {collectOpaqueBoxOccluders,findCoplanarColorOverlaps} from './surface-audit.js';

// The normal play camera stays above the ground and house tour cameras also
// stay in this enclosing volume. Ground undersides cannot face a legal viewer;
// upstairs undersides remain checked because downstairs viewers can see them.
const viewerBounds={minX:-60,maxX:60,minY:.05,maxY:100,minZ:-70,maxZ:60};
const inspect=root=>findCoplanarColorOverlaps(root,{includeInvisible:true,exposedOnly:true,viewerBounds});

test('all house, furnishing, garden, lamp and roof surfaces avoid exposed coplanar colour conflicts before and after batching',()=>{
  // Include browser-only textured room signs in this CPU geometry audit. No
  // raster pixels are needed to test their planes against walls/each other.
  const previousDocument=globalThis.document,scene=new THREE.Scene();let house;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})};
  try {house=createHouse(scene);} finally {
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  }
  let labels=0;scene.traverse(mesh=>{if(mesh.isMesh&&mesh.material.map)labels++;});
  assert.ok(labels>=8,'All textured room and den signs participate');
  assert.equal(house.layers.length,5,'Ground, upper, outdoor, interior roof lining and exterior roof are all included');
  const occluders=collectOpaqueBoxOccluders(scene,{includeInvisible:true});
  assert.ok(occluders.length>500,'Audit captures the actual authored opaque box volumes');
  const options={includeInvisible:true,exposedOnly:true,occluders,viewerBounds};
  const describe=findings=>JSON.stringify(findings.slice(0,4).map(f=>({a:f.a.mesh,b:f.b.mesh,plane:f.plane,axis:f.projectionAxis,area:f.area})),null,2);
  const before=findCoplanarColorOverlaps(scene,options);assert.equal(before.length,0,describe(before));
  house.upper.visible=false; // Invisible cutaway layers are still part of the regression.
  house.layers.forEach(batchStaticGeometry);
  const after=findCoplanarColorOverlaps(scene,options);assert.equal(after.length,0,describe(after));
});

test('the audit reproduces the old wall skirting and window-reveal end-cap conflict',()=>{
  const make=width=>{
    const root=new THREE.Group();
    cube(root,0xf2e7cc,0,1,0,2,2,.24).name='wall reveal';
    cube(root,0xf9f0dc,0,.1,0,width,.2,.255).name='skirting';return root;
  };
  const old=inspect(make(2));assert.ok(old.some(f=>f.a.mesh==='wall reveal'&&f.b.mesh==='skirting'&&f.projectionAxis===0));
  assert.equal(inspect(make(1.976)).length,0,'A genuine construction gap removes the shared end plane');
});

test('the audit reproduces the old sofa-base and differently coloured arm side conflict',()=>{
  const make=baseWidth=>{
    const root=new THREE.Group(),width=3.8;
    cube(root,0xb29470,0,.32,0,baseWidth,.56,1.95).name='wood sofa base';
    for(const side of [-1,1])cube(root,0xb2c4a0,side*(width/2-.14),.8,0,.28,1,2.05).name='sofa arm';
    return root;
  };
  assert.ok(inspect(make(3.8)).length>0);
  assert.equal(inspect(make(3.76)).length,0,'The narrower structural base has no competing outside side faces');
});

test('the audit reproduces overlapping crate staircase side faces without rejecting an actual construction joint',()=>{
  const make=backZ=>{
    const root=new THREE.Group();
    cube(root,0xe0c499,12,.54,-11,1.65,1.08,1.25).name='lower crate';
    cube(root,0xd0b389,12,.74,backZ,1.65,1.48,1.25).name='upper crate';return root;
  };
  assert.ok(inspect(make(-12)).some(f=>f.projectionAxis===0));
  assert.equal(inspect(make(-12.3)).length,0,'Separated crates retain their full solid dimensions');
});
