import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createRabbit} from '../src/model.js';
import {createHouse,batchStaticGeometry} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {createMistressModel} from '../src/mistress-model.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {MistressNavigation} from '../src/mistress-navigation.js';

const scenarios=[
  ['idle',0,true,0,'idle'],['running',8.8,true,0,'idle'],['charging',0,true,1,'idle'],
  ['airborne',6,false,0,'idle'],['eating',0,true,0,'eat'],['drinking',0,true,0,'drink'],['peeing',0,true,0,'pee'],
];
const directMesh=joint=>joint.children.find(child=>child.isMesh);
const direction=new THREE.Vector3(.857,.312,.409).normalize();

// Signed crossings test the actual triangles, including overlapping fur
// ellipsoids in a rigid batch. Samples must remain inside some opaque fur.
function insideFur(point,mesh) {
  const ray=new THREE.Raycaster(point.clone().addScaledVector(direction,-10),direction,0,10-1e-7);
  const material=mesh.material,side=material.side;let hits;
  try {material.side=THREE.DoubleSide;hits=ray.intersectObject(mesh,false);}
  finally {material.side=side;}
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  let depth=0,previous=-Infinity;
  for(const hit of hits) {
    if(Math.abs(hit.distance-previous)<1e-7)continue;
    previous=hit.distance;
    const normal=hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    depth+=normal.dot(direction)<0?1:-1;
  }
  return depth>0;
}
function highestVertex(rabbit) {
  let top=-Infinity;const point=new THREE.Vector3();
  rabbit.joints.body.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const attribute=mesh.geometry.attributes.position;
    for(let index=0;index<attribute.count;index++) {
      point.fromBufferAttribute(attribute,index).applyMatrix4(mesh.matrixWorld);top=Math.max(top,point.y);
    }
  });
  return top;
}

test('rabbit sight points reuse their array and vectors while following animated and parent transforms',()=>{
  const rabbit=createRabbit(),parent=new THREE.Group();parent.position.set(3,2,-5);parent.rotation.y=.7;parent.add(rabbit.root);
  rabbit.root.position.set(4,1,-2);rabbit.root.rotation.y=-.3;rabbit.animate(.2);
  const points=rabbit.getSightPoints(),identities=points.slice(),before=points.map(point=>point.toArray());
  assert.equal(points.length,8);assert.equal(new Set(points).size,8);
  rabbit.root.position.x+=2;parent.position.z+=3;rabbit.animate(.8,8,true);
  assert.equal(rabbit.getSightPoints(),points);
  points.forEach((point,index)=>{assert.equal(point,identities[index]);assert.ok(Number.isFinite(point.x+point.y+point.z));});
  assert.notDeepEqual(points.map(point=>point.toArray()),before);
  const head=rabbit.joints.head.localToWorld(new THREE.Vector3(0,0,.035));assert.ok(points[2].distanceTo(head)<1e-10);
  assert.notEqual(createRabbit().getSightPoints(),points);
});

test('every sight point stays inside its actual fur mesh throughout actions and ceiling tucks',()=>{
  const rabbit=createRabbit();rabbit.root.position.set(19.95,7.42,-12.3);rabbit.root.rotation.y=.8;
  const {body,head,ears}=rabbit.joints,meshes=[body,body,head,head,ears[0],ears[1],ears[0],ears[1]].map(directMesh);
  for(const headroom of [Infinity,1,.655])for(const [name,speed,grounded,charge,action] of scenarios)for(let frame=0;frame<6;frame++) {
    rabbit.animate(frame*.43,speed,grounded,charge,6.1,action,headroom);
    const points=rabbit.getSightPoints(),top=highestVertex(rabbit);
    for(let index=0;index<points.length;index++) {
      assert.ok(insideFur(points[index],meshes[index]),`${name} ${headroom} phase ${frame}, point ${index} left the visible fur`);
      assert.ok(points[index].y<=top+1e-8);
      if(Number.isFinite(headroom))assert.ok(points[index].y<=rabbit.root.position.y+headroom+1e-8);
    }
  }
});

