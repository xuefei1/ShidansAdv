import { DEN, FLOOR_HEIGHT, HOUSE, STAIRS, GARDEN_STAIRS, RAMPS, BOUNDS, roomAt } from './layout.js';
import { tableAt, tableInteraction, withinInteractionReach } from './table-refuges.js';
import { WATER_REACH } from './water.js';

export const MISTRESS_RADIUS = .50;
export const MISTRESS_HEIGHT = 2.72;
// The leading edge of a wider foot reaches the stair landing before its
// centre. This allowance is only used at that final stair/slab junction.
export const MISTRESS_STAIR_STEP = .22;
export const MISTRESS_GROUND_STEP = .12;
export const MISTRESS_FOUNTAIN_REACH = 1.2;
const GRID = .5;
const CELL = 4;
const EPSILON = 1e-6;
const point = p => ({x:p.x,y:p.y,z:p.z});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const validPoint = p => p && ['x','y','z'].every(axis=>Number.isFinite(p[axis]));

// Expanded boxes deliberately use the person's square envelope. This small
// safety margin at corners keeps the animated shoulders clear of furniture.
function segmentHitsBox(a,b,box,radius,height,step=0) {
  let first = 0, last = 1;
  for (const [axis,low,high] of [
    ['x',box.minX-radius,box.maxX+radius],
    ['y',box.minY-height+.005,box.maxY-step-.005],
    ['z',box.minZ-radius,box.maxZ+radius],
  ]) {
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<EPSILON) {
      if(a[axis]<=low+EPSILON || a[axis]>=high-EPSILON) return false;
    } else {
      const t1=(low-a[axis])/delta,t2=(high-a[axis])/delta;
      first=Math.max(first,Math.min(t1,t2));last=Math.min(last,Math.max(t1,t2));
      if(last<=first+EPSILON) return false;
    }
  }
  return first<1-EPSILON && last>EPSILON;
}

function distanceToSegmentXZ(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)) : 0;
  return Math.hypot(a.x+dx*t-p.x,a.z+dz*t-p.z);
}

class MinHeap {
  constructor() { this.items=[]; }
  push(id,score) {
    const item={id,score},items=this.items;let index=items.length;items.push(item);
    while(index>0) {
      const parent=(index-1)>>1;if(items[parent].score<=score) break;
      items[index]=items[parent];index=parent;
    }
    items[index]=item;
  }
  pop() {
    const items=this.items,first=items[0],last=items.pop();
    if(items.length) {
      let index=0;
      while(index*2+1<items.length) {
        let child=index*2+1;
        if(child+1<items.length && items[child+1].score<items[child].score) child++;
        if(items[child].score>=last.score) break;
        items[index]=items[child];index=child;
      }
      items[index]=last;
    }
    return first;
  }
  get length() { return this.items.length; }
}

// Static, human-sized navigation is authored separately from rabbit physics.
// Build once after the house and fountains: moving food and Shidan never
// invalidate this graph, and following a route does not perform path searches.
export class MistressNavigation {
  constructor(world) {
    this.radius=MISTRESS_RADIUS;this.height=MISTRESS_HEIGHT;
    this.rampEnds=RAMPS.map(ramp=>[{x:(ramp.minX+ramp.maxX)/2,y:0,z:ramp.startZ},{x:(ramp.minX+ramp.maxX)/2,y:ramp.height,z:ramp.endZ}]);
    this.rampLengths=this.rampEnds.map(([low,high])=>distance(low,high));
    this.obstacles=(world.solids ?? []).filter(box=>!box.pushable && !world.dynamicBoxes?.has(box)).map(box=>({...box}));
    this.tabletops=this.obstacles.filter(box=>box.tabletop);
    this._buildReachShelves();
    this._buildReachSurfaces();
    this._buildReachFountains();
    this.cells=new Map();
    for(const box of this.obstacles) {
      for(let x=Math.floor(box.minX/CELL);x<=Math.floor(box.maxX/CELL);x++) {
        for(let z=Math.floor(box.minZ/CELL);z<=Math.floor(box.maxZ/CELL);z++) {
          const key=`${x},${z}`;
          if(!this.cells.has(key)) this.cells.set(key,[]);
          this.cells.get(key).push(box);
        }
      }
    }
    this.nodes=[];this.grid=new Map();this.stairNodes=[];this.nodeCells=new Map();
    this.buildGraph();
    this.labelComponents();
    this.mainComponent=this.componentAt({x:-15.8,y:0,z:6.9});
    if(this.mainComponent<0)this.mainComponent=this.components[0]??-1;
    this._pursuitCache=null;
    this._approachCache=null;
    this._cleanupCache=null;
  }

