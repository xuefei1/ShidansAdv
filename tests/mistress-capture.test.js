import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {MistressCapture} from '../src/mistress-capture.js';
import {createMistressModel} from '../src/mistress-model.js';
import {createHouse} from '../src/house.js';
import {createRabbit} from '../src/model.js';
import {visualHeadroom} from '../src/rabbit-clearance.js';
import {CAPTURE_SECONDS} from '../src/mistress-pursuit.js';
import {findCoplanarColorOverlaps} from './surface-audit.js';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);
const snapshot=model=>{const rows=[];model.root.traverse(object=>rows.push([object.uuid,...object.position.toArray(),...object.rotation.toArray(),...object.scale.toArray(),object.visible]));return rows;};
function frame(capture,model,progress) {
  const {mistressYaw}=capture.sample(progress);model.root.position.copy(capture.mistress);model.root.rotation.y=mistressYaw;
  model.animate(progress*CAPTURE_SECONDS,{captureProgress:progress,captureTarget:capture.start,captureSupport:capture.support});
  const cradle=model.getCradlePoint();return {pose:capture.sample(progress,cradle),cradle};
}

test('pickup begins at the captured world pose, reaches the exact hand socket, and keeps frozen sources unchanged',()=>{
  const capture=new MistressCapture(),model=createMistressModel(),rabbit={x:3,y:0,z:4,facing:-2.8},mistress={x:3.5,y:0,z:3.5,yaw:.7};
  const original=JSON.stringify({rabbit,mistress});assert.equal(capture.begin({rabbit,mistress}),true);
  const initial=frame(capture,model,0).pose;assert.deepEqual(initial.position.toArray(),[3,0,4]);near(initial.facing,-2.8);near(initial.mistressYaw,.7);
  const early=frame(capture,model,.001).pose.position.clone();assert.ok(early.distanceTo(new THREE.Vector3(3,0,4))<.001);
  const {pose,cradle}=frame(capture,model,1);assert.equal(pose.carried,true);assert.equal(pose.carryWeight,1);assert.ok(pose.position.distanceTo(cradle)<1e-10);
  assert.equal(JSON.stringify({rabbit,mistress}),original);assert.equal(CAPTURE_SECONDS,3);
  rabbit.x=99;mistress.z=99;assert.deepEqual(capture.sample(0).position.toArray(),[3,0,4]);
});

test('capture samples reuse memory and depend only on progress and this frame socket',()=>{
  const capture=new MistressCapture();capture.begin({rabbit:{x:1,y:0,z:2},mistress:{x:0,y:0,z:0}});
  const pose=capture.sample(.5),position=pose.position,expected=position.toArray(),yaw=pose.mistressYaw;
  capture.sample(.9,{x:80,y:90,z:100});
  assert.equal(capture.sample(.5),pose);assert.equal(pose.position,position);assert.deepEqual(position.toArray(),expected);near(pose.mistressYaw,yaw);
  const paused=capture.sample(.5,{x:1,y:1.4,z:1}).position.toArray();
  for(let index=0;index<60;index++)assert.deepEqual(capture.sample(.5,{x:1,y:1.4,z:1}).position.toArray(),paused);
  capture.reset();assert.equal(capture.active,false);assert.equal(capture.sample(.5),null);
  assert.equal(capture.begin({rabbit:{x:NaN,y:0,z:0},mistress:{x:0,y:0,z:0}}),false);
});

