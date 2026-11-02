import { inMistressViewCone } from './mistress-vision.js';
import { withinInteractionReach } from './table-refuges.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

// Poll at the same rate as vision. A bounded ray budget and rotating candidates
// keep large pellet piles from making a camera turn stall, without starving
// farther visible messes behind nearer occluded ones.
export class MistressCleanupSight {
  constructor({vision,navigation,poop,water,rayBudget=24}) {
    Object.assign(this,{vision,navigation,poop,water});this.rayBudget=rayBudget;this.clear();
  }
  clear() {this.descriptors=new WeakMap();this.cursor={pee:0,poop:0};this.serial=0;}
  descriptor(kind,source,stance) {
    let descriptor=this.descriptors.get(source);
    if(!descriptor) {
      const position=()=>({x:source.x,y:source.y+(kind==='pee'?.045:0),z:source.z});
      const canClean=from=>{
        const target=position(),interaction=this.navigation.reachInteraction?.(target)??this.navigation.tableInteraction?.(target);
        const support=interaction?.support??interaction?.table;
        const y=interaction?.under&&support?Math.min(from.y+1,support.minY-.12):Math.max(from.y+1,Math.min(from.y+2.2,target.y+.25));
        return this.vision.canReachPoint({x:from.x,y,z:from.z},target);
      };
      descriptor={id:`${kind}:${++this.serial}`,kind,
        get position(){return position();},
        exists:()=>kind==='pee'?this.water.puddles.includes(source):this.poop.hasBall(source),
        remove:()=>kind==='pee'?this.water.removePuddle(source):this.poop.remove(source),
        canClean,
      };
      Object.defineProperty(descriptor,'goal',{get:()=>{
        const target=position(),goal=this.navigation.cleanupTarget?this.navigation.cleanupTarget(target,descriptor.stance):
          this.navigation.pursuitTarget(target,descriptor.stance);
        const interaction=this.navigation.reachInteraction?.(target)??this.navigation.tableInteraction?.(target);
        return goal&&withinInteractionReach(target,goal,interaction,{reach:1.3,height:2})&&canClean(goal)?goal:null;
      }});
      this.descriptors.set(source,descriptor);
    }
    descriptor.stance={...stance};return descriptor;
  }
  scan(observer,active=null) {
    if(observer.asleep)return null;
    if(active?.kind==='pee'&&active.exists()&&active.goal)return active;
    let budget=this.rayBudget;
    for(const kind of ['pee','poop']) {
      if(kind==='poop'&&active?.kind==='poop'&&active.exists()&&active.goal)return active;
      const sources=kind==='pee'?this.water.puddles:this.poop.physics.balls;
      const candidates=[];
      for(const source of sources) {
        if(kind==='pee'&&!(source.progress>0))continue;
        const position={x:source.x,y:source.y+(kind==='pee'?.045:0),z:source.z};
        if(this.navigation.isDen(position)||!inMistressViewCone(observer.position,observer.yaw,position))continue;
        candidates.push({source,position,distance:distance(observer.position,position)});
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      let examined=0;
      const start=candidates.length?this.cursor[kind]%candidates.length:0;
      while(examined<candidates.length&&budget>0) {
        const candidate=candidates[(start+examined)%candidates.length];examined++;
        // Large puddles may show an edge around cover even if their centre is
        // hidden. Tiny balls need only a centre ray.
        const edge=kind==='pee'?(.45+.6*Math.sqrt(candidate.source.amount/100))*(.18+.82*candidate.source.progress)*.8:0;
        const samples=kind==='pee'?[candidate.position,
          {...candidate.position,x:candidate.position.x+edge},
          {...candidate.position,x:candidate.position.x-edge}]:[candidate.position];
        let seen=false;
        for(const sample of samples) {
          if(budget<=0)break;budget--;
          if(this.vision.canSeePoint(observer,sample)){seen=true;break;}
        }
        if(!seen)continue;
        const descriptor=this.descriptor(kind,candidate.source,observer.stance??observer.position);
        if(!descriptor.goal)continue;
        this.cursor[kind]=0;return descriptor;
      }
      this.cursor[kind]=candidates.length?(start+examined)%candidates.length:0;
      // Check the remaining pee candidates before considering a lower-priority
      // ball on the next scan.
      if(examined<candidates.length)return null;
    }
    return null;
  }
}
