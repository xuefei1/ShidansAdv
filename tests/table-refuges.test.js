import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {createWaterFountains} from '../src/fountains.js';
import {MistressNavigation} from '../src/mistress-navigation.js';
import {MistressAI} from '../src/mistress-ai.js';
import {MistressPursuit,POOP_CLEAN_SECONDS,PEE_CLEAN_SECONDS} from '../src/mistress-pursuit.js';
import {MistressSight} from '../src/mistress-awareness.js';
import {MistressVision} from '../src/mistress-vision.js';
import {MistressCleanupSight} from '../src/mistress-cleanup.js';
import {RabbitController} from '../src/physics.js';
import {withinInteractionReach,TABLE_EDGE_REACH,TABLE_REACH_HEIGHT} from '../src/table-refuges.js';
import {DEN,FLOOR_HEIGHT as H} from '../src/layout.js';

const p=(x,y,z)=>({x,y,z});
const scene=new THREE.Scene(),{world,group}=createHouse(scene);createWaterFountains(scene,world);
const nav=new MistressNavigation(world),vision=new MistressVision(new MistressSight(group),world);
const from=p(-15.8,0,6.9),tables=world.solids.filter(box=>box.tabletop);
const centre=(box,under=false)=>p((box.minX+box.maxX)/2,under?box.tabletop.baseY:box.maxY,(box.minZ+box.maxZ)/2);
const horizontal=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

function sensorFor(kind,source) {
  const balls=kind==='poop'?[source]:[],puddles=kind==='pee'?[source]:[];let removals=0;
  function remove(items,item){const index=items.indexOf(item);if(index<0)return false;items.splice(index,1);removals++;return true;}
  const poop={physics:{balls},hasBall:ball=>balls.includes(ball),remove:ball=>remove(balls,ball)};
  const water={puddles,removePuddle:patch=>remove(puddles,patch)};
  return {sensor:new MistressCleanupSight({vision,navigation:nav,poop,water}),get removals(){return removals;}};
}
function standingMistress(position=from) {
  const routine=new MistressAI(world,{navigation:nav,random:()=>.5}),npc=new MistressPursuit(routine,{random:()=>.5});
  routine.activity='mopping';routine.position={...position};routine.renderPosition={...position};routine.poseWeight=0;
  routine._duration=1000000;routine._nextNoise=Infinity;return npc;
}
function physicalContact(npc,rabbit) {
  return vision.contactClear(p(npc.position.x,npc.position.y+2.3,npc.position.z),rabbit,
    {stance:npc.position,tableInteraction:nav.tableInteraction(rabbit)});
}
function visibleWaste(fixture,source,table) {
  for(const radius of [3,4,5,6,8])for(let index=0;index<16;index++) {
    const angle=index*Math.PI/8,position=p(source.x+Math.sin(angle)*radius,table.tabletop.baseY,source.z+Math.cos(angle)*radius);
    if(!nav.canStand(position))continue;
    const observer={position,stance:position,eye:p(position.x,position.y+2.3,position.z),
      yaw:Math.atan2(source.x-position.x,source.z-position.z)};
    const target=fixture.sensor.scan(observer);if(target)return {target,observer};
  }
  return null;
}
function rabbitClear(point) {
  for(const box of world.query(point.x-.22,point.z-.22,point.x+.22,point.z+.22)) {
    if(world.dynamicBoxes.has(box)||point.y>=box.maxY-.01||point.y+.68<=box.minY+.01)continue;
    const x=Math.max(box.minX,Math.min(box.maxX,point.x)),z=Math.max(box.minZ,Math.min(box.maxZ,point.z));
    if(Math.hypot(x-point.x,z-point.z)<.219)return false;
  }
  return true;
}

