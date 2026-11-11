import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createMirrorMaze} from '../src/mirror-maze.js';
import {createMazeHeart} from '../src/maze-heart.js';
import {createWaterFountains} from '../src/fountains.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressPursuit} from '../src/mistress-pursuit.js';
import {NoiseSystem} from '../src/noise.js';
import {BASEMENT,BASEMENT_STAIRS as STAIRS} from '../src/layout.js';
import {MAZE_LAYOUTS,getMazeLayout} from '../src/maze-layout-catalog.js';
import {generateMirrorMaze} from '../src/mirror-maze-layout.js';

function fixture(seed=2147483648,layoutProvider=null) {
  const layout=layoutProvider?layoutProvider():generateMirrorMaze(seed);
  const scene=new THREE.Scene(),house=createHouse(scene,{basementType:'maze',basementLayout:layout});
  const maze=createMirrorMaze({parent:house.basement,world:house.world,layoutProvider:()=>layout});
  const heart=createMazeHeart({parent:house.basement,world:house.world,layout:maze.layout});
  const water=createWaterFountains(scene,house.world,{mazeLayout:()=>maze.layout});
  const nav=new MistressNavigation(house.world),vision=new MistressVision(new MistressSight([]),house.world);
  return {...house,scene,maze,heart,water,nav,vision};
}
const bottom={x:(STAIRS.minX+STAIRS.maxX)/2,y:BASEMENT.y,z:STAIRS.startZ-1.1};

test('real house, maze, sanctuary and water leave all four entries and the heart reachable for the mistress',()=>{
  const {world,nav,maze}=fixture();
  for(const id of ['basement-furnace','basement-water-heater','basement-pillar:-12:-6'])assert.equal(world.fixtures.has(id),false);
  assert.equal(nav.canStand(bottom),true);assert.equal(nav.canStand(maze.layout.heart),true);
  const main={x:-15.8,y:0,z:6.9};
  for(const gate of maze.layout.entrances)for(const destination of [gate.outside,gate.inside,maze.layout.heart]) {
    const route=nav.findPath(bottom,destination);assert.ok(route.length>1,`no path to ${gate.side} ${JSON.stringify(destination)}`);
    for(let i=1;i<route.length;i++)assert.equal(nav.segmentClear(route[i-1],route[i]),true);
  }
  const fromHouse=nav.findPath(main,maze.layout.heart);assert.ok(fromHouse.length>2);
  assert.ok(fromHouse.some(point=>Math.abs(point.x-bottom.x)<.01&&Math.abs(point.y)<.01&&Math.abs(point.z-STAIRS.endZ)<.01),'route uses the upper stair landing');
  assert.ok(fromHouse.some(point=>Math.abs(point.x-bottom.x)<.01&&Math.abs(point.y-BASEMENT.y)<.01&&Math.abs(point.z-STAIRS.startZ)<.01),'route uses the lower stair landing');
  assert.equal(nav.isRabbitSafe(maze.layout.heart,main),false,'central carpet and plush do not create a protected den');
});

test('recessed fountains keep narrow passages and all generated supply cells human-reachable',()=>{
  for(const seed of [0,17,619,2147483648]) {
    const {nav,maze}=fixture(seed),component=nav.componentAt(bottom);
    assert.ok(component>=0);
    for(const point of maze.layout.spawnPoints) {
      assert.equal(nav.canStand(point),true,`seed ${seed}, cell ${point.id} has standing space`);
      assert.equal(nav.componentAt(point),component,`seed ${seed}, cell ${point.id} remains connected past the fountains`);
      assert.equal(nav.isRabbitSafe(point,bottom),false,`seed ${seed}, supply cell ${point.id} is catchable`);
    }
    for(const fountain of maze.layout.fountainPoints) {
      const drinking=maze.layout.cells[fountain.id],approach=nav.pursuitTarget(drinking,bottom);
      assert.ok(approach,`seed ${seed}: fountain ${fountain.id} does not become a protected drinking spot`);
      assert.ok(nav.findPath(bottom,approach).length>1);
    }
  }
});

