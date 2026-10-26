import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {World,RabbitController} from '../src/physics.js';
import {createConsumables} from '../src/consumables.js';
import {findCoplanarColorOverlaps} from './surface-audit.js';

test('pushing nearby coloured book surfaces does not create competing coplanar patches',()=>{
  const scene=new THREE.Scene(),world=new World(),view=createConsumables(scene,world,{wires:[],randomLimits:{},slots:[
    {id:'book-a',type:'book',x:0,y:0,z:0},{id:'book-b',type:'book',x:.65,y:0,z:.02},
  ]});
  const rabbit=new RabbitController(world);Object.assign(rabbit,{x:-1.5,y:0,z:0});
  const books=scene.getObjectByName('book collectibles');let contacts=0;
  for(let i=0;i<480;i++) {
    rabbit.update(1/120,i<240?{x:1}:{});view.system.update(1/120,rabbit,0);
    if(rabbit.pushing)contacts++;
    if(i%16===0) {
      view.sync(16/120);
      const findings=findCoplanarColorOverlaps(books);
      assert.equal(findings.length,0,`Competing surfaces during push frame ${i}`);
    }
  }
  assert.ok(contacts>0);assert.ok(view.system.items.get('book-b').x>.65);
  const a=view.system.items.get('book-a').collider,b=view.system.items.get('book-b').collider;
  const overlapX=Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX),overlapZ=Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ);
  assert.ok(overlapX<=0||overlapZ<=0,'Settled loose props do not retain overlapping volumes');
});
