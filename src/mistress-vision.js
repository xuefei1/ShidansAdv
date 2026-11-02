import * as THREE from '../vendor/three.module.js';

export const MISTRESS_VIEW_ANGLE=Math.PI/2;
export const MISTRESS_VIEW_RANGE=50;
const valid=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
function blockedBySolids(origin,target,boxes) {
  for(const box of boxes) {
    let first=0,last=1;
    for(const axis of ['x','y','z']) {
      const delta=target[axis]-origin[axis],low=box[`min${axis.toUpperCase()}`],high=box[`max${axis.toUpperCase()}`];
      if(Math.abs(delta)<1e-9) {if(origin[axis]<=low||origin[axis]>=high){last=-1;break;}}
      else {
        const a=(low-origin[axis])/delta,b=(high-origin[axis])/delta;
        first=Math.max(first,Math.min(a,b));last=Math.min(last,Math.max(a,b));
      }
      if(last<=first)break;
    }
    if(last>first&&first<1-.001&&last>.001)return true;
  }
  return false;
}

// A horizontal forward cone gives the floor indicator an exact angular/range
// meaning. Actual three-dimensional eye rays decide cover and other floors.
export function inMistressViewCone(origin,yaw,target) {
  if(!valid(origin)||!valid(target)||!Number.isFinite(yaw))return false;
  const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z;
  if(Math.hypot(dx,dy,dz)>MISTRESS_VIEW_RANGE+1e-9)return false;
  const horizontal=Math.hypot(dx,dz);
  return horizontal<1e-9||(dx*Math.sin(yaw)+dz*Math.cos(yaw))/horizontal>=Math.cos(MISTRESS_VIEW_ANGLE/2)-1e-9;
}

export class MistressVision {
  constructor(sight,world=null) {
    this.sight=sight;this.world=world;
    this.samples=Array.from({length:4},()=>new THREE.Vector3());
    this.singleSample=[this.samples[0]];
  }
  targetSamples(player) {
    if(!valid(player))return [];
    const {x,y,z}=player;
    this.samples[0].set(x,y+.38,z);
    this.samples[1].set(x,y+.72,z);
    this.samples[2].set(x-.16,y+.32,z);
    this.samples[3].set(x+.16,y+.32,z);
    return this.samples;
  }
  canSeePoint({position,eye=position,yaw,asleep=false},target) {
    if(asleep||!valid(eye)||!inMistressViewCone(position,yaw,target))return false;
    if(this.world&&blockedBySolids(eye,target,this.world.queryDynamic(Math.min(eye.x,target.x),Math.min(eye.z,target.z),Math.max(eye.x,target.x),Math.max(eye.z,target.z))))return false;
    this.singleSample[0]=target;
    return this.sight.hasLineOfSight(eye,this.singleSample,{includeHidden:true});
  }
  canReachPoint(origin,target) {
    if(!valid(origin)||!valid(target))return false;
    if(this.world)return !blockedBySolids(origin,target,this.world.query(Math.min(origin.x,target.x),Math.min(origin.z,target.z),Math.max(origin.x,target.x),Math.max(origin.z,target.z)));
    this.singleSample[0]=target;
    return this.sight.hasLineOfSight(origin,this.singleSample,{includeHidden:true});
  }
  canSee({position,eye=position,yaw,asleep=false},player,{samples=null}={}) {
    if(asleep||!valid(player)||!inMistressViewCone(position,yaw,player))return false;
    // NPC perception must keep respecting the real upper walls even while a
    // camera cutaway hides their render groups from the player.
    // Rendered head/ear samples can remain visible above a monitor or low
    // furniture even when every lower body ray is hidden. Physical contact
    // deliberately keeps the separate compact body samples below.
    for(const sample of samples??this.targetSamples(player)) {
      if(!valid(sample))continue;
      // Loose opaque props move independently of the static triangle index.
      // Their live collision silhouettes can provide cover without rebuilding it.
      if(this.world&&blockedBySolids(eye,sample,this.world.queryDynamic(Math.min(eye.x,sample.x),Math.min(eye.z,sample.z),Math.max(eye.x,sample.x),Math.max(eye.z,sample.z))))continue;
      this.singleSample[0]=sample;
      if(this.sight.hasLineOfSight(eye,this.singleSample,{includeHidden:true}))return true;
    }
    return false;
  }
  contactClear(eye,player,{stance=null,reachInteraction=null,tableInteraction=null}={}) {
    if(!valid(eye)||!valid(player))return false;
    const samples=this.targetSamples(player);
    // Reaching across furniture uses the person's hand rather than an eye
    // ray. Lower it beneath a table or raise it toward an elevated rabbit;
    // slabs, legs, glass and other solids still block physical contact.
    let origin=eye;
    const interaction=reachInteraction??tableInteraction,support=interaction?.support??interaction?.table;
    if(valid(stance)&&support) {
      const y=interaction.under?Math.min(stance.y+1,support.minY-.12):
        Math.max(stance.y+1,Math.min(stance.y+2.2,player.y+.35));
      origin={x:stance.x,y,z:stance.z};
    }
    // Seeing through a closed pane is allowed; reaching through one is not.
    // Contact uses physical solids, including glass, independently of cutaways.
    if(this.world)return samples.some(target=>!blockedBySolids(origin,target,this.world.query(Math.min(origin.x,target.x),Math.min(origin.z,target.z),Math.max(origin.x,target.x),Math.max(origin.z,target.z))));
    return this.sight.hasLineOfSight(origin,samples,{includeHidden:true});
  }
}
