import * as THREE from '../vendor/three.module.js';
import { canHearNoise } from './noise.js';

export const MISTRESS_FOOTSTEP_RADIUS = 5;
export const MISTRESS_FOOTSTEP_INTERVAL = .45;
export const MISTRESS_FOOTSTEP_SECONDS = 1.2;
export const MAX_MISTRESS_FOOTSTEPS = 16;
const CELL = 4;
const EPSILON = 1e-9;
const validPoint = point => point && ['x','y','z'].every(axis => Number.isFinite(point[axis]));
const opaque = material => material && material.visible!==false && !material.transparent && material.depthWrite!==false;
const shown = object => {
  for(let current=object;current;current=current.parent) if(!current.visible) return false;
  return true;
};

// Collect only static house/fountain roots. This index is built once; real
// triangle intersections preserve window panes, wire gaps and furniture legs.
// Transparent glass and contact-shadow sheets never obstruct a visual sighting.
export class MistressSight {
  constructor(roots=[]) {
    this.entries=[];this.cells=new Map();
    this._frustum=new THREE.Frustum();this._projection=new THREE.Matrix4();
    this._sample=new THREE.Vector3();this._origin=new THREE.Vector3();
    this._direction=new THREE.Vector3();this._raycaster=new THREE.Raycaster();
    this._boxHit=new THREE.Vector3();
    this._hits=[];this._candidates=new Set();
    const visited=new Set();
    for(const root of Array.isArray(roots)?roots:[roots]) {
      if(!root?.traverse) continue;
      root.updateWorldMatrix(true,true);
      root.traverse(mesh=>{
        if(!mesh.isMesh || visited.has(mesh)) return;
        visited.add(mesh);
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        if(!materials.some(opaque)) return;
        const bounds=new THREE.Box3().setFromObject(mesh);
        if(bounds.isEmpty() || !Number.isFinite(bounds.min.x+bounds.max.x+bounds.min.z+bounds.max.z)) return;
        const entry={mesh,bounds};this.entries.push(entry);
        for(let x=Math.floor(bounds.min.x/CELL);x<=Math.floor(bounds.max.x/CELL);x++) {
          for(let z=Math.floor(bounds.min.z/CELL);z<=Math.floor(bounds.max.z/CELL);z++) {
            const key=`${x},${z}`;
            if(!this.cells.has(key)) this.cells.set(key,[]);
            this.cells.get(key).push(entry);
          }
        }
      });
    }
  }
  _clear(origin,target,distance,includeHidden=false) {
    this._direction.subVectors(target,origin).divideScalar(distance);
    this._raycaster.set(origin,this._direction);this._raycaster.near=.005;
    this._raycaster.far=Math.max(.005,distance-.025);
    const candidates=this._candidates;candidates.clear();
    for(let x=Math.floor(Math.min(origin.x,target.x)/CELL);x<=Math.floor(Math.max(origin.x,target.x)/CELL);x++) {
      for(let z=Math.floor(Math.min(origin.z,target.z)/CELL);z<=Math.floor(Math.max(origin.z,target.z)/CELL);z++) {
        for(const entry of this.cells.get(`${x},${z}`)??[]) candidates.add(entry);
      }
    }
    for(const {mesh,bounds} of candidates) {
      if((!includeHidden&&!shown(mesh)) || !this._raycaster.ray.intersectBox(bounds,this._boxHit)) continue;
      // Infinite-ray bounds alone include rooms beyond the character. Skip
      // them before the more expensive triangle walk, while retaining meshes
      // whose broad bounds already contain the camera (such as room chunks).
      if(!bounds.containsPoint(origin) && origin.distanceToSquared(this._boxHit)>this._raycaster.far**2) continue;
      const hits=this._hits;hits.length=0;
      this._raycaster.intersectObject(mesh,false,hits);
      for(const hit of hits) {
        const material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
        if(opaque(material)) return false;
      }
    }
    return true;
  }
  hasLineOfSight(origin,samplePoints,{includeHidden=false}={}) {
    if(!validPoint(origin)||!samplePoints?.length)return false;
    this._origin.set(origin.x,origin.y,origin.z);
    for(const point of samplePoints) {
      if(!validPoint(point))continue;
      this._sample.set(point.x,point.y,point.z);
      const distance=this._origin.distanceTo(this._sample);
      if(distance<=.001||this._clear(this._origin,this._sample,distance,includeHidden))return true;
    }
    return false;
  }
  inView(camera,samplePoints,{visible=true}={}) {
    if(!visible || !camera?.isCamera || !samplePoints?.length) return false;
    camera.updateWorldMatrix(true,false);
    this._projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._projection);
    this._origin.setFromMatrixPosition(camera.matrixWorld);
    for(const point of samplePoints) {
      if(!validPoint(point)) continue;
      this._sample.set(point.x,point.y,point.z);
      if(!this._frustum.containsPoint(this._sample)) continue;
      const distance=this._origin.distanceTo(this._sample);
      if(distance>.001 && this._clear(this._origin,this._sample,distance)) return true;
    }
    return false;
  }
}

