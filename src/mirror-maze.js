import * as THREE from '../vendor/three.module.js';
import {BASEMENT} from './layout.js';
import {generateMirrorMaze} from './mirror-maze-layout.js';
import {cube} from './model.js';
import {batchStaticGeometry} from './render-batching.js';

export const MAZE_GLASS_OPACITY=.92;
export const MAZE_GLASS_COLOR=0x9ccfed;
const WALL_THICKNESS=.20,FRAME_THICKNESS=.12,FRAME_WIDTH=.07;
const FLOOR=BASEMENT.y,TOP=BASEMENT.ceilingY,HEIGHT=TOP-FLOOR;

function frostTexture() {
  const size=64,data=new Uint8Array(size*size*4);
  // Repeating matte grain supplies frosting without a screen-space blur,
  // transmission buffer or any reflected scene captures.
  for(let index=0;index<size*size;index++) {
    const grain=232+((Math.imul(index+17,1103515245)>>>19)&15);
    data.set([grain,grain,grain,255],index*4);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.name='Privacy glass frost grain';texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

function buildGlassFaces(walls,group,material,owned) {
  const planes=new Map();
  for(const wall of walls) {
    const key=`${wall.axis}:${wall.coordinate}`;
    if(!planes.has(key))planes.set(key,{axis:wall.axis,coordinate:wall.coordinate,segments:[]});
    planes.get(key).segments.push({start:wall.start+FRAME_WIDTH,end:wall.end-FRAME_WIDTH});
  }
  const panels=[];
  for(const {axis,coordinate,segments} of planes.values()) {
    const alongX=axis==='x',positions=[],normals=[],uvs=[];
    const low=FLOOR+FRAME_WIDTH,high=TOP-FRAME_WIDTH;
    const normal=alongX?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0);
    for(const segment of segments) {
      const corners=[[segment.start,low],[segment.end,low],[segment.end,high],[segment.start,high]];
      for(const index of alongX?[0,1,2,0,2,3]:[0,2,1,0,3,2]) {
        const [at,y]=corners[index];
        positions.push(alongX?at:coordinate,y,alongX?coordinate:at);
        normals.push(normal.x,normal.y,normal.z);uvs.push(at*4,(y-FLOOR)*4);
      }
    }
    const geometry=new THREE.BufferGeometry();owned.add(geometry);
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Frosted privacy glass';
    mesh.castShadow=false;mesh.receiveShadow=false;
    mesh.userData.mazeGlass=mesh.userData.dynamicMaze=true;group.add(mesh);
    const start=Math.min(...segments.map(s=>s.start)),end=Math.max(...segments.map(s=>s.end));
    panels.push({mesh,normal,point:new THREE.Vector3(alongX?(start+end)/2:coordinate,(low+high)/2,alongX?coordinate:(start+end)/2),
      width:end-start,height:high-low,segments:segments.map(s=>({...s,y:(low+high)/2,x:alongX?(s.start+s.end)/2:coordinate,z:alongX?coordinate:(s.start+s.end)/2}))});
  }
  return panels;
}

function buildFrames(walls,frames,bounds) {
  const color=0x7ea9cd;
  for(const wall of walls) {
    const alongX=wall.axis==='x';
    for(const y of [FLOOR+FRAME_WIDTH/2,TOP-FRAME_WIDTH/2]) {
      cube(frames,color,wall.x,y,wall.z,alongX?wall.length:FRAME_THICKNESS,FRAME_WIDTH,alongX?FRAME_THICKNESS:wall.length);
    }
    const spacing=alongX?(bounds.cellWidth??bounds.cellSize):(bounds.cellDepth??bounds.cellSize);
    const count=Math.max(1,Math.round(wall.length/spacing));
    for(let index=0;index<=count;index++) {
      const at=index===0?wall.start+FRAME_WIDTH/2:index===count?wall.end-FRAME_WIDTH/2:wall.start+index*wall.length/count;
      cube(frames,color,alongX?at:wall.x,(FLOOR+TOP)/2,alongX?wall.z:at,
        alongX?FRAME_WIDTH:FRAME_THICKNESS,HEIGHT-2*FRAME_WIDTH,alongX?FRAME_THICKNESS:FRAME_WIDTH);
    }
  }
  frames.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=false;mesh.receiveShadow=true;}});
  batchStaticGeometry(frames,{cellSize:Infinity});
}

// Keep the generator/API name stable for diagnostics and navigation. The
// actual wall surfaces now render as privacy glass rather than mirrors.
export function createMirrorMaze({parent,world,random=Math.random,layoutProvider=null}) {
  const group=new THREE.Group();group.name='The frosted-glass labyrinth';parent.add(group);
  const grain=frostTexture();
  // Frosted panes keep their blue tint on both sides. Lit surface normals let
  // the house's warm key light paint one side yellow and the other blue.
  const glassMaterial=new THREE.MeshBasicMaterial({name:'Blue frosted privacy glass',color:MAZE_GLASS_COLOR,map:grain,
    transparent:true,opacity:MAZE_GLASS_OPACITY,side:THREE.DoubleSide,depthWrite:false});
  // A single centered surface per wall preserves 8% transparency. Separate
  // front/back layers would multiply it down to only 0.64% transparency.
  glassMaterial.forceSinglePass=true;
  const owned=new Set(),walls=[];
  const maze={group,world,walls,panels:[],panes:[],layout:null,revision:0,glassMaterial,fallbackMaterial:glassMaterial,
    regenerate() {
      for(const collider of walls)world.removeBox(collider);walls.length=0;
      for(const resource of owned)resource.dispose();owned.clear();group.clear();
      const layout=layoutProvider?layoutProvider():generateMirrorMaze(random),frames=new THREE.Group();frames.name='Privacy glass frames';group.add(frames);
      buildFrames(layout.walls,frames,layout.bounds);
      frames.traverse(mesh=>{if(mesh.isMesh){mesh.userData.dynamicMaze=true;owned.add(mesh.geometry);}});
      for(const wall of layout.walls) {
        const alongX=wall.axis==='x';
        const collider=world.addDynamicBox(wall.x,(FLOOR+TOP)/2,wall.z,alongX?wall.length:WALL_THICKNESS,HEIGHT,alongX?WALL_THICKNESS:wall.length,'concrete');
        collider.id=wall.id;collider.verticalBarrier=true;collider.mazeWall=true;walls.push(collider);
      }
      maze.panels=maze.panes=buildGlassFaces(layout.walls,group,glassMaterial,owned);
      maze.layout=layout;maze.revision++;return layout;
    },
    reset(){return maze.regenerate();},
    dispose(){
      for(const collider of walls)world.removeBox(collider);walls.length=0;
      for(const resource of owned)resource.dispose();owned.clear();
      glassMaterial.dispose();grain.dispose();group.removeFromParent();
    }
  };
  world.mirrorMaze=maze;maze.regenerate();return maze;
}
