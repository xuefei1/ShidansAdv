import {BASEMENT} from './layout.js';

// Reuse each design's passage graph across a larger footprint. The narrow
// perimeter is still human-walkable; the west edge respects the stair cheek.
export const MIRROR_MAZE_BOUNDS=Object.freeze({minX:-19.3,maxX:22.3,minZ:-18.3,maxZ:18.3,
  columns:16,rows:12,cellWidth:2.6,cellDepth:3.05,cellSize:2.6});
export const MAZE_PERIMETER=Object.freeze({westX:-20.1,eastX:23.1,northZ:-19.1,southZ:19.1});
const {columns:C,rows:R,cellWidth:WIDTH,cellDepth:DEPTH,minX:LEFT,minZ:BACK}=MIRROR_MAZE_BOUNDS;
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
const idAt=(c,r)=>r*C+c;
const heartIds=[idAt(C/2-1,R/2-1),idAt(C/2,R/2-1),idAt(C/2-1,R/2),idAt(C/2,R/2)];
const heartSet=new Set(heartIds);
const neighbours=id=>{
  const c=id%C,r=Math.floor(id/C),out=[];
  if(c>0)out.push(id-1);if(c<C-1)out.push(id+1);if(r>0)out.push(id-C);if(r<R-1)out.push(id+C);
  return out;
};
export function mazeRandom(seed) {
  let state=seed>>>0;
  return ()=>{state=(state+0x6d2b79f5)>>>0;let value=Math.imul(state^(state>>>15),state|1);value^=value+Math.imul(value^(value>>>7),value|61);return ((value^(value>>>14))>>>0)/4294967296;};
}
function distances(open,starts) {
  const result=Array(C*R).fill(Infinity),queue=[...starts];for(const id of queue)result[id]=0;
  for(let i=0;i<queue.length;i++)for(const next of neighbours(queue[i]))if(result[next]===Infinity&&open.has(edgeKey(queue[i],next))) {
    result[next]=result[queue[i]]+1;queue.push(next);
  }
  return result;
}
function adjacency(open) {return Array.from({length:C*R},(_,id)=>neighbours(id).filter(next=>open.has(edgeKey(id,next))));}
function reachableWithout(links,blocked=-1) {
  const seen=new Uint8Array(C*R),queue=heartIds.filter(id=>id!==blocked);
  for(const id of queue)seen[id]=1;
  for(let i=0;i<queue.length;i++)for(const next of links[queue[i]])if(next!==blocked&&!seen[next]) {seen[next]=1;queue.push(next);}
  return seen;
}
function articulations(links) {
  const entered=new Int32Array(C*R),low=new Int32Array(C*R),result=[];let clock=0;
  function visit(id,parent=-1) {
    entered[id]=low[id]=++clock;let children=0,cut=false;
    for(const next of links[id]) {
      if(!entered[next]) {children++;visit(next,id);low[id]=Math.min(low[id],low[next]);if(parent!==-1&&low[next]>=entered[id])cut=true;}
      else if(next!==parent)low[id]=Math.min(low[id],entered[next]);
    }
    if(parent===-1?children>1:cut)result.push(id);
  }
  visit(heartIds[0]);return result;
}
function alternateApproaches(open,entrances,random) {
  // Repair only chokepoints used by an entrance, keeping unrelated dead ends.
  // Each new side passage bypasses an articulation on the route to the heart;
  // after repair no single outside junction can block an entrance's approach.
  const closed=[];
  for(let a=0;a<C*R;a++)if(!heartSet.has(a))for(const b of neighbours(a)) {
    if(b>a&&!heartSet.has(b)&&!open.has(edgeKey(a,b)))closed.push([a,b]);
  }
  for(let pass=0;pass<C*R;pass++) {
    const links=adjacency(open),cuts=articulations(links).filter(id=>!heartSet.has(id)).map(id=>({id,reachable:reachableWithout(links,id)}))
      .filter(cut=>entrances.some(gate=>gate.cell!==cut.id&&!cut.reachable[gate.cell]));
    if(!cuts.length)return;
    let best=-1,score=0;
    for(let i=0;i<closed.length;i++) {
      const [a,b]=closed[i];if(open.has(edgeKey(a,b)))continue;
      const covered=cuts.reduce((count,cut)=>count+Number(a!==cut.id&&b!==cut.id&&cut.reachable[a]!==cut.reachable[b]),0);
      const rank=covered+(covered?random()*.2:0);
      if(rank>score){score=rank;best=i;}
    }
    if(best<0)throw Error('Cannot create alternate maze approaches');
    open.add(edgeKey(...closed[best]));
  }
  throw Error('Maze approach repair did not converge');
}
function chooseCorridor(random,at,available,previous,profile) {
  if(profile==='tangle')return available[Math.floor(random()*available.length)];
  const column=at%C,row=Math.floor(at/C),lastColumn=previous===undefined?column:previous%C,lastRow=previous===undefined?row:Math.floor(previous/C);
  const weights=available.map(next=>{
    const dx=next%C-column,dz=Math.floor(next/C)-row;
    const straight=dx===column-lastColumn&&dz===row-lastRow;
    if(profile==='ribbons')return (dx?4:1)*(straight?1.6:1);
    if(profile==='four-winds') {
      const horizontal=(column<C/2)===(row<R/2);
      return ((horizontal?dx:dz)?3.5:1)*(straight?1.25:1);
    }
    const centreX=profile==='twin-courts'?(column<C/2?C/4-.5:3*C/4-.5):(C-1)/2;
    const centreZ=(R-1)/2,awayX=column-centreX,awayZ=row-centreZ,length=Math.hypot(awayX,awayZ)||1;
    // The spiral follows one circulation direction around the heart; the twin
    // courts circulate around two separate centres before joining the core.
    const tangent=(-awayZ*dx+awayX*dz)/length;
    return 1+3.5*Math.max(0,tangent)+(straight?.3:0);
  });
  let pick=random()*weights.reduce((total,weight)=>total+weight,0);
  for(let index=0;index<available.length;index++){pick-=weights[index];if(pick<0)return available[index];}
  return available.at(-1);
}
function carve(random,profile='tangle') {
  // Carve the surrounding labyrinth first. Four deliberate doors connect the
  // chamber from different directions instead of inheriting one tree branch.
  const start=idAt(0,0),open=new Set(),seen=new Set([start]),stack=[start];
  while(stack.length) {
    const at=stack.at(-1),available=neighbours(at).filter(id=>!heartSet.has(id)&&!seen.has(id));
    if(!available.length){stack.pop();continue;}
    const next=chooseCorridor(random,at,available,stack.at(-2),profile);open.add(edgeKey(at,next));seen.add(next);stack.push(next);
  }
  // The heart is a real open chamber, rather than four corridor corners.
  for(const a of heartIds)for(const b of heartIds)if(neighbours(a).includes(b))open.add(edgeKey(a,b));
  const [northWest,northEast,southWest,southEast]=heartIds;
  for(const choices of [[[northWest,northWest-C],[northEast,northEast-C]],[[northEast,northEast+1],[southEast,southEast+1]],
    [[southWest,southWest+C],[southEast,southEast+C]],[[northWest,northWest-1],[southWest,southWest-1]]])open.add(edgeKey(...choices[Math.floor(random()*choices.length)]));
  let depth=distances(open,heartIds);const used=new Set();
  const boundaries=[['west',Array.from({length:R-2},(_,r)=>idAt(0,r+1))],['east',Array.from({length:R-2},(_,r)=>idAt(C-1,r+1))],
    ['north',Array.from({length:C-2},(_,c)=>idAt(c+1,0))],['south',Array.from({length:C-2},(_,c)=>idAt(c+1,R-1))]];
  const entrances=boundaries.map(([side,ids])=>{
    const far=ids.filter(id=>!used.has(id)).sort((a,b)=>depth[b]-depth[a]).slice(0,3);
    const id=far[Math.floor(random()*far.length)];used.add(id);return {side,cell:id};
  });
  alternateApproaches(open,entrances,random);
  depth=distances(open,heartIds);
  const deadEnds=Array.from({length:C*R},(_,id)=>id).filter(id=>!heartIds.includes(id)&&neighbours(id).filter(next=>open.has(edgeKey(id,next))).length===1).length;
  const shortest=Math.min(...entrances.map(e=>depth[e.cell])),mean=entrances.reduce((total,e)=>total+depth[e.cell],0)/4;
  return {open,entrances,depth,deadEnds,shortest,mean,quality:shortest+mean*.5+deadEnds*.15};
}
function mergeWalls(parts) {
  const grouped=new Map();
  for(const p of parts){const key=`${p.axis}:${p.coordinate}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(p);}
  const result=[];
  for(const entries of grouped.values()) {
    entries.sort((a,b)=>a.start-b.start);let current=null;
    for(const entry of entries) {
      if(current&&entry.start===current.end)current.end=entry.end;
      else {current={...entry};result.push(current);}
    }
  }
  return result.map((w,i)=>({...w,id:`maze-wall:${i}`,x:w.axis==='x'?(w.start+w.end)/2:w.coordinate,
    z:w.axis==='z'?(w.start+w.end)/2:w.coordinate,length:w.end-w.start}));
}

// Accepting a numerical seed makes generated maps reproducible in tests and
// diagnostics. Normal play samples one fresh seed per new adventure.
export function generateMirrorMaze(random=Math.random,{profile='tangle'}={}) {
  const seed=typeof random==='number'?random>>>0:Math.floor(random()*4294967296)>>>0,next=mazeRandom(seed);
  let chosen;
  for(let attempt=0;attempt<6;attempt++) {
    const candidate=carve(next,profile);if(!chosen||candidate.quality>chosen.quality)chosen=candidate;
    if(candidate.shortest>=10&&candidate.mean>=16&&candidate.deadEnds>=10){chosen=candidate;break;}
  }
  const {open,entrances,depth}=chosen;
  const cells=Array.from({length:C*R},(_,id)=>({id,column:id%C,row:Math.floor(id/C),
    x:LEFT+(id%C+.5)*WIDTH,y:BASEMENT.y,z:BACK+(Math.floor(id/C)+.5)*DEPTH,
    links:neighbours(id).filter(next=>open.has(edgeKey(id,next))),distanceFromHeart:depth[id]}));
  const entranceCells=new Set(entrances.map(e=>e.cell));
  const gates=entrances.map(({side,cell})=>{
    const center=cells[cell],normal={x:side==='west'?-1:side==='east'?1:0,z:side==='north'?-1:side==='south'?1:0};
    const x=center.x+normal.x*WIDTH/2,z=center.z+normal.z*DEPTH/2;
    return {id:`maze-entrance:${side}`,side,cell,x,y:BASEMENT.y,z,width:normal.x?DEPTH:WIDTH,normal,
      inside:{x:center.x,y:BASEMENT.y,z:center.z},outside:{x:x+normal.x*.8,y:BASEMENT.y,z:z+normal.z*.8}};
  });
  const hasGate=(side,id)=>gates.some(gate=>gate.side===side&&gate.cell===id),parts=[];
  for(let c=0;c<=C;c++)for(let r=0;r<R;r++) {
    const west=c===0,east=c===C,id=idAt(west?0:east?C-1:c,r);
    if(west?hasGate('west',id):east?hasGate('east',id):open.has(edgeKey(idAt(c-1,r),idAt(c,r))))continue;
    parts.push({axis:'z',coordinate:LEFT+c*WIDTH,start:BACK+r*DEPTH,end:BACK+(r+1)*DEPTH});
  }
  for(let r=0;r<=R;r++)for(let c=0;c<C;c++) {
    const north=r===0,south=r===R,id=idAt(c,north?0:south?R-1:r);
    if(north?hasGate('north',id):south?hasGate('south',id):open.has(edgeKey(idAt(c,r-1),idAt(c,r))))continue;
    parts.push({axis:'x',coordinate:BACK+r*DEPTH,start:LEFT+c*WIDTH,end:LEFT+(c+1)*WIDTH});
  }
  const fountainIds=[],fountainPoints=[];
  for(const target of [idAt(3,2),idAt(C-4,2),idAt(3,R-3),idAt(C-4,R-3)]) {
    const options=cells.filter(cell=>!heartSet.has(cell.id)&&!entranceCells.has(cell.id)&&!fountainIds.includes(cell.id))
      .map(cell=>({cell,sides:[[-1,0],[1,0],[0,-1],[0,1]].filter(([dx,dz])=>{
        const c=cell.column+dx,r=cell.row+dz;
        return c<0||c>=C||r<0||r>=R||!cell.links.includes(idAt(c,r));
      })})).filter(entry=>entry.sides.length)
      .sort((a,b)=>Math.abs(a.cell.column-cells[target].column)+Math.abs(a.cell.row-cells[target].row)-
        Math.abs(b.cell.column-cells[target].column)-Math.abs(b.cell.row-cells[target].row));
    const {cell,sides}=options[0],[dx,dz]=sides[Math.floor(next()*sides.length)];
    fountainIds.push(cell.id);
    // Recess bowls toward a closed wall, preserving a human-sized route in
    // the expanded cell instead of splitting its corridor into two strips.
    const recess=(dx?WIDTH:DEPTH)/2-.55;
    fountainPoints.push({...cell,x:cell.x+dx*recess,z:cell.z+dz*recess,wallNormal:{x:dx,z:dz}});
  }
  const fountains=new Set(fountainIds);
  const centreX=LEFT+C*WIDTH/2,centreZ=BACK+R*DEPTH/2;
  return {type:'mirror-maze',seed,id:`mirror-maze:${seed.toString(16).padStart(8,'0')}`,bounds:{...MIRROR_MAZE_BOUNDS},perimeter:{...MAZE_PERIMETER},
    floor:BASEMENT.y,cells,entrances:gates,walls:mergeWalls(parts),heart:{x:centreX,y:BASEMENT.y,z:centreZ,radius:2.05,minX:centreX-WIDTH,maxX:centreX+WIDTH,minZ:centreZ-DEPTH,maxZ:centreZ+DEPTH,cellIds:[...heartIds]},
    fountainPoints,spawnPoints:cells.filter(cell=>!heartIds.includes(cell.id)&&!entranceCells.has(cell.id)&&!fountains.has(cell.id)).map(cell=>({...cell})),
    stats:{cells:cells.length,deadEnds:chosen.deadEnds,loops:open.size-cells.length+1,shortestEntranceSteps:chosen.shortest,meanEntranceSteps:chosen.mean}};
}