test('semantic metadata identifies all seven tables with floor and height bounds, without granting safety',()=>{
  assert.deepEqual(tables.map(box=>box.id).sort(),['coffee-top','dining-top','library-table-top','garden-table-top',
    'craft-table-top','studio-desk-top','picnic-top'].sort());
  for(const table of tables) {
    assert.equal(table.tabletop.baseY,table.id==='studio-desk-top'?H:0);
    for(const under of [false,true]) {
      const point=centre(table,under);assert.equal(nav.tableAt(point)?.id,table.id);
      assert.equal(nav.tableAt({...point,x:table.minX})?.id,table.id);
      assert.equal(nav.tableAt({...point,z:table.maxZ})?.id,table.id);
      assert.equal(nav.isRabbitSafe(point,from),false,`${table.id} ${under?'under':'top'} is not a hiding place`);
      const goal=nav.pursuitTarget(point,from);assert.ok(goal);assert.equal(nav.canStand(goal),true);
      assert.ok(withinInteractionReach(point,goal,nav.reachInteraction(point)));assert.ok(nav.findPath(from,goal).length>1);
    }
    assert.equal(nav.tableAt({...centre(table),x:table.maxX+.01}),null);
    assert.equal(nav.tableAt({...centre(table),y:table.tabletop.baseY+TABLE_REACH_HEIGHT+.001}),null);
    assert.equal(nav.tableAt({...centre(table,true),y:table.tabletop.baseY-.1}),null);
  }
  assert.equal(nav.tableAt(p(14,0,-12)),null,'the upstairs desk does not extend reach in the room below');
  for(const point of [p(-15,H+.96,-13.5),p(2,H+.4,-11.3),p(14,1.56,-12),p(14,1.5,7)])
    assert.equal(nav.tableAt(point),null,'beds, poufs, crates and solid islands are not tables');
});

test('heard-only pursuit catches Shidan on and under every real table without entering its furniture',()=>{
  for(const table of tables)for(const under of [false,true]) {
    const npc=standingMistress(),rabbit=centre(table,under),label=`${table.id} ${under?'under':'top'}`;
    if(!under)rabbit.y=world.support(rabbit.x,rabbit.z,table.maxY+.3,true).y;
    const event={id:1,source:'shidan',kind:'eat',scope:'house',position:{...rabbit},time:0,expiresAt:1.2};
    npc.update(0,{player:rabbit,noiseEvents:[event],seen:false});assert.equal(npc.investigating,true,label);
    for(let frame=0;frame<2000&&npc.phase==='chase';frame++) {
      npc.update(.02,{player:rabbit,seen:false});
      assert.equal(nav.canStand(npc.position),true,`${label}: the human remains outside the table and legs`);
      npc.update(0,{player:rabbit,seen:false,contactClear:physicalContact(npc,rabbit)});
    }
    assert.equal(npc.phase,'caught',label);assert.equal(npc.playerLocked,true);
    assert.ok(withinInteractionReach(rabbit,npc.position,nav.reachInteraction(rabbit)));
    assert.ok(Math.abs(npc.position.y-rabbit.y)<=TABLE_REACH_HEIGHT);
    assert.equal(physicalContact(npc,rabbit),true,label);
  }
});

test('poop and pee on and under every table complete their physical reach and real cleanup timers',()=>{
  for(const table of tables)for(const under of [false,true])for(const kind of ['poop','pee']) {
    const position=centre(table,under);
    if(!under)position.y=world.support(position.x,position.z,table.maxY+.3,true).y;
    const source={...position,y:position.y+(kind==='poop'?.065:0),progress:1,amount:100};
    const fixture=sensorFor(kind,source),observed=visibleWaste(fixture,source,table);
    const label=`${table.id} ${under?'under':'top'} ${kind}`;
    assert.ok(observed,`${label} must be spotted by real eye rays from a valid human stance`);
    const {target,observer}=observed,goal=target.goal;
    assert.ok(goal,label);assert.ok(withinInteractionReach(source,goal,nav.reachInteraction(source)));assert.equal(target.canClean(goal),true,label);
    const npc=standingMistress(observer.position),player=p(DEN.x,0,DEN.z);
    npc.update(0,{player,cleanupTarget:target});assert.equal(npc.phase,'cleanup',label);
    for(let frame=0;frame<1000&&npc.phase==='cleanup'&&npc.state!=='acting';frame++) {
      npc.update(.02,{player});assert.equal(nav.canStand(npc.position),true,label);
    }
    assert.equal(npc.state,'acting',`${label} must actually be approached before cleaning`);
    const seconds=npc.cleanupRemaining;
    npc.update(seconds-.001,{player,movementScale:0});assert.equal(npc.phase,'cleanup',label);assert.equal(fixture.removals,0);
    npc.update(.001,{player,movementScale:0});assert.equal(fixture.removals,1,label);
    assert.equal(npc.phase,'search');assert.equal(npc.rageBonus,kind==='pee'?.05:0);
  }
});

