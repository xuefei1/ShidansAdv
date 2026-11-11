import test from 'node:test';
import assert from 'node:assert/strict';
import {BasementSceneDirector} from '../src/basement-scenes.js';
import {MAZE_LAYOUTS,getMazeLayout} from '../src/maze-layout-catalog.js';
import {createHouse} from '../src/house.js';
import {createMirrorMaze} from '../src/mirror-maze.js';
import * as THREE from '../vendor/three.module.js';

test('current basement content chooses from all five fixed maze designs',()=>{
  const chosen=new Set();
  for(let index=0;index<5;index++) {
    const director=new BasementSceneDirector({random:()=> (index+.5)/5}),scene=director.next();
    assert.equal(scene.type,'maze');chosen.add(scene.layout.layoutId);
    assert.deepEqual(scene.layout.walls,getMazeLayout(scene.layout.layoutId).walls);
  }
  assert.deepEqual(chosen,new Set(MAZE_LAYOUTS.map(layout=>layout.id)));
});

test('a new round changes designs, while merely reading the current scene keeps it intact',()=>{
  const director=new BasementSceneDirector({random:()=>0}),first=director.next();
  first.layout.cells[0].links.length=0;
  assert.equal(director.current,first);
  const second=director.next();assert.notEqual(second.layout.layoutId,first.layout.layoutId);
  const third=director.next();assert.equal(third.layout.layoutId,first.layout.layoutId);
  assert.ok(third.layout.cells[0].links.length,'a previous round cannot damage the reusable design');
});

test('content selection happens before layout selection and other content can bypass the maze catalog',()=>{
  const calls=[],samples=[.9,.1,.6],contents=[
    {id:'maze',select:({random})=>{calls.push('maze layout');return {layoutId:random()};}},
    {id:'future-content',select:()=>{calls.push('future content');return {room:'future room'};}},
  ];
  const director=new BasementSceneDirector({contents,random:()=>{calls.push('content/random');return samples.shift();}});
  assert.equal(director.next().type,'future-content');assert.deepEqual(calls,['content/random','future content']);
  const maze=director.next();assert.equal(maze.type,'maze');assert.equal(maze.layoutId,.6);
  assert.deepEqual(calls,['content/random','future content','content/random','maze layout','content/random']);
});

test('the runtime level provider loads the selected fixed geometry and replaces old walls on a new round',()=>{
  const scene=new THREE.Scene(),house=createHouse(scene,{basementType:'maze'}),director=new BasementSceneDirector({random:()=>0});
  director.next();const maze=createMirrorMaze({parent:house.basement,world:house.world,layoutProvider:()=>director.current.layout});
  assert.equal(maze.layout.layoutId,MAZE_LAYOUTS[0].id);const oldWalls=[...maze.walls];
  director.next();maze.regenerate();assert.equal(maze.layout.layoutId,MAZE_LAYOUTS[1].id);
  assert.deepEqual(maze.layout.walls,getMazeLayout(MAZE_LAYOUTS[1].id).walls);
  assert.ok(oldWalls.every(wall=>!house.world.solids.includes(wall)));
});