test('sight samples lower with the ceiling pose and restore without changing rigid geometry or shadow',()=>{
  const rabbit=createRabbit(),meshes=[];rabbit.root.traverse(object=>{if(object.isMesh)meshes.push(object);});
  const original=meshes.map(mesh=>({geometry:mesh.geometry,material:mesh.material,attribute:mesh.geometry.attributes.position,version:mesh.geometry.attributes.position.version}));
  const shadow=rabbit.root.children.find(child=>child.isMesh);rabbit.root.position.y=7.42;
  rabbit.animate(.4,6,false,0,6.1);const ordinary=rabbit.getSightPoints().map(point=>point.toArray());
  rabbit.animate(.4,6,false,0,6.1,'idle',.655);const tucked=rabbit.getSightPoints();
  assert.ok(Math.max(...tucked.map(point=>point.y))<7.42+.655);
  assert.ok(tucked[6].y<ordinary[6][1]-.5,'the ear-tip target follows its folded ear');
  rabbit.animate(.4,6,false,0,6.1);assert.deepEqual(rabbit.getSightPoints().map(point=>point.toArray()),ordinary);
  assert.equal(meshes.length,11);
  meshes.forEach((mesh,index)=>{
    assert.equal(mesh.geometry,original[index].geometry);assert.equal(mesh.material,original[index].material);
    assert.equal(mesh.geometry.attributes.position,original[index].attribute);assert.equal(mesh.geometry.attributes.position.version,original[index].version);
  });
  assert.equal(shadow.position.y,6.1-7.42+.014);
});

test('visible animated head and ears reveal a real tabletop rabbit above the studio monitor',()=>{
  const scene=new THREE.Scene(),{world,layers,ceiling}=createHouse(scene);layers.forEach(batchStaticGeometry);
  const fountains=createWaterFountains(scene,world),sight=new MistressSight([...layers,ceiling,...fountains.groups]);
  const vision=new MistressVision(sight,world),navigation=new MistressNavigation(world),mistress=createMistressModel(),rabbit=createRabbit();
  const player={x:14,y:5.66,z:-12.82},position={x:18.5,y:4.2,z:-12},yaw=Math.atan2(player.x-position.x,player.z-position.z);
  assert.equal(navigation.canStand(position),true);assert.equal(world.support(player.x,player.z,player.y+.01,true).y,player.y);
  mistress.root.position.set(position.x,position.y,position.z);mistress.root.rotation.y=yaw;mistress.animate(2,{moving:true,speed:3.5});
  rabbit.root.position.set(player.x,player.y,player.z);rabbit.animate(2);const samples=rabbit.getSightPoints();
  const actor={position,eye:mistress.getSightPoints()[0],yaw};
  assert.equal(vision.canSee(actor,player),false,'the monitor really blocks all four lower default samples');
  assert.equal(sight.hasLineOfSight(actor.eye,[samples[3]],{includeHidden:true}),true,'the rendered head projects above the monitor');
  assert.equal(vision.canSee(actor,player,{samples}),true);
  assert.equal(vision.canSee({...actor,yaw:yaw+Math.PI},player,{samples}),false,'visible ears do not bypass the facing cone');
  assert.equal(vision.canSee({...actor,asleep:true},player,{samples}),false);
  assert.equal(vision.targetSamples(player).length,4,'physical contact retains the original lower body samples');
  const contact=vision.targetSamples(player).map(point=>point.toArray());vision.canSee(actor,player,{samples});
  assert.deepEqual(vision.targetSamples(player).map(point=>point.toArray()),contact);
  const wall=world.addDynamicBox(16.5,6.4,-12.4,.2,3.5,3);
  assert.equal(vision.canSee(actor,player,{samples}),false,'solid moving cover still hides the entire animated silhouette');
  world.removeBox(wall);
});
