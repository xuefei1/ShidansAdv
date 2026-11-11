import test from 'node:test';
import assert from 'node:assert/strict';
import {MAZE_LAYOUTS,getMazeLayout,chooseMazeLayout} from '../src/maze-layout-catalog.js';

const edgeSet=maze=>new Set(maze.cells.flatMap(cell=>cell.links.filter(next=>next>cell.id).map(next=>`${cell.id}:${next}`)));
function reachable(maze,blocked=-1) {
  const found=new Set(maze.heart.cellIds),queue=[...found];
  for(let i=0;i<queue.length;i++)for(const next of maze.cells[queue[i]].links)if(next!==blocked&&!found.has(next)){found.add(next);queue.push(next);}
  return found;
}

test('the five fixed designed maps have stable distinct walls and fresh nested scene data',()=>{
  assert.equal(MAZE_LAYOUTS.length,5);
  assert.equal(new Set(MAZE_LAYOUTS.map(design=>design.id)).size,5);
  assert.equal(new Set(MAZE_LAYOUTS.map(design=>design.name)).size,5);
  const layouts=MAZE_LAYOUTS.map(design=>getMazeLayout(design.id));
  for(const [index,maze] of layouts.entries()) {
    const design=MAZE_LAYOUTS[index],again=getMazeLayout(design.id);
    assert.equal(maze.layoutId,design.id);assert.equal(maze.layoutName,design.name);assert.equal(maze.profileId,design.profile);
    assert.deepEqual(maze,again);assert.notEqual(maze,again);assert.notEqual(maze.cells,again.cells);
    const signature=JSON.stringify(again.walls);
    maze.cells[0].links.length=0;maze.walls[0].start=999;maze.fountainPoints[0].x=999;maze.heart.cellIds.length=0;
    assert.equal(JSON.stringify(getMazeLayout(design.id).walls),signature);
    assert.deepEqual(getMazeLayout(design.id),again,'a previous game cannot change a cached layout');
  }
  const edges=MAZE_LAYOUTS.map(design=>edgeSet(getMazeLayout(design.id)));
  for(let a=0;a<edges.length;a++)for(let b=a+1;b<edges.length;b++) {
    const different=[...edges[a]].filter(edge=>!edges[b].has(edge)).length+[...edges[b]].filter(edge=>!edges[a].has(edge)).length;
    assert.ok(different>=100,`${MAZE_LAYOUTS[a].name} and ${MAZE_LAYOUTS[b].name} need substantially different passage choices`);
  }
});

test('all five authored maps preserve four center doors, alternate approaches, dead ends and recessed water',()=>{
  for(const design of MAZE_LAYOUTS) {
    const maze=getMazeLayout(design.id),heart=new Set(maze.heart.cellIds);
    assert.equal(maze.cells.length,192);assert.equal(maze.bounds.cellWidth,2.6);assert.equal(maze.bounds.cellDepth,3.05);assert.equal(reachable(maze).size,192);
    assert.equal(maze.entrances.length,4);assert.equal(new Set(maze.entrances.map(gate=>gate.side)).size,4);
    const doors=maze.heart.cellIds.flatMap(id=>maze.cells[id].links.filter(next=>!heart.has(next)).map(next=>[maze.cells[id],maze.cells[next]]));
    assert.equal(doors.length,4);
    assert.equal(new Set(doors.map(([a,b])=>a.x===b.x?(b.z<a.z?'north':'south'):(b.x<a.x?'west':'east'))).size,4);
    for(const cell of maze.cells)if(!heart.has(cell.id)) {
      const remaining=reachable(maze,cell.id);
      for(const gate of maze.entrances)if(gate.cell!==cell.id)assert.ok(remaining.has(gate.cell),`${design.name}: junction ${cell.id} is a hidden single approach`);
    }
    assert.ok(maze.stats.deadEnds>=10);assert.ok(maze.stats.shortestEntranceSteps>=10);assert.ok(maze.stats.meanEntranceSteps>=16);
    assert.equal(maze.fountainPoints.length,4);
    const reserved=new Set([...maze.heart.cellIds,...maze.entrances.map(gate=>gate.cell),...maze.fountainPoints.map(point=>point.id)]);
    for(const point of maze.spawnPoints)assert.equal(reserved.has(point.id),false);
    for(const point of maze.fountainPoints) {
      const dimension=point.wallNormal.x?maze.bounds.cellWidth:maze.bounds.cellDepth;
      assert.ok(Math.abs(Math.hypot(point.x-maze.cells[point.id].x,point.z-maze.cells[point.id].z)-(dimension/2-.55))<1e-9);
    }
  }
});

test('all five designs fill the enlarged footprint with narrow human-sized perimeter approaches',()=>{
  for(const design of MAZE_LAYOUTS) {
    const maze=getMazeLayout(design.id),bounds=maze.bounds;
    const width=bounds.maxX-bounds.minX,depth=bounds.maxZ-bounds.minZ;
    assert.ok(Math.abs(width-41.6)<1e-8);assert.ok(Math.abs(depth-36.6)<1e-8);
    assert.ok(width*depth>40*30*1.268,'nearly 27% more maze area');
    for(const gap of [23.88-(bounds.maxX+.1),(bounds.minZ-.1)-(-19.88),19.88-(bounds.maxZ+.1)])assert.ok(gap>1.4&&gap<1.5);
    assert.ok(bounds.minX-.1-(-20.94)>1.5,'west bypass clears the stair cheek');
    for(const gate of maze.entrances) {
      assert.ok(gate.outside.x-.5>-23.88&&gate.outside.x+.5<23.88);
      assert.ok(gate.outside.z-.5>-19.88&&gate.outside.z+.5<19.88);
      assert.ok(Math.abs(Math.hypot(gate.outside.x-gate.x,gate.outside.z-gate.z)-.8)<1e-8);
    }
  }
});

test('random selection reaches all five layouts and excludes only the immediately preceding design',()=>{
  assert.deepEqual(Array.from({length:5},(_,index)=>chooseMazeLayout(()=>(index+.5)/5).layoutId),MAZE_LAYOUTS.map(design=>design.id));
  for(const previous of MAZE_LAYOUTS) {
    const choices=Array.from({length:4},(_,index)=>chooseMazeLayout(()=>(index+.5)/4,{excludeId:previous.id}).layoutId);
    assert.equal(new Set(choices).size,4);assert.equal(choices.includes(previous.id),false);
    assert.deepEqual(choices,MAZE_LAYOUTS.filter(design=>design.id!==previous.id).map(design=>design.id));
  }
  for(const value of [NaN,Infinity,-1,1,4])assert.ok(MAZE_LAYOUTS.some(design=>design.id===chooseMazeLayout(()=>value).layoutId));
  assert.throws(()=>getMazeLayout('not-a-layout'),RangeError);
});
