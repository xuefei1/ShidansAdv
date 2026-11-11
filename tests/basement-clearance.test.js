import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {RabbitController} from '../src/physics.js';
import {createRabbit} from '../src/model.js';
import {visualHeadroom} from '../src/rabbit-clearance.js';
import {BASEMENT,BASEMENT_STAIRS as STAIRS} from '../src/layout.js';

const {world}=createHouse(new THREE.Scene(),{basementType:'mirror-maze'});
const model=createRabbit(),point=new THREE.Vector3();
function animate(player,time) {
  const room=visualHeadroom(world,player);
  model.root.position.set(player.x,player.y,player.z);model.root.rotation.y=player.facing;
  model.animate(time,Math.hypot(player.vx,player.vz),player.grounded,0,player.y,'idle',room);
  return room;
}
function top() {
  model.root.updateWorldMatrix(true,true);let highest=-Infinity;
  model.joints.body.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)highest=Math.max(highest,point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).y);
  });
  return highest;
}

test('walking and sprinting down/up the basement stairs preserves the normal body pose beside both opening edges',()=>{
  let frames=0;
  for(const dt of [1/120,1/60,1/30,.1])for(const run of [false,true])
    for(const x of [STAIRS.minX+.22,STAIRS.minX+.4,(STAIRS.minX+STAIRS.maxX)/2,STAIRS.maxX-.4,STAIRS.maxX-.22]) {
      const player=new RabbitController(world);
      Object.assign(player,{x,y:0,z:STAIRS.endZ+.8,surface:'wood'});
      for(const [direction,z,y] of [['down',STAIRS.startZ-1.1,BASEMENT.y],['up',STAIRS.endZ+.8,0]]) {
        let arrived=false;
        for(let time=0;time<20;time+=dt) {
          const dz=z-player.z;
          player.update(dt,{z:dz/Math.max(1,Math.abs(dz)),run});
          const headroom=animate(player,frames++*dt);
          assert.equal(model.ducking,false,`${direction}: false ceiling at ${JSON.stringify({x:player.x,y:player.y,z:player.z,headroom,dt,run})}`);
          assert.equal(model.joints.body.scale.y,1,'stairs must not flatten the torso');
          if(Math.abs(dz)<.06&&Math.abs(player.vz)<.2){arrived=true;break;}
        }
        assert.equal(arrived,true,`the ${direction} route actually reaches its landing: ${JSON.stringify({dt,run,x,position:[player.x,player.y,player.z],vz:player.vz})}`);
        assert.ok(Math.abs(player.y-y)<1e-6);
      }
    }
  assert.ok(frames>10000,'sample the complete animation through the entrance in both directions');
});

test('the basement floor slab remains a real ceiling beyond the open stairwell',()=>{
  const player={x:STAIRS.maxX-.22,y:-.90,z:-8,grounded:true,radius:.22,height:.68,vx:0,vz:0,facing:0};
  assert.ok(animate(player,.4)>1.6);assert.equal(model.ducking,false);
  player.x=STAIRS.maxX+1;
  const headroom=animate(player,.4);
  assert.ok(headroom<.7);assert.equal(model.ducking,true);
  assert.ok(top()<=BASEMENT.ceilingY-.02,'the real rendered fur still clears the actual slab');
});

test('an actual low beam spanning the staircase still folds the ears and keeps all fur below it',()=>{
  const x=(STAIRS.minX+STAIRS.maxX)/2,z=-8,y=world.rampHeight(x,z);
  const beam=world.addBox(x,y+1.1,z,1.8,.1,1.8,'concrete');beam.id='test-stair-overhead-beam';
  try {
    const player={x,y,z,grounded:true,radius:.22,height:.68,vx:0,vz:3,facing:0};
    assert.ok(animate(player,.7)<1.1);assert.equal(model.ducking,true);
    assert.ok(top()<=beam.minY-.02,'a real staircase obstruction must not be ignored');
  } finally {world.removeBox(beam);}
});
