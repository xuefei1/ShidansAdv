import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createHouse} from '../src/house.js';
import {RabbitController,SURFACES} from '../src/physics.js';
import {PoopPhysics,POOP_RADIUS} from '../src/poop-physics.js';
import {FLOOR_HEIGHT as H,RAMPS} from '../src/layout.js';
import {createRabbit} from '../src/model.js';
import {visualHeadroom} from '../src/rabbit-clearance.js';

const scene=new THREE.Scene(),{world}=createHouse(scene);
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
function rabbitAt(x,y,z) {
  const rabbit=new RabbitController(world);Object.assign(rabbit,{x,y,z,surface:world.support(x,z,y+.01,true).surface});return rabbit;
}
function walkTo(rabbit,x,z,fps,inspect=()=>{}) {
  for(let frame=0;frame<fps*12;frame++) {
    const dx=x-rabbit.x,dz=z-rabbit.z;
    if(Math.hypot(dx,dz)<.02&&Math.hypot(rabbit.vx,rabbit.vz)<.1)return;
    rabbit.update(1/fps,{x:dx*2,z:dz*2});inspect(rabbit);
  }
  assert.fail(`Could not walk to ${x},${z}: ${JSON.stringify({x:rabbit.x,y:rabbit.y,z:rabbit.z})}`);
}
function ascend(fps,inspect=()=>{}) {
  const rabbit=rabbitAt(21.8,H,-4.8);
  walkTo(rabbit,21.8,-8.8,fps,inspect);close(rabbit.y,H+.9);
  walkTo(rabbit,20.4,-8.8,fps,inspect);walkTo(rabbit,20.4,-12.5,fps,inspect);close(rabbit.y,H+1.9);
  return rabbit;
}

test('the linen tunnel is replaced by two open carpet tiers and bounded physical access ramps',()=>{
  assert.equal(world.solids.some(box=>box.id?.includes('linen-passage')||box.id==='linen-tunnel-ceiling'),false);
  const decks=world.solids.filter(box=>box.shelfDeck);
  assert.deepEqual(decks.map(box=>box.id).sort(),['linen-shelf-lower','linen-shelf-upper']);
  close(decks.find(box=>box.id.endsWith('lower')).maxY,H+.9);
  close(decks.find(box=>box.id.endsWith('upper')).maxY,H+1.9);
  for(const deck of decks){assert.equal(deck.surface,'carpet');assert.equal(SURFACES[deck.surface].longJump,true);}
  assert.ok(decks[0].minZ>decks[1].maxZ,'tiers do not trap the rabbit’s tall ears beneath another deck');
  const steps=world.solids.filter(box=>box.rabbitRamp);assert.equal(steps.length,48);
  for(const step of steps){assert.equal(step.reachableShelf.id,'linen-shelf');assert.equal(step.surface,'carpet');close(step.minY,H);}
  assert.equal(world.ramps,RAMPS);assert.equal(RAMPS.length,2,'furniture does not alter the two human stairways');
});

test('ordinary walking climbs both shelf ramps continuously at low and high frame rates',()=>{
  for(const fps of [120,60,30,10]) {
    const rabbit=ascend(fps,actor=>{
      assert.equal(actor.grounded,true,`${fps} FPS must not require a jump on the ramp`);
      assert.equal(actor.surface,'carpet');assert.ok(actor.y>=H&&actor.y<=H+1.9+1e-8);
    });
    close(rabbit.y,H+1.9);assert.equal(rabbit.energy.value,100);
  }
});

test('a charged westward jump from the second tier lands directly on the studio desk',()=>{
  const desk=world.solids.find(box=>box.id==='studio-desk-top');
  for(const fps of [120,60,30,10]) {
    const rabbit=ascend(fps);walkTo(rabbit,19.95,-12.3,fps);
    for(let frame=0;frame<Math.ceil(.7*fps);frame++)rabbit.update(1/fps,{jump:true});
    rabbit.update(1/fps,{x:-1});assert.equal(rabbit.lastJump,'long');
    for(let frame=0;frame<fps*3&&!rabbit.grounded;frame++)rabbit.update(1/fps,{x:-1});
    assert.equal(rabbit.grounded,true);assert.ok(rabbit.x>desk.minX&&rabbit.x<desk.maxX);
    assert.ok(rabbit.z>desk.minZ&&rabbit.z<desk.maxZ);close(rabbit.y,desk.maxY);
    assert.ok(rabbit.energy.value>89&&rabbit.energy.value<91,'normal long-jump energy remains in effect');
  }
});