// Heard footsteps are short-lived snapshots, rather than a hidden character
// tracker. Their metre-based rings show uncertainty around the last sound.
// Hearing uses full 3D distance and intentionally ignores walls and visibility.
export class MistressFootsteps {
  constructor() { this.reset(); }
  reset() {
    this.elapsed=0;this.sequence=0;this._events=[];
    this._walking=false;this._start=0;this._next=0;
    this._previousMistress=null;this._previousPlayer=null;
  }
  relocateListener(player) {
    // R/Home is an instantaneous relocation, not a listening path through
    // every room between the old position and the den. Preserve heard cues
    // and the walking rhythm while rebasing interpolation to the new place.
    this._previousPlayer=validPoint(player)?{x:player.x,y:player.y,z:player.z}:null;
  }
  get events() { return this._events.slice(); }
  get ripples() {
    return this._events.map(event=>{
      const age=Math.max(0,this.elapsed-event.time),progress=Math.min(1,age/MISTRESS_FOOTSTEP_SECONDS);
      return Object.freeze({id:event.id,x:event.position.x,y:event.position.y,z:event.position.z,
        age,progress,radius:1.2+3.8*progress,opacity:.9*(1-progress)**1.2});
    });
  }
  canHear(event,listener) {
    return this._events.includes(event) && event.expiresAt>this.elapsed+EPSILON && canHearNoise(event,listener);
  }
  audibleTo(listener) { return this._events.filter(event=>event.expiresAt>this.elapsed+EPSILON && canHearNoise(event,listener)); }
  update(dt,{player,mistress,active=true}={}) {
    if(!active || !Number.isFinite(dt) || dt<=0 || !Number.isFinite(this.elapsed+dt)) return [];
    const frameStart=this.elapsed;this.elapsed+=dt;
    this._events=this._events.filter(event=>event.expiresAt>this.elapsed+EPSILON);
    const position=mistress?.position??mistress?.renderPosition;
    const walking=mistress?.state==='walking' && mistress.speed>0 && validPoint(position) && validPoint(player);
    if(!walking) {
      this._walking=false;this._previousMistress=this._previousPlayer=null;return [];
    }
    const continued=this._walking;
    if(!continued) {this._start=frameStart;this._next=0;}
    this._walking=true;
    const last=Math.floor((this.elapsed-this._start+EPSILON)/MISTRESS_FOOTSTEP_INTERVAL);
    const earliestLive=Math.floor((this.elapsed-MISTRESS_FOOTSTEP_SECONDS-this._start+EPSILON)/MISTRESS_FOOTSTEP_INTERVAL)+1;
    if(!Number.isSafeInteger(last) || !Number.isSafeInteger(earliestLive)) {
      this._walking=false;this._previousMistress=this._previousPlayer=null;return [];
    }
    const first=Math.max(this._next,earliestLive,last-MAX_MISTRESS_FOOTSTEPS+1),emitted=[];
    for(let index=first,count=0;index<=last&&count<MAX_MISTRESS_FOOTSTEPS;index++,count++) {
      const time=this._start+index*MISTRESS_FOOTSTEP_INTERVAL;
      const t=Math.max(0,Math.min(1,(time-frameStart)/dt));
      const interpolate=(before,after)=>continued&&before ? {
        x:before.x+(after.x-before.x)*t,y:before.y+(after.y-before.y)*t,z:before.z+(after.z-before.z)*t,
      } : {x:after.x,y:after.y,z:after.z};
      const source=interpolate(this._previousMistress,position),listener=interpolate(this._previousPlayer,player);
      if(Math.hypot(source.x-listener.x,source.y-listener.y,source.z-listener.z)>MISTRESS_FOOTSTEP_RADIUS) continue;
      const event=Object.freeze({id:++this.sequence,source:'mistress',kind:'footstep',scope:'local',
        radius:MISTRESS_FOOTSTEP_RADIUS,position:Object.freeze(source),time,lifetime:MISTRESS_FOOTSTEP_SECONDS,
        expiresAt:time+MISTRESS_FOOTSTEP_SECONDS});
      this._events.push(event);emitted.push(event);
    }
    this._next=last+1;
    if(this._events.length>MAX_MISTRESS_FOOTSTEPS)this._events.splice(0,this._events.length-MAX_MISTRESS_FOOTSTEPS);
    this._previousMistress={x:position.x,y:position.y,z:position.z};
    this._previousPlayer={x:player.x,y:player.y,z:player.z};
    return emitted;
  }
}
