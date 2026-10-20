import * as THREE from '../vendor/three.module.js';
import { FLOOR_HEIGHT as H } from './layout.js';
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
].map(([id,floor,kind,x,z]) => Object.freeze({id,floor,kind,x,z,y:floor*H+(kind==='ceiling'?3.48:1.72)})));

export function createHouseLamps({ground,upper,world}) {
  const glowMaterial = new THREE.MeshStandardMaterial({color:0xffefd3,emissive:0xffba65,emissiveIntensity:0,roughness:.8});
  const glowGeometry = new THREE.CylinderGeometry(.42,.42,.045,20);
  const transform = new THREE.Object3D(), colliders = [];
  // Thin exposed beams give pendants a mounting point in the roof cutaway.
  for (const [floor,x,z,width] of [[0,-14.5,12,19],[0,-14.5,5,19],[0,0,16,10],[0,14.5,15,19],[0,14.5,7,19],
    [1,-14.5,-8,19],[1,1.5,-10,13],[1,16,-8,16],[1,0,-.5,48]]) {
    const parent=floor?upper:ground, y=floor*H+3.88;
    cube(parent,0xcbbba2,x,y,z,width,.08,.12);
    colliders.push(world.addBox(x,y,z,width,.08,.12));
  }
  for (const floor of [0,1]) {
    const parent=floor?upper:ground, fixtures=LAMP_PLACEMENTS.filter(l=>l.floor===floor);
    const glow=new THREE.InstancedMesh(glowGeometry,glowMaterial,fixtures.length);
    glow.name=`Lamp diffusers floor ${floor}`; parent.add(glow);
    for (const [i,lamp] of fixtures.entries()) {
      const {x,y,z,kind}=lamp, base=floor*H;
      if(kind==='floor') {
        cube(parent,0xa78a63,x,base+.055,z,.58,.11,.58);
        cylinder(parent,0x998365,x,base+.83,z,.035,1.55,.035,8);
        colliders.push(world.addBox(x,base+.055,z,.58,.11,.58),world.addBox(x,base+.83,z,.09,1.55,.09));
      } else {
        cylinder(parent,0xa78a63,x,base+3.84,z,.16,.07,.16,12);
        cylinder(parent,0x998365,x,base+3.66,z,.022,.35,.022,8);
      }
      const shade=cylinder(parent,0xf3debd,x,y+.18,z,.47,.4,.24,20);
      shade.name=lamp.id;
      colliders.push(world.addBox(x,y+.18,z,.94,.4,.94));
      // Instancing preserves the live emissive material through static batching.
      transform.position.set(x,y-.025,z); transform.updateMatrix(); glow.setMatrixAt(i,transform.matrix);
    }
  }
  return {fixtures:LAMP_PLACEMENTS,glowMaterial,colliders};
}
