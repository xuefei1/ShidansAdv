import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {createConsumables} from '../src/consumables.js';
import {World} from '../src/physics.js';
import {DEN,FLOOR_HEIGHT as H,STAIRS,GARDEN_STAIRS,RAMPS,BOUNDS} from '../src/layout.js';
import {MistressNavigation,MISTRESS_RADIUS,MISTRESS_HEIGHT,MISTRESS_STAIR_STEP,MISTRESS_GROUND_STEP} from '../src/mistress-navigation.js';
import {MISTRESS_ACTIVITIES} from '../src/mistress-ai.js';

const scene=new THREE.Scene(),{world,roof}=createHouse(scene);
createWaterFountains(scene,world);createConsumables(scene,world);
const queryCacheSize=world.queryCache.size,nav=new MistressNavigation(world);
const p=(x,y,z)=>({x,y,z});
const anchors=MISTRESS_ACTIVITIES.map(activity=>[activity.id,activity.approach]);

function interpolate(a,b,t) { return p(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t); }
function checkHumanClearance(position) {
  const radius=MISTRESS_RADIUS;
  assert.ok(Math.hypot(position.x-DEN.x,position.z-DEN.z)>=DEN.radius+radius-.0001 || position.y>DEN.fenceHeight||position.y<-.25,'den fence');
  // Independent full-scan cylinder test, rather than trusting the graph's
  // spatial lookup or its more conservative square shoulder envelope.
  for(const box of world.solids) {
    if(box.pushable || world.dynamicBoxes.has(box) || box.maxY<=position.y+MISTRESS_GROUND_STEP+.005 || box.minY>=position.y+MISTRESS_HEIGHT-.005) continue;
    if(box.id==='upper-floor' && position.y>=H-MISTRESS_STAIR_STEP && position.x>STAIRS.minX+radius && position.x<STAIRS.maxX-radius) continue;
    if(box.id==='balcony-floor' && position.y>=H-MISTRESS_STAIR_STEP && position.x>GARDEN_STAIRS.minX+radius && position.x<GARDEN_STAIRS.maxX-radius) continue;
    const nearestX=Math.max(box.minX,Math.min(box.maxX,position.x));
    const nearestZ=Math.max(box.minZ,Math.min(box.maxZ,position.z));
    assert.ok(Math.hypot(nearestX-position.x,nearestZ-position.z)>=radius-.0001,
      `${box.id ?? 'static furniture'} clips a human at ${JSON.stringify(position)}`);
  }
}

test('all household activities connect on the full furnished level with fountains and loose food',()=>{
  for(const [name,position] of anchors) assert.ok(nav.canStand(position),name);
  for(const [fromName,from] of anchors) for(const [toName,to] of anchors) {
    const route=nav.findPath(from,to);
    assert.ok(route.length>=1,`${fromName} -> ${toName}`);
    assert.deepEqual(route[0],from);assert.deepEqual(route.at(-1),to);
    for(let index=1;index<route.length;index++) {
      const a=route[index-1],b=route[index];assert.ok(nav.segmentClear(a,b),`${fromName} -> ${toName} segment ${index}`);
      const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.1));
      for(let step=0;step<=count;step++) checkHumanClearance(interpolate(a,b,step/count));
    }
  }
});

