import * as THREE from '../vendor/three.module.js';
import {BASEMENT} from './layout.js';
import {sceneryEllipsoid,cylinder,mat} from './model.js';
import {batchStaticGeometry} from './render-batching.js';
import {MazeAffection} from './maze-affection.js';

export const MAZE_PLUSH_SCALE=.52;
export const MAX_KISS_HEARTS=64;
export const KISS_HEARTS_PER_SECOND=24;
export const KISS_HEART_LIFETIME=1.65;

// Flat, layered ink geometry makes the carrot part of the fabric, with no
// pickup, food collider or interaction attached to it.
function carrotPrint(parent) {
  const print=new THREE.Group();print.name='Carrot drawing on the yellow rug';
  print.userData.rugPrint=true;parent.add(print);
  const ink=(name,color,shape,y)=>{
    const geometry=new THREE.ShapeGeometry(shape,12);geometry.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color}));
    mesh.name=name;mesh.position.y=y;mesh.castShadow=false;print.add(mesh);
  };
  const carrot=new THREE.Shape();carrot.moveTo(-.36,.60);
  carrot.bezierCurveTo(-.58,.15,-.24,-.80,0,-1.08);
  carrot.bezierCurveTo(.24,-.80,.58,.15,.36,.60);
  carrot.quadraticCurveTo(0,.80,-.36,.60);
  ink('Printed orange carrot',0xf09336,carrot,.018);
  for(const [lean,height,color] of [[-.55,1.16,0x4d985f],[0,1.48,0x68ab5f],[.59,1.17,0x76b66a]]) {
    const leaf=new THREE.Shape();leaf.moveTo(0,.55);
    leaf.quadraticCurveTo(lean-.17,height-.12,lean,height);
    leaf.quadraticCurveTo(lean+.24,height-.20,.08,.55);
    ink('Printed carrot leaf',color,leaf,.022);
  }
  const highlight=new THREE.Shape();highlight.moveTo(.18,.44);
  highlight.quadraticCurveTo(.33,-.05,.07,-.65);
  highlight.quadraticCurveTo(.21,-.04,.07,.48);
  ink('Printed carrot highlight',0xffc26a,highlight,.026);
  for(const [x,y,w] of [[-.30,.28,.21],[-.20,-.12,.16],[-.10,-.50,.10]]) {
    const crease=new THREE.Shape();crease.moveTo(x,y);crease.lineTo(x+w,y-.05);crease.lineTo(x+w*.8,y-.09);crease.lineTo(x,y-.035);crease.closePath();
    ink('Printed carrot stripe',0xd9762e,crease,.030);
  }
  print.rotation.y=-.23;print.position.set(.18,BASEMENT.y,.36);
  batchStaticGeometry(print,{cellSize:Infinity});return print;
}

