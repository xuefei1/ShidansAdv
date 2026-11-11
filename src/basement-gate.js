import * as THREE from '../vendor/three.module.js';
import {BASEMENT_STAIR_OPENING as OPENING, FLOOR_HEIGHT} from './layout.js';
import {cube} from './model.js';
import {batchStaticGeometry} from './render-batching.js';
import {BASEMENT_UNLOCK_HAPPINESS} from './basement-access.js';

export {BASEMENT_UNLOCK_HAPPINESS};
// The upstairs slab is the stairwell's roof. Matching fence extensions on the
// three low guards prevent jumping around the locked entrance from the side.
const TOP = FLOOR_HEIGHT - .28, GUARD_TOP = .96, THICKNESS = .16;
const PANELS = Object.freeze([
  {id:'entrance',minX:OPENING.minX-THICKNESS,maxX:OPENING.maxX+THICKNESS,minY:-.22,maxY:TOP,minZ:OPENING.maxZ-THICKNESS/2,maxZ:OPENING.maxZ+THICKNESS/2},
  {id:'west',minX:OPENING.minX-THICKNESS,maxX:OPENING.minX,minY:GUARD_TOP,maxY:TOP,minZ:OPENING.minZ-THICKNESS,maxZ:OPENING.maxZ-THICKNESS/2},
  {id:'east',minX:OPENING.maxX,maxX:OPENING.maxX+THICKNESS,minY:GUARD_TOP,maxY:TOP,minZ:OPENING.minZ-THICKNESS,maxZ:OPENING.maxZ-THICKNESS/2},
  {id:'rear',minX:OPENING.minX,maxX:OPENING.maxX,minY:GUARD_TOP,maxY:TOP,minZ:OPENING.minZ-THICKNESS,maxZ:OPENING.minZ},
]);

function fencePanel(parent,panel) {
  const acrossX=panel.maxX-panel.minX>panel.maxZ-panel.minZ;
  const x=(panel.minX+panel.maxX)/2,z=(panel.minZ+panel.maxZ)/2;
  // Inset the rendered bars a few millimetres from physical panel bounds.
  // Entrance post end caps must not share the guard's differently coloured
  // outer planes or the ground slab's bottom plane at the corner junctions.
  const min=(acrossX?panel.minX:panel.minZ)+.006,max=(acrossX?panel.maxX:panel.maxZ)-.006;
  const bottom=Math.max(0,panel.minY)+.008,top=panel.maxY-.008,height=top-bottom,color=0xd5dfd3;
  const bar=(at,y,width,h,depth)=>cube(parent,color,acrossX?at:x,y,acrossX?z:at,acrossX?width:depth,h,acrossX?depth:width);
  const count=Math.ceil((max-min)/.23);
  for(let i=0;i<=count;i++) {
    const edge=i===0||i===count;
    bar(min+.035+(max-min-.07)*i/count,bottom+height/2,edge?.07:.018,height,edge?.07:.018);
  }
  for(let y=bottom+.035;y<top-.02;y+=.32)bar((min+max)/2,y,max-min,.018,.018);
  // The final rail reaches the ceiling without a jumpable gap above the mesh.
  bar((min+max)/2,top-.035,max-min,.07,.07);
}

function sign(parent) {
  const x=(OPENING.minX+OPENING.maxX)/2,z=OPENING.maxZ+.085;
  cube(parent,0xb5945f,x,1.76,z,2.15,.47,.055);
  // Small golden latch on the front gate makes its initial locked state clear.
  cube(parent,0xd6ba72,x,1.24,z+.035,.23,.26,.075);
  cube(parent,0x7d7154,x,1.25,z+.075,.035,.09,.012);
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;
  const context=canvas.getContext('2d');
  context.fillStyle='#f7edd2';context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle='#6e735e';context.textAlign='center';context.textBaseline='middle';
  context.font='600 42px sans-serif';context.fillText('BASEMENT · LOCKED',384,52);
  context.font='500 36px sans-serif';context.fillText(`${BASEMENT_UNLOCK_HAPPINESS} happiness to open`,384,111);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const plaque=new THREE.Mesh(new THREE.PlaneGeometry(2.08,.41),new THREE.MeshStandardMaterial({map:texture,roughness:1}));
  plaque.name='Basement unlock sign';plaque.position.set(x,1.76,z+.0285);parent.add(plaque);
}

// This group is added after the house's static batching. All collision changes
// use the live dynamic index, shared by rabbit, loose props, balls and sight.
export function createBasementGate({parent,world}) {
  const group=new THREE.Group();group.name='Locked basement fence';parent.add(group);
  for(const panel of PANELS)fencePanel(group,panel);
  sign(group);batchStaticGeometry(group,{cellSize:Infinity});
  group.traverse(mesh=>{if(mesh.isMesh)mesh.userData.dynamicGate=true;});
  let locked=false;
  const colliders=[];
  const gate={group,colliders,get locked(){return locked;},get collider(){return colliders[0]??null;},
    setLocked(value) {
      const next=!!value;if(next===locked)return false;
      locked=next;group.visible=next;
      if(next)for(const p of PANELS) {
        const b=world.addDynamicBox((p.minX+p.maxX)/2,(p.minY+p.maxY)/2,(p.minZ+p.maxZ)/2,
          p.maxX-p.minX,p.maxY-p.minY,p.maxZ-p.minZ,'wood');
        b.id=`basement-gate:${p.id}`;b.verticalBarrier=true;b.basementGate=true;colliders.push(b);
      }
      else {for(const b of colliders)world.removeBox(b);colliders.length=0;}
      return true;
    }};
  world.basementGate=gate;gate.setLocked(true);return gate;
}