test('routes walk up and down the actual staircase with continuous support and full headroom',()=>{
  const lower=anchors[0][1],upper=MISTRESS_ACTIVITIES.find(activity=>activity.id==='sleeping').approach;
  for(const [from,to] of [[lower,upper],[upper,lower]]) {
    const route=nav.findPath(from,to);
    assert.ok(route.some(position=>position.y===0 && position.x===2.5 && position.z===15),'bottom stair landing');
    assert.ok(route.some(position=>position.y===H && position.x===2.5 && position.z===2),'upper stair landing');
    let slopedSegments=0;
    for(let index=1;index<route.length;index++) {
      const a=route[index-1],b=route[index];if(Math.abs(a.y-b.y)<.001) continue;
      slopedSegments++;
      for(let step=0;step<=100;step++) {
        const position=interpolate(a,b,step/100);
        const expected=(STAIRS.startZ-position.z)/(STAIRS.startZ-STAIRS.endZ)*H;
        assert.ok(Math.abs(position.y-expected)<1e-8,'no floating or floor teleport');
        assert.ok(position.x>=STAIRS.minX+MISTRESS_RADIUS && position.x<=STAIRS.maxX-MISTRESS_RADIUS);
        for(const box of roof.colliders) {
          const overlaps=position.x>box.minX-MISTRESS_RADIUS && position.x<box.maxX+MISTRESS_RADIUS &&
            position.z>box.minZ-MISTRESS_RADIUS && position.z<box.maxZ+MISTRESS_RADIUS &&
            position.y<box.maxY-.005 && position.y+MISTRESS_HEIGHT>box.minY+.005;
          assert.equal(overlaps,false,`stair headroom: ${box.id}`);
        }
      }
    }
    assert.ok(slopedSegments>0);
  }
  assert.equal(nav.segmentClear(p(0,0,0),p(0,H,-5)),false,'diagonal shortcut through a ceiling');
  assert.equal(nav.canStand(p(-10,H,12)),false,'front-wing roof is not an upstairs room');
  assert.equal(nav.canStand(p(0,H,10)),false,'no imaginary floor in the tall stair hall');
  assert.equal(nav.canStand(p(2.5,0,8.5)),false,'cannot walk inside the stair mass');
  assert.equal(nav.canStand(p(2.5,H/2,8.5)),true);
});

test('human clearance blocks furniture, fountains, low rabbit tunnels, walls and window sills',()=>{
  for(const [name,position] of [
    ['couch',p(-17,0,5.2)],['coffee table',p(-9,0,7.5)],['bed',p(-15,H,-14)],
    ['water fountain',p(-10.5,0,17.8)],['basement stairwell has no ground-floor slab',p(-22.5,0,-17)],
    ['lower linen shelf',p(21.1,H,-9.5)],['interior window',p(-5,0,11)],
    ['closed exterior glass',p(23.7,0,12)],['solid wall',p(-5,0,13)],
  ]) assert.equal(nav.canStand(position),false,name);
  assert.equal(nav.canStand(p(22.5,H,-17)),true,'the old upstairs tunnel wall has become open floor');
  const left=p(-6,0,11),right=p(-4,0,11);
  assert.ok(nav.canStand(left));assert.ok(nav.canStand(right));
  assert.equal(nav.segmentClear(left,right),false,'cannot walk through a rabbit jump window');
  assert.ok(nav.segmentClear(p(-6,0,6),p(-4,0,6)),'ordinary open doorway remains usable');
  assert.deepEqual(nav.findPath(left,p(-16,0,-33)),[],'the genuine low hedge tunnel has no snapped destination');
});

test('the analytical den ring blocks the whole human body and routes go around it',()=>{
  assert.equal(nav.canStand(p(DEN.x,0,DEN.z)),false);
  assert.equal(nav.canStand(p(DEN.x+DEN.radius+.2,0,DEN.z)),false,'shoulder touches fence');
  assert.equal(nav.canStand(p(DEN.x+DEN.radius+MISTRESS_RADIUS+.1,0,DEN.z)),true);
  const from=p(-21.2,0,12),to=p(-10.8,0,12);
  assert.ok(nav.canStand(from));assert.ok(nav.canStand(to));
  assert.equal(nav.segmentClear(from,to),false);
  const route=nav.findPath(from,to);assert.ok(route.length>2);
  for(let index=1;index<route.length;index++) {
    const a=route[index-1],b=route[index];
    for(let step=0;step<=100;step++) {
      const position=interpolate(a,b,step/100);
      assert.ok(Math.hypot(position.x-DEN.x,position.z-DEN.z)>=DEN.radius+MISTRESS_RADIUS);
    }
  }
});

