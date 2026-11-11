import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMirrorMaze,MIRROR_MAZE_BOUNDS} from '../src/mirror-maze-layout.js';

function reachable(layout,start=layout.heart.cellIds[0]) {
  const found=new Set([start]),queue=[start];
  for(let i=0;i<queue.length;i++)for(const next of layout.cells[queue[i]].links)if(!found.has(next)){found.add(next);queue.push(next);}
  return found;
}
function heartReachableWithout(layout,blocked) {
  const found=new Set(layout.heart.cellIds),queue=[...found];
  for(let i=0;i<queue.length;i++)for(const next of layout.cells[queue[i]].links)if(next!==blocked&&!found.has(next)){found.add(next);queue.push(next);}
  return found;
}

test('one hundred seeded labyrinths have four exits, one connected heart, real dead ends and nontrivial routes',()=>{
  for(let seed=0;seed<100;seed++) {
    const maze=generateMirrorMaze(seed),b=MIRROR_MAZE_BOUNDS;
    assert.equal(maze.cells.length,192);assert.equal(reachable(maze).size,192,`disconnected seed ${seed}`);
    assert.equal(maze.entrances.length,4);assert.equal(new Set(maze.entrances.map(e=>e.side)).size,4);
    assert.equal(new Set(maze.entrances.map(e=>e.cell)).size,4);
    assert.ok(maze.stats.deadEnds>=10,`too few dead ends in seed ${seed}`);
    assert.ok(maze.stats.shortestEntranceSteps>=10,`short entrance in seed ${seed}`);
    assert.ok(maze.stats.meanEntranceSteps>=16,`simple maze in seed ${seed}`);
    assert.ok(maze.stats.loops>=4&&maze.stats.loops<=20);
    for(const cell of maze.cells)for(const linked of cell.links) {
      const other=maze.cells[linked];assert.ok(other.links.includes(cell.id));
      const spacing=cell.row===other.row?b.cellWidth:b.cellDepth;
      assert.ok(Math.abs(Math.hypot(cell.x-other.x,cell.z-other.z)-spacing)<1e-8);
    }
    for(const cell of maze.heart.cellIds)for(const other of maze.heart.cellIds) {
      if(Math.abs(maze.cells[cell].column-maze.cells[other].column)+Math.abs(maze.cells[cell].row-maze.cells[other].row)===1)assert.ok(maze.cells[cell].links.includes(other));
    }
    for(const gate of maze.entrances) {
      assert.equal(gate.width,gate.normal.x?b.cellDepth:b.cellWidth);assert.ok(reachable(maze,gate.cell).has(maze.heart.cellIds[0]));
      const through=maze.walls.some(wall=>wall.axis==='x'?Math.abs(gate.z-wall.coordinate)<.01&&gate.x>wall.start&&gate.x<wall.end:
        Math.abs(gate.x-wall.coordinate)<.01&&gate.z>wall.start&&gate.z<wall.end);
      assert.equal(through,false,`sealed ${gate.side} exit in seed ${seed}`);
    }
  }
});

test('four chamber doors and alternate approaches keep any one corridor junction from cutting off an entrance',()=>{
  for(let seed=0;seed<100;seed++) {
    const maze=generateMirrorMaze(seed),heart=new Set(maze.heart.cellIds),doors=[];
    for(const id of heart)for(const next of maze.cells[id].links)if(!heart.has(next))doors.push([maze.cells[id],maze.cells[next]]);
    assert.equal(doors.length,4,`heart door count in seed ${seed}`);
    assert.equal(new Set(doors.map(([inside,outside])=>inside.x===outside.x?(outside.z<inside.z?'north':'south'):(outside.x<inside.x?'west':'east'))).size,4);
    // Removing each non-terminal vertex is stronger than checking merely for
    // loops: it proves the alternative routes cannot share a hidden choke.
    for(const blocked of maze.cells)if(!heart.has(blocked.id)) {
      const remaining=heartReachableWithout(maze,blocked.id);
      for(const gate of maze.entrances)if(gate.cell!==blocked.id)assert.ok(remaining.has(gate.cell),`seed ${seed}: junction ${blocked.id} isolates ${gate.side}`);
    }
    assert.ok(maze.walls.reduce((length,wall)=>length+wall.length,0)>500,'narrower passages provide substantially more mirror wall length');
  }
});

test('numeric seeds reproduce layouts while fresh random seeds change the maze',()=>{
  assert.deepEqual(generateMirrorMaze(123456),generateMirrorMaze(123456));
  const signatures=new Set(Array.from({length:30},(_,seed)=>JSON.stringify(generateMirrorMaze(seed).walls)));
  assert.equal(signatures.size,30);
  assert.equal(generateMirrorMaze(()=>.5).seed,2147483648);
});

test('supplies use clear cell centres and fountains recess against closed walls outside the heart and exits',()=>{
  for(let seed=0;seed<20;seed++) {
    const maze=generateMirrorMaze(seed),fountains=new Set(maze.fountainPoints.map(p=>p.id)),entrances=new Set(maze.entrances.map(p=>p.cell));
    assert.equal(fountains.size,4);assert.ok(maze.spawnPoints.length>=170);
    for(const point of [...maze.spawnPoints,...maze.fountainPoints]) {
      assert.equal(point.y,-4.2);assert.equal(maze.heart.cellIds.includes(point.id),false);assert.equal(entrances.has(point.id),false);
      assert.ok(maze.cells[point.id].links.length>0);
    }
    for(const point of maze.spawnPoints)assert.equal(fountains.has(point.id),false);
    for(const point of maze.fountainPoints) {
      const centre=maze.cells[point.id],normal=point.wallNormal;
      const dimension=normal.x?maze.bounds.cellWidth:maze.bounds.cellDepth;
      assert.ok(Math.abs(Math.hypot(point.x-centre.x,point.z-centre.z)-(dimension/2-.55))<1e-9);
      const neighbour=maze.cells.find(cell=>cell.column===centre.column+normal.x&&cell.row===centre.row+normal.z);
      assert.ok(!neighbour||!centre.links.includes(neighbour.id),'fountain is backed by a closed wall');
      assert.ok(dimension-1.07>1.5,'the opposite lane preserves human and nav-grid clearance');
    }
    assert.ok(Math.abs(maze.heart.x-1.5)<1e-8);assert.ok(Math.abs(maze.heart.z)<1e-8);
    assert.ok(Math.abs(maze.heart.maxX-maze.heart.minX-2*maze.bounds.cellWidth)<1e-8);
    assert.ok(Math.abs(maze.heart.maxZ-maze.heart.minZ-2*maze.bounds.cellDepth)<1e-8);
    assert.equal(maze.heart.radius,2.05);assert.deepEqual(maze.heart.cellIds,[87,88,103,104]);
    // The cheek's true outside face is -20.94, not its -21.02 centre.
    // Its 1.54m walking strip also admits a 0.5m navigation-grid node.
    assert.ok(maze.bounds.minX-.1-(-20.94)>1.5);
  }
});
