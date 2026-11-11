import * as THREE from '../vendor/three.module.js';
import { FLOOR_HEIGHT as H, BASEMENT } from './layout.js';
import { cube, cylinder } from './model.js';

// Keep bases out of doorways, shortcuts and existing furniture-climbing routes.
export const LAMP_PLACEMENTS = Object.freeze([
  ['den-pendant',0,'ceiling',-16,12], ['lounge-pendant',0,'ceiling',-12,5],
  ['hall-pendant',0,'ceiling',-1.5,16], ['dining-pendant',0,'ceiling',14,15],
  ['kitchen-pendant',0,'ceiling',14,7], ['library-pendant',0,'ceiling',-14,-11],
  ['garden-pendant',0,'ceiling',1,-11], ['craft-pendant',0,'ceiling',17,-11],
  ['bedroom-pendant',1,'ceiling',-14,-8], ['reading-pendant',1,'ceiling',1,-10],
  ['studio-pendant',1,'ceiling',15,-8], ['gallery-pendant',1,'ceiling',2,-.5],
  ['sofa-lamp',0,'floor',-21,5.8], ['library-lamp',0,'floor',-18,-4.5],
  ['dining-lamp',0,'floor',20,18], ['bedroom-lamp',1,'floor',-22,-7.5],
  ['reading-lamp',1,'floor',5.5,-15.5], ['studio-lamp',1,'floor',18,-4.5],
  ['basement-west-north',-1,'ceiling',-16,-10], ['basement-centre-north',-1,'ceiling',0,-10],
  ['basement-east-north',-1,'ceiling',16,-10], ['basement-west-south',-1,'ceiling',-16,10],
  ['basement-centre-south',-1,'ceiling',0,10], ['basement-east-south',-1,'ceiling',16,10],
].map(([id,floor,kind,x,z]) => Object.freeze({id,floor,kind,x,z,y:floor*H+(kind==='ceiling'?3.48:1.72)})));

// All five maze designs share their cell grid, even though their passages
// differ. Centering pendants in those cells clears every possible wall line
// and keeps baked shades, colliders and live light positions in agreement.
export function mazeCeilingLampPlacements(layout) {
  if(!layout)return LAMP_PLACEMENTS.filter(lamp=>lamp.floor===-1);
  const {columns,rows}=layout.bounds;
  const columnsAt=[Math.floor(columns/6),Math.floor((columns-1)/2),columns-1-Math.floor(columns/6)];
  const rowsAt=[Math.floor(rows/4)-1,rows-Math.floor(rows/4)];
  return LAMP_PLACEMENTS.filter(lamp=>lamp.floor===-1).map((lamp,index)=>{
    const column=columnsAt[index%3],row=rowsAt[Math.floor(index/3)];
    const cell=layout.cells.find(cell=>cell.column===column&&cell.row===row);
    if(!cell)throw new RangeError(`Maze is missing ceiling-lamp cell ${column},${row}`);
    return Object.freeze({...lamp,x:cell.x,z:cell.z,cellId:cell.id});
  });
}

export function createHouseLamps({ground,upper,basement,world,basementLayout=null}) {
  const glowMaterial = new THREE.MeshStandardMaterial({color:0xffefd3,emissive:0xffba65,emissiveIntensity:0,roughness:.8});
  const basementGlowMaterial=glowMaterial.clone();
  const glowGeometry = new THREE.CylinderGeometry(.42,.42,.045,20);
  const transform = new THREE.Object3D(), colliders = [];
  // Thin exposed beams give pendants a mounting point in the roof cutaway.
  for (const [floor,x,z,width] of [[0,-14.5,12,19],[0,-14.5,5,19],[0,0,16,10],[0,14.5,15,19],[0,14.5,7,19],
    [1,-14.5,-8,19],[1,1.5,-10,13],[1,16,-8,16],[1,0,-.5,48]]) {
    const parent=floor?upper:ground, y=floor*H+3.88;
    cube(parent,0xcbbba2,x,y,z,width-.04,.08,.12);
    colliders.push(world.addBox(x,y,z,width-.04,.08,.12));
  }
  const basementFixtures=mazeCeilingLampPlacements(basementLayout);
  let basementIndex=0;
  const fixtures=LAMP_PLACEMENTS.filter(l=>l.floor!==-1||basement).map(lamp=>lamp.floor===-1?basementFixtures[basementIndex++]:lamp);
  const groups=new Map();
  for (const floor of basement?[-1,0,1]:[0,1]) {
    const parent=floor===-1?basement:floor===1?upper:ground, floorFixtures=fixtures.filter(l=>l.floor===floor);
    const glow=new THREE.InstancedMesh(glowGeometry,floor===-1?basementGlowMaterial:glowMaterial,floorFixtures.length);
    glow.name=`Lamp diffusers floor ${floor}`; parent.add(glow);
    groups.set(floor,glow);
    for (const [i,lamp] of floorFixtures.entries()) {
      const {x,y,z,kind}=lamp, base=floor*H;
      if(kind==='floor') {
        cube(parent,0xa78a63,x,base+.055,z,.58,.11,.58);
        cylinder(parent,0x998365,x,base+.83,z,.035,1.55,.035,8);
        colliders.push(world.addBox(x,base+.055,z,.58,.11,.58),world.addBox(x,base+.83,z,.09,1.55,.09));
      } else {
        if(floor===-1){
          const mount=BASEMENT.ceilingY-.045,rodTop=mount-.035,rodBottom=y+.18;
          const cap=cylinder(parent,0xa78a63,x,mount,z,.16,.07,.16,12);
          const rod=cylinder(parent,0x998365,x,(rodTop+rodBottom)/2,z,.022,rodTop-rodBottom,.022,8);
          cap.userData.lampId=rod.userData.lampId=lamp.id;
        } else {
          cylinder(parent,0xa78a63,x,base+3.84,z,.16,.07,.16,12);
          cylinder(parent,0x998365,x,base+3.66,z,.022,.35,.022,8);
        }
      }
      const shade=cylinder(parent,0xf3debd,x,y+.18,z,.47,.4,.24,20);
      shade.name=lamp.id;shade.userData.lampId=lamp.id;
      const shadeCollider=world.addBox(x,y+.18,z,.94,.4,.94);
      shadeCollider.lampId=lamp.id;shade.userData.collider=shadeCollider;colliders.push(shadeCollider);
      // Instancing preserves the live emissive material through static batching.
      transform.position.set(x,y-.025,z); transform.updateMatrix(); glow.setMatrixAt(i,transform.matrix);
    }
  }
  return {fixtures,glowMaterial,basementGlowMaterial,groups,colliders};
}
