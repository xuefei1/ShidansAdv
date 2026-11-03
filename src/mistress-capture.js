import * as THREE from '../vendor/three.module.js';

const valid=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const angle=(from,to,t)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*t;
const boxValid=box=>box&&['minX','maxX','minY','maxY','minZ','maxZ'].every(axis=>Number.isFinite(box[axis]));

// Render-only pickup. Captured physics and gameplay clocks stay with their
// controllers; sampling a paused progress value has no time/state side effects.
export class MistressCapture {
  constructor() {
    this.start=new THREE.Vector3();this.mistress=new THREE.Vector3();this.exit=new THREE.Vector3();
    this.socket=new THREE.Vector3();this.position=new THREE.Vector3();
    this.pose={position:this.position,facing:0,mistressYaw:0,progress:0,carryWeight:0,carried:false,headroom:Infinity};
    this.reset();
  }
  get active() {return this._active;}
  reset() {this._active=false;this.support=null;this.under=false;}
  begin({rabbit,mistress,rabbitFacing=rabbit?.facing??0,mistressYaw=mistress?.yaw??0,support=null,headroom=Infinity}={}) {
    const person=mistress?.renderPosition??mistress?.position??mistress;
    if(!valid(rabbit)||!valid(person)||!Number.isFinite(rabbitFacing)||!Number.isFinite(mistressYaw)) {this.reset();return false;}
    this.start.copy(rabbit);this.mistress.copy(person);this.startFacing=rabbitFacing;this.startYaw=mistressYaw;
    this.headroom=Number.isFinite(headroom)?Math.max(.1,headroom):Infinity;
    const dx=rabbit.x-person.x,dz=rabbit.z-person.z;
    this.targetYaw=Math.hypot(dx,dz)>.001?Math.atan2(dx,dz):mistressYaw;
    const facingYaw=angle(this.startYaw,this.targetYaw,1);
    this.cradleFacing=angle(this.startFacing,facingYaw+Math.PI/2,1);
    this.support=boxValid(support)?{minX:support.minX,maxX:support.maxX,minY:support.minY,maxY:support.maxY,minZ:support.minZ,maxZ:support.maxZ}:null;
    const box=this.support;
    this.under=!!box&&rabbit.y<box.minY-.05&&rabbit.x>=box.minX-.05&&rabbit.x<=box.maxX+.05&&rabbit.z>=box.minZ-.05&&rabbit.z<=box.maxZ+.05;
    this.exit.copy(this.start);
    if(this.under) {
      const x=person.x-rabbit.x,z=person.z-rabbit.z;
      let distance=Infinity;
      if(Math.abs(x)>1e-9)distance=Math.min(distance,((x>0?box.maxX+.8:box.minX-.8)-rabbit.x)/x);
      if(Math.abs(z)>1e-9)distance=Math.min(distance,((z>0?box.maxZ+.8:box.minZ-.8)-rabbit.z)/z);
      if(Number.isFinite(distance)&&distance>=0)this.exit.set(rabbit.x+x*distance,rabbit.y,rabbit.z+z*distance);
      else this.exit.x=box.minX-.8;
      this.exitAxis=this.exit.x<=box.minX-.79||this.exit.x>=box.maxX+.79?'x':'z';
      this.exitSide=this.exit[this.exitAxis]<this.start[this.exitAxis]?-1:1;
    }
    this._active=true;this.sample(0);return true;
  }
  sample(progress,cradle=null) {
    if(!this.active)return null;
    const p=clamp(progress),turn=smooth(p/.28),lateTurn=this.support?smooth((p-.38)/.34)*Math.PI/2:0;
    const yaw=angle(this.startYaw,this.targetYaw,turn)+lateTurn;
    // A socket-less query is used to face the model before obtaining its exact
    // animated hand socket. It never retains last frame's hand coordinates.
    if(valid(cradle))this.socket.copy(cradle);
    else this.socket.set(this.mistress.x+Math.sin(yaw)*.63,this.mistress.y+1.40,this.mistress.z+Math.cos(yaw)*.63);
    const carryWeight=smooth((p-(this.under ? .44 : .42))/(this.under ? .32 : .30));
    if(this.under) {
      const out=smooth((p-.12)/.24),lift=smooth((p-.36)/.50);
      this.position.copy(this.start).lerp(this.exit,out);
      if(p>.36) {
        this.position.copy(this.exit).lerp(this.socket,lift);
        this.position.y+=.20*16*lift*lift*(1-lift)*(1-lift);
        // Her entire silhouette must remain outside the slab until her paws
        // clear its top, rather than merely moving its root beyond the edge.
        const axis=this.exitAxis,edge=this.support[`${this.exitSide<0?'min':'max'}${axis.toUpperCase()}`]+this.exitSide*.78;
        const safe=this.exitSide<0?Math.min(this.position[axis],edge):Math.max(this.position[axis],edge);
        const clear=1-smooth((this.position.y-this.support.maxY-.02)/.10);
        this.position[axis]=mix(this.position[axis],safe,clear);
      }
    } else if(this.support) {
      const rise=smooth((p-.12)/.22),carry=smooth((p-.34)/.38),top=Math.max(this.support.maxY,this.start.y)+.04;
      this.position.copy(this.start);this.position.y+=.24*rise;
      if(p>.34) {
        this.position.copy(this.start);this.position.y+=.24;
        this.position.lerp(this.socket,carry);
        this.position.y+=.12*16*carry*carry*(1-carry)*(1-carry);
        const outside=Math.max(this.support.minX-this.position.x,this.position.x-this.support.maxX,
          this.support.minZ-this.position.z,this.position.z-this.support.maxZ);
        const above=(1-smooth((outside-.65)/.35))*(1-smooth((p-.62)/.10));
        this.position.y+=Math.max(0,top-this.position.y)*above;
      }
    } else {
      const lift=smooth((p-.16)/.56);
      this.position.copy(this.start).lerp(this.socket,lift);
      this.position.y+=.16*16*lift*lift*(1-lift)*(1-lift);
    }
    // Exact hand attachment takes over after travel, while her late turn and
    // straightening continue to carry the rabbit with the same socket.
    const attached=p>=(this.under ? .86 : .72);
    if(attached)this.position.copy(this.socket);
    const face=smooth((p-.28)/.44);
    Object.assign(this.pose,{mistressYaw:yaw,progress:p,carryWeight,carried:attached,headroom:this.headroom+2*carryWeight,
      facing:mix(this.startFacing,this.cradleFacing,face)+lateTurn*face});
    return this.pose;
  }
}
