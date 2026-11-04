import test from 'node:test';
import assert from 'node:assert/strict';
import {RabbitController,World} from '../src/physics.js';

test('capture holds an airborne rabbit in place and returning home allows free den jumps',()=>{
  const rabbit=new RabbitController(new World());
  Object.assign(rabbit,{x:-10,y:1.1,z:9,vx:5,vy:4,vz:-3,grounded:false,charging:true,charge:.6,jumpHeld:true});
  rabbit.energy.value=60;rabbit.energy.consume(20);
  for(let frame=0;frame<30;frame++)rabbit.update(.1,{x:1,z:1,run:true,jump:true,captured:true});
  assert.deepEqual([rabbit.x,rabbit.y,rabbit.z],[-10,1.1,9]);
  assert.deepEqual([rabbit.vx,rabbit.vy,rabbit.vz],[0,0,0]);
  assert.equal(rabbit.charge,0);assert.equal(rabbit.charging,false);assert.equal(rabbit.sprinting,false);
  assert.equal(rabbit.lastJump,null);assert.equal(rabbit.isFreeDenJump(),false);
  assert.ok(Math.abs(rabbit.energy.value-80.06)<1e-8,'normal recovery continues while held');
  rabbit.reset();assert.equal(rabbit.y,0);assert.equal(rabbit.isFreeDenJump(),true);assert.ok(rabbit.energy.value>80);
});