test('floor, tabletop, bed and under-table paths are continuous and finish cradled',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene),dining=world.fixtures.get('dining-top'),bed=world.fixtures.get('bed-quilt');
  assert.ok(dining&&bed);
  const cases=[
    {name:'floor',rabbit:{x:0,y:0,z:1},mistress:{x:0,y:0,z:0,yaw:2.8}},
    {name:'far tabletop',rabbit:{x:14,y:dining.maxY,z:15},mistress:{x:14,y:0,z:13.05,yaw:0},support:dining},
    {name:'under table',rabbit:{x:14,y:0,z:15},mistress:{x:14,y:0,z:13.05,yaw:0},support:dining},
    {name:'bed',rabbit:{x:-15,y:5.16,z:-13.5},mistress:{x:-11.8,y:4.2,z:-13.5,yaw:-Math.PI/2},support:bed},
  ];
  for(const scenario of cases) {
    const capture=new MistressCapture(),model=createMistressModel();capture.begin(scenario);let previous=null,previousFacing=null,maxStep=0,leftUnder=false;
    for(let index=0;index<=360;index++) {
      const p=index/360,{pose,cradle}=frame(capture,model,p),point=pose.position;
      assert.ok(Number.isFinite(point.x+point.y+point.z+pose.facing+pose.mistressYaw),scenario.name);
      if(previous)maxStep=Math.max(maxStep,previous.distanceTo(point));previous=point.clone();
      if(previousFacing!==null)assert.ok(Math.abs(pose.facing-previousFacing)<.08,'the carried facing never jumps across the angle wrap');previousFacing=pose.facing;
      if(capture.under) {
        const under=point.x>dining.minX&&point.x<dining.maxX&&point.z>dining.minZ&&point.z<dining.maxZ;
        if(!under)leftUnder=true;
        if(point.y>.03&&point.y<dining.maxY)assert.equal(under,false,'slide outside the real slab before lifting');
      }
      if(p>=.9)assert.ok(point.distanceTo(cradle)<1e-9,scenario.name);
    }
    assert.ok(maxStep<.06,`${scenario.name} has no positional snap (largest frame step ${maxStep})`);
    if(capture.under)assert.equal(leftUnder,true);
  }
});

test('mistress bends and reaches, then straightens with two supporting hands and a reusable exact socket',()=>{
  const model=createMistressModel(),target=new THREE.Vector3(0,0,.75);model.root.position.set(2,4.2,3);model.root.rotation.y=.8;
  target.add(model.root.position);model.animate(.9,{captureProgress:.3,captureTarget:target});
  const low=model.joints.body.position.y;assert.ok(model.joints.body.rotation.x>.4);assert.ok(model.joints.shins[0].rotation.x>.7);
  model.animate(3,{captureProgress:1,captureTarget:target});assert.ok(model.joints.body.position.y>low+.15);
  near(model.joints.body.rotation.x,0);assert.ok(model.joints.arms.every(arm=>arm.rotation.x<-.8));assert.ok(model.joints.forearms.every(arm=>arm.rotation.x<-1));
  const socket=model.getCradlePoint(),identity=socket;
  const hands=model.joints.forearms.map(arm=>arm.localToWorld(new THREE.Vector3(0,-.216,.008)));
  const expected=hands[0].add(hands[1]).multiplyScalar(.5),offset=new THREE.Vector3(0,-.34,.06).applyMatrix4(model.root.matrixWorld).sub(model.root.position);
  expected.add(offset);assert.ok(socket.distanceTo(expected)<1e-10);assert.equal(model.getCradlePoint(),identity);
  const highTarget=target.clone();highTarget.y+=1.52;model.animate(3,{captureProgress:1,captureTarget:highTarget});
  assert.ok(model.getCradlePoint().y>=model.root.position.y+1.56,'the high-table cradle clears its tabletop');
  model.animate(.9,{captureProgress:.3,captureTarget:highTarget});
  for(const arm of model.joints.forearms)assert.ok(arm.localToWorld(new THREE.Vector3(0,-.216,.008)).y>model.root.position.y+1.52,'reaching palms stay above the high tabletop');
});

test('capture restores ordinary actions and preserves mesh buffers, hidden props and floor shadows',()=>{
  const model=createMistressModel(),meshes=[];model.root.traverse(object=>{if(object.isMesh)meshes.push(object);});
  const originals=meshes.map(mesh=>[mesh.geometry,mesh.material,mesh.geometry.attributes.position,mesh.geometry.attributes.position.version]);
  const walk={moving:true,speed:3.5};model.animate(2,walk);const original=snapshot(model);
  model.animate(2,{...walk,captureProgress:0});assert.deepEqual(snapshot(model),original);
  for(const progress of [.1,.3,.6,1]) {
    model.animate(3*progress,{activity:'phone',captureProgress:progress,captureTarget:{x:0,y:0,z:1}});
    assert.ok(Object.values(model.props).every(prop=>!prop.visible));assert.equal(model.shadow.visible,true);
    assert.equal(model.shadow.position.y,.018);
  }
  model.animate(2,walk);assert.deepEqual(snapshot(model),original);
  assert.equal(meshes.length,22);meshes.forEach((mesh,index)=>{
    assert.deepEqual([mesh.geometry,mesh.material,mesh.geometry.attributes.position,mesh.geometry.attributes.position.version],originals[index]);assert.equal(mesh.castShadow,false);
  });
  for(const progress of [.3,1]) {
    model.animate(progress*3,{captureProgress:progress,captureTarget:{x:0,y:0,z:.75}});
    assert.equal(findCoplanarColorOverlaps(model.root).length,0);
  }
});