test('the rendered rabbit stays beneath the real ceiling during ascent and the complete charged desk jump',()=>{
  const model=createRabbit(),bounds=new THREE.Box3(),ceiling=world.solids.find(box=>box.id==='upstairs-ceiling');
  let time=0,tightAirSamples=0,highestFoot=H;
  function inspect(rabbit) {
    time+=1/60;highestFoot=Math.max(highestFoot,rabbit.y);
    const headroom=visualHeadroom(world,rabbit),floor=world.support(rabbit.x,rabbit.z,rabbit.y+.01,true).y;
    model.root.position.set(rabbit.x,rabbit.y,rabbit.z);model.root.rotation.y=rabbit.facing;
    model.animate(time,Math.hypot(rabbit.vx,rabbit.vz),rabbit.grounded,rabbit.charge/.8,floor,'idle',headroom);
    model.root.updateMatrixWorld(true);bounds.setFromObject(model.root);
    assert.ok(bounds.max.y<=ceiling.minY+.001,`ears intersect the ceiling at ${JSON.stringify({x:rabbit.x,y:rabbit.y,z:rabbit.z,top:bounds.max.y})}`);
    if(!rabbit.grounded&&headroom<.9)tightAirSamples++;
  }
  const rabbit=ascend(60,inspect);walkTo(rabbit,19.95,-12.3,60,inspect);
  for(let frame=0;frame<42;frame++){rabbit.update(1/60,{jump:true});inspect(rabbit);}
  rabbit.update(1/60,{x:-1});inspect(rabbit);assert.equal(rabbit.lastJump,'long');
  for(let frame=0;frame<180&&!rabbit.grounded;frame++){rabbit.update(1/60,{x:-1});inspect(rabbit);}
  assert.equal(rabbit.grounded,true);close(rabbit.y,H+1.46);
  assert.ok(highestFoot>7.35,'the physical full jump is preserved');assert.ok(tightAirSamples>0,'the trajectory must exercise ceiling-aware posing');
});

test('the upper shelf supports charged launches in all eight movement headings',()=>{
  for(let direction=0;direction<8;direction++) {
    const angle=direction*Math.PI/4,dx=Math.sin(angle),dz=Math.cos(angle),rabbit=rabbitAt(21.1,H+1.9,-13.5);
    for(let frame=0;frame<84;frame++)rabbit.update(1/120,{jump:true});
    const before={x:rabbit.x,z:rabbit.z};rabbit.update(.05,{x:dx,z:dz});
    assert.equal(rabbit.lastJump,'long',`heading ${direction}`);assert.equal(rabbit.grounded,false);
    assert.ok((rabbit.x-before.x)*dx+(rabbit.z-before.z)*dz>.2,`heading ${direction} must be free to launch`);
  }
});

test('upstairs furniture ramps create no phantom ground-floor wall or raised ball support',()=>{
  for(const [x,startZ,endZ] of [[21.8,-4.8,-7.8],[20.4,-9.2,-12]]) {
    const rabbit=rabbitAt(x,0,startZ);walkTo(rabbit,x,endZ,60,actor=>close(actor.y,0));
    assert.equal(rabbit.grounded,true);close(rabbit.y,0);
    const physics=new PoopPhysics(world),ball=physics.spawn({x,y:.3,z:(startZ+endZ)/2});
    for(let frame=0;frame<120;frame++)physics.update(1/60);
    close(ball.y,POOP_RADIUS,.002);
    assert.equal(world.rampAt(x,(startZ+endZ)/2),undefined);
  }
});
