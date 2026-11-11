import * as THREE from '../vendor/three.module.js';
import { canHearNoise } from './noise.js';
import {blockedBySolids} from './mistress-vision.js';

export const MISTRESS_FOOTSTEP_RADIUS = 5;
export const MISTRESS_FOOTSTEP_INTERVAL = .45;
export const MISTRESS_FOOTSTEP_STRIDES = Object.freeze({walk:1,search:.9,run:1.15});
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
  constructor(roots=[],{world=null}={}) {
    this.world=world;
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
        if(!mesh.isMesh || mesh.userData.dynamicGate || mesh.userData.dynamicMaze || visited.has(mesh)) return;
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
    if(this.world&&blockedBySolids(origin,target,this.world.queryDynamic(Math.min(origin.x,target.x),Math.min(origin.z,target.z),Math.max(origin.x,target.x),Math.max(origin.z,target.z))))return false;
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
    this.elapsed=0;this.sequence=0;this.cueSequence=0;this._events=[];this._cues=[];
    this._progress=0;this._previousMistress=null;this._previousPlayer=null;this._previousSpeed=0;
  }
  relocateListener(player) {
    // R/Home is an instantaneous relocation, not a listening path through
    // every room between the old position and the den. Preserve heard cues
    // and the walking rhythm while rebasing interpolation to the new place.
    this._previousPlayer=validPoint(player)?{x:player.x,y:player.y,z:player.z}:null;
  }
  get events() { return this._events.slice(); }
  get cues() { return this._cues.slice(); }
  get ripples() {
    return this._events.map(event=>{
      const age=Math.max(0,this.elapsed-event.time),progress=Math.min(1,age/MISTRESS_FOOTSTEP_SECONDS);
      return Object.freeze({id:event.id,x:event.position.x,y:event.position.y,z:event.position.z,
        age,progress,radius:1.2+3.8*progress,opacity:.9*(1-progress)**1.2,
        gait:event.gait,phase:event.phase,strength:event.strength});
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
    this._cues=this._cues.filter(event=>event.expiresAt>this.elapsed+EPSILON);
    const position=mistress?.position??mistress?.renderPosition;
    const previous=this._previousMistress,previousPlayer=this._previousPlayer;
    const speed=Number.isFinite(mistress?.speed)?Math.max(0,mistress.speed):0;
    const previousSpeed=this._previousSpeed;
    const snapshot=point=>validPoint(point)?{x:point.x,y:point.y,z:point.z}:null;
    this._previousMistress=snapshot(position);this._previousPlayer=snapshot(player);this._previousSpeed=speed;
    if(!validPoint(position)||!previous||mistress?.state!=='walking') {this._progress=0;return [];}
    const travel=Math.hypot(position.x-previous.x,position.y-previous.y,position.z-previous.z);
    // A return-to-den/scold or debug teleport is not a walking path. Ordinary
    // movement remains valid at any reported speed, including accumulated rage.
    const allowance=Math.max(speed,previousSpeed)*dt*1.5+1;
    if(!Number.isFinite(travel)||!Number.isFinite(allowance)||travel>allowance) {this._progress=0;return [];}
    if(speed<=0||travel<=EPSILON)return [];
    const phase=typeof mistress.phase==='string'?mistress.phase:'routine';
    const gait=phase==='search'?'search':phase==='chase'||phase==='cleanup'?'run':'walk';
    const stride=MISTRESS_FOOTSTEP_STRIDES[gait],cycles=travel/stride,before=this._progress,total=before+cycles;
    const count=Math.floor(total+EPSILON);
    if(!Number.isSafeInteger(count)||!Number.isSafeInteger(this.cueSequence+count)) {this._progress=0;return [];}
    this._progress=Math.max(0,total-count);
    if(!count)return [];
    const baseId=this.cueSequence;this.cueSequence+=count;
    const measuredSpeed=travel/dt;
    const strength=gait==='run'?Math.min(1.35,.65+measuredSpeed/10):
      gait==='search'?Math.min(.75,.35+measuredSpeed/12):Math.min(1,.45+measuredSpeed/12);
    const interpolate=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
    // Only materialize still-live recent footfalls. A suspended tab cannot
    // allocate a long trail or replay an audio backlog on the next frame.
    const first=Math.max(1,count-MAX_MISTRESS_FOOTSTEPS+1,
      Math.floor(before+cycles*Math.max(0,1-MISTRESS_FOOTSTEP_SECONDS/dt))+1);
    const emitted=[];
    const playerSpeed=Math.max(12,Math.hypot(player?.vx??0,player?.vy??0,player?.vz??0));
    const playerContinued=validPoint(player)&&previousPlayer&&
      Math.hypot(player.x-previousPlayer.x,player.y-previousPlayer.y,player.z-previousPlayer.z)<=playerSpeed*dt+1;
    for(let index=first;index<=count;index++) {
      const t=Math.max(0,Math.min(1,(index-before)/cycles)),time=frameStart+t*dt;
      if(time+MISTRESS_FOOTSTEP_SECONDS<=this.elapsed+EPSILON)continue;
      const id=baseId+index,source=Object.freeze(interpolate(previous,position,t));
      const cue=Object.freeze({id,cueId:id,source:'mistress',kind:'footstep',scope:'local',
        radius:MISTRESS_FOOTSTEP_RADIUS,position:source,time,lifetime:MISTRESS_FOOTSTEP_SECONDS,
        expiresAt:time+MISTRESS_FOOTSTEP_SECONDS,speed:measuredSpeed,phase,gait,strength,stride,foot:id%2?'left':'right'});
      this._cues.push(cue);
      if(!validPoint(player))continue;
      const listener=playerContinued?interpolate(previousPlayer,player,t):player;
      if(Math.hypot(source.x-listener.x,source.y-listener.y,source.z-listener.z)>MISTRESS_FOOTSTEP_RADIUS)continue;
      const event=Object.freeze({...cue,id:++this.sequence});this._events.push(event);emitted.push(event);
    }
    for(const events of [this._events,this._cues])if(events.length>MAX_MISTRESS_FOOTSTEPS)events.splice(0,events.length-MAX_MISTRESS_FOOTSTEPS);
    return emitted;
  }
}