test('a ball pushed from a table top underneath remains a live cleanable target',()=>{
  const table=tables.find(box=>box.id==='coffee-top'),source={...centre(table),y:table.maxY+.065};
  const fixture=sensorFor('poop',source),target=fixture.sensor.descriptor('poop',source,from);assert.ok(target.goal);
  source.y=table.tabletop.baseY+.065;assert.ok(target.goal);assert.equal(nav.tableInteraction(source).under,true);
  const npc=standingMistress(target.goal),player=p(DEN.x,0,DEN.z);npc.update(POOP_CLEAN_SECONDS,{player,cleanupTarget:target});
  assert.equal(fixture.removals,1);assert.equal(npc.phase,'search');
});

test('table reach never bypasses blocked contact or cleanup rays, and real tunnels remain safe',()=>{
  const table=tables.find(box=>box.id==='coffee-top'),rabbit=centre(table,true),goal=nav.pursuitTarget(rabbit,from),npc=standingMistress(goal);
  npc.update(0,{player:rabbit,seen:true,contactClear:false});assert.equal(npc.canAttemptCapture(rabbit),true);assert.equal(npc.phase,'chase');
  const source={...rabbit,y:rabbit.y+.065},fixture=sensorFor('poop',source),target=fixture.sensor.descriptor('poop',source,goal);
  const barrier=world.addDynamicBox((goal.x+source.x)/2,.7,(goal.z+source.z)/2,.15,1.4,.15);
  assert.equal(target.canClean(goal),false);assert.equal(physicalContact(npc,rabbit),false);
  npc.update(0,{player:rabbit,seen:true,contactClear:physicalContact(npc,rabbit)});assert.equal(npc.phase,'chase');
  world.removeBox(barrier);
  for(const point of [p(DEN.x,0,DEN.z),p(-16,0,-33)]) {
    assert.equal(nav.isRabbitSafe(point,from),true);assert.equal(nav.cleanupTarget(point,from),null);
  }
});

test('sampled legal table footprints have no safe pockets beside chair corners or above small books',()=>{
  const storage=[nav.nodes.length,nav.grid.size,nav.cells.size],findPath=nav.findPath;let checked=0;
  nav.findPath=()=>{throw new Error('perception must not perform an A* route search');};
  try {
    for(const table of tables)for(const under of [false,true])for(let ix=0;ix<=24;ix++)for(let iz=0;iz<=16;iz++) {
      const point=p(table.minX+(table.maxX-table.minX)*ix/24,table.tabletop.baseY,
        table.minZ+(table.maxZ-table.minZ)*iz/16);
      if(!under)point.y=world.support(point.x,point.z,table.maxY+.4,true).y;
      if(!rabbitClear(point)||(!under&&point.y<table.maxY-.001))continue;
      checked++;const label=`${table.id} ${JSON.stringify(point)}`,goal=nav.pursuitTarget(point,from);
      assert.ok(goal,label);assert.equal(nav.isRabbitSafe(point,from),false,label);
      assert.ok(withinInteractionReach(point,goal,nav.reachInteraction(point)),label);
      assert.equal(vision.contactClear(p(goal.x,goal.y+2.3,goal.z),point,
        {stance:goal,tableInteraction:nav.tableInteraction(point)}),true,label);
      const source={...point,y:point.y+.065},fixture=sensorFor('poop',source),target=fixture.sensor.descriptor('poop',source,from);
      assert.ok(target.goal,`waste ${label}`);assert.equal(target.canClean(target.goal),true,label);
    }
  } finally {nav.findPath=findPath;}
  assert.ok(checked>4000);assert.deepEqual([nav.nodes.length,nav.grid.size,nav.cells.size],storage);
});

test('the high studio computer support remains within bounded reach and can be caught',()=>{
  const screen=world.fixtures.get('computer-screen'),rabbit=p((screen.minX+screen.maxX)/2,screen.maxY,(screen.minZ+screen.maxZ)/2);
  assert.equal(world.support(rabbit.x,rabbit.z,rabbit.y+.01,true).y,rabbit.y);assert.ok(rabbit.y-H>2.25);
  assert.ok(nav.tableInteraction(rabbit));const goal=nav.pursuitTarget(rabbit,from);assert.ok(goal);
  const npc=standingMistress(goal);npc.update(0,{player:rabbit,seen:true,contactClear:physicalContact(npc,rabbit)});
  assert.equal(npc.phase,'caught');assert.equal(physicalContact(npc,rabbit),true);
  assert.equal(nav.tableAt({...rabbit,y:H+2.401}),null,'jumping above arm height may escape naturally');
});

