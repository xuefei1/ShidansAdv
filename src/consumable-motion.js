import {DEN,BOUNDS} from './layout.js';
import {consumableRotation} from './consumable-collision.js';

// Loose props use sleeping, lightweight bodies. Static scenery remains fixed;
// Shidan transfers movement to a contacted prop instead of treating it as a wall.
export class ConsumableMotion {
  constructor(world) { this.world=world;this.bodies=new Map();this.active=new Set(); }
  clear() {this.bodies.clear();this.active.clear();}
  add(item) {
    const box=item.collider,body={item,box,vx:0,vy:0,vz:0};
    this.bodies.set(box,body);box.pushable=true;box.pushFriction=item.type==='cardboard'?.18:.10;
    box.onRabbitPush=(rabbit,dt)=>this.push(body,rabbit,dt);
    item.rotation=consumableRotation(item);
  }
  remove(item) {const body=this.bodies.get(item.collider);if(body)this.active.delete(body);this.bodies.delete(item.collider);}
  shift(body,dx,dy,dz) {
    if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)<1e-8)return;
    this.world.moveDynamicBox(body.box,dx,dy,dz);
    body.item.x+=dx;body.item.y+=dy;body.item.z+=dz;
  }
  canPlace(body,dx,dz) {
    const b=body.box,minX=b.minX+dx,maxX=b.maxX+dx,minZ=b.minZ+dz,maxZ=b.maxZ+dz;
    if(minX<BOUNDS.minX+.01||maxX>BOUNDS.maxX-.01||minZ<BOUNDS.minZ+.01||maxZ>BOUNDS.maxZ-.01)return false;
    if(b.minY<DEN.fenceHeight) {
      const old=Math.hypot(body.item.x-DEN.x,body.item.z-DEN.z),next=Math.hypot(body.item.x+dx-DEN.x,body.item.z+dz-DEN.z);
      const radius=Math.hypot(maxX-minX,maxZ-minZ)/2;
      if(old<DEN.radius && next+radius>DEN.radius-.025)return false;
      if(old>DEN.radius && next-radius<DEN.radius+.025)return false;
    }
    return !this.world.query(minX,minZ,maxX,maxZ).some(s=>!s.pushable&&s.maxY>b.minY+.025&&s.minY<b.maxY-.025&&s.maxX>minX+.005&&s.minX<maxX-.005&&s.maxZ>minZ+.005&&s.minZ<maxZ-.005);
  }
  slide(body,dx,dz) {
    let movedX=0,movedZ=0;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.07));
    for(let i=0;i<steps;i++) {
      const x=dx/steps,z=dz/steps;
      if(this.canPlace(body,x,z)) {this.shift(body,x,0,z);movedX+=x;movedZ+=z;}
      else {
        if(this.canPlace(body,x,0)){this.shift(body,x,0,0);movedX+=x;}
        if(this.canPlace(body,0,z)){this.shift(body,0,0,z);movedZ+=z;}
      }
    }
    return Math.hypot(movedX,movedZ);
  }
  push(body,rabbit,dt) {
    const b=body.box;
    let dx=Math.max(b.minX,Math.min(b.maxX,rabbit.x))-rabbit.x,dz=Math.max(b.minZ,Math.min(b.maxZ,rabbit.z))-rabbit.z;
    let distance=Math.hypot(dx,dz),amount=rabbit.radius+.015-distance;
    if(amount<=0)return;
    if(distance<1e-6) {
      dx=rabbit.vx||Math.sin(rabbit.facing)||1;dz=rabbit.vz||Math.cos(rabbit.facing)||0;distance=Math.hypot(dx,dz);
      amount+=Math.min(b.maxX-rabbit.x,rabbit.x-b.minX,b.maxZ-rabbit.z,rabbit.z-b.minZ)+.01;
    }
    dx/=distance;dz/=distance;
    const shove=Math.max(.01,amount),moved=this.slide(body,dx*shove,dz*shove);
    // Slide clutter sideways when a wall prevents the forward displacement.
    if(moved<shove*.3) {
      if(this.slide(body,-dz*shove,dx*shove)<shove*.3)this.slide(body,dz*shove,-dx*shove);
    }
    body.vx=rabbit.vx*.55+dx*.25;body.vz=rabbit.vz*.55+dz*.25;
    this.active.add(body);rabbit.pushing=true;rabbit.lastPushedId=body.item.id;
  }
  separate(body) {
    const a=body.box;
    for(const b of this.world.queryDynamic(a.minX,a.minZ,a.maxX,a.maxZ)) {
      if(a===b||!b.pushable||a.maxY<=b.minY+.01||a.minY>=b.maxY-.01)continue;
      const overlapX=Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX),overlapZ=Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ);
      if(overlapX<=.002||overlapZ<=.002)continue;
      const x=overlapX<overlapZ?Math.sign((a.minX+a.maxX)-(b.minX+b.maxX))||1:0;
      const z=overlapX>=overlapZ?Math.sign((a.minZ+a.maxZ)-(b.minZ+b.maxZ))||1:0;
      const depth=Math.min(overlapX,overlapZ)+.004,other=this.bodies.get(b);
      this.slide(body,x*depth*.5,z*depth*.5);
      if(other){this.slide(other,-x*depth*.5,-z*depth*.5);other.vx-=x*.15;other.vz-=z*.15;this.active.add(other);}
    }
  }
  update(dt) {
    if(!(dt>0)||!Number.isFinite(dt))return;
    const steps=Math.max(1,Math.ceil(Math.min(dt,.1)*120)),step=Math.min(dt,.1)/steps;
    for(let i=0;i<steps;i++)for(const body of [...this.active]) {
      const ground=this.world.support(body.item.x,body.item.z,body.item.y+.12,true).y;
      body.vy=Math.max(-15,body.vy-16*step);
      const y=Math.max(ground,body.item.y+body.vy*step);
      this.shift(body,0,y-body.item.y,0);
      if(y<=ground+.001)body.vy=0;
      this.slide(body,body.vx*step,body.vz*step);this.separate(body);
      const friction=Math.exp(-8*step);body.vx*=friction;body.vz*=friction;
      if(Math.hypot(body.vx,body.vy,body.vz)<.025&&Math.abs(body.item.y-ground)<.005){body.vx=body.vy=body.vz=0;this.active.delete(body);}
    }
  }
}