test('swept segments cannot tunnel through a thin wall or cut an obstructed grid corner',()=>{
  const isolated=new World();
  isolated.addBox(-9,1,-4,.01,2,3);
  isolated.addBox(-8,1,-8,.1,2,.1);
  const navigation=new MistressNavigation(isolated);
  assert.equal(navigation.segmentClear(p(-10,0,-4),p(-8,0,-4)),false,'one-centimetre wall');
  const from=p(-8.7,0,-8),to=p(-8,0,-8.7);
  assert.ok(navigation.canStand(from));assert.ok(navigation.canStand(to));
  assert.equal(navigation.segmentClear(from,to),false,'diagonal clips human radius around the corner');
  const route=navigation.findPath(from,to);assert.ok(route.length>2);
  for(let index=1;index<route.length;index++) assert.ok(navigation.segmentClear(route[index-1],route[index]));
});

test('static navigation ignores moving consumables and keeps its fixed graph without changing the world',()=>{
  assert.equal(world.queryCache.size,queryCacheSize,'building does not flood the physics query cache');
  const staticBoxes=world.solids.filter(box=>!world.dynamicBoxes.has(box));
  const snapshot=staticBoxes.map(box=>({...box}));
  const storage=[nav.nodes.length,nav.cells.size,nav.grid.size,nav.obstacles.length];
  const from=anchors[0][1],to=anchors[3][1],expected=nav.findPath(from,to);
  const loose=world.addDynamicBox(from.x,.35,from.z,2,.7,2);loose.pushable=true;
  assert.ok(nav.canStand(from),'food never blocks the mistress route');
  for(let index=0;index<50;index++) {
    world.moveDynamicBox(loose,.01,0,-.01);
    assert.deepEqual(nav.findPath(from,to),expected);
  }
  world.removeBox(loose);
  assert.deepEqual([nav.nodes.length,nav.cells.size,nav.grid.size,nav.obstacles.length],storage);
  assert.deepEqual(staticBoxes,snapshot,'pathfinding never moves static colliders');
  assert.equal(nav.obstacles.length,staticBoxes.length);
  assert.deepEqual(nav.findPath(p(NaN,0,0),to),[]);
  assert.equal(nav.canStand(null),false);
});

test('pursuit routes connect the front yard, both side paths, backyard and balcony',()=>{
  const outdoors=[p(0,0,25),p(-25,0,0),p(25,0,0),p(3,0,-30),p(0,H,-22)];
  const from=anchors[0][1];
  for(const destination of outdoors) {
    assert.equal(nav.canStand(destination),true,JSON.stringify(destination));
    for(const [a,b] of [[from,destination],[destination,from]]) {
      const route=nav.findPath(a,b);assert.ok(route.length>1);
      for(let index=1;index<route.length;index++) {
        const first=route[index-1],second=route[index];
        assert.ok(nav.segmentClear(first,second));
        const count=Math.ceil(distanceForTest(first,second)/.1);
        for(let step=0;step<=count;step++)checkHumanClearance(interpolate(first,second,step/count));
      }
    }
  }
  assert.equal(nav.canStand(p(BOUNDS.maxX,0,25)),false,'lot fence respects adult radius');
  assert.equal(nav.canStand(p(0,0,BOUNDS.minZ)),false);
  assert.equal(nav.canStand(p(-23,H,-24)),false,'balcony has no floor west of its slab');
});

const distanceForTest=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
test('the outdoor stairs connect garden and balcony with their actual support and landing gap',()=>{
  const bottom=p(20.5,0,-35.5),top=p(20.5,H,-24.5);
  for(const [from,to] of [[bottom,top],[top,bottom]]) {
    const route=nav.findPath(from,to);assert.ok(route.length>=4);
    assert.ok(route.some(position=>position.y===0&&position.z===GARDEN_STAIRS.startZ));
    assert.ok(route.some(position=>position.y===H&&position.z===GARDEN_STAIRS.endZ));
    for(let index=1;index<route.length;index++)for(let step=0;step<=100;step++) {
      const position=interpolate(route[index-1],route[index],step/100);checkHumanClearance(position);
      assert.equal(nav.hasFloor(position),true);
      if(position.y>.001&&position.y<H-.001) {
        const expected=(GARDEN_STAIRS.startZ-position.z)/(GARDEN_STAIRS.startZ-GARDEN_STAIRS.endZ)*H;
        assert.ok(Math.abs(position.y-expected)<1e-8);
      }
    }
  }
  assert.equal(nav.segmentClear(p(18,0,-30),p(20.5,H,-24.5)),false,'no diagonal ascent through side rails');
});