test('main-style post-movement contact gets one chance at a heard table source after a blocked approach',()=>{
  const rabbit=p(14,H,-11.34375),goal=nav.pursuitTarget(rabbit,from),start={...goal,z:goal.z-3};
  assert.ok(nav.canStand(start));assert.ok(withinInteractionReach(rabbit,goal,nav.reachInteraction(rabbit)));
  for(const clear of [true,false]) {
    const npc=standingMistress(start),event={id:1,source:'shidan',kind:'eat',scope:'house',position:{...rabbit},time:0,expiresAt:1.2};
    npc.update(0,{player:rabbit,seen:false,noiseEvents:[event]});let arrived=false;
    for(let frame=0;frame<100&&npc.phase==='chase'&&!arrived;frame++) {
      npc.update(.05,{player:rabbit,seen:false,contactClear:false});
      arrived=!!npc.investigationGoal&&horizontal(npc.position,npc.investigationGoal)<1e-6;
      // main.js performs this fresh physical check after each .05s slice.
      npc.update(0,{player:rabbit,seen:false,contactClear:clear&&arrived&&physicalContact(npc,rabbit)});
    }
    assert.ok(arrived,'the blocked approach must reach its source before the fresh contact result becomes available');
    if(clear)assert.equal(npc.phase,'caught');
    else {
      assert.equal(npc.phase,'chase');npc.update(.05,{player:rabbit,seen:false,contactClear:false});
      assert.equal(npc.phase,'search','a rejected physical ray cannot keep source-arrival pursuit alive forever');
    }
  }
});

test('standing beside every real table permits a physical catch across its full width, bounded to that table edge and floor',()=>{
  for(const table of tables) {
    const rabbit=p(table.minX+.3,table.maxY,(table.minZ+table.maxZ)/2);
    rabbit.y=world.support(rabbit.x,rabbit.z,table.maxY+.3,true).y;
    const near=p(table.maxX+TABLE_EDGE_REACH,table.tabletop.baseY,rabbit.z),interaction=nav.reachInteraction(rabbit);
    assert.equal(nav.canStand(near),true,table.id);assert.ok(horizontal(near,rabbit)>3,table.id);
    assert.equal(withinInteractionReach(rabbit,near,interaction),true,table.id);
    assert.equal(withinInteractionReach(rabbit,{...near,x:near.x+.01},interaction),false,'the larger numeric range cannot extend into the room');
    assert.equal(withinInteractionReach(rabbit,{...near,y:near.y+1},interaction),false,'another floor/airborne stance cannot use table reach');
    const npc=standingMistress(near);npc.update(0,{player:rabbit,seen:true,contactClear:false});
    assert.equal(npc.canAttemptCapture(rabbit),true,table.id);assert.equal(physicalContact(npc,rabbit),true,table.id);
    npc.update(0,{player:rabbit,seen:true,contactClear:physicalContact(npc,rabbit)});assert.equal(npc.phase,'caught',table.id);
  }
});

test('full-table reach includes opposite diagonal corners and does not clean from beyond the table-edge boundary',()=>{
  const table=world.fixtures.get('dining-top'),rabbit=p(table.minX+.22,table.maxY,table.minZ+.22);
  const near=p(table.maxX+.7,0,table.maxZ+.7),npc=standingMistress(near);
  assert.equal(nav.canStand(near),true);assert.ok(horizontal(near,rabbit)>6);
  npc.update(0,{player:rabbit,seen:true,contactClear:physicalContact(npc,rabbit)});assert.equal(npc.phase,'caught');
  const source={...rabbit,y:rabbit.y+.065},fixture=sensorFor('poop',source),far=p(table.maxX+1.1,0,rabbit.z);
  const target=fixture.sensor.descriptor('poop',source,far),cleaner=standingMistress(far);
  assert.ok(target.goal);assert.ok(horizontal(far,source)<nav.reachInteraction(source).reach);
  cleaner.update(1,{player:p(DEN.x,0,DEN.z),cleanupTarget:target,movementScale:0});
  assert.equal(cleaner.phase,'cleanup');assert.equal(cleaner.state,'walking');assert.equal(fixture.removals,0);
  assert.equal(cleaner.cleanupRemaining,POOP_CLEAN_SECONDS);
});

