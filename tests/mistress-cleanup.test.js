import test from 'node:test';
import assert from 'node:assert/strict';
import {MistressCleanupSight} from '../src/mistress-cleanup.js';

const p=(x=0,y=0,z=0)=>({x,y,z});
const observer={position:p(),stance:p(),eye:p(0,2.3,0),yaw:0};
function setup({balls=[],puddles=[],visible=()=>true,reachable=()=>true,budget=24}={}) {
  let rays=0;
  const vision={canSeePoint(actor,point){rays++;return visible(point);},canReachPoint:reachable};
  const navigation={isDen:point=>point.x===-16&&point.z===12,
    pursuitTarget:point=>point.x===1?null:p(point.x,0,point.z)};
  const poop={physics:{balls},hasBall:ball=>balls.includes(ball),remove:ball=>{
    const index=balls.indexOf(ball);if(index<0)return false;balls.splice(index,1);return true;
  }};
  const water={puddles,removePuddle:puddle=>{
    const index=puddles.indexOf(puddle);if(index<0)return false;puddles.splice(index,1);return true;
  }};
  return {sensor:new MistressCleanupSight({vision,navigation,poop,water,rayBudget:budget}),poop,water,get rays(){return rays;}};
}
const puddle=(x=0,z=6)=>({...p(x,0,z),amount:100,progress:1});

test('visible reachable puddles outrank a nearer poop ball and nearest same-kind mess wins',()=>{
  const ball=p(0,.065,2),near=puddle(0,6),far=puddle(0,9);
  const {sensor}=setup({balls:[ball],puddles:[far,near]});
  const chosen=sensor.scan(observer);assert.equal(chosen.kind,'pee');assert.equal(chosen.position.z,6);
});

test('mess sensing rejects sleeping, behind, distant, protected and unreachable targets',()=>{
  const fixture=setup({balls:[p(0,.065,-1),p(0,.065,51),p(-16,.065,12),p(1,.065,5)]});
  assert.equal(fixture.sensor.scan(observer),null);
  fixture.poop.physics.balls.push(p(0,.065,4));
  assert.equal(fixture.sensor.scan({...observer,asleep:true}),null);
  assert.equal(fixture.sensor.scan(observer).kind,'poop');
});

test('occluded puddles permit a visible ball, while a visible puddle preempts an active ball',()=>{
  const ball=p(0,.065,3),patch=puddle();let showPee=false;
  const {sensor}=setup({balls:[ball],puddles:[patch],visible:point=>point.z!==6||showPee});
  const active=sensor.scan(observer);assert.equal(active.kind,'poop');
  assert.equal(sensor.scan({...observer,yaw:Math.PI},active),active,'a remembered target survives turning away');
  showPee=true;assert.equal(sensor.scan(observer,active).kind,'pee');
});

test('descriptors track moving balls and exact identity through removal and replacement',()=>{
  const ball={...p(0,.065,3),id:1};const {sensor,poop}=setup({balls:[ball]});
  const target=sensor.scan(observer);ball.z=4;
  assert.equal(target.position.z,4);assert.equal(target.goal.z,4);assert.equal(target.remove(),true);assert.equal(target.exists(),false);
  const replacement={...p(0,.065,4),id:1};poop.physics.balls.push(replacement);
  const next=sensor.scan(observer);assert.notEqual(next.id,target.id);assert.equal(target.remove(),false);assert.equal(next.exists(),true);
});

test('a remembered ball pushed into an inaccessible space is released instead of repeatedly reacquired',()=>{
  const ball=p(0,.065,3),{sensor}=setup({balls:[ball]});
  const active=sensor.scan(observer);assert.equal(active.kind,'poop');
  ball.x=1;assert.equal(active.goal,null);
  assert.equal(sensor.scan(observer,active),null);
  assert.equal(sensor.scan(observer),null);
});

test('ray work is bounded and farther visible messes are not starved by occluded near piles',()=>{
  const fixture=setup({balls:Array.from({length:60},(_,i)=>p(0,.065,i+1)),visible:point=>point.z===49});
  let found=null;
  for(let scan=0;scan<3&&!found;scan++) {
    const before=fixture.rays;found=fixture.sensor.scan(observer);assert.ok(fixture.rays-before<=24);
  }
  assert.equal(found.position.z,49);
});

test('reachable elevated messes use raised hands while physically blocked messes are excluded',()=>{
  const ball=p(0,1.56,3),origins=[];
  const {sensor}=setup({balls:[ball],reachable:(origin)=>{origins.push(origin.y);return true;}});
  const chosen=sensor.scan(observer);assert.ok(chosen);assert.equal(chosen.goal.y,0);
  assert.ok(chosen.canClean(p(0,0,2)));assert.ok(origins.every(y=>y>=1.8&&y<=2.2));
  assert.equal(setup({balls:[ball],reachable:()=>false}).sensor.scan(observer),null);
  assert.equal(setup({balls:[p(0,3,3)]}).sensor.scan(observer),null);
});

test('forming puddles wait for exact completion before sight or cleanup, while complete edges remain visible',()=>{
  const patch={...puddle(),progress:.01};let examined=[];
  const {sensor}=setup({puddles:[patch],visible:point=>{examined.push(point);return point.x>0;}});
  for(const progress of [0,.01,.5,.999]) {
    patch.progress=progress;assert.equal(sensor.scan(observer),null);
  }
  assert.equal(examined.length,0,'in-progress pee does not spend visibility rays or begin cleaning');
  const waiting=sensor.descriptor('pee',patch,observer.stance);assert.equal(waiting.ready,false);assert.equal(waiting.goal,null);
  patch.progress=1;
  const active=sensor.scan(observer);assert.equal(active,waiting);assert.equal(active.kind,'pee');assert.equal(active.ready,true);
  assert.ok(examined.some(point=>point.x>.8),'a complete puddle can reveal its visible outer edge');
  assert.equal(sensor.scan({...observer,yaw:Math.PI},active),active);
  assert.equal(active.remove(),true);assert.equal(sensor.scan(observer,active),null);
});

test('a large visible waste pile still selects one reachable object within its ray budget',()=>{
  const fixture=setup({balls:[...Array.from({length:1000},()=>p(-.1,.065,3)),p(0,.065,6)],budget:1});
  assert.equal(fixture.sensor.scan(observer)?.position.z,3);assert.equal(fixture.rays,1);
});
