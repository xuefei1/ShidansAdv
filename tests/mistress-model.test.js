import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createMistressModel, MISTRESS_STANDING_PELVIS } from '../src/mistress-model.js';
import { findCoplanarColorOverlaps } from './surface-audit.js';
import { MISTRESS_RADIUS, MISTRESS_HEIGHT } from '../src/mistress-navigation.js';
import { MISTRESS_ACTIVITIES } from '../src/mistress-ai.js';
import { createHouse } from '../src/house.js';
import { createWaterFountains } from '../src/fountains.js';

const standingActions=['angry','typing','humming','tidying','gardening','vacuuming','cleaning'];
const activities=['idle','phone','cooking','eating','laundry','mopping','reading','sleeping',...standingActions];
const snapshot=model=>{
  const values=[];model.root.traverse(object=>values.push([object.uuid,...object.position.toArray(),...object.rotation.toArray(),...object.scale.toArray(),object.visible]));return values;
};

test('mistress fits a human-sized standing silhouette with floor-anchored feet',()=>{
  const model=createMistressModel();assert.equal(model.root.name,'Mistress');
  const bounds=new THREE.Box3().setFromObject(model.root),size=bounds.getSize(new THREE.Vector3());
  // Hidden props participate in Box3, so measure the actual visible body.
  const visible=new THREE.Box3();model.root.updateMatrixWorld(true);
  model.root.traverseVisible(object=>{if(object.isMesh && object!==model.shadow)visible.expandByObject(object);});
  assert.ok(visible.min.y>=-.01 && visible.min.y<.04,`feet ${visible.min.y}`);
  assert.ok(visible.max.y>2.65 && visible.max.y<2.75,`height ${visible.max.y}`);
  assert.ok(size.x<1.0);assert.equal(model.root.position.y,0);
});

test('household and scolding actions animate finite transforms and show only their own props',()=>{
  const model=createMistressModel();
  const expected={phone:['phone'],cooking:['spoon','pot'],eating:['bowl'],laundry:['towel'],mopping:['mop'],reading:['book'],vacuuming:['mop'],cleaning:['towel']};
  for(const activity of activities) {
    model.animate(23,{activity,activityTime:17,laughing:activity==='phone'});
    model.root.traverse(object=>{
      for(const value of [...object.position.toArray(),...object.quaternion.toArray(),...object.scale.toArray()])assert.ok(Number.isFinite(value),`${activity} ${object.name}`);
    });
    const props=Object.entries(model.props).filter(([,prop])=>prop.visible).map(([name])=>name);
    assert.deepEqual(props,expected[activity]||[]);
  }
});

test('the cooking pot rests on the counter and the spoon stays above it inside the pot',()=>{
  const model=createMistressModel();
  for(let index=0;index<16;index++) {
    model.animate(0,{activity:'cooking',activityTime:index*.2});model.root.updateMatrixWorld(true);
    const pot=new THREE.Box3().setFromObject(model.props.pot);
    const spoon=new THREE.Box3().setFromObject(model.props.spoon);
    assert.ok(pot.min.y>1.44 && pot.min.y<1.45,`pot base ${pot.min.y}`);
    assert.ok(pot.max.y>1.60 && pot.max.y<1.63,`pot rim ${pot.max.y}`);
    assert.ok(spoon.min.y>1.44 && spoon.min.y<pot.max.y,`spoon tip ${spoon.min.y} inside pot`);
  }
});

test('seated and sleep transitions blend from the standing pose without moving the room anchor',()=>{
  const model=createMistressModel();model.root.position.set(-13.6,4.2,-14);
  model.animate(0,{activity:'sleeping',poseWeight:0});assert.equal(model.joints.body.rotation.x,0);
  assert.equal(model.joints.body.position.y,MISTRESS_STANDING_PELVIS);assert.equal(model.joints.eyes.visible,true);
  model.animate(0,{activity:'sleeping',poseWeight:.5});assert.equal(model.joints.body.rotation.x,-Math.PI/4);
  model.animate(0,{activity:'sleeping'});assert.equal(model.joints.body.rotation.x,-Math.PI/2);
  assert.equal(model.joints.eyes.visible,false);assert.equal(model.joints.closedEyes.visible,true);
  assert.deepEqual(model.root.position.toArray(),[-13.6,4.2,-14]);
  model.animate(0,{activity:'phone',poseWeight:1});assert.ok(Math.abs(model.joints.body.position.y-1.11)<1e-9);
  assert.equal(model.joints.legs[0].rotation.x,-Math.PI/2);assert.equal(model.joints.shins[0].rotation.x,Math.PI/2);
  model.animate(0,{activity:'eating'});assert.ok(Math.abs(model.joints.body.position.y-.95)<1e-9);
});