test('grounded rabbit feet retain table interaction across supported edges on every tabletop',()=>{
  for(const table of tables) {
    const middle=centre(table),stance=p(table.maxX+.8,table.tabletop.baseY,middle.z);
    for(const point of [{...middle,x:table.minX-.12},{...middle,x:table.maxX+.12},
      {...middle,z:table.minZ-.12},{...middle,z:table.maxZ+.12},
      {...middle,x:table.maxX+.14,z:table.minZ-.14}]) {
      Object.assign(point,{radius:.22,grounded:true});
      assert.equal(world.support(point.x,point.z,point.y+.01,true,point.radius).y,table.maxY,'the actual foot circle is supported');
      assert.equal(nav.tableAt(point)?.id,table.id);
      assert.equal(withinInteractionReach(point,stance,nav.tableInteraction(point)),true,'capture agrees with table classification');
      assert.equal(withinInteractionReach(point,{...stance,y:stance.y+H},nav.tableInteraction(point)),false,'table reach does not cross floors');
    }
  }
});

test('the faster walking controller can coast past a table centre boundary and still be caught through a clear hand path',()=>{
  const table=world.fixtures.get('dining-top'),rabbit=new RabbitController(world);
  Object.assign(rabbit,{x:14,y:table.maxY,z:15.9,surface:'wood'});
  for(let frame=0;frame<120&&rabbit.z>=14.3;frame++)rabbit.update(1/60,{z:(14.1-rabbit.z)*3});
  for(let frame=0;frame<120;frame++)rabbit.update(1/60,{});
  assert.ok(rabbit.z<table.minZ-.1,'the original coasting defect must move the centre beyond the table');
  assert.equal(rabbit.grounded,true);assert.ok(Math.abs(rabbit.y-table.maxY)<1e-8);
  assert.equal(nav.tableAt(rabbit)?.id,table.id);
  const npc=standingMistress(p(table.maxX+TABLE_EDGE_REACH,0,15));
  npc.update(0,{player:rabbit,seen:true,contactClear:false});assert.equal(npc.canAttemptCapture(rabbit),true);
  assert.equal(physicalContact(npc,rabbit),true);
  const wall=world.addDynamicBox(16.8,1.5,15,.08,3,8);
  try {
    assert.equal(physicalContact(npc,rabbit),false);
    npc.update(0,{player:rabbit,seen:true,contactClear:physicalContact(npc,rabbit)});assert.equal(npc.phase,'chase');
  } finally {world.removeBox(wall);}
  npc.update(0,{player:rabbit,seen:true,contactClear:physicalContact(npc,rabbit)});assert.equal(npc.phase,'caught');
});

test('unsupported corners, separated feet, airborne rabbits and under-table points do not expand table reach',()=>{
  const table=world.fixtures.get('dining-top'),middle=centre(table),stance=p(table.maxX+.8,0,middle.z);
  const interaction=nav.tableInteraction(middle),supported={...middle,x:table.maxX+.12,grounded:true,radius:.22};
  assert.equal(nav.tableAt(supported)?.id,table.id);
  const rejected=[
    {...supported,x:table.maxX+.17,z:table.minZ-.17},
    {...supported,x:table.maxX+.22},
    {...supported,x:table.maxX+.23,radius:10},
    {...supported,grounded:false},
    {...supported,radius:undefined},
    {...supported,y:table.maxY-.01},
    {...supported,y:table.tabletop.baseY},
    {...supported,y:table.tabletop.baseY-H},
  ];
  for(const point of rejected) {
    assert.equal(nav.tableAt(point),null,JSON.stringify(point));
    assert.equal(withinInteractionReach(point,stance,interaction),false,'a stale interaction must also reject unsupported feet');
  }
  assert.equal(nav.tableAt(p(supported.x,supported.y,supported.z)),null,'ordinary point snapshots retain strict footprint bounds');
});
