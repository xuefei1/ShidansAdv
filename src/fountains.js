import * as THREE from '../vendor/three.module.js';
import { WaterSystem, FOUNTAIN_PLACEMENTS } from './water.js';
import { FLOOR_HEIGHT, HOUSE } from './layout.js';
import { cylinder, sceneryEllipsoid, beam, mat } from './model.js';
import { batchStaticGeometry } from './render-batching.js';
import { applySurfaceOverlay } from './surface-materials.js';

export const MAX_PUDDLES = 256;
export const PUDDLE_CLEARANCE = .045;

function puddleGeometry() {
  const positions=[],colors=[],normal=[],segments=32;
  const shade=color=>new THREE.Color(color);
  const rim=shade(0x997016),wet=shade(0xe9b922),highlight=shade(0xffe6a3);
  const vertex=(point,color)=>{positions.push(...point);colors.push(color.r,color.g,color.b);normal.push(0,0,1);};
  const edge=(angle,radius,z)=>{
    const wobble=1+.035*Math.sin(angle*3)+.022*Math.cos(angle*5);
    return [Math.cos(angle)*radius*wobble,Math.sin(angle)*radius*wobble,z];
  };
  for(let i=0;i<segments;i++) {
    const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
    for(const point of [edge(a,.90,0),edge(a,1,0),edge(b,1,0),edge(a,.90,0),edge(b,1,0),edge(b,.90,0)]) vertex(point,rim);
    for(const point of [[0,0,.006],edge(a,.915,.006),edge(b,.915,.006)]) vertex(point,wet);
    // One offset reflection is integrated into the same mesh/draw. Its real
    // height separation keeps the gold fill and highlight from depth flicker.
    for(const point of [[-.25,.23,.012],[-.25+Math.cos(a)*.24,.23+Math.sin(a)*.065,.012],[-.25+Math.cos(b)*.24,.23+Math.sin(b)*.065,.012]]) vertex(point,highlight);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function createFountainModel() {
  const group=new THREE.Group();
  cylinder(group,0xfff2db,0,.05,0,.36,.10,.38,20);
  cylinder(group,0xb1d6c6,0,.17,0,.37,.14,.42,20);
  // The dull inner dish stays visible as its finite pool recedes. Separate
  // instanced water and streams can disappear without rebuilding the bowl.
  cylinder(group,0xd4dfce,0,.244,0,.333,.004,.333,20);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.37,.041,6,24),mat(0xfff4df));
  rim.rotation.x=Math.PI/2; rim.position.y=.268; group.add(rim);
  beam(group,0x7cbaa9,[0,.24,-.24],[0,.50,-.24],.041);
  beam(group,0x7cbaa9,[0,.50,-.24],[0,.50,-.09],.041);
  group.traverse(mesh=>{ if(mesh.isMesh) {mesh.castShadow=false;mesh.receiveShadow=true;} });
  batchStaticGeometry(group,{cellSize:Infinity});
  return group.children[0];
}

function createFountainWaterModel(stream=false) {
  const group=new THREE.Group();
  if(stream) cylinder(group,0xb9e9ed,0,0,0,.013,.226,.013,8);
  else {
    cylinder(group,0x84cbdc,0,0,0,.33,.012,.33,20);
    sceneryEllipsoid(group,0xe9fbef,.13,.007,.10,.065,.008,.025);
  }
  group.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=false;mesh.receiveShadow=true;}});
  batchStaticGeometry(group,{cellSize:Infinity});return group.children[0];
}

const outdoorItem=item=>['balcony','yard','front-yard'].includes(item.room);
const poolFor=event=>event.y>=FLOOR_HEIGHT-.1 && event.x>=HOUSE.minX && event.x<=HOUSE.maxX && event.z>=HOUSE.minZ && event.z<=HOUSE.maxZ ? 1 :
  event.x<HOUSE.minX || event.x>HOUSE.maxX || event.z<HOUSE.minZ || event.z>HOUSE.maxZ ? 2 : 0;