test('den, genuinely narrow gaps and hedge shelter cannot alert a pursuer',()=>{
  const from=anchors[0][1];
  for(const position of [p(DEN.x,0,DEN.z),p(DEN.x+3,2,DEN.z),p(-16,0,-33),p(20.5,0,-29)]) {
    assert.equal(nav.isRabbitSafe(position,from),true,JSON.stringify(position));
    assert.equal(nav.pursuitTarget(position,from),null);
  }
  const narrow=new World();narrow.addBox(-11.6,1.6,-5,.5,3.2,6);narrow.addBox(-10.4,1.6,-5,.5,3.2,6);
  const adult=new MistressNavigation(narrow);
  assert.equal(adult.isRabbitSafe(p(-11,0,-5)),true,'a rabbit-wide gap is protected even without a roof');
  assert.equal(adult.isRabbitSafe(p(-11,0,-1)),false,'leaving the gap restores detection');
});

test('wall edges, ordinary corners, jumping and climbable furniture do not grant blanket immunity',()=>{
  const from=anchors[0][1];
  for(const position of [p(-4.8,0,13),p(23.7,0,19.7),p(23.7,0,17),p(25.7,0,31.7),p(0,1.2,25),p(14,0,15),p(14,1.52,15),p(-15,H+.96,-14),p(12,.32,-9)]) {
    assert.equal(nav.isRabbitSafe(position,from),false,JSON.stringify(position));
    const destination=nav.pursuitTarget(position,from);assert.ok(destination);assert.equal(nav.canStand(destination),true);
    assert.ok(nav.findPath(from,destination).length>1);
  }
  const destination=nav.pursuitTarget(p(-4.65,0,11),p(-6,0,11));
  assert.ok(destination.x>-5,'project to the rabbit side of a window, never through its wall');
  assert.equal(nav.segmentClear(p(-6,0,11),destination),false,'pursuer must route around to a door');
});

test('cached reachability distinguishes an inaccessible region from a pursuer already in that region',()=>{
  const split=new World();split.addBox(0,2,-3,.2,4,70);
  const adult=new MistressNavigation(split),left=p(-10,0,0),right=p(10,0,0);
  assert.notEqual(adult.componentAt(left),adult.componentAt(right));
  assert.equal(adult.isRabbitSafe(right,left),true);assert.equal(adult.isRabbitSafe(right,right),false);
  assert.deepEqual(adult.findPath(left,right),[]);
  const cache=adult._pursuitCache;adult.isRabbitSafe(right,right);assert.equal(adult._pursuitCache,cache);
});

test('nearby search choices and nearest reachable positions use the fixed graph without new caches',()=>{
  const from=anchors[0][1],storage=[nav.nodes.length,nav.nodeCells.size,nav.components.length];
  for(let index=0;index<20;index++) {
    const destination=nav.randomNearby(from,6,()=>index/20);assert.ok(destination);
    assert.equal(nav.canStand(destination),true);assert.ok(distanceForTest(from,destination)<=6.00001);
    assert.ok(nav.findPath(from,destination).length>1);
  }
  assert.ok(nav.nearestReachable(p(14,1.52,15),from,{maxDistance:4}));
  assert.equal(nav.nearestReachable(p(100,0,100),from,{maxDistance:2}),null);
  assert.equal(nav.randomNearby(from,0),null);assert.equal(nav.randomNearby(null,5),null);
  assert.deepEqual([nav.nodes.length,nav.nodeCells.size,nav.components.length],storage);
});

test('the stair-aware path estimate remains a lower bound beside either landing',()=>{
  for(const ramp of RAMPS) {
    const base=ramp.baseY??0,x=(ramp.minX+ramp.maxX)/2,low=p(x,base,ramp.startZ),high=p(x,base+ramp.height,ramp.endZ);
    for(const progress of [.02,.5,.98]) {
      const target=interpolate(low,high,progress),estimate=nav.makeHeuristic(target);
      for(const end of [low,high])assert.ok(estimate(end)<=distanceForTest(end,target)+1e-8,'partial stair travel cannot require climbing past the quarry');
    }
  }
});
