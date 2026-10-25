import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/physics.js';
import { PoopPhysics } from '../src/poop-physics.js';

function seeded(seed) { return ()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296); }
function fullScan(world,minX,minZ,maxX=minX,maxZ=minZ) {
  const x0=Math.floor(minX/4),x1=Math.floor(maxX/4),z0=Math.floor(minZ/4),z1=Math.floor(maxZ/4);
  return world.solids.filter(b=>world.dynamicBoxes.has(b) && Math.floor(b.minX/4)<=x1 && Math.floor(b.maxX/4)>=x0 && Math.floor(b.minZ/4)<=z1 && Math.floor(b.maxZ/4)>=z0);
}

test('dynamic cell queries match a full scan with stable order and no duplicates across both floors and cell boundaries',()=>{
  const world=new World(),random=seeded(43);
  world.addBox(0,.5,0,30,1,30); // Static scenery never enters the dynamic index.
  for(let i=0;i<64;i++) world.addDynamicBox(-25+random()*50,.3+(i%2)*4.2,-37+random()*68,.2+random()*1.2,.3,.2+random()*1.2);
  world.addDynamicBox(0,.5,0,12,1,12); // One object spanning many cells.
  const queries=[[0,0],[-4,-4],[4,4],[-4.1,-4.1,4.1,4.1],[-26,-38,26,32]];
  for(let i=0;i<250;i++) {
    const x=-26+random()*52,z=-38+random()*70;
    queries.push([x,z,x+random()*8,z+random()*8]);
  }
  for(const args of queries) {
    const found=world.queryDynamic(...args);
    assert.deepEqual(found,fullScan(world,...args));assert.equal(new Set(found).size,found.length);
  }
});

test('removing and respawning collectibles invalidates cached dynamic queries and cleans empty cells',()=>{
  const world=new World(),old=world.addDynamicBox(4,.4,4,1,.8,1),other=world.addDynamicBox(-12,.4,-12,1,.8,1);
  const bounds=[3,3,5,5];assert.deepEqual(world.queryDynamic(...bounds),[old]);
  assert.ok(world.dynamicQueryCache.size>0);const revision=world.dynamicRevision;
  world.removeBox(old);assert.equal(world.dynamicRevision,revision+1);
  assert.deepEqual(world.queryDynamic(...bounds),[]);assert.deepEqual(world.queryDynamic(4,4),[]);
  const replacement=world.addDynamicBox(4,.2,4,.7,.4,.7);
  assert.deepEqual(world.queryDynamic(...bounds),[replacement]);assert.deepEqual(world.queryDynamic(4,4),[replacement]);
  world.removeBox(replacement);world.removeBox(other);assert.equal(world.dynamicCells.size,0);assert.equal(world.dynamicBoxes.size,0);
  assert.deepEqual(world.queryDynamic(-30,-40,30,40),[]);
});

test('poop contacts query nearby dynamic cells without iterating the full collectible set for each substep',()=>{
  const world=new World();
  world.addDynamicBox(10,.5,24,1,1,1);
  for(let i=0;i<63;i++)world.addDynamicBox(-24+(i%8)*6,.2,-36+Math.floor(i/8)*6,.5,.4,.5);
  const physics=new PoopPhysics(world);let queries=0,maxCandidates=0;
  const query=world.queryDynamic.bind(world);
  world.queryDynamic=(...args)=>{const result=query(...args);queries++;maxCandidates=Math.max(maxCandidates,result.length);return result;};
  // The wake-on-change path legitimately scans this set, but unchanged-frame
  // contacts must use the spatial index exclusively.
  world.dynamicBoxes[Symbol.iterator]=()=>{throw Error('Full collectible scan during contact');};
  const ball=physics.spawn({x:10,y:1.5,z:24});
  for(let i=0;i<240;i++)physics.update(1/120);
  assert.ok(queries>0);assert.equal(maxCandidates,1);assert.ok(Math.abs(ball.y-1.065)<.001);assert.equal(ball.sleeping,true);
});