test('sleeping rests wholly above the quilt and lifts feet over the bed edge during docking',()=>{
  const model=createMistressModel();
  for(const weight of [.2,.25,.4,.5,.75,.9,.95,.99,1]) {
    model.animate(0,{activity:'sleeping',poseWeight:weight});model.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3();
    model.root.traverseVisible(object=>{if(object.isMesh && object!==model.shadow)bounds.expandByObject(object);});
    assert.ok(bounds.min.y>.96,`sleep weight ${weight}: minimum ${bounds.min.y} clears quilt`);
    assert.ok(bounds.max.y<3.9,`sleep weight ${weight} clears ceiling`);
  }
});

test('the complete walking silhouette fits the navigation envelope through every gait phase',()=>{
  const model=createMistressModel(),point=new THREE.Vector3();
  for(let step=0;step<64;step++) {
    model.animate(step/13,{moving:true,speed:3.5});model.root.updateMatrixWorld(true);
    model.root.traverseVisible(object=>{
      if(!object.isMesh || object===model.shadow)return;
      const positions=object.geometry.attributes.position;
      for(let index=0;index<positions.count;index++) {
        point.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld);
        assert.ok(Math.hypot(point.x,point.z)<=MISTRESS_RADIUS,`${object.parent.name} clears radius`);
        assert.ok(point.y>=0 && point.y<=MISTRESS_HEIGHT,`${object.parent.name} clears headroom`);
      }
    });
  }
});

test('scolding and new standing gestures keep the body within its human navigation stance',()=>{
  const model=createMistressModel(),point=new THREE.Vector3();
  const props=new Set();Object.values(model.props).forEach(prop=>prop.traverse(object=>props.add(object)));
  for(const activity of standingActions)for(let sample=0;sample<64;sample++) {
    const time=sample*5/63;model.animate(time,{activity,activityTime:time});model.root.updateMatrixWorld(true);
    model.root.traverseVisible(object=>{
      if(!object.isMesh||object===model.shadow||props.has(object))return;
      const positions=object.geometry.attributes.position;
      for(let index=0;index<positions.count;index++) {
        point.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld);
        assert.ok(Math.hypot(point.x,point.z)<=MISTRESS_RADIUS,`${activity}: ${object.parent.name} clears radius`);
        assert.ok(point.y>=0&&point.y<=MISTRESS_HEIGHT,`${activity}: ${object.parent.name} clears headroom/floor`);
      }
    });
  }
});

test('angry scolding lowers the brows and animates a head shake, raised hand and heel',()=>{
  const model=createMistressModel();model.animate(0,{activity:'angry',activityTime:0});
  assert.ok(model.joints.brows[0].rotation.z<-.3&&model.joints.brows[1].rotation.z>.3);
  assert.ok(model.joints.forearms[1].rotation.x<-2);
  const initial={head:model.joints.head.rotation.y,hand:model.joints.forearms[1].rotation.x,heel:model.joints.shins[0].position.y};
  model.animate(.2,{activity:'angry',activityTime:.2});
  assert.notEqual(model.joints.head.rotation.y,initial.head);assert.notEqual(model.joints.forearms[1].rotation.x,initial.hand);
  assert.ok(model.joints.shins[0].position.y>initial.heel);
  assert.deepEqual(Object.values(model.props).filter(prop=>prop.visible),[]);
  model.animate(0,{activity:'idle'});
  assert.ok(model.joints.brows.every(brow=>brow.rotation.z===0));assert.equal(model.joints.shins[0].position.y,-.39);
});