export function createMazeHeart({parent,world,layout}) {
  const group=new THREE.Group();group.name='The blue bunny sanctuary';parent.add(group);
  const rug=cylinder(group,0xf0cf6c,0,BASEMENT.y+.006,0,1,.012,1,64);
  rug.name='Yellow carrot rug';rug.userData.rug=true; rug.castShadow=false;
  const edge=new THREE.Mesh(new THREE.TorusGeometry(1,.009,5,64),mat(0xffe9a2));
  edge.rotation.x=Math.PI/2;edge.position.y=BASEMENT.y+.014;group.add(edge);
  const artwork=carrotPrint(group);
  const toy=new THREE.Group();toy.name='Blue rabbit plush';group.add(toy);
  const blue=0x82b8e1,light=0xbbd8ed,ears=[];
  const shape=(color,x,y,z,a,b,c)=>sceneryEllipsoid(toy,color,x,y,z,a,b,c);
  shape(blue,0,.34,0,.31,.37,.25);shape(light,0,.34,.18,.23,.27,.09);
  shape(blue,0,.76,.04,.27,.26,.25);
  for(const side of [-1,1]) {
    // Grow each ear from the upper skull. Rotating the root makes the whole
    // ear and its inner marking lean outward together, like Shidan's ears.
    const ear=new THREE.Group();ear.name=side<0?'Plush left ear':'Plush right ear';
    ear.position.set(side*.145,.965,.025);ear.rotation.set(-.09,0,-side*.24);toy.add(ear);ears.push(ear);
    sceneryEllipsoid(ear,blue,0,.24,0,.095,.28,.075);
    sceneryEllipsoid(ear,light,0,.25,.067,.047,.21,.014);
    shape(blue,side*.27,.11,.15,.19,.12,.22);
    shape(blue,side*.32,.39,.05,.13,.22,.12);
    shape(0x253646,side*.105,.80,.262,.032,.039,.019);
    shape(0xf8f5e7,side*.11-.007,.811,.278,.009,.012,.005);
  }
  shape(light,0,.68,.265,.10,.075,.048);shape(0x777f9b,0,.705,.308,.035,.025,.016);
  shape(light,0,.23,-.23,.11,.11,.10);
  toy.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
  batchStaticGeometry(toy,{cellSize:Infinity});
  toy.scale.setScalar(MAZE_PLUSH_SCALE);
  toy.updateWorldMatrix(true,true);
  const toyBounds=new THREE.Box3().setFromObject(toy),toySize=toyBounds.getSize(new THREE.Vector3());
  const toyCenter=toyBounds.getCenter(new THREE.Vector3());
  const toyLift=-toyBounds.min.y;
  const item={id:'maze-blue-bunny',type:'plush',x:0,y:BASEMENT.y,z:0};
  const collider=world.addDynamicBox(toyCenter.x,BASEMENT.y+toyLift+toyCenter.y,toyCenter.z,toySize.x,toySize.y,toySize.z,'concrete');
  collider.id=item.id;collider.consumableId=item.id;collider.mazeFixture=true;item.collider=collider;
  const action=new MazeAffection(world,item);
  const heart=new THREE.Shape();heart.moveTo(0,.12);heart.bezierCurveTo(-.24,.38,-.4,.05,0,-.25);heart.bezierCurveTo(.4,.05,.24,.38,0,.12);
  const hearts=new THREE.InstancedMesh(new THREE.ShapeGeometry(heart,8),new THREE.MeshBasicMaterial({color:0xf29bc2,side:THREE.DoubleSide,depthWrite:false}),MAX_KISS_HEARTS);
  hearts.name='Kiss floating hearts';
  hearts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);hearts.frustumCulled=false;hearts.count=0;group.add(hearts);
  const transform=new THREE.Object3D(),particles=[];
  let elapsed=0,emissionStart=null,nextHeart=0;
  function reset(nextLayout=layout) {
    layout=nextLayout;group.position.set(layout.heart.x,0,layout.heart.z);
    const radius=layout.heart.radius??2.05;
    rug.scale.set(radius,1,radius);edge.scale.set(radius-.04,radius-.04,1);
    artwork.scale.setScalar(Math.min(1,radius/2.05));
    toy.position.set(0,BASEMENT.y+toyLift,-.85);
    toy.rotation.set(0,0,0);
    item.x=layout.heart.x;item.z=layout.heart.z-.85;
    world.moveDynamicBox(collider,item.x+toyCenter.x-(collider.minX+collider.maxX)/2,
      item.y+toyLift+toyCenter.y-(collider.minY+collider.maxY)/2,item.z+toyCenter.z-(collider.minZ+collider.maxZ)/2);
    action.reset();particles.length=0;hearts.count=0;elapsed=nextHeart=0;emissionStart=null;
  }
  function update(dt,camera,{visible=true,burst=false}={}) {
    dt=Number.isFinite(dt)?Math.max(0,dt):0;
    const start=elapsed;elapsed+=dt;group.visible=visible;
    for(let i=particles.length-1;i>=0;i--){particles[i].age+=dt;if(particles[i].age>=KISS_HEART_LIFETIME)particles.splice(i,1);}
    if(action.active||burst) {
      if(emissionStart===null){emissionStart=start;nextHeart=0;}
      const last=Math.floor((elapsed-emissionStart)*KISS_HEARTS_PER_SECOND+1e-9);
      const first=Math.max(nextHeart,Math.floor((elapsed-KISS_HEART_LIFETIME-emissionStart)*KISS_HEARTS_PER_SECOND)+1);
      // Skip expired emissions after a delayed frame instead of allocating a
      // backlog. Integer cadence indices give the same density at every FPS.
      for(let index=first;index<=last&&particles.length<MAX_KISS_HEARTS;index++) {
        const age=elapsed-emissionStart-index/KISS_HEARTS_PER_SECOND,phase=index*2.399963+emissionStart;
        if(age<KISS_HEART_LIFETIME)particles.push({age,phase,x:Math.sin(phase)*.53,z:-.66+Math.cos(phase)*.28,lift:.09*(index%3)});
      }
      nextHeart=last+1;
    } else emissionStart=null;
    hearts.count=0;
    for(let i=particles.length-1;i>=0;i--) {
      const p=particles[i];
      transform.position.set(p.x+Math.sin(p.phase+p.age*4)*.12,BASEMENT.y+.45+p.lift+p.age*.86,p.z);
      if(camera)transform.quaternion.copy(camera.quaternion);
      transform.scale.setScalar(.33*Math.sqrt(Math.max(0,1-p.age/KISS_HEART_LIFETIME)));transform.updateMatrix();hearts.setMatrixAt(hearts.count++,transform.matrix);
    }
    hearts.instanceMatrix.needsUpdate=true;
    toy.rotation.z=action.active?Math.sin(elapsed*7)*.035:0;
  }
  group.traverse(o=>{if(o.isMesh)o.userData.dynamicMaze=true;});
  reset();return {group,item,action,reset,update,toy,ears,rug,artwork,get heartCount(){return hearts.count;}};
}