  // Low front-wing roofs are not upstairs floors. Both actual stair ramps
  // connect the upper rooms/balcony to the ground-floor lot.
  hasFloor(p) {
    if(!validPoint(p)) return false;
    const r=this.radius;
    if(p.x<BOUNDS.minX+r || p.x>BOUNDS.maxX-r || p.z<BOUNDS.minZ+r || p.z>BOUNDS.maxZ-r) return false;
    for(const ramp of RAMPS) {
      if(p.x<ramp.minX+r || p.x>ramp.maxX-r || p.z<Math.min(ramp.startZ,ramp.endZ) || p.z>Math.max(ramp.startZ,ramp.endZ))continue;
      const y=(ramp.startZ-p.z)/(ramp.startZ-ramp.endZ)*ramp.height;
      if(Math.abs(p.y-y)<.006)return true;
    }
    // Grid nodes sit on actual pavers; interpolation may cross their small
    // ankle-height steps. The band keeps this support test constant-cost.
    if(p.y>=-.005 && p.y<=MISTRESS_GROUND_STEP+.005) {
      // Prevent sideways entry through the solid staircase and its railings.
      return !RAMPS.some(ramp=>p.x>ramp.minX-r && p.x<ramp.maxX+r &&
        p.z>Math.min(ramp.startZ,ramp.endZ)-r && p.z<Math.max(ramp.startZ,ramp.endZ)+r &&
        Math.abs(p.z-ramp.startZ)>.006 && (ramp.startZ-p.z)/(ramp.startZ-ramp.endZ)>0);
    }
    const stairLanding=p.x>=STAIRS.minX+r && p.x<=STAIRS.maxX-r && p.z<=STAIRS.endZ;
    const indoor=p.x>=HOUSE.minX+r && p.x<=HOUSE.maxX-r && p.z>=HOUSE.minZ && (p.z<=2-r || stairLanding) && p.z<=2;
    const balcony=p.x>=-20+r && p.x<=24-r && p.z>=-25+r && p.z<=-20;
    const gardenLanding=p.x>=GARDEN_STAIRS.minX+r && p.x<=GARDEN_STAIRS.maxX-r && p.z>=GARDEN_STAIRS.endZ && p.z<=-20;
    return p.y>=FLOOR_HEIGHT-.005 && p.y<=FLOOR_HEIGHT+MISTRESS_GROUND_STEP+.005 && (indoor || balcony || gardenLanding);
  }

  supportHeight(x,z,base) {
    let height=base;
    for(const box of this.candidates(x,z,x,z))if(box.maxY>height && box.maxY<=base+MISTRESS_GROUND_STEP+.001 &&
      x>box.minX && x<box.maxX && z>box.minZ && z<box.maxZ)height=box.maxY;
    return height;
  }

  stepAllowance(box,a,b=a) {
    if(box.rabbitRamp)return 0;
    if(this.isStairLip(box,a,b))return MISTRESS_STAIR_STEP;
    return box.maxY-Math.min(a.y,b.y)<=MISTRESS_GROUND_STEP+.001?MISTRESS_GROUND_STEP:0;
  }

  candidates(minX,minZ,maxX,maxZ) {
    const x0=Math.floor(minX/CELL),x1=Math.floor(maxX/CELL),z0=Math.floor(minZ/CELL),z1=Math.floor(maxZ/CELL);
    if(x0===x1 && z0===z1) return this.cells.get(`${x0},${z0}`) ?? [];
    const found=new Set();
    for(let x=x0;x<=x1;x++) for(let z=z0;z<=z1;z++) for(const box of this.cells.get(`${x},${z}`) ?? []) found.add(box);
    return found;
  }

  isStairLip(box,a,b=a) {
    // The ramp meets the slab's vertical edge with an 8cm final step. The
    // collision model uses a smooth ramp; allow that lip below the ankles.
    const ramp=box.id==='upper-floor'?STAIRS:box.id==='balcony-floor'?GARDEN_STAIRS:null;
    return ramp && Math.min(a.x,b.x)>=ramp.minX+this.radius && Math.max(a.x,b.x)<=ramp.maxX-this.radius;
  }