test('cleanup bends the knees and looks down while reusing a small cloth or mop inside the clear stance',()=>{
  const model=createMistressModel(),point=new THREE.Vector3();
  for(const cleanupKind of ['poop','pee'])for(let sample=0;sample<64;sample++) {
    const activityTime=sample*10/63;model.animate(activityTime,{activity:'cleaning',activityTime,cleanupKind});model.root.updateMatrixWorld(true);
    assert.ok(model.joints.legs[0].rotation.x<-.25&&model.joints.shins[0].rotation.x>.25);
    assert.ok(model.joints.head.rotation.x>.25);
    assert.deepEqual(Object.entries(model.props).filter(([,prop])=>prop.visible).map(([name])=>name),[cleanupKind==='pee'?'mop':'towel']);
    model.root.traverseVisible(object=>{
      if(!object.isMesh||object===model.shadow)return;
      const positions=object.geometry.attributes.position;
      for(let index=0;index<positions.count;index++) {
        point.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld);
        assert.ok(Math.hypot(point.x,point.z)<=MISTRESS_RADIUS,`${cleanupKind}: ${object.parent.name} and prop clear furniture`);
        assert.ok(point.y>=0&&point.y<=MISTRESS_HEIGHT,`${cleanupKind}: ${object.parent.name} clears floor and headroom`);
      }
    });
  }
  model.animate(0,{activity:'cleaning',activityTime:0});const hand=model.joints.forearms[0].rotation.x;
  model.animate(.2,{activity:'cleaning',activityTime:.2});assert.notEqual(model.joints.forearms[0].rotation.x,hand);
});

test('cleanup restores the original laundry and sweeping prop scales and poses',()=>{
  const model=createMistressModel(),pose=object=>[...object.position.toArray(),...object.rotation.toArray(),...object.scale.toArray()];
  for(const [activity,prop] of [['laundry','towel'],['mopping','mop'],['vacuuming','mop']]) {
    model.animate(2,{activity,activityTime:2});const expected=pose(model.props[prop]);
    for(const cleanupKind of ['poop','pee']) {
      model.animate(.3,{activity:'cleaning',activityTime:.3,cleanupKind});
      model.animate(2,{activity,activityTime:2});assert.deepEqual(pose(model.props[prop]),expected);
    }
  }
});

test('rage adds angry brows to the existing run gait and clears without replacing the active pose',()=>{
  const model=createMistressModel(),pose=object=>[...object.position.toArray(),...object.rotation.toArray()];
  const rig=[model.joints.body,model.joints.head,...model.joints.arms,...model.joints.forearms,...model.joints.legs,...model.joints.shins];
  model.animate(.15,{moving:true,speed:7});const baseline=rig.map(pose);
  model.animate(.15,{moving:true,speed:7,enraged:true});assert.deepEqual(rig.map(pose),baseline);
  assert.ok(model.joints.brows[0].rotation.z<-.3&&model.joints.brows[1].rotation.z>.3);
  assert.equal(model.joints.legs[0].rotation.x,-model.joints.legs[1].rotation.x);
  model.animate(.15,{moving:true,speed:7,enraged:false});assert.deepEqual(rig.map(pose),baseline);
  assert.ok(model.joints.brows.every(brow=>brow.rotation.z===0));
});

test('visibility samples track the real head and chest in standing, seated and sleeping poses',()=>{
  const model=createMistressModel();model.root.position.set(4,4.2,-9);model.root.rotation.y=Math.PI/2;
  const sample=model.getSightPoints();
  for(const activity of ['idle','phone','sleeping']) {
    model.animate(0,{activity});const current=model.getSightPoints();assert.equal(current,sample);
    const headBounds=new THREE.Box3().setFromObject(model.joints.head);
    assert.ok(headBounds.containsPoint(current[0]));assert.ok(current[0].y>4.2);
    assert.ok(current[1].distanceTo(current[0])>.1);
  }
});