test('all five selected designs retain furnished NPC routes to every entry, supply cell and fountain',()=>{
  for(const design of MAZE_LAYOUTS) {
    const {nav,maze}=fixture(design.seed,()=>getMazeLayout(design.id)),component=nav.componentAt(bottom);
    assert.equal(maze.layout.layoutId,design.id,'the scene uses the selected fixed layout rather than a new procedural map');
    assert.ok(component>=0);
    for(const gate of maze.layout.entrances)for(const destination of [gate.outside,gate.inside,maze.layout.heart]) {
      const route=nav.findPath(bottom,destination);assert.ok(route.length>1,`${design.name}: no route from stairs to ${gate.side}`);
      for(let i=1;i<route.length;i++)assert.equal(nav.segmentClear(route[i-1],route[i]),true);
    }
    for(const point of maze.layout.spawnPoints) {
      assert.equal(nav.canStand(point),true,`${design.name}: supply cell ${point.id} has standing room`);
      assert.equal(nav.componentAt(point),component,`${design.name}: supply cell ${point.id} remains connected`);
      assert.equal(nav.isRabbitSafe(point,bottom),false,`${design.name}: food does not become a safe hiding spot`);
    }
    for(const fountain of maze.layout.fountainPoints) {
      const approach=nav.pursuitTarget(maze.layout.cells[fountain.id],bottom);
      assert.ok(approach,`${design.name}: fountain ${fountain.id} has a reachable drinking stance`);
      assert.ok(nav.findPath(bottom,approach).length>1);
    }
    maze.dispose();
  }
});

test('opaque mirror collision blocks sight and contact while real open corridors preserve vision',()=>{
  const {maze,vision}=fixture(),cells=maze.layout.cells;
  const observer=(a,b)=>({position:a,eye:{x:a.x,y:BASEMENT.y+2.3,z:a.z},yaw:Math.atan2(b.x-a.x,b.z-a.z)});
  let closed;
  for(const cell of cells) {
    const next=cells.find(other=>Math.abs(other.column-cell.column)+Math.abs(other.row-cell.row)===1&&!cell.links.includes(other.id));
    if(next){closed=[cell,next];break;}
  }
  const [a,b]=closed,target={...b,y:BASEMENT.y+.5};
  assert.equal(vision.canSeePoint(observer(a,b),target),false);
  assert.equal(vision.canReachPoint(observer(a,b).eye,target),false);
  const open=cells.find(cell=>cell.links.length&&cell.id!==14&&cell.id!==15),next=cells[open.links[0]];
  assert.equal(vision.canSeePoint(observer(open,next),{...next,y:BASEMENT.y+.5}),true);
});

test('rewarding noise in the labyrinth starts an ordinary chase along collision-checked maze corridors',()=>{
  const {world,nav,maze}=fixture(),player={...maze.layout.heart,grounded:true},start=maze.layout.entrances[0].inside;
  const routine=new MistressAI(world,{navigation:nav,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  assert.equal(routine.resumeFrom(start),true);
  const noise=new NoiseSystem();noise.update(.1,player,{consuming:{id:'maze-book',type:'book'}});
  const context={player,seen:false,noiseEvents:noise.events,noiseElapsed:noise.elapsed,contactClear:()=>false};
  npc.update(0,context);assert.equal(npc.phase,'chase');assert.equal(npc.investigating,true);
  const first={...npc.position};
  for(let i=0;i<160;i++) {
    const before={...npc.position};npc.update(.05,context);
    assert.equal(nav.canStand(npc.position),true);
    if(Math.hypot(before.x-npc.position.x,before.z-npc.position.z)>.00001)assert.equal(nav.segmentClear(before,npc.position),true);
  }
  assert.ok(Math.hypot(first.x-npc.position.x,first.z-npc.position.z)>2,'hearing causes real travel');
});
