import * as THREE from '../vendor/three.module.js';
import { FLOOR_HEIGHT as H } from './layout.js';
import { cube, beam, mat } from './model.js';
import { batchStaticGeometry } from './render-batching.js';

// Low wings surround a tall central stair hall. The upper rear rooms and the
// stair hall share one ceiling height, leaving the whole stair flight open.
export const CEILING_VOLUMES = Object.freeze([
  {id:'lounge-ceiling',minX:-24,maxX:-5.12,minZ:2,maxZ:20,bottom:3.9,top:4.08},
  {id:'kitchen-ceiling',minX:5.12,maxX:24,minZ:2,maxZ:20,bottom:3.9,top:4.08},
  {id:'upstairs-ceiling',minX:-24,maxX:24,minZ:-20,maxZ:2,bottom:H+3.9,top:H+4.08},
  {id:'stair-hall-ceiling',minX:-5,maxX:5,minZ:2,maxZ:20,bottom:H+3.9,top:H+4.08},
].map(Object.freeze));

function pitchedRoof(parent,{id,minX,maxX,minZ,maxZ,base,rise,ridge='x',color=0x9db9b1}) {
  // A closed, six-vertex roof prism: two pitched surfaces, two gables and an
  // underside over the eaves. One low-poly shell suffices for each roof volume.
  const centre=(minZ+maxZ)/2;
  let points=[[minX,base,minZ],[maxX,base,minZ],[minX,base+rise,centre],
    [maxX,base+rise,centre],[minX,base,maxZ],[maxX,base,maxZ]];
  if(ridge==='z') {
    const middle=(minX+maxX)/2;
    points=[[minX,base,minZ],[minX,base,maxZ],[middle,base+rise,minZ],
      [middle,base+rise,maxZ],[maxX,base,minZ],[maxX,base,maxZ]];
  }
  const faces=[[0,1,2],[1,3,2],[2,3,4],[3,5,4],[0,4,1],[1,4,5],[0,2,4],[1,5,3]];
  // Swapping the ridge axis mirrors the prism. Correct that handedness so all
  // faces point outward; inward normals reverse shadow bias on the broad slopes.
  const outward=faces.map(face=>ridge==='x'?face.toReversed():face);
  // Supplying vertices per triangle preserves the crisp roof/gable normals.
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(outward.flatMap(face=>face.flatMap(i=>points[i])),3));
  geometry.computeVertexNormals();
  const material=mat(color).clone();material.side=THREE.FrontSide;material.shadowSide=THREE.BackSide;
  const mesh=new THREE.Mesh(geometry,material);mesh.name=id;mesh.castShadow=mesh.receiveShadow=true;
  mesh.userData.roof=true;parent.add(mesh);
  const start=ridge==='x'?[minX-.03,base+rise+.025,centre]:[(minX+maxX)/2,base+rise+.025,minZ-.03];
  const end=ridge==='x'?[maxX+.03,base+rise+.025,centre]:[(minX+maxX)/2,base+rise+.025,maxZ+.03];
  beam(parent,0x819f99,start,end,.055);
  return mesh;
}

export function createHouseRoof({group,solid,detail,world}) {
  const shell=new THREE.Group(),ceilings=new THREE.Group();
  shell.name='Exterior roof';ceilings.name='Interior ceilings and stair-hall enclosure';
  group.add(ceilings,shell);
  const colliders=[];
  const roofSolid=(parent,color,x,y,z,w,h,d,id)=>{
    const mesh=solid(parent,color,x,y,z,w,h,d,'wood',id);
    colliders.push(mesh.userData.collider);return mesh;
  };
  for(const v of CEILING_VOLUMES) {
    // The exterior shell casts the roof shadow; its interior lining only needs
    // to receive light, avoiding a duplicate set of roof shadow submissions.
    roofSolid(ceilings,0xf3ebd8,(v.minX+v.maxX)/2,(v.bottom+v.top)/2,(v.minZ+v.maxZ)/2,
      v.maxX-v.minX,v.top-v.bottom,v.maxZ-v.minZ,v.id).castShadow=false;
  }
  // Enclose the tall foyer above the single-storey wings. There is no wall
  // across its rear, so Shidan can reach the upstairs gallery normally.
  for(const x of [-5,5]) roofSolid(ceilings,0xe9ddc5,x,6,11,.24,4.2,18,`stair-hall-high-side-${x}`);
  roofSolid(ceilings,0xe9ddc5,0,6,20,10,4.2,.24,'stair-hall-high-front');
  // Existing gallery rails reach y=5.16; the upper facade continues from there
  // to the roof on either side of the open central stair hall.
  for(const x of [-14.5,14.5]) roofSolid(ceilings,0xe1d9c7,x,6.63,2,18.76,2.94,.24,`gallery-upper-facade-${x}`);
  // Frosted clerestory panels and cream mullions brighten the high facade.
  // They are backed by the enclosure solids and do not add glass draw passes.
  const highPanel=(x,y,z,w,h)=>{
    detail(shell,0xc3dad9,x,y,z,w,h,.018);
    for(const px of [x-w/2-.04,x+w/2+.04]) detail(shell,0xf8efdc,px,y,z+.015,.08,h+.16,.03);
    for(const py of [y-h/2-.04,y+h/2+.04]) detail(shell,0xf8efdc,x,py,z+.015,w+.16,.08,.03);
    detail(shell,0xf8efdc,x,y,z+.02,.075,h-.04,.035);
  };
  highPanel(0,6.3,20.132,5.8,1.55);
  for(const x of [-20,-10,10,20]) highPanel(x,6.7,2.132,4.8,1.25);

  const roofs=[
    {id:'lounge-roof',minX:-24.5,maxX:-4.9,minZ:1.9,maxZ:20.5,base:4.08,rise:1.6,color:0xa8bfb1},
    {id:'kitchen-roof',minX:4.9,maxX:24.5,minZ:1.9,maxZ:20.5,base:4.08,rise:1.6,color:0xa8bfb1},
    {id:'upper-rear-roof',minX:-24.5,maxX:24.5,minZ:-20.5,maxZ:2.12,base:H+4.08,rise:1.8,color:0x99b7b1},
    {id:'stair-hall-roof',minX:-5.12,maxX:5.12,minZ:1.88,maxZ:20.5,base:H+4.08,rise:1.8,ridge:'z',color:0x99b7b1},
  ];
  roofs.forEach(roof=>pitchedRoof(shell,roof));
  // Cream fascia closes the ceiling/eave seams along the exposed front edges.
  for(const x of [-14.5,14.5]) cube(shell,0xf7edd8,x,4.08,20.16,19,.16,.18);
  cube(shell,0xf7edd8,0,H+4.08,-20.16,48,.16,.18);
  cube(shell,0xf7edd8,0,H+4.08,20.16,10,.16,.18);
  // There are only a few hundred roof triangles. Merge each complete layer now
  // rather than spending extra draws on spatial cells this small shell needs
  // neither indoors nor outdoors. The caller's general batching pass is safe
  // to repeat; these five material/shadow batches remain five.
  batchStaticGeometry(ceilings,{cellSize:Infinity});
  batchStaticGeometry(shell,{cellSize:Infinity});
  return {shell,ceilings,layers:[ceilings,shell],colliders,volumes:CEILING_VOLUMES,meshes:[...shell.children]};
}