test('actual pickup meshes clear floors, tabletop and bed slabs without silhouette pops',()=>{
  const {world}=createHouse(new THREE.Scene()),dining=world.fixtures.get('dining-top'),bed=world.fixtures.get('bed-quilt');
  const cases=[
    {name:'floor',rabbit:{x:0,y:0,z:1},mistress:{x:0,y:0,z:0,yaw:0}},
    {name:'tabletop',rabbit:{x:14,y:dining.maxY,z:15},mistress:{x:14,y:0,z:13.05,yaw:0},support:dining},
    {name:'under-table',rabbit:{x:14,y:0,z:15},mistress:{x:14,y:0,z:13.05,yaw:0},support:dining},
    {name:'bed',rabbit:{x:-15,y:5.16,z:-13.5},mistress:{x:-11.8,y:4.2,z:-13.5,yaw:-Math.PI/2},support:bed},
  ];
  const point=new THREE.Vector3();
  function clearMesh(model,floor,label) {
    model.root.updateWorldMatrix(true,true);
    const position=model.root.position,boxes=world.query(position.x-1.5,position.z-1.5,position.x+1.5,position.z+1.5).filter(box=>!box.pushable);
    model.root.traverseVisible(mesh=>{
      if(!mesh.isMesh||mesh.material.transparent)return;
      const attribute=mesh.geometry.attributes.position;
      for(let index=0;index<attribute.count;index++) {
        point.fromBufferAttribute(attribute,index).applyMatrix4(mesh.matrixWorld);
        assert.ok(point.y>=floor-.005,`${label} sinks through its floor`);
        for(const box of boxes) {
          const inside=point.x>box.minX+.008&&point.x<box.maxX-.008&&point.y>box.minY+.008&&point.y<box.maxY-.008&&point.z>box.minZ+.008&&point.z<box.maxZ-.008;
          assert.equal(inside,false,`${label}: ${mesh.parent.name} clips ${box.id}`);
        }
      }
    });
  }
  for(const scenario of cases) {
    const capture=new MistressCapture(),mistress=createMistressModel(),rabbit=createRabbit();
    const initialHeadroom=visualHeadroom(world,scenario.rabbit);
    rabbit.root.position.copy(scenario.rabbit);rabbit.root.rotation.y=scenario.rabbit.facing??0;
    rabbit.animate(0,0,true,0,world.support(scenario.rabbit.x,scenario.rabbit.z,scenario.rabbit.y+.01,true).y,'idle',initialHeadroom);
    const ordinary=snapshot(rabbit);
    capture.begin({...scenario,headroom:initialHeadroom});let previous=null;
    for(let step=0;step<=180;step++) {
      const progress=step/180,{pose}=frame(capture,mistress,progress);
      rabbit.root.position.copy(pose.position);rabbit.root.rotation.y=pose.facing;
      const headroom=Math.min(visualHeadroom(world,rabbit.root.position),pose.headroom);
      rabbit.animate(progress*3,0,true,0,world.support(pose.position.x,pose.position.z,pose.position.y+.01,true).y,'carried',headroom,pose.carryWeight);
      if(step===0)assert.deepEqual(snapshot(rabbit),ordinary,`${scenario.name} begins at the exact ordinary rendered pose`);
      clearMesh(rabbit,scenario.mistress.y,`${scenario.name} rabbit at ${progress}`);
      clearMesh(mistress,scenario.mistress.y,`${scenario.name} mistress at ${progress}`);
      const samples=rabbit.getSightPoints();
      if(previous)for(let index=0;index<samples.length;index++)assert.ok(samples[index].distanceTo(previous[index])<.10,`${scenario.name}: animated silhouette jumps at ${progress}`);
      previous=samples.map(sample=>sample.clone());
    }
  }
});