  canStand(p) {
    if(!this.hasFloor(p)) return false;
    if(p.y<DEN.fenceHeight && Math.hypot(p.x-DEN.x,p.z-DEN.z)<DEN.radius+this.radius+.02) return false;
    for(const box of this.candidates(p.x-this.radius,p.z-this.radius,p.x+this.radius,p.z+this.radius)) {
      if(box.rabbitRamp&&p.y>=(box.reachableShelf?.baseY??box.minY)-.13&&p.y<=box.maxY+.13&&
        p.x>box.minX-this.radius+EPSILON&&p.x<box.maxX+this.radius-EPSILON&&
        p.z>box.minZ-this.radius+EPSILON&&p.z<box.maxZ+this.radius-EPSILON)return false;
      const step=this.stepAllowance(box,p);
      if(p.y+.005>=box.maxY-step || p.y+this.height-.005<=box.minY) continue;
      if(p.x>box.minX-this.radius+EPSILON && p.x<box.maxX+this.radius-EPSILON &&
        p.z>box.minZ-this.radius+EPSILON && p.z<box.maxZ+this.radius-EPSILON) return false;
    }
    return true;
  }

  segmentClear(a,b) {
    if(!this.canStand(a) || !this.canStand(b)) return false;
    if(Math.min(a.y,b.y)<DEN.fenceHeight && distanceToSegmentXZ(DEN,a,b)<DEN.radius+this.radius+.02) return false;
    for(const box of this.candidates(Math.min(a.x,b.x)-this.radius,Math.min(a.z,b.z)-this.radius,
      Math.max(a.x,b.x)+this.radius,Math.max(a.z,b.z)+this.radius)) {
      if(segmentHitsBox(a,b,box,this.radius,this.height,this.stepAllowance(box,a,b))) return false;
    }
    const steps=Math.max(1,Math.ceil(distance(a,b)/.125));
    // Support is sampled independently of obstacle sweeps, so smoothing cannot
    // cut off the stairs, float over a void or descend through a floor slab.
    for(let i=1;i<steps;i++) {
      const t=i/steps;
      if(!this.hasFloor({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t})) return false;
    }
    return true;
  }

  buildGraph() {
    const add=(p,key)=>{
      if(!this.canStand(p)) return null;
      const id=this.nodes.length;this.nodes.push({...p,id,edges:[]});
      if(key) this.grid.set(key,id);
      const cell=`${Math.floor(p.x/CELL)},${Math.floor(p.z/CELL)}`;
      if(!this.nodeCells.has(cell))this.nodeCells.set(cell,[]);
      this.nodeCells.get(cell).push(id);
      return id;
    };
    for(let floor=0;floor<2;floor++) {
      const minX=floor?HOUSE.minX:BOUNDS.minX,maxX=floor?HOUSE.maxX:BOUNDS.maxX;
      const minZ=floor?-25:BOUNDS.minZ,maxZ=floor?2:BOUNDS.maxZ;
      for(let ix=Math.ceil(minX/GRID);ix<=Math.floor(maxX/GRID);ix++) {
        for(let iz=Math.ceil(minZ/GRID);iz<=Math.floor(maxZ/GRID);iz++) add({x:ix*GRID,y:this.supportHeight(ix*GRID,iz*GRID,floor*FLOOR_HEIGHT),z:iz*GRID},`${floor},${ix},${iz}`);
      }
    }
    const connect=(a,b)=>{
      if(a===undefined || a===null || b===undefined || b===null || a===b) return;
      const first=this.nodes[a],second=this.nodes[b];
      if(!this.segmentClear(first,second)) return;
      const cost=distance(first,second);first.edges.push({id:b,cost});second.edges.push({id:a,cost});
    };
    for(const [key,id] of this.grid) {
      const [floor,x,z]=key.split(',').map(Number);
      for(const [dx,dz] of [[0,1],[1,-1],[1,0],[1,1]]) connect(id,this.grid.get(`${floor},${x+dx},${z+dz}`));
    }
    for(const [rampIndex,ramp] of RAMPS.entries()) {
      const x=(ramp.minX+ramp.maxX)/2,direction=Math.sign(ramp.endZ-ramp.startZ);
      let previous=this.grid.get(`0,${x/GRID},${(ramp.startZ-direction*GRID)/GRID}`);
      const count=Math.round(Math.abs(ramp.endZ-ramp.startZ)/GRID);
      for(let index=0;index<=count;index++) {
        const progress=index/count,z=ramp.startZ+(ramp.endZ-ramp.startZ)*progress;
        const id=add({x,y:progress*ramp.height,z,ramp:rampIndex});
        if(id!==null)this.stairNodes.push(id);
        connect(previous,id);previous=id;
      }
      connect(previous,this.grid.get(`1,${x/GRID},${(ramp.endZ+direction*GRID)/GRID}`));
    }
  }

