import test from 'node:test';
import assert from 'node:assert/strict';
import {drawLevelMap} from '../src/level-map.js';
import {FLOOR_HEIGHT} from '../src/layout.js';

function canvasRecorder() {
  const shapes=[],texts=[],stack=[];
  const ctx={globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:1,
    clearRect(){},fillRect(){},strokeRect(){},moveTo(){},lineTo(){},closePath(){},translate(){},rotate(){},
    beginPath(){this.path=[];},arc(x,y,radius){this.path.push({x,y,radius});},
    fill(){for(const arc of this.path)shapes.push({...arc,kind:'fill',color:this.fillStyle,opacity:this.globalAlpha});},
    stroke(){for(const arc of this.path)shapes.push({...arc,kind:'stroke',color:this.strokeStyle,opacity:this.globalAlpha});},
    fillText(text,x,y){texts.push({text,x,y,color:this.fillStyle});},
    save(){stack.push({globalAlpha:this.globalAlpha,fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,lineWidth:this.lineWidth});},
    restore(){Object.assign(this,stack.pop());},
  };
  return {ctx,shapes,texts};
}
const player={x:0,y:0,z:10,facing:0};
const render=(cues={},floor=0)=>{const output=canvasRecorder();drawLevelMap(output.ctx,170,192,player,floor,new Set(),false,cues);return output;};
const red=shapes=>shapes.filter(shape=>shape.color==='#c8434e');

test('the minimap never invents a mistress marker without a current sight cue',()=>{
  assert.equal(red(render().shapes).length,0);
  const visible=red(render({mistress:{x:2,y:0,z:8}}).shapes);
  assert.equal(visible.filter(shape=>shape.kind==='fill').length,1);
  assert.equal(visible[0].radius,3.5);
  assert.equal(red(render({mistress:null}).shapes).length,0,'no last-seen dot persists');
});

test('audible footsteps draw fading red area rings without a hidden exact dot',()=>{
  const cue={x:2,y:0,z:8,radius:2,opacity:.4};
  const {ctx,shapes}=render({ripples:[cue]});
  const rings=red(shapes);assert.equal(rings.length,1);assert.equal(rings[0].kind,'stroke');assert.equal(rings[0].opacity,.4);
  assert.equal(ctx.globalAlpha,1,'fading cues cannot fade Shidan or the map');
  assert.equal(red(render({ripples:[{...cue,opacity:0}]}).shapes).length,0);
});

test('nearby cues on the other floor remain audible with a vertical direction tag',()=>{
  const upper={x:2,y:FLOOR_HEIGHT,z:8,radius:1,opacity:.8};
  const below=render({ripples:[upper]},0);assert.ok(below.texts.some(text=>text.text==='↑'&&text.color==='#c8434e'));
  const same=render({mistress:upper},1);assert.ok(!same.texts.some(text=>text.text==='↑'||text.text==='↓'));
  const above=render({mistress:{x:2,y:0,z:8}},1);assert.ok(above.texts.some(text=>text.text==='↓'));
});

test('malformed and expired map cues are ignored without drawing invalid canvas arcs',()=>{
  const {shapes}=render({mistress:{x:NaN,y:0,z:1},ripples:[null,{}, {x:1,y:0,z:1,radius:-1,opacity:1}]});
  assert.equal(red(shapes).length,0);assert.ok(shapes.every(shape=>Number.isFinite(shape.radius)));
});
