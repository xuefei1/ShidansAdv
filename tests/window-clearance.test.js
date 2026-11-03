import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createRabbit} from '../src/model.js';
import {RabbitController,World} from '../src/physics.js';
import {visualHeadroom} from '../src/rabbit-clearance.js';
import {WALLS,FLOOR_HEIGHT as H} from '../src/layout.js';

const {world}=createHouse(new THREE.Scene());
const pose=model=>[model.joints.body,model.joints.head,...model.joints.ears,...model.joints.paws]
  .map(joint=>[...joint.position.toArray(),...joint.rotation.toArray(),...joint.scale.toArray()]);
function top(model) {
  model.root.updateWorldMatrix(true,true);let highest=-Infinity;const point=new THREE.Vector3();
  model.joints.body.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const attribute=mesh.geometry.attributes.position;
    for(let index=0;index<attribute.count;index++) {
      point.fromBufferAttribute(attribute,index).applyMatrix4(mesh.matrixWorld);highest=Math.max(highest,point.y);
    }
  });
  return highest;
}

test('authored wall segments and upright panes explicitly describe side barriers',()=>{
  const panes=world.solids.filter(box=>box.id?.startsWith('glass:'));
  assert.equal(panes.length,WALLS.flatMap(wall=>wall.openings).filter(opening=>opening.kind==='glazed-window').length);
  assert.ok(panes.length>20);assert.ok(panes.every(box=>box.verticalBarrier===true));
  assert.equal(world.fixtures.get('front:-24:0').verticalBarrier,true);
  assert.equal(world.fixtures.get('dining-top').verticalBarrier,undefined);
  assert.equal(world.fixtures.get('upstairs-ceiling').verticalBarrier,undefined);
});

test('both sides of every real window stay upright beside the pane and lintel at walking and jumping heights',()=>{
  // Isolate the actual wall collision geometry so nearby furniture does not
  // hide a pane false positive behind a legitimate overhead surface.
  const walls={query:(...bounds)=>world.query(...bounds).filter(box=>box.verticalBarrier)};
  const model=createRabbit();let checked=0;
  for(const wall of WALLS)for(const opening of wall.openings.filter(opening=>['window','glazed-window'].includes(opening.kind))) {
    for(const side of [-1,1])for(const distance of [.4,.65])for(const offset of [0,.25,1.3,1.7]) {
      const point={x:wall.axis==='x'?opening.at:wall.fixed+side*distance,y:wall.floor*H+offset,z:wall.axis==='x'?wall.fixed+side*distance:opening.at};
      const headroom=visualHeadroom(walls,point);
      assert.ok(headroom>=1.6,`${wall.id}/${opening.at} has false overhead at ${JSON.stringify(point)}`);
      model.root.position.set(point.x,point.y,point.z);model.animate(checked/60,5,offset===0,0,wall.floor*H,'idle',headroom);
      assert.equal(model.ducking,false);checked++;
    }
  }
  assert.equal(checked,WALLS.flatMap(wall=>wall.openings).filter(opening=>['window','glazed-window'].includes(opening.kind)).length*16);
  assert.ok(checked>500);
});

test('real walking and sprinting controllers retain ordinary poses along inside and outside windowed walls',()=>{
  const paths=[
    {x:5.5,end:22.5,y:0,z:19.62},
    {x:5.5,end:22.5,y:0,z:20.38},
    {x:9,end:23,y:H,z:-19.62},
    {x:9,end:23,y:H,z:-20.38},
  ];let frames=0;
  for(const path of paths)for(const run of [false,true])for(const fps of [30,60]) {
    const rabbit=new RabbitController(world),model=createRabbit(),ordinary=createRabbit();
    Object.assign(rabbit,{x:path.x,y:path.y,z:path.z,vx:0,vy:0,vz:0,facing:Math.PI/2,grounded:true,surface:world.support(path.x,path.z,path.y+.01,true).surface});
    let frame=0;
    for(;frame<fps*12&&rabbit.x<path.end;frame++) {
      rabbit.update(1/fps,{x:1,run});const headroom=visualHeadroom(world,rabbit),speed=Math.hypot(rabbit.vx,rabbit.vz);
      model.animate(frame/fps,speed,rabbit.grounded,rabbit.charge/.8,rabbit.y,'idle',headroom);
      ordinary.animate(frame/fps,speed,rabbit.grounded,rabbit.charge/.8,rabbit.y);
      assert.equal(model.ducking,false,`false duck at ${JSON.stringify({x:rabbit.x,y:rabbit.y,z:rabbit.z,run,fps,headroom})}`);
      assert.deepEqual(pose(model),pose(ordinary));assert.ok(Math.abs(rabbit.y-path.y)<1e-8);frames++;
    }
    assert.ok(rabbit.x>=path.end,'the regression traverses whole windows and adjacent opaque wall sections');
  }
  assert.ok(frames>1500);
});

