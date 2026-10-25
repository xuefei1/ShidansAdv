import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/physics.js';
import {PoopPhysics} from '../src/poop-physics.js';

const full=(world,dynamic,args)=>{
  const [minX,minZ,maxX=minX,maxZ=minZ]=args;
  const x0=Math.floor(minX/4),x1=Math.floor(maxX/4),z0=Math.floor(minZ/4),z1=Math.floor(maxZ/4);
  return world.solids.filter(b=>(!dynamic || world.dynamicBoxes.has(b)) && Math.floor(b.minX/4)<=x1 && Math.floor(b.maxX/4)>=x0 && Math.floor(b.minZ/4)<=z1 && Math.floor(b.maxZ/4)>=z0);
};

test('moving colliders retain identity and insertion order while both spatial indexes follow every cell crossing',()=>{
  const w=new World(),first=w.addDynamicBox(-8,.4,-8,1,.8,1);
  const staticBox=w.addBox(0,.5,0,20,1,20),second=w.addDynamicBox(4,.4,4,.8,.8,.8);
  const order=w.order.get(first),solids=w.solids.slice();
  const queries=[[-12,-12,12,12],[-8,-8],[-4.1,-4.1,4.1,4.1],[4,4],[8,8],[-1,-1,1,1]];
  for(const delta of [[.2,.1,.2],[3.8,0,3.8],[4,2,4],[4,0,4],[-8,-2,-8]]) {
    for(const q of queries) {w.query(...q);w.queryDynamic(...q);} // Populate multi-cell caches before each move.
    const before=w.dynamicRevision;assert.equal(w.moveDynamicBox(first,...delta),first);
    assert.equal(w.dynamicRevision,before+1);assert.equal(w.order.get(first),order);assert.deepEqual(w.solids,solids);
    for(const q of queries) {
      assert.deepEqual(w.query(...q),full(w,false,q));assert.deepEqual(w.queryDynamic(...q),full(w,true,q));
      assert.equal(new Set(w.queryDynamic(...q)).size,w.queryDynamic(...q).length);
    }
  }
  assert.ok(w.query(4,4).includes(second));assert.ok(w.query(4,4).includes(staticBox));
  w.removeBox(first);assert.ok(!w.queryDynamic(-20,-20,20,20).includes(first));
  w.removeBox(second);assert.equal(w.dynamicCells.size,0);
});

test('vertical and in-cell movement refresh bounds for cached queries without rebuilding collider objects',()=>{
  const w=new World(),b=w.addDynamicBox(2,.5,2,.5,1,.5);
  const cached=w.queryDynamic(1,1,3,3),all=w.query(1,1,3,3);
  w.moveDynamicBox(b,.1,2,.1);
  assert.equal(w.queryDynamic(1,1,3,3),cached);assert.equal(w.query(1,1,3,3),all);
  assert.equal(cached[0].minY,2);assert.equal(cached[0].maxY,3);
  const revision=w.dynamicRevision;
  w.moveDynamicBox(b,0,0,0);w.moveDynamicBox(b,NaN,0,0);w.moveDynamicBox({},1,1,1);
  assert.equal(w.dynamicRevision,revision);
});

test('support can ignore pushable props while preserving static furniture and the default physical surface',()=>{
  const w=new World();w.addBox(0,.5,0,2,1,2);
  const prop=w.addDynamicBox(0,1.2,0,.6,.4,.6);prop.pushable=true;
  assert.equal(w.support(0,0,2).y,1.4);assert.equal(w.support(0,0,2,true).y,1);
  w.moveDynamicBox(prop,4,0,0);assert.equal(w.support(0,0,2).y,1);assert.equal(w.support(4,0,2,true).y,0);
});

test('moving a prop wakes sleeping balls near its old and new positions while distant sleepers remain asleep',()=>{
  const w=new World(),prop=w.addDynamicBox(0,.25,0,1,.5,1),physics=new PoopPhysics(w);
  const supported=physics.spawn({x:0,y:.565,z:0}),destination=physics.spawn({x:2.2,y:.065,z:0}),far=physics.spawn({x:12,y:.065,z:12});
  for(let i=0;i<240;i++)physics.update(1/120);
  assert.equal(supported.sleeping,true);assert.equal(destination.sleeping,true);assert.equal(far.sleeping,true);
  w.moveDynamicBox(prop,2.2,0,0);physics.update(1/120);
  assert.equal(supported.sleeping,false);assert.equal(destination.sleeping,false);assert.equal(far.sleeping,true);
  assert.ok(destination.x<prop.minX || destination.x>prop.maxX || destination.y>prop.maxY);
  for(let i=0;i<240;i++)physics.update(1/120);
  assert.ok(supported.y<.07);assert.equal(far.sleeping,true);
});

test('separate ball simulations independently observe movement without consuming a shared change queue',()=>{
  const w=new World(),prop=w.addDynamicBox(0,.25,0,1,.5,1),a=new PoopPhysics(w),b=new PoopPhysics(w);
  const ballA=a.spawn({x:0,y:.565,z:0}),ballB=b.spawn({x:0,y:.565,z:0});
  for(let i=0;i<240;i++){a.update(1/120);b.update(1/120);}
  assert.ok(ballA.sleeping&&ballB.sleeping);w.moveDynamicBox(prop,3,0,0);
  a.update(1/120);b.update(1/120);assert.ok(!ballA.sleeping&&!ballB.sleeping);
});
