import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/physics.js';
import {WaterSystem} from '../src/water.js';
import {bindMouseControls} from '../src/mouse.js';

function setup() {
  const items=[{id:'fountain-a',x:0,y:0,z:0},{id:'fountain-b',x:4,y:0,z:0}];
  const water=new WaterSystem(new World(),{items}),player={x:.9,y:0,z:0,grounded:true};
  const canvas=new EventTarget(),document=new EventTarget(),window=new EventTarget();
  canvas.focus=()=>{};document.pointerLockElement=null;
  const mouse=bindMouseControls({canvas,document,window,canControl:()=>true,onLook:()=>{},onPoop:()=>{},
    onLockChange:()=>{},onLockDenied:()=>{},onPrimary:held=>held?water.hold(player):water.stop()});
  const event=type=>{const e=new Event(type);Object.assign(e,{button:0,clientX:0,clientY:0});(type==='mousedown'?canvas:window).dispatchEvent(e);};
  function fillAndPee() {
    event('mousedown');water.advance(10,player);event('mouseup');assert.equal(water.bladder.value,100);
    assert.ok(water.pee(player));water.advance(1,player);assert.equal(water.bladder.value,0);
    player.x=4.9;
  }
  return {water,player,items,event,mouse,fillAndPee};
}

test('a held click on the next fountain resumes at the cooldown deadline without another mouse press',()=>{
  const {water,player,items,event,fillAndPee}=setup();fillAndPee();water.advance(58.5,player);
  assert.equal(water.cooldownRemaining,.5);event('mousedown');
  assert.equal(water.drinking,false);assert.equal(water.pending,items[1]);
  water.advance(.499,player);assert.equal(water.cooldownRemaining,.001);assert.equal(water.bladder.value,0);
  water.advance(.001,player);assert.equal(water.cooldownRemaining,0);assert.equal(water.drinking,true);assert.equal(water.bladder.value,0);
  water.advance(.1,player);assert.equal(water.bladder.value,1);assert.equal(water.remaining(items[0]),0);assert.equal(water.remaining(items[1]),99);
  event('mouseup');water.advance(1,player);assert.equal(water.bladder.value,1);
});

test('a frame crossing cooldown expiry credits only the time after it, including tiny and coarse intervals',()=>{
  for(const after of [.001,.1,3.75]) {
    const {water,player,items,event,fillAndPee}=setup();fillAndPee();water.advance(58.5,player);event('mousedown');
    water.advance(.5+after,player);assert.equal(water.bladder.value,after*10);assert.equal(water.remaining(items[1]),100-after*10);
  }
});

test('queued drinking is cancelled by release, input clearing, leaving reach or jumping',()=>{
  for(const cancel of [f=>f.event('mouseup'),f=>f.mouse.clear(),f=>{f.player.x=8;},f=>{f.player.grounded=false;}]) {
    const f=setup();f.fillAndPee();f.event('mousedown');cancel(f);f.water.advance(60,f.player);
    assert.equal(f.water.pending,null);assert.equal(f.water.drinking,false);assert.equal(f.water.bladder.value,0);assert.equal(f.water.remaining(f.items[1]),100);
  }
});

test('holding during the pee animation waits through its completion and the remaining cooldown',()=>{
  const {water,player,items,event}=setup();event('mousedown');water.advance(10,player);event('mouseup');
  water.pee(player);water.advance(.5,player);player.x=4.9;event('mousedown');
  assert.equal(water.peeing,true);assert.equal(water.drinking,false);water.advance(.5,player);
  assert.equal(water.peeing,false);assert.equal(water.bladder.value,0);assert.equal(water.cooldownRemaining,59);
  water.advance(59.1,player);assert.equal(water.bladder.value,1);assert.equal(water.remaining(items[1]),99);
});

test('full and depleted fountains do not queue endless drinking and strict start remains immediate-only',()=>{
  const {water,player,items,event,fillAndPee}=setup();fillAndPee();
  assert.equal(water.start(player),false);assert.equal(water.pending,null);
  water.advance(59,player);event('mousedown');water.advance(10,player);
  assert.equal(water.bladder.value,100);assert.equal(water.drinking,false);assert.equal(water.pending,null);assert.equal(water.remaining(items[1]),0);
  event('mouseup');water.pee(player);water.advance(60,player);event('mousedown');water.advance(5,player);
  assert.equal(water.bladder.value,0);assert.equal(water.pending,null);assert.equal(water.drinking,false);
});
