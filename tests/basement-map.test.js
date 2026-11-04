import test from 'node:test';
import assert from 'node:assert/strict';
import {drawLevelMap} from '../src/level-map.js';
import {BASEMENT,BASEMENT_STAIRS,BOUNDS,FLOOR_HEIGHT as H,RAMPS} from '../src/layout.js';

function render(floor,{player={x:0,y:BASEMENT.y,z:0,facing:0},cues={}}={}){
  const rectangles=[],texts=[],rotations=[],stack=[];
  const ctx={globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:1,
    clearRect(){},fillRect(x,y,w,h){rectangles.push({kind:'fill',color:this.fillStyle,x,y,w,h});},strokeRect(x,y,w,h){rectangles.push({kind:'stroke',color:this.strokeStyle,x,y,w,h});},
    beginPath(){},moveTo(){},lineTo(){},closePath(){},arc(){},fill(){},stroke(){},translate(){},rotate(angle){rotations.push(angle);},
    fillText(text,x,y){texts.push({text,x,y});},save(){stack.push({globalAlpha:this.globalAlpha,fillStyle:this.fillStyle,strokeStyle:this.strokeStyle});},restore(){Object.assign(this,stack.pop());}};
  drawLevelMap(ctx,340,384,player,floor,new Set(),true,cues);return {rectangles,texts,rotations};
}
const scale=Math.min((340-28)/(BOUNDS.maxX-BOUNDS.minX+2),(384-28)/(BOUNDS.maxZ-BOUNDS.minZ+2));
const hasRamp=(output,ramp)=>output.rectangles.some(r=>r.kind==='stroke'&&Math.abs(r.w-(ramp.maxX-ramp.minX)*scale)<1e-6&&Math.abs(r.h-Math.abs(ramp.endZ-ramp.startZ)*scale)<1e-6);

test('basement map draws the full concrete room and its own stairs without yards, den or upper labels',()=>{
  const output=render(-1);
  assert.ok(output.texts.some(t=>t.text==='UTILITY BASEMENT'));assert.ok(output.rectangles.some(r=>r.kind==='fill'&&r.color==='#8d9294'));
  assert.ok(!output.rectangles.some(r=>['#bed3a3','#c4d5a5','#eadcc966'].includes(r.color)));
  assert.ok(!output.texts.some(t=>['LOUNGE','BEDROOM','BACKYARD','FRONT YARD'].includes(t.text)));
  assert.equal(output.rotations.length,1,'Shidan is shown on her actual basement floor');
  for(const ramp of RAMPS)assert.equal(hasRamp(output,ramp),ramp===BASEMENT_STAIRS,ramp.id);
});

test('ground and upper maps show only ramps connected to their floor',()=>{
  for(const floor of [0,1]){
    const output=render(floor);
    for(const ramp of RAMPS)assert.equal(hasRamp(output,ramp),floor===0||ramp!==BASEMENT_STAIRS,`${floor}: ${ramp.id}`);
    assert.equal(output.rotations.length,0,'a basement rabbit cannot appear upstairs');
  }
});

test('basement and upper cues get correct relative floor arrows on all three maps',()=>{
  const basement={x:0,y:BASEMENT.y,z:0},ground={x:0,y:0,z:0},upper={x:0,y:H,z:0};
  assert.ok(render(-1,{cues:{mistress:ground}}).texts.some(t=>t.text==='↑'));
  assert.ok(render(0,{cues:{mistress:basement}}).texts.some(t=>t.text==='↓'));
  assert.ok(render(1,{cues:{mistress:basement}}).texts.some(t=>t.text==='↓'));
  assert.ok(render(-1,{cues:{ripples:[{...upper,radius:1,opacity:.8}]}}).texts.some(t=>t.text==='↑'));
  assert.ok(!render(-1,{cues:{mistress:basement}}).texts.some(t=>t.text==='↑'||t.text==='↓'));
});
