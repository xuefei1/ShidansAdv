import * as THREE from '../vendor/three.module.js';
import {HOUSE} from './layout.js';

// One inexpensive ground draw around the house. The open centre keeps the
// backdrop from covering the basement stairwell below the wooden floor.
export function createTerrainBackdrop() {
  const positions=[];
  for(const [left,right,back,front] of [[-100,HOUSE.minX,-100,100],[HOUSE.maxX,100,-100,100],
    [HOUSE.minX,HOUSE.maxX,-100,HOUSE.minZ],[HOUSE.minX,HOUSE.maxX,HOUSE.maxZ,100]]) {
    const corners=[[left,-.56,back],[left,-.56,front],[right,-.56,front],[right,-.56,back]];
    for(const i of [0,1,2,0,2,3])positions.push(...corners[i]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xe1e4d2,roughness:1}));
  mesh.name='Terrain around the house';mesh.receiveShadow=true;return mesh;
}