  labelComponents() {
    this.components=new Int32Array(this.nodes.length).fill(-1);this.componentCount=0;
    for(const start of this.nodes) {
      if(this.components[start.id]>=0)continue;
      const label=this.componentCount++,queue=[start.id];this.components[start.id]=label;
      for(let index=0;index<queue.length;index++)for(const edge of this.nodes[queue[index]].edges) {
        if(this.components[edge.id]>=0)continue;
        this.components[edge.id]=label;queue.push(edge.id);
      }
    }
  }

  componentAt(p) {
    if(!this.canStand(p))return -1;
    const floor=p.y>=FLOOR_HEIGHT-.006?1:0,ix=Math.round(p.x/GRID),iz=Math.round(p.z/GRID);
    for(const [dx,dz] of [[0,0],[0,1],[1,0],[0,-1],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]]) {
      const id=this.grid.get(`${floor},${ix+dx},${iz+dz}`);
      if(id!==undefined && this.segmentClear(p,this.nodes[id]))return this.components[id];
    }
    for(const id of this.stairNodes)if(distance(p,this.nodes[id])<1.6 && this.segmentClear(p,this.nodes[id]))return this.components[id];
    return -1;
  }

  floorPoint(p) {
    if(!validPoint(p))return null;
    for(const ramp of RAMPS) {
      if(p.x<ramp.minX || p.x>ramp.maxX || p.z<Math.min(ramp.startZ,ramp.endZ) || p.z>Math.max(ramp.startZ,ramp.endZ))continue;
      const y=(ramp.startZ-p.z)/(ramp.startZ-ramp.endZ)*ramp.height;
      if(p.y>=y-.35)return {x:p.x,y,z:p.z};
    }
    const upper=p.y>=FLOOR_HEIGHT-.35 && p.x>=HOUSE.minX && p.x<=HOUSE.maxX && p.z>=-25 && p.z<=2;
    return {x:p.x,y:this.supportHeight(p.x,p.z,upper?FLOOR_HEIGHT:0),z:p.z};
  }

  region(p) {
    if(p.x<HOUSE.minX || p.x>HOUSE.maxX || p.z<HOUSE.minZ || p.z>HOUSE.maxZ)return p.y>=FLOOR_HEIGHT-.25?'balcony':'outside';
    return roomAt(p.x,p.y,p.z)?.id??'hall';
  }

  nearbyCandidates(p,radius) {
    const found=[];
    for(let x=Math.floor((p.x-radius)/CELL);x<=Math.floor((p.x+radius)/CELL);x++)for(let z=Math.floor((p.z-radius)/CELL);z<=Math.floor((p.z+radius)/CELL);z++) {
      for(const id of this.nodeCells.get(`${x},${z}`)??[]) {
        const node=this.nodes[id];if(Math.hypot(node.x-p.x,node.y-p.y,node.z-p.z)<=radius+EPSILON)found.push(node);
      }
    }
    return found;
  }

  nearestReachable(p,from,{maxDistance=3}={}) {
    const target=this.floorPoint(p),component=from?this.componentAt(from):this.mainComponent;
    if(!target || component<0 || !Number.isFinite(maxDistance) || maxDistance<0)return null;
    if(this.canStand(target) && this.componentAt(target)===component)return point(target);
    let nearest=null,best=maxDistance+EPSILON;
    for(const node of this.nearbyCandidates(target,maxDistance)) {
      const d=distance(node,target);
      if(d>=best || this.components[node.id]!==component)continue;
      nearest=node;best=d;
    }
    return nearest?point(nearest):null;
  }

  isDen(p) {
    return validPoint(p) && p.y<FLOOR_HEIGHT-.35 && Math.hypot(p.x-DEN.x,p.z-DEN.z)<DEN.radius;
  }

  pursuitTarget(player,from,{preferFrom=false}={}) {
    if(!validPoint(player))return null;
    const component=from?this.componentAt(from):this.mainComponent;
    const key=`${player.x},${player.y},${player.z},${component}${preferFrom&&validPoint(from)?`,${from.x},${from.y},${from.z}`:''}`;
    const cache=preferFrom?this._approachCache:this._pursuitCache;
    if(cache?.key===key)return cache.target?point(cache.target):null;
    const target=this._pursuitTarget(player,component,{from:preferFrom?from:null});
    if(preferFrom)this._approachCache={key,target};else this._pursuitCache={key,target};
    return target?point(target):null;
  }

  tableAt(position) {return tableAt(position,this.tabletops);}
  tableInteraction(position) {return tableInteraction(position,this.tabletops);}

  _buildReachFountains() {
    const groups=new Map();
    for(const box of this.obstacles) {
      if(!box.fountainId)continue;
      if(!groups.has(box.fountainId))groups.set(box.fountainId,{id:box.fountainId,
        minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity});
      const fountain=groups.get(box.fountainId);
      for(const axis of ['X','Y','Z']) {
        fountain[`min${axis}`]=Math.min(fountain[`min${axis}`],box[`min${axis}`]);
        fountain[`max${axis}`]=Math.max(fountain[`max${axis}`],box[`max${axis}`]);
      }
    }
    this.reachableFountains=[...groups.values()];
  }

  fountainAt(position) {
    if(!validPoint(position))return null;
    return this.reachableFountains.find(fountain=>Math.abs(position.y-fountain.minY)<=.45+EPSILON&&
      Math.hypot(position.x-(fountain.minX+fountain.maxX)/2,position.z-(fountain.minZ+fountain.maxZ)/2)<=WATER_REACH+EPSILON)??null;
  }

  _buildReachShelves() {
    const groups=new Map();
    for(const box of this.obstacles) {
      const metadata=box.reachableShelf;if(!metadata?.id)continue;
      if(!groups.has(metadata.id))groups.set(metadata.id,{id:metadata.id,baseY:metadata.baseY,decks:[],parts:[],
        minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity});
      const shelf=groups.get(metadata.id);shelf.parts.push(box);if(box.shelfDeck)shelf.decks.push(box);
      for(const axis of ['X','Y','Z']) {shelf[`min${axis}`]=Math.min(shelf[`min${axis}`],box[`min${axis}`]);shelf[`max${axis}`]=Math.max(shelf[`max${axis}`],box[`max${axis}`]);}
    }
    this.reachableShelves=[...groups.values()].filter(shelf=>shelf.decks.length);
  }

  shelfAt(position) {
    if(!validPoint(position))return null;
    return this.reachableShelves.find(shelf=>position.x>=shelf.minX-.001&&position.x<=shelf.maxX+.001&&
      position.z>=shelf.minZ-.001&&position.z<=shelf.maxZ+.001&&position.y>=shelf.baseY-.02&&position.y<=shelf.baseY+2.4+.001&&
      shelf.parts.some(part=>position.x>=part.minX-.001&&position.x<=part.maxX+.001&&
        position.z>=part.minZ-.001&&position.z<=part.maxZ+.001))??null;
  }

  _buildReachSurfaces() {
    // Join only low, connected physical furniture layers. This keeps a bed's
    // frame, quilt and pillows one surface while excluding walls/floor slabs.
    const boxes=this.obstacles.filter(box=>{
      const base=box.minY>=FLOOR_HEIGHT-.1?FLOOR_HEIGHT:0;
      return box.minY>=base-.05&&box.maxY>base+.12&&box.maxY<=base+2.4+.001;
    });
    const parents=boxes.map((_,index)=>index),baseOf=box=>box.minY>=FLOOR_HEIGHT-.1?FLOOR_HEIGHT:0;
    const root=index=>{while(parents[index]!==index){parents[index]=parents[parents[index]];index=parents[index];}return index;};
    for(let a=0;a<boxes.length;a++)for(let b=0;b<a;b++) {
      const first=boxes[a],second=boxes[b];if(baseOf(first)!==baseOf(second))continue;
      if(['X','Y','Z'].every(axis=>first[`min${axis}`]<=second[`max${axis}`]+.025&&first[`max${axis}`]>=second[`min${axis}`]-.025))
        parents[root(a)]=root(b);
    }
    const groups=new Map();this._reachSurfaceByBox=new Map();
    for(let index=0;index<boxes.length;index++) {
      const id=root(index),box=boxes[index];
      if(!groups.has(id))groups.set(id,{id:`reachable-surface-${id}`,baseY:baseOf(box),
        minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity});
      const group=groups.get(id);
      for(const axis of ['X','Y','Z']) {group[`min${axis}`]=Math.min(group[`min${axis}`],box[`min${axis}`]);group[`max${axis}`]=Math.max(group[`max${axis}`],box[`max${axis}`]);}
      this._reachSurfaceByBox.set(box,group);
    }
  }

  reachInteraction(position) {
    const shelf=this.shelfAt(position);
    if(shelf) {
      const overhead=shelf.decks.filter(deck=>deck.minY>position.y+.25&&position.x>=deck.minX-.001&&position.x<=deck.maxX+.001&&
        position.z>=deck.minZ-.001&&position.z<=deck.maxZ+.001).sort((a,b)=>a.minY-b.minY)[0];
      const support=overhead??[...shelf.decks].sort((a,b)=>b.maxY-a.maxY).find(deck=>deck.maxY<=position.y+.035)??shelf.decks[0];
      return {support,table:support,envelope:shelf,key:shelf.id,kind:'shelf',under:!!overhead,reach:3.2,height:2.4};
    }
    const table=this.tableInteraction(position);
    if(table)return {...table,support:table.table,key:table.table.id,kind:'table'};
    const fountain=this.fountainAt(position);
    if(fountain)return {support:fountain,key:fountain.id,kind:'fountain',under:false,reach:MISTRESS_FOUNTAIN_REACH,height:1.35};
    const base=this.floorPoint(position);
    if(!base||position.y<=base.y+.12||position.y>base.y+2.4+.001)return null;
    let support=null;
    for(const box of this.candidates(position.x,position.z,position.x,position.z)) {
      if(!this._reachSurfaceByBox.has(box)||box.maxY>position.y+.035||box.maxY<=base.y+.12||
        position.x<box.minX-.001||position.x>box.maxX+.001||position.z<box.minZ-.001||position.z>box.maxZ+.001)continue;
      if(!support||box.maxY>support.maxY)support=box;
    }
    if(!support)return null;
    const surface=this._reachSurfaceByBox.get(support);
    return {table:surface,support:surface,key:surface.id,kind:'surface',under:false,reach:3.2,height:2.4};
  }

  // Waste and rabbits use the same reachable table perimeter. A separate
  // cache avoids repeated waste queries displacing the live rabbit query.
  cleanupTarget(position,from) {
    if(!validPoint(position))return null;
    const component=from?this.componentAt(from):this.mainComponent;
    const key=`${position.x},${position.y},${position.z},${component}`;
    if(this._cleanupCache?.key===key)return this._cleanupCache.target?point(this._cleanupCache.target):null;
    const target=this._pursuitTarget(position,component,{waste:true});
    this._cleanupCache={key,target};return target?point(target):null;
  }

  _tablePerimeterCandidates(table,target,base) {
    // A half-metre grid can miss an otherwise reachable table edge, especially
    // beside a chair or climbing trunk. Project onto the actual person-clear
    // faces and the nearby obstacles' critical edges instead of a finer grid.
    const margin=.015,r=this.radius+margin,found=[];
    const faces=[['x','z',table.minX-r,table.minZ-r,table.maxZ+r],['x','z',table.maxX+r,table.minZ-r,table.maxZ+r],
      ['z','x',table.minZ-r,table.minX-r,table.maxX+r],['z','x',table.maxZ+r,table.minX-r,table.maxX+r]];
    const nearby=this.candidates(table.minX-2*r,table.minZ-2*r,table.maxX+2*r,table.maxZ+2*r);
    for(const [normal,tangent,fixed,low,high] of faces) {
      const values=new Set([Math.max(low,Math.min(high,target[tangent])),low,high,(low+high)/2]);
      for(const obstacle of nearby) {
        if(obstacle.maxY<=base.y+MISTRESS_GROUND_STEP+.005||obstacle.minY>=base.y+this.height-.005)continue;
        const n=normal.toUpperCase(),t=tangent.toUpperCase();
        if(fixed<obstacle[`min${n}`]-r||fixed>obstacle[`max${n}`]+r)continue;
        for(const edge of [obstacle[`min${t}`]-r,obstacle[`max${t}`]+r])if(edge>=low&&edge<=high)values.add(edge);
      }
      // At most 128 temporary points; the fixed navigation graph/cache never
      // grows. Nearer critical coordinates are tested first if a face is busy.
      for(const coordinate of [...values].sort((a,b)=>Math.abs(a-target[tangent])-Math.abs(b-target[tangent])).slice(0,32)) {
        const candidate={x:0,y:base.y,z:0,continuous:true};candidate[normal]=fixed;candidate[tangent]=coordinate;
        if(this.canStand(candidate))found.push(candidate);
      }
    }
    return found;
  }

  _pursuitTarget(player,component,{waste=false,from=null}={}) {
    const base=this.floorPoint(player);
    if(!base || component<0 || this.isDen(player))return null;
    const interaction=this.reachInteraction(player),table=this.tableAt(player),surface=interaction?.envelope??interaction?.support??interaction?.table;
    // Real low passages remain protected. Tagged tables and the small props
    // resting above their slabs do not turn the floor underneath into shelter.
    for(const box of this.candidates(player.x,player.z,player.x,player.z)) {
      if(interaction?.kind==='shelf'&&box.reachableShelf?.id===interaction.key)continue;
      if(box.tabletop||(table&&box.minY>=table.minY-.005))continue;
      if(player.x>box.minX+.002 && player.x<box.maxX-.002 && player.z>box.minZ+.002 && player.z<box.maxZ-.002 &&
        box.minY>player.y+.25 && box.minY<base.y+this.height-.005)return null;
    }
    if(this.canStand(base) && this.componentAt(base)===component)return base;
    const elevated=player.y>base.y+MISTRESS_GROUND_STEP+.05,maxDistance=interaction?.reach??(elevated?4:.9),region=this.region(base);
    let nearest=null,best=Infinity;
    const around=interaction?.edgeReach!==undefined&&table?
      {x:(table.minX+table.maxX)/2,y:base.y,z:(table.minZ+table.maxZ)/2}:base;
    const radius=interaction?.edgeReach!==undefined&&table?
      Math.hypot(table.maxX-table.minX,table.maxZ-table.minZ)/2+interaction.edgeReach:maxDistance;
    const candidates=this.nearbyCandidates(around,radius);
    if(surface)candidates.push(...this._tablePerimeterCandidates(surface,player,base));
    // Grid rounding must not grant immunity in an ordinary wall corner. A few
    // local continuous stances find the clear side of a wall/furniture edge.
    if(!elevated&&!interaction)for(const radius of [.35,.65,.9])for(let index=0;index<16;index++) {
      const angle=index/16*Math.PI*2,p={x:base.x+Math.sin(angle)*radius,y:base.y,z:base.z+Math.cos(angle)*radius};
      if(this.canStand(p))candidates.push({...p,component:this.componentAt(p)});
    }
    for(const node of candidates) {
      const d=distance(base,node);
      // A drinking rabbit may fit between a low bowl and a wall where the
      // human cannot stand. Use the nearest clear hand approach, rather than
      // stopping on the NPC-facing edge just outside ordinary capture range.
      const score=interaction?.kind==='fountain'?d:validPoint(from)?distance(from,node)+d*.08:d;
      if(d>maxDistance+EPSILON||score>=best||Math.abs(node.y-base.y)>.4||this.region(node)!==region)continue;
      if(interaction?.edgeReach!==undefined&&!withinInteractionReach(player,node,interaction))continue;
      if((node.continuous?this.componentAt(node):node.component??this.components[node.id])!==component)continue;
      const overhead=interaction?.under?(interaction.support??interaction.table):null;
      const start={x:node.x,y:overhead?Math.min(node.y+1,overhead.minY-.12):
        interaction?Math.max(node.y+1,Math.min(node.y+2.2,player.y+(waste ? .25 : .35))):node.y+(elevated?1.9:.35),z:node.z};
      // Cleanup reaches the exact object, rather than a rabbit's upper body.
      // A ray above a nearby stool can see fur while the ball below is blocked.
      const end={x:player.x,y:interaction&&waste?player.y:
        overhead?Math.min(player.y+.35,overhead.minY-.04):player.y+.35,z:player.z};
      let blocked=false;
      for(const box of this.candidates(Math.min(start.x,end.x),Math.min(start.z,end.z),Math.max(start.x,end.x),Math.max(start.z,end.z))) {
        if(segmentHitsBox(start,end,box,0,0)){blocked=true;break;}
      }
      if(blocked)continue;
      nearest=node;best=score;
    }
    return nearest?point(nearest):null;
  }

  isRabbitSafe(player,from) { return !this.pursuitTarget(player,from); }

  randomNearby(from,radius=6,random=Math.random) {
    const component=this.componentAt(from);
    if(component<0 || !Number.isFinite(radius) || radius<=0)return null;
    const candidates=this.nearbyCandidates(from,radius).filter(node=>this.components[node.id]===component && Math.abs(node.y-from.y)<.65 && distance(node,from)>.8);
    if(!candidates.length)return null;
    const sample=random(),index=Math.floor(Math.max(0,Math.min(1-Number.EPSILON,Number.isFinite(sample)?sample:.5))*candidates.length);
    return point(candidates[index]);
  }

  makeHeuristic(target) {
    const targetFloor=target.y>=FLOOR_HEIGHT-.005?1:0;
    const targetRamp=target.y>.005&&target.y<FLOOR_HEIGHT-.005 ? RAMPS.findIndex(ramp=>{
      const y=(ramp.startZ-target.z)/(ramp.startZ-ramp.endZ)*ramp.height;
      return target.x>=ramp.minX+this.radius&&target.x<=ramp.maxX-this.radius&&Math.abs(y-target.y)<.006;
    }):-1;
    const crossFloor=(a,floor,b,other)=>{
      if(floor===other)return distance(a,b);
      let best=Infinity;
      for(let index=0;index<RAMPS.length;index++)best=Math.min(best,distance(a,this.rampEnds[index][floor])+this.rampLengths[index]+distance(this.rampEnds[index][other],b));
      return best;
    };
    const floorHeuristic=(node,floor)=>{
      if(targetRamp<0) {
        if(floor===targetFloor)return distance(node,target);
        let best=Infinity;
        for(let index=0;index<RAMPS.length;index++)best=Math.min(best,distance(node,this.rampEnds[index][floor])+normalCosts[index]);
        return best;
      }
      return Math.min(...this.rampEnds[targetRamp].map((end,index)=>crossFloor(node,floor,end,index)+distance(end,target)));
    };
    const normalCosts=this.rampEnds.map((ends,index)=>this.rampLengths[index]+distance(ends[targetFloor],target));
    const portalCosts=this.rampEnds.map(ends=>ends.map((end,floor)=>floorHeuristic(end,floor)));
    return node=>{
      if(node.ramp!==undefined && node.y>.005 && node.y<FLOOR_HEIGHT-.005) {
        const costs=this.rampEnds[node.ramp].map((end,floor)=>distance(node,end)+portalCosts[node.ramp][floor]);
        if(node.ramp===targetRamp)costs.push(distance(node,target));
        return Math.min(...costs);
      }
      return floorHeuristic(node,node.y>=FLOOR_HEIGHT-.005?1:0);
    };
  }

  nearbyNodes(p) {
    const found=[],floor=p.y>FLOOR_HEIGHT-.01?1:0,ix=Math.round(p.x/GRID),iz=Math.round(p.z/GRID);
    for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) {
      const id=this.grid.get(`${floor},${ix+dx},${iz+dz}`);
      if(id!==undefined && this.segmentClear(p,this.nodes[id])) found.push(id);
    }
    for(const id of this.stairNodes) if(distance(p,this.nodes[id])<1.6 && this.segmentClear(p,this.nodes[id])) found.push(id);
    return found;
  }

  findPath(from,to) {
    if(!this.canStand(from) || !this.canStand(to)) return [];
    const component=this.componentAt(from);if(component<0 || this.componentAt(to)!==component)return [];
    if(this.segmentClear(from,to)) return [point(from),point(to)];
    const starts=this.nearbyNodes(from),ends=this.nearbyNodes(to);
    if(!starts.length || !ends.length) return [];
    const goals=new Set(ends),count=this.nodes.length,g=new Float64Array(count).fill(Infinity);
    const previous=new Int32Array(count).fill(-1),closed=new Uint8Array(count),open=new MinHeap();
    // A stair-aware lower bound avoids exploring the whole garden merely
    // because the quarry is directly above us on the other floor.
    const heuristic=this.makeHeuristic(to),estimates=new Float64Array(count).fill(-1);
    const estimate=id=>estimates[id]<0?(estimates[id]=heuristic(this.nodes[id])):estimates[id];
    for(const id of starts) {g[id]=distance(from,this.nodes[id]);open.push(id,g[id]+estimate(id));}
    let reached=-1;
    while(open.length) {
      const {id}=open.pop();if(closed[id]) continue;
      if(goals.has(id)) {reached=id;break;}
      closed[id]=1;
      for(const edge of this.nodes[id].edges) {
        const cost=g[id]+edge.cost;
        if(closed[edge.id] || cost>=g[edge.id]) continue;
        g[edge.id]=cost;previous[edge.id]=id;open.push(edge.id,cost+estimate(edge.id));
      }
    }
    if(reached<0) return [];
    const route=[point(to)];
    for(let id=reached;id>=0;id=previous[id]) route.push(point(this.nodes[id]));
    route.push(point(from));route.reverse();
    // Greedy string pulling returns only clear walking segments. In particular
    // it retains the two stair landings rather than interpolating floor heights.
    const smoothed=[route[0]];let anchor=0;
    while(anchor<route.length-1) {
      let next=route.length-1;
      while(next>anchor+1 && !this.segmentClear(route[anchor],route[next])) next--;
      if(distance(smoothed.at(-1),route[next])>EPSILON) smoothed.push(route[next]);
      anchor=next;
    }
    return smoothed;
  }
}