test('real window lintels still tuck the airborne rabbit while crossing directly beneath them',()=>{
  const model=createRabbit(),lintel=world.solids.find(box=>box.verticalBarrier&&box.id==='west-rooms-1:-13.2:2.65');
  assert.ok(lintel);
  for(const direction of [-1,1])for(const offset of [-.12,0,.12]) {
    const player={x:-5+offset,y:H+1.3,z:-12,height:.68,radius:.22};
    const headroom=visualHeadroom(world,player);assert.ok(headroom<1.4);
    model.root.position.set(player.x,player.y,player.z);model.root.rotation.y=direction*Math.PI/2;
    model.animate(.4,6,false,0,H,'idle',headroom);
    assert.equal(model.ducking,true);assert.ok(top(model)<=lintel.minY-.02,'actual fur remains below the lintel');
  }
});

test('charged controller jumps through the real upstairs window tuck before any leading fur crosses its lintel',()=>{
  const lintel=world.fixtures.get('west-rooms-1:-13.2:2.65'),point=new THREE.Vector3();
  for(const fps of [30,60,120]) {
    const rabbit=new RabbitController(world),model=createRabbit();
    Object.assign(rabbit,{x:-3,y:H,z:-12,vx:0,vy:0,vz:0,facing:-Math.PI/2,grounded:true,surface:'carpet'});
    for(let frame=0;frame<Math.round(.7*fps);frame++)rabbit.update(1/fps,{jump:true});
    let duckFrames=0;
    for(let frame=0;frame<fps*2;frame++) {
      rabbit.update(1/fps,{x:-1});model.root.position.set(rabbit.x,rabbit.y,rabbit.z);model.root.rotation.y=rabbit.facing;
      model.animate(frame/fps,Math.hypot(rabbit.vx,rabbit.vz),rabbit.grounded,rabbit.charge/.8,
        world.support(rabbit.x,rabbit.z,rabbit.y+.01,true).y,'idle',visualHeadroom(world,rabbit));
      duckFrames+=Number(model.ducking);model.root.updateWorldMatrix(true,true);
      model.joints.body.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const attribute=mesh.geometry.attributes.position;
        for(let index=0;index<attribute.count;index++) {
          point.fromBufferAttribute(attribute,index).applyMatrix4(mesh.matrixWorld);
          const inside=point.x>lintel.minX+.002&&point.x<lintel.maxX-.002&&point.y>lintel.minY+.002&&point.y<lintel.maxY-.002&&point.z>lintel.minZ+.002&&point.z<lintel.maxZ-.002;
          assert.equal(inside,false,`${fps} FPS leading fur clips the window lintel`);
        }
      });
    }
    assert.ok(rabbit.x<-6,'the jump actually crosses the window plane');assert.ok(duckFrames>0,'the real jump requires a ceiling tuck');
  }
});

test('true roofs, low furniture and complete clearances preserve the duck diagnostic and exact normal restoration',()=>{
  const isolated=new World(),roof=isolated.addBox(0,1.05,0,3,.1,3);roof.id='glass-roof';
  const model=createRabbit(),player={x:0,y:0,z:0};
  model.animate(.7,3,true);const ordinary=pose(model);assert.equal(model.ducking,false);
  const headroom=visualHeadroom(isolated,player);assert.ok(headroom<1);
  model.animate(.7,3,true,0,0,'idle',headroom);assert.equal(model.ducking,true);assert.ok(top(model)<=roof.minY-.02);
  model.animate(.7,3,true);assert.equal(model.ducking,false);assert.deepEqual(pose(model),ordinary);
  model.animate(.7,0,true,0,0,'carried',Infinity,1);assert.equal(model.ducking,false,'relaxed carried ears are not a clearance duck');
  const table=world.fixtures.get('dining-top');player.x=14;player.z=15;
  model.root.position.set(player.x,0,player.z);model.animate(.7,3,true,0,0,'idle',visualHeadroom(world,player));
  assert.equal(model.ducking,true);assert.ok(top(model)<=table.minY-.02);
});