test('enlarged action poses and every docking stage clear the actual furnished house',()=>{
  const scene=new THREE.Scene(),{world}=createHouse(scene);createWaterFountains(scene,world);
  const model=createMistressModel(),point=new THREE.Vector3(),propObjects=new Set();
  Object.values(model.props).forEach(prop=>prop.traverse(object=>propObjects.add(object)));
  function check(label) {
    model.root.updateMatrixWorld(true);
    model.root.traverseVisible(object=>{
      if(!object.isMesh || object===model.shadow || propObjects.has(object))return;
      const bounds=new THREE.Box3().setFromObject(object);
      const candidates=world.solids.filter(box=>!box.pushable &&
        bounds.min.x<box.maxX && bounds.max.x>box.minX && bounds.min.y<box.maxY && bounds.max.y>box.minY &&
        bounds.min.z<box.maxZ && bounds.max.z>box.minZ);
      const positions=object.geometry.attributes.position;
      for(let index=0;index<positions.count;index++) {
        point.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld);
        for(const box of candidates) {
          const inside=point.x>box.minX+.003 && point.x<box.maxX-.003 && point.y>box.minY+.003 &&
            point.y<box.maxY-.003 && point.z>box.minZ+.003 && point.z<box.maxZ-.003;
          assert.equal(inside,false,`${label}: ${object.parent.name} enters ${box.id||'furniture'}`);
        }
      }
    });
  }
  for(const activity of MISTRESS_ACTIVITIES) {
    const location=activity.seat||activity.approach;
    model.root.position.set(location.x,location.y,location.z);model.root.rotation.y=activity.yaw;
    for(let phase=0;phase<13;phase++) {
      model.animate(phase/4,{activity:activity.animation??activity.id,activityTime:phase/4,laughing:activity.id==='phone'});
      check(`${activity.id} phase ${phase}`);
    }
    if(!activity.seat)continue;
    for(let step=0;step<=80;step++) {
      const weight=step/80,a=activity.approach,b=activity.seat;
      model.root.position.set(a.x+(b.x-a.x)*weight,a.y,a.z+(b.z-a.z)*weight);
      model.animate(0,{activity:activity.animation??activity.id,poseWeight:weight});check(`${activity.id} dock ${weight}`);
    }
  }
});

test('returning from an activity fully restores the same walk pose and keeps mesh identities stable',()=>{
  const model=createMistressModel();
  const walk={moving:true,speed:3.5,activity:'idle'};model.animate(2,walk);const baseline=snapshot(model);
  const geometry=[],meshes=[];model.root.traverse(object=>{if(object.isMesh){geometry.push(object.geometry);meshes.push(object);}});
  for(const activity of activities) {
    model.animate(27,{activity,activityTime:13,laughing:true});model.animate(2,walk);
    // Hidden prop transforms may preserve their last animated pose; visible rig
    // transforms must match, and all props remain hidden during walking.
    const current=snapshot(model);
    const propIds=new Set();Object.values(model.props).forEach(prop=>prop.traverse(object=>propIds.add(object.uuid)));
    assert.deepEqual(current.filter(row=>!propIds.has(row[0])),baseline.filter(row=>!propIds.has(row[0])));
  }
  const after=[];model.root.traverse(object=>{if(object.isMesh)after.push(object);});assert.deepEqual(after,meshes);
  assert.deepEqual(after.map(mesh=>mesh.geometry),geometry);
});

test('animated body stays cheaply batched and never invalidates cached sunlight shadows',()=>{
  const model=createMistressModel();let meshes=0;model.root.traverse(object=>{if(object.isMesh){meshes++;assert.equal(object.castShadow,false);}});
  assert.ok(meshes<=23,`model uses ${meshes} rigid draws`);
  assert.equal(model.shadow.material.depthWrite,false);assert.equal(model.shadow.material.polygonOffset,true);
  model.animate(1,{activity:'phone'});let visible=0;model.root.traverseVisible(object=>{if(object.isMesh)visible++;});assert.ok(visible<=17);
});

test('walking swings opposite legs and arms, while silent activities have visible distinct gestures',()=>{
  const model=createMistressModel();model.animate(.15,{moving:true,speed:3.5});
  assert.ok(model.joints.legs[0].rotation.x>0);assert.ok(model.joints.legs[1].rotation.x<0);
  assert.ok(model.joints.arms[0].rotation.x<0);assert.ok(model.joints.arms[1].rotation.x>0);
  model.animate(0,{activity:'laundry',activityTime:0});const fold=model.joints.forearms[0].rotation.z;
  model.animate(0,{activity:'laundry',activityTime:.5});assert.notEqual(model.joints.forearms[0].rotation.z,fold);
  model.animate(0,{activity:'mopping',activityTime:0});const mop=model.props.mop.position.z;
  model.animate(0,{activity:'mopping',activityTime:.5});assert.notEqual(model.props.mop.position.z,mop);
});

test('every routine pose and its props passes the different-colour coplanar surface audit',()=>{
  const model=createMistressModel();
  for(const activity of activities) {
    model.animate(0,{activity,activityTime:1});
    assert.equal(findCoplanarColorOverlaps(model.root).length,0,`${activity} has no competing flat faces`);
  }
  model.animate(0,{activity:'cleaning',activityTime:1,cleanupKind:'pee',enraged:true});
  assert.equal(findCoplanarColorOverlaps(model.root).length,0,'the mop cleanup and rage expression have no competing flat faces');
});