export function createWaterFountains(scene, world) {
  const groups=[new THREE.Group(),new THREE.Group(),new THREE.Group()];
  groups.forEach((group,index)=>{group.name=['Ground-floor fountains','Upper-floor fountains','Outdoor fountains'][index];scene.add(group);});
  const items=FOUNTAIN_PLACEMENTS.map(placement=>({...placement}));
  for(const item of items) {
    item.colliders=[world.addBox(item.x,item.y+.155,item.z,.84,.31,.84,'wood'),
      world.addBox(item.x,item.y+.425,item.z-.18,.14,.23,.32,'wood')];
    for(const [index,collider] of item.colliders.entries()) {
      collider.id=`${item.id}:${index}`;collider.fountainId=item.id;
      world.fixtures?.set(collider.id,collider);
    }
    item.collider=item.colliders[0];
  }
  const system=new WaterSystem(world,{items}), transform=new THREE.Object3D();
  // Fourteen shells need three static draws. Water/streams add six bounded
  // shared draws, updated only when a reservoir changes rather than per frame.
  const source=createFountainModel(),waterSource=createFountainWaterModel(),streamSource=createFountainWaterModel(true);
  const waterMeshes=[],streamMeshes=[],stationLayers=[];
  groups.forEach((group,layer)=>{
    const stations=items.filter(item=>(outdoorItem(item)?2:item.floor)===layer);
    const mesh=new THREE.InstancedMesh(source.geometry,source.material,stations.length);
    mesh.name=`Water fountains layer ${layer}`;mesh.receiveShadow=true;mesh.frustumCulled=false;
    stations.forEach((item,index)=>{transform.position.set(item.x,item.y,item.z);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);});
    group.add(mesh);
    stationLayers.push(stations);
    for(const [model,name,collection] of [[waterSource,'Fountain water',waterMeshes],[streamSource,'Fountain streams',streamMeshes]]) {
      const liquid=new THREE.InstancedMesh(model.geometry,model.material,stations.length);
      liquid.name=`${name} layer ${layer}`;liquid.receiveShadow=true;liquid.frustumCulled=false;
      liquid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(liquid);collection.push(liquid);
    }
  });
  const tint=new THREE.Color();
  function syncWater() {
    stationLayers.forEach((stations,layer)=>{
      const waterMesh=waterMeshes[layer],streamMesh=streamMeshes[layer];waterMesh.count=streamMesh.count=0;
      for(const item of stations) {
        const fraction=system.remaining(item)/100;if(fraction<=0)continue;
        const radius=.4+.6*Math.sqrt(fraction);
        transform.position.set(item.x,item.y+.252,item.z);transform.rotation.set(0,0,0);transform.scale.set(radius,1,radius);transform.updateMatrix();
        const index=waterMesh.count++;waterMesh.setMatrixAt(index,transform.matrix);
        tint.setRGB(.65+.35*fraction,.78+.22*fraction,.78+.22*fraction);waterMesh.setColorAt(index,tint);
        transform.position.set(item.x,item.y+.371,item.z-.09);transform.scale.set(1,1,1);transform.updateMatrix();
        streamMesh.setMatrixAt(streamMesh.count++,transform.matrix);
      }
      waterMesh.instanceMatrix.needsUpdate=streamMesh.instanceMatrix.needsUpdate=true;
      if(waterMesh.instanceColor)waterMesh.instanceColor.needsUpdate=true;
    });
  }
  syncWater();
  const geometry=puddleGeometry(), material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.28,transparent:true,opacity:.78,depthWrite:false});
  const puddleMeshes=groups.map((group,index)=>{
    const mesh=applySurfaceOverlay(new THREE.InstancedMesh(geometry,material,MAX_PUDDLES));
    // Puddles share the floor plane, including when two occupy the same spot.
    // Blend them in instance order without writing competing depths, while
    // opaque walls and furniture still occlude them through normal depth tests.
    mesh.material.depthWrite=false;mesh.material.depthTest=true;
    mesh.name=`Pee puddles layer ${index}`;mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);return mesh;
  });
  const puddles=[];let puddleSequence=0;
  function syncPuddles() {
    for(const mesh of puddleMeshes) mesh.count=0;
    for(const event of puddles) {
      const mesh=puddleMeshes[poolFor(event)],radius=(.45+.6*Math.sqrt(event.amount/100))*(.18+.82*event.progress);
      transform.position.set(event.x,event.y+PUDDLE_CLEARANCE,event.z);
      transform.rotation.set(-Math.PI/2,0,0);transform.scale.set(radius*1.3,radius,1);transform.updateMatrix();
      mesh.setMatrixAt(mesh.count++,transform.matrix);
    }
    for(const mesh of puddleMeshes) mesh.instanceMatrix.needsUpdate=true;
  }
  return {system,items,groups,puddles,puddleMeshes,waterMeshes,streamMeshes,
    advance(dt,player) {
      const progress=system.peeProgress,revision=system.waterRevision;system.advance(dt,player);
      if(progress!==system.peeProgress)syncPuddles();
      if(revision!==system.waterRevision)syncWater();
    },
    pee(player) {
      const event=system.pee(player);if(!event) return null;
      // Keep identity stable while instances compact or the cap replaces an
      // old puddle. IDs do not repeat when a new round resets this view.
      event.id=++puddleSequence;
      if(puddles.length===MAX_PUDDLES) puddles.shift();puddles.push(event);syncPuddles();return event;
    },
    removePuddle(puddle) {
      if(!puddle||!(puddle.progress>=1))return false;
      const index=puddles.indexOf(puddle);if(index<0)return false;
      // Cleanup affects scenery only. The bladder and action cooldown belong
      // to WaterSystem and must survive removal of a completed puddle.
      puddles.splice(index,1);syncPuddles();return true;
    },
    reset() {system.reset();puddles.length=0;syncPuddles();syncWater();},
    setUpperVisible(visible) {groups[1].visible=visible;},
  };
}
