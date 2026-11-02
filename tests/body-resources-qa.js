import { MISTRESS_ACTIVITIES } from '/src/mistress-ai.js';
import { FLOOR_HEIGHT as H } from '/src/layout.js';
const frame=document.getElementById('app'),results=document.getElementById('results'),status=document.getElementById('status');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const game=()=>frame.contentDocument,canvas=()=>game().getElementById('game'),data=()=>canvas().dataset;
const key=(type,code)=>canvas().dispatchEvent(new frame.contentWindow.KeyboardEvent(type,{code,bubbles:true}));
const mouse=(type,button=0)=>canvas().dispatchEvent(new frame.contentWindow.MouseEvent(type,{button,clientX:300,clientY:400,bubbles:true}));
const click=id=>game().getElementById(id).click(),pos=()=>data().position.split(',').map(Number);
const advance=async seconds=>{
  game().dispatchEvent(new frame.contentWindow.CustomEvent('qa-advance',{detail:seconds}));
  // Background previews may render more slowly than a fixed 100 ms wait.
  // Let the actual game settle the injected clock before sampling its HUD.
  await new Promise(resolve=>frame.contentWindow.requestAnimationFrame(()=>frame.contentWindow.requestAnimationFrame(resolve)));
  await wait(100);
};
function check(label,passed) {
  const li=document.createElement('li');li.className=passed?'pass':'fail';li.textContent=`${passed?'PASS':'FAIL'}: ${label}`;results.append(li);
  if(!passed) throw Error(label);
}
async function until(condition,label) {
  status.textContent=label;const deadline=performance.now()+240000;
  while(!condition()) {status.dataset.game=JSON.stringify(data());if(performance.now()>deadline || !game().getElementById('fatal').hidden) throw Error(`Timed out: ${label} (${JSON.stringify(data())})`);await wait(40);}
}
async function walk(x,z,{run=false}={}) {
  const held=new Set(),deadline=performance.now()+240000;
  const setKeys=codes=>{for(const code of [...held])if(!codes.includes(code)){key('keyup',code);held.delete(code);}for(const code of codes)if(!held.has(code)){key('keydown',code);held.add(code);}};
  status.textContent=`Walking to (${x}, ${z})`;
  try {
    while(performance.now()<deadline) {
      const p=pos(),dx=x-p[0],dz=z-p[2];
      if(Math.hypot(dx,dz)<.23) {setKeys([]);await wait(600);if(Math.hypot(x-pos()[0],z-pos()[2])<.23)return;}
      const yaw=Number(data().camera.split(',')[0]),forward=-Math.sin(yaw)*dx-Math.cos(yaw)*dz,right=Math.cos(yaw)*dx-Math.sin(yaw)*dz;
      setKeys([...(run&&Math.hypot(dx,dz)>2.5?['ShiftLeft']:[]),...(Math.abs(right)>.14?[right>0?'KeyD':'KeyA']:[]),...(Math.abs(forward)>.14?[forward>0?'KeyW':'KeyS']:[])]);await wait(40);
    }
    throw Error(`Could not walk to ${x},${z}: ${pos()}`);
  } finally {setKeys([]);}
}
async function runPursuitChecks() {
  document.title='Shidan · Pursuit QA';document.querySelector('header b').textContent='Detection, chase & capture';
  await until(()=>data().mistressConeVisible==='true','Show the forward floor cone');
  check('Shidan starts protected in the den with the forward cone visible',data().mistressPhase==='routine'&&game().getElementById('chase-warning').hidden);
  const programs=data().shaderPrograms,shadow=data().shadowRevision;
  await walk(-14,12);key('keydown','Space');await until(()=>!game().getElementById('charge').hidden&&game().getElementById('charge-percent').textContent==='100%','Charge the escape jump');
  const yaw=Number(data().camera.split(',')[0]),codes=[...(Math.abs(Math.cos(yaw))>.3?[Math.cos(yaw)>0?'KeyD':'KeyA']:[]),...(Math.abs(Math.sin(yaw))>.3?[Math.sin(yaw)>0?'KeyS':'KeyW']:[])];
  for(const code of codes)key('keydown',code);key('keyup','Space');
  await until(()=>pos()[0]>-11,'Escape into the forward view');for(const code of codes)key('keyup',code);
  await until(()=>data().grounded==='true','Land outside the den');await until(()=>data().mistressPhase==='chase','Be spotted outside the den');
  if(new URLSearchParams(location.search).has('shelf')) {await runShelfChecks();return;}
  if(new URLSearchParams(location.search).has('scold-escape')) {await runScoldEscapeChecks();return;}
  if(new URLSearchParams(location.search).has('tables')) {await runKitchenTableChecks();return;}
  if(new URLSearchParams(location.search).has('cleanup')) {await runCleanupChecks();return;}
  if(new URLSearchParams(location.search).has('search-noise')) {await runSearchNoiseChecks();return;}
  check('Forward sight starts a chase and displays the warning graphic',data().mistressDetection==='sight'&&!game().getElementById('chase-warning').hidden&&game().getElementById('chase-warning').dataset.phase==='chase');
  check('Initial chase pace is seventy percent of the wood-floor sprint',data().mistressChaseMultiplier==='0.70'&&Math.abs(Number(data().mistressChaseSpeed)-5.74)<.001);
  click('menu-button');await until(()=>data().mode==='pause','Pause a live chase');
  const beforePause=data().mistressElapsed;await advance(2);
  check('Pause freezes the pursuit rather than spending the lost-sight timer',data().mistressElapsed===beforePause);
  // Circle the coffee-table legs and trunk; the long jump can land on either
  // side of that furniture depending on the held-input frame boundary.
  click('resume');await walk(-6,6);await walk(-6,4.8);await walk(-12,4.8);await walk(-12,7.4);await walk(-15.8,7.4);
  if(new URLSearchParams(location.search).has('capture')) {
    await advance(.75);document.querySelector('header').hidden=true;results.hidden=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});return;
  }
  for(let i=0;i<35&&data().mistressPhase!=='caught';i++)await advance(.1);
  await until(()=>data().mistressPhase==='caught','Allow clear close contact');
  check('Clear close contact begins a three-second capture',Number(data().mistressCaptureRemaining)>2.8&&data().captureCount==='1'&&game().getElementById('chase-title').textContent==='Caught!');
  const capturedAt=data().position,supply=data().poopSupply,score=data().happiness;
  key('keydown','KeyD');key('keydown','ShiftLeft');key('keydown','Space');key('keydown','KeyP');key('keydown','KeyQ');mouse('mousedown',2);await wait(200);
  for(const code of ['KeyD','ShiftLeft','Space','KeyP','KeyQ'])key('keyup',code);
  check('Capture locks movement, jumping, resource actions and the home button',data().position===capturedAt&&data().poopSupply===supply&&game().getElementById('home').disabled&&data().peeing==='false');
  const left=Number(data().mistressCaptureRemaining);await advance(left-.001);
  check('Shidan stays caught until the full three-second delay has elapsed',data().mistressPhase==='caught'&&Number(data().mistressCaptureRemaining)>.0001);
  await advance(.002);await until(()=>data().mistressPhase==='scolding','Return Shidan after capture');
  check('Capture returns Shidan to the den and preserves her score and supplies',Math.hypot(pos()[0]+16,pos()[2]-12)<.03&&data().happiness===score&&data().poopSupply===supply&&data().freeDenJump==='false');
  const scoldPosition=data().mistressPosition.split(',').map(Number),distanceToDen=Math.hypot(scoldPosition[0]+16,scoldPosition[2]-12);
  check('The mistress appears beside the den, angry, while Shidan can act again',distanceToDen>4&&distanceToDen<6.5&&data().mistressActivity==='angry'&&data().mistressState==='acting'&&!game().getElementById('home').disabled&&game().getElementById('chase-warning').dataset.phase==='scolding'&&game().getElementById('danger-vignette').hidden);
  await advance(1);
  check('The scolding timer shows four seconds after one active second',game().getElementById('chase-detail').textContent.endsWith('4s'));
  if(new URLSearchParams(location.search).has('scold')) {
    document.querySelector('header').hidden=true;results.hidden=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});return;
  }
  click('menu-button');const scoldTime=data().mistressScoldRemaining;await advance(3);
  check('Pause freezes the five-second scolding',data().mistressScoldRemaining===scoldTime);
  click('resume');await advance(Number(data().mistressScoldRemaining)-.001);
  check('Scolding lasts the full five active seconds',data().mistressPhase==='scolding'&&Number(data().mistressScoldRemaining)>.0001);
  await advance(.002);
  check('She resumes a random routine from the den instead of teleporting to the couch',data().mistressPhase==='routine'&&data().mistressActivity!=='angry'&&Math.hypot(...data().mistressPosition.split(',').map((v,i)=>Number(v)-scoldPosition[i]))<.05&&game().getElementById('chase-warning').hidden);
  for(const [elapsed,multiplier] of [[120,.75],[240,.80],[360,.85],[480,.90]]) {
    const now=600-Number(data().dayRemaining);await advance(elapsed+.01-now);
    check(`Chase pace increases to ${Math.round(multiplier*100)}% after ${elapsed/60} minutes`,Math.abs(Number(data().mistressChaseMultiplier)-multiplier)<.001);
  }
  check('Pursuit and floor patterns reuse warmed shaders and cached shadows',data().shaderPrograms===programs&&data().shadowRevision===shadow);
  click('menu-button');click('reset');await until(()=>data().dayRemaining==='600.00','Restart the pursuit state');
  check('Restart clears alert, capture and difficulty state',data().mistressPhase==='routine'&&data().captureCount==='0'&&data().mistressChaseMultiplier==='0.70'&&game().getElementById('chase-warning').hidden);
  check('The actual game has no fatal pursuit/rendering error',game().getElementById('fatal').hidden);
  status.textContent='All pursuit checks passed.';
}
async function runScoldEscapeChecks() {
  document.querySelector('header b').textContent='Escaping during the angry rant';
  for(let i=0;i<220&&data().mistressPhase!=='caught';i++)await advance(.1);
  check('The mistress catches Shidan outside the den through the real contact callback',data().mistressPhase==='caught'&&data().captureCount==='1');
  await advance(Number(data().mistressCaptureRemaining)+.001);
  await until(()=>data().mistressPhase==='scolding','Return to the den for the angry rant');
  check('The angry rant keeps its forward field-of-view indicator active',data().mistressConeVisible==='true'&&Number(data().mistressScoldRemaining)>4.9);
  const rantStarted=Number(data().mistressElapsed),previousYaw=Number(data().camera.split(',')[0]);
  mouse('mousedown');frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent('mousemove',{clientX:300+previousYaw/.003,clientY:400}));mouse('mouseup');
  await until(()=>Math.abs(Number(data().camera.split(',')[0]))<.001,'Face the northern den fence');
  await walk(-16,9.5);key('keydown','Space');
  await until(()=>!game().getElementById('charge').hidden&&game().getElementById('charge-percent').textContent==='100%','Charge a second escape during the rant');
  key('keydown','KeyW');key('keyup','Space');
  try {await until(()=>['chase','caught'].includes(data().mistressPhase),'Be spotted as soon as Shidan clears the den');}
  finally {key('keyup','KeyW');}
  check('A visible escape interrupts the rant immediately without waiting five seconds',Number(data().mistressElapsed)-rantStarted<.1&&data().mistressDetection==='sight'&&data().mistressScoldRemaining==='0.000');
  check('The chase warning updates after the rant is interrupted',!game().getElementById('chase-warning').hidden&&['chase','caught'].includes(game().getElementById('chase-warning').dataset.phase));
  check('Escaping the rant causes no fatal rendering or controller error',game().getElementById('fatal').hidden);
  status.textContent='All scolding-escape checks passed.';
  if(new URLSearchParams(location.search).has('capture')) {
    document.querySelector('header').hidden=true;results.hidden=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});
  }
}
async function runKitchenTableChecks() {
  document.querySelector('header b').textContent='Kitchen climbing & tabletop capture';
  // The controlled clock keeps the NPC in place while real held keys drive
  // Shidan along the production route. No position or collision overrides.
  const previousYaw=Number(data().camera.split(',')[0]);mouse('mousedown');
  frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent('mousemove',{clientX:300+previousYaw/.003,clientY:400}));mouse('mouseup');
  await until(()=>Math.abs(Number(data().camera.split(',')[0]))<.001,'Align the camera with the kitchen stepping route');
  await walk(-6,17,{run:true});await walk(0,17,{run:true});await walk(6.5,17,{run:true});
  // Align west of the book before turning toward the steps. A diagonal
  // approach can lodge against its corner at coarse background frame rates.
  await walk(7.25,17);await walk(7.25,15);
  const east=['KeyD'];
  for(const height of [.32,.72,1.12,1.52]) {
    for(const code of east)key('keydown',code);key('keydown','Space');await wait(50);key('keyup','Space');
    try {await until(()=>data().grounded==='true'&&Math.abs(pos()[1]-height)<.03,`Hop to the ${height} m kitchen step`);}
    finally {for(const code of east)key('keyup',code);}
    await wait(250);
    check(`Normal controls reach the ${height} m step without falling`,data().grounded==='true'&&Math.abs(pos()[1]-height)<.03);
    if(height===1.12)await walk(11.3,15);
  }
  await walk(14,15.7);
  const across=new URLSearchParams(location.search).has('across');
  // Snacks are pushable. This far-side pursuit check only needs rewarding
  // chewing; a nearby banana may become the nearest item after the climb.
  check(across?'A happiness snack is reachable on the kitchen dining table':'The restored cake is reachable on the kitchen dining table',
    pos()[1]>1.5&&(across?/\+[1-9]\d* happiness/.test(game().getElementById('consume-energy').textContent):data().consumeTarget==='cake-0'));
  mouse('mousedown');await until(()=>data().lastNoiseKind==='eat','Chew a tabletop snack');
  check('Tabletop chewing emits ordinary house-wide noise',data().lastNoiseScope==='house');
  if(across) {
    await advance(.2);
    for(let i=0;i<25&&data().mistressInvestigating!=='true'&&data().mistressSeesPlayer!=='true';i++)await advance(.1);
    mouse('mouseup');await walk(14.2,14.35);
    check('Shidan reaches the far half of the kitchen tabletop',pos()[2]<14.6&&Math.abs(pos()[1]-1.52)<.03);
    for(let i=0;i<220&&data().mistressPhase!=='caught';i++)await advance(.1);
    const npc=data().mistressPosition.split(',').map(Number),rabbit=pos();
    const edge=Math.hypot(Math.max(11.6-npc[0],0,npc[0]-16.4),Math.max(13.6-npc[2],0,npc[2]-16.4));
    check('The mistress catches across the table from its edge',data().mistressPhase==='caught'&&edge<=1.001&&Math.hypot(npc[0]-rabbit[0],npc[2]-rabbit[2])>2.5);
  } else if(new URLSearchParams(location.search).has('orbit')) {
    // Refresh real sight after the frozen-clock climb, and keep chewing until
    // she has either actual sight or a fresh heard source before moving away.
    await advance(.2);
    for(let i=0;i<25&&data().mistressInvestigating!=='true'&&data().mistressSeesPlayer!=='true';i++)await advance(.1);
    await runMovingTableChecks();
  }
  else for(let i=0;i<180&&data().mistressPhase!=='caught';i++)await advance(.1);
  mouse('mouseup');
  check('The mistress routes to the kitchen and catches Shidan on the table',data().mistressPhase==='caught'&&data().captureCount==='1'&&pos()[1]>1.5);
  check('The climb and tabletop capture have no fatal runtime error',game().getElementById('fatal').hidden);
  status.textContent='All kitchen-table checks passed.';
  if(new URLSearchParams(location.search).has('capture')) {
    document.querySelector('header').hidden=true;results.hidden=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});
  }
}
async function runShelfChecks() {
  document.querySelector('header b').textContent='Two-tier studio shelf & long jump';
  const previousYaw=Number(data().camera.split(',')[0]);mouse('mousedown');
  frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent('mousemove',{clientX:300+previousYaw/.003,clientY:400}));mouse('mouseup');
  await until(()=>Math.abs(Number(data().camera.split(',')[0]))<.001,'Align the shelf route camera');
  await walk(-6,17,{run:true});await walk(0,17,{run:true});await walk(2.5,16);
  await walk(2.5,.9,{run:true});
  check('Normal controls reach the upstairs floor',data().grounded==='true'&&Math.abs(pos()[1]-H)<.03);
  await walk(17,0,{run:true});await walk(17,-6,{run:true});await walk(21.8,-4.8,{run:true});
  await walk(21.8,-8.8);
  check('The first ramp reaches the lower carpeted shelf without a jump',Math.abs(pos()[1]-(H+.9))<.03&&data().surface==='carpet');
  await walk(21.8,-9.35);await until(()=>data().consumeTarget==='book-11','Reach the restored shelf book');
  check('The lower tier has an accessible book',data().consumeTarget==='book-11');
  await walk(20.4,-8.8);await walk(20.4,-12.5);
  check('The connecting ramp reaches level two',data().grounded==='true'&&Math.abs(pos()[1]-(H+1.9))<.03);
  await walk(21,-13.6);await until(()=>data().consumeTarget==='banana-2','Reach the upper shelf snack');
  check('The upper tier has an accessible snack',data().consumeTarget==='banana-2'&&data().consumableCount==='40');
  await walk(19.95,-12.3);const before=Number(data().energy);
  key('keydown','Space');await until(()=>!game().getElementById('charge').hidden&&game().getElementById('charge-percent').textContent==='100%','Charge a jump from shelf level two');
  key('keydown','KeyA');key('keyup','Space');
  try {
    await until(()=>data().grounded==='false','Launch from the upper shelf');
    check('The grippy shelf launches a real long jump',data().lastNoiseKind==='long-jump'&&data().lastNoiseScope==='local');
    await until(()=>data().grounded==='true'&&pos()[0]<16.2&&Math.abs(pos()[1]-(H+1.46))<.03,'Land directly on the studio table');
  } finally {key('keyup','KeyA');}
  check('A charged jump lands on the studio table and spends normal energy',pos()[0]>11.8&&pos()[0]<16.2&&before-Number(data().energy)>9.9);
  check('The shelf route has no fatal rendering or input error',game().getElementById('fatal').hidden);
  const [yaw,pitch]=data().camera.split(',').map(Number);mouse('mousedown');
  frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent('mousemove',{clientX:300+(yaw+Math.PI/2)/.003,clientY:400+(.24-pitch)/.0027}));mouse('mouseup');
  await until(()=>Math.abs(Number(data().camera.split(',')[0])+Math.PI/2)<.01,'Look back toward the shelf');
  status.textContent='All studio-shelf checks passed.';
  if(new URLSearchParams(location.search).has('capture')) {
    document.querySelector('header').hidden=true;results.hidden=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});
  }
}
async function runMovingTableChecks() {
  // Keep this browser route along the wide axis. The Node controller fixture
  // covers circles/sprints; coarse background-tab input must allow wood slide.
  const targets=[13.2,14.8],held=new Set();
  let index=0,distance=0;
  try {
    for(let i=0;i<200&&data().mistressPhase!=='caught';i++) {
      const before=pos();
      if(index===0?before[0]<=targets[0]+.2:before[0]>=targets[1]-.2)index=1-index;
      const codes=[targets[index]>before[0]?'KeyD':'KeyA'];
      for(const code of [...held])if(!codes.includes(code)){key('keyup',code);held.delete(code);}
      for(const code of codes)if(!held.has(code)){key('keydown',code);held.add(code);}
      await advance(.1);const after=pos();distance+=Math.hypot(after[0]-before[0],after[2]-before[2]);
      checkTableHeight(after);
    }
  } finally {for(const code of held)key('keyup',code);}
  check('The mistress intercepts Shidan while she keeps moving around the tabletop',distance>.5&&data().mistressPhase==='caught');
}
function checkTableHeight(point) {
  if(Math.abs(point[1]-1.52)>.03)throw Error(`The moving-table route left its support: ${point}`);
}
async function runSearchNoiseChecks() {
  document.querySelector('header b').textContent='Chewing interrupts search';
  await walk(-6,6);await walk(0,6);await walk(0,-1.5);await walk(-14,-1.5);
  await walk(-14,-5);await walk(-18,-7);await walk(-18,-14.8);await walk(-17,-14.8);
  await until(()=>data().consumeTarget==='book-3','Reach an accessible library book');
  await advance(2.2);
  check('The mistress searches on the first floor after Shidan breaks sight',data().mistressPhase==='search'&&Number(data().mistressPosition.split(',')[1])<.2&&data().mistressSeesPlayer==='false');
  check('Hearing is unmasked before the new chewing sound',data().mistressMasking==='false');
  const before=Number(data().noiseSequence);mouse('mousedown');
  await until(()=>Number(data().noiseSequence)>before,'Chew while the mistress searches');mouse('mouseup');
  check('Actual held chewing emits a fresh house-wide sound',data().lastNoiseKind==='eat'&&data().lastNoiseScope==='house');
  check('Chewing immediately interrupts search and starts sound investigation',data().mistressPhase==='chase'&&data().mistressInvestigating==='true'&&data().mistressDetection==='eat'&&data().mistressSeesPlayer==='false');
  check('The chase warning explains that she heard the sound',!game().getElementById('chase-warning').hidden&&game().getElementById('chase-title').textContent==='She heard that!');
  // Corner braking may hold her briefly; an eventual sighting can also
  // legitimately promote the sound investigation to a visual pursuit.
  const beforeMove=data().mistressPosition;await advance(1);
  check('She leaves the roam route and pursues the sound or a renewed sighting',data().mistressPhase==='chase'&&data().mistressPosition!==beforeMove);
  check('There are no fatal chewing or search errors',game().getElementById('fatal').hidden);
  if(new URLSearchParams(location.search).has('capture')) {
    document.querySelector('header').hidden=true;results.hidden=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});
  }
  status.textContent='All search-noise checks passed.';
}
async function runCleanupChecks() {
  document.querySelector('header b').textContent='Poop and puddle distractions';
  await walk(-11.5,15.5);key('keydown','KeyP');key('keyup','KeyP');
  for(let i=0;i<100&&data().mistressPhase!=='cleanup';i++)await advance(.1);
  await until(()=>data().mistressPhase==='cleanup','Let the mistress notice the poop ball');
  check('A visible poop ball interrupts pursuit and starts a cleanup distraction',data().mistressCleanupKind==='poop'&&data().poopCount==='1'&&game().getElementById('chase-warning').dataset.phase==='cleanup'&&game().getElementById('danger-vignette').hidden);
  for(let i=0;i<200&&data().mistressState!=='acting';i++)await advance(.1);
  check('She reaches the ball and starts its 0.2-second cleaning action',data().mistressPhase==='cleanup'&&data().mistressState==='acting'&&Number(data().mistressCleanupRemaining)>0&&Number(data().mistressCleanupRemaining)<=.2);
  // Shidan can move away while the mistress is occupied.
  await walk(-10.5,17);const remaining=Number(data().mistressCleanupRemaining);
  click('menu-button');await advance(2);check('Pause freezes cleanup time and leaves the ball intact',Number(data().mistressCleanupRemaining)===remaining&&data().poopCount==='1');click('resume');
  await advance(remaining-.001);check('The ball remains until the full cleaning duration elapses',data().poopCount==='1'&&Number(data().mistressCleanupRemaining)>.0001);
  await advance(.002);check('Poop cleanup removes the exact ball without granting rage',data().poopCount==='0'&&data().mistressRageBonus==='0.00');
  if(new URLSearchParams(location.search).has('poop-only')) {
    check('The faster poop cleanup causes no fatal game error',game().getElementById('fatal').hidden);
    status.textContent='All 0.2-second poop-cleanup checks passed.';return;
  }
  await until(()=>data().consumeTarget==='fountain-living','Reach water for a puddle');
  mouse('mousedown');await until(()=>data().drinking==='true','Start drinking');await advance(10);mouse('mouseup');
  check('The full fountain supplies enough water for a real pee action',data().bladder==='100.00');
  key('keydown','KeyQ');key('keyup','KeyQ');await advance(1);
  await until(()=>data().peeing==='false','Finish making the puddle');
  await walk(-8,18.5);
  // It must enter her view; search can currently be facing away from the
  // fountain, and a frozen test clock would never turn her back toward it.
  for(let i=0;i<150&&data().mistressCleanupKind!=='pee';i++)await advance(.1);
  await until(()=>data().mistressCleanupKind==='pee','Let the mistress see the puddle');
  key('keydown','KeyP');key('keyup','KeyP');await wait(150);
  check('A pee puddle has priority even when another poop ball is available',data().puddleCount==='1'&&data().poopCount==='1'&&data().mistressPhase==='cleanup'&&data().mistressCleanupKind==='pee');
  for(let i=0;i<100&&data().mistressState!=='acting';i++)await advance(.1);
  check('The mistress reaches the puddle and starts the ten-second mop animation',data().mistressCleanupKind==='pee'&&data().mistressState==='acting'&&Number(data().mistressCleanupRemaining)>9.8);
  if(new URLSearchParams(location.search).has('cleaning')) {
    await advance(2);document.querySelector('header').hidden=true;results.hidden=true;Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});status.textContent='Pee cleanup preview';return;
  }
  const left=Number(data().mistressCleanupRemaining);await advance(left-.001);
  check('The puddle remains and rage is unchanged just before ten seconds',data().puddleCount==='1'&&data().mistressRageBonus==='0.00'&&Number(data().mistressCleanupRemaining)>.0001);
  await advance(.002);
  check('Completed puddle cleanup removes it and adds five percent of top sprint speed',data().puddleCount==='0'&&data().mistressRageBonus==='0.05'&&data().mistressRageSpeedBonus==='0.440'&&!game().getElementById('mistress-rage').hidden);
  check('Cleanup preserves the drinking cooldown and does not refill the bladder',Number(data().drinkCooldown)>40&&data().bladder==='0.00');
  check('The cleanup flow has no fatal rendering or action errors',game().getElementById('fatal').hidden);
  if(new URLSearchParams(location.search).has('results')) {await runResultsChecks();return;}
  if(new URLSearchParams(location.search).has('capture')) {
    document.querySelector('header').hidden=true;results.hidden=true;Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});status.textContent='All cleanup checks passed.';return;
  }
  click('menu-button');click('reset');await until(()=>data().dayRemaining==='600.00','Restart after rage');
  check('Restart clears waste, cleanup and the rage bonus',data().poopCount==='0'&&data().puddleCount==='0'&&data().mistressRageBonus==='0.00'&&data().mistressPhase==='routine'&&game().getElementById('mistress-rage').hidden);
  status.textContent='All cleanup checks passed.';
}
async function runResultsChecks() {
  await walk(-9,19);await walk(-6.5,16);await walk(-7.2,12.5);
  await until(()=>data().consumeTarget==='book-1','Reach a final happiness item');
  mouse('mousedown');await until(()=>data().lastConsumedId==='book-1','Finish the book before bedtime');mouse('mouseup');
  await advance(Number(data().dayRemaining)+.02);await until(()=>data().mode==='gameover','Show the bedtime results');
  const stats=JSON.parse(data().roundStats),result=game().getElementById('game-over');
  check('Bedtime opens a Game Over dialog with final score and full local rank',!result.hidden&&game().getElementById('game-over-score').textContent==='20'&&game().getElementById('game-over-rank').textContent==='#2 of 4');
  check('Results show actual successful poop, water and pee totals',stats.poopDropped===2&&stats.waterDrunk===100&&stats.urineProduced===100&&stats.puddlesCreated===1);
  check('Movement and mistress cleanup statistics survive bedtime',stats.longJumps===1&&stats.distanceTravelled>0&&stats.wasteCleaned.poop===1&&stats.wasteCleaned.pee===1);
  check('All fourteen consumable kinds have independent result rows with the completed book counted',game().querySelectorAll('#game-over-items tr').length===14&&stats.consumedTotal===1&&stats.consumed.book===1&&Object.entries(stats.consumed).every(([key,count])=>key==='book'||count===0));
  const position=data().position,frozen=data().roundStats;key('keydown','KeyP');key('keydown','KeyW');key('keyup','KeyP');key('keyup','KeyW');await advance(30);
  check('Results freeze the round and cannot record the same score twice',data().position===position&&data().roundStats===frozen&&data().dayRemaining==='0.00'&&game().querySelectorAll('#leaderboard-rows tr').length===4);
  check('Game Over offers a new game and main menu with keyboard focus inside',!!game().getElementById('game-over-new')&&!!game().getElementById('game-over-menu')&&result.contains(game().activeElement));
  if(new URLSearchParams(location.search).has('capture')) {
    document.querySelector('header').hidden=true;results.hidden=true;Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});status.textContent='All results checks passed.';return;
  }
  click('game-over-new');await until(()=>data().mode==='play','Start a new game from results');
  check('New game resets stats, poop supply and the entire ten-minute round',data().dayRemaining==='600.00'&&data().poopSupply==='10'&&data().poopCount==='0'&&data().roundStats===''&&game().getElementById('game-over').hidden);
  await advance(600);await until(()=>data().mode==='gameover','Finish the second round');click('game-over-menu');await until(()=>data().mode==='title','Return to main menu');
  check('Main menu keeps completed scores and allows a fresh adventure',!game().getElementById('welcome').hidden&&!game().getElementById('player-name').disabled&&data().dayRemaining==='600.00'&&game().querySelectorAll('#leaderboard-rows tr').length===5);
  status.textContent='All results checks passed.';
}
async function runMinimapChecks() {
  document.title='Shidan · Mistress minimap QA';document.querySelector('header b').textContent='Sight & nearby footsteps';
  const map=game().querySelector('.minimap'),legend=game().getElementById('consumable-legend');
  const mapRect=map.getBoundingClientRect(),legendRect=legend.getBoundingClientRect();
  check('The minimap is visible in the lower right with the item board open',mapRect.width>0&&mapRect.height>150&&mapRect.left>frame.clientWidth/2&&mapRect.top>frame.clientHeight/2&&mapRect.bottom<frame.clientHeight&&legendRect.bottom<=mapRect.top);
  check('The mistress is about fifty percent taller and fits below door height',Number(data().mistressStandingHeight)>2.6&&Number(data().mistressStandingHeight)<2.9);
  await until(()=>data().mapMistressVisible==='true','See the mistress on the couch');
  check('A clearly visible mistress has a red map marker',data().mapMistressVisible==='true');
  const turn=()=>{mouse('mousedown');frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent('mousemove',{clientX:300-Math.PI/.003,clientY:400}));mouse('mouseup');};
  turn();await until(()=>data().mapMistressVisible==='false','Turn the camera away');
  check('Turning away removes the exact marker without leaving a last-seen dot',data().mapMistressVisible==='false'&&data().mapFootstepCount==='0');
  legend.querySelector('summary').click();
  check('Collapsing the item legend keeps the minimap visible',map.getBoundingClientRect().height>150);
  legend.querySelector('summary').click();await walk(-16,9.2);
  canvas().dispatchEvent(new frame.contentWindow.WheelEvent('wheel',{deltaY:-2000,bubbles:true,cancelable:true}));
  await until(()=>data().mapMistressVisible==='false','Look away with a close camera');
  await advance(Number(data().mistressRemaining)+1.23);
  await until(()=>data().mistressState==='walking'&&Number(data().mapFootstepCount)>0,'Hear the first nearby footsteps');
  const cues=JSON.parse(data().mapFootsteps),heard=Number(data().mistressFootstepSequence);
  check('Nearby walking creates red ripple cues even while the mistress is off camera',data().mapMistressVisible==='false'&&cues.length>0);
  check('Heard cues are snapshots within five metres, with finite area and fade values',cues.every(cue=>Math.hypot(cue.x-pos()[0],cue.y-pos()[1],cue.z-pos()[2])<=5.0001&&cue.radius>=1.2&&cue.radius<=5&&cue.opacity>0&&cue.opacity<=.9));
  if(new URLSearchParams(location.search).has('capture')) {
    await advance(.75);document.querySelector('header').hidden=true;results.hidden=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});return;
  }
  click('menu-button');await until(()=>data().mode==='pause','Pause the minimap cues');
  const before=data().mapFootsteps;await advance(3);
  check('Pausing freezes heard cues and produces no new steps',data().mapFootsteps===before&&Number(data().mistressFootstepSequence)===heard);
  click('resume');await advance(12);await until(()=>data().mapFootstepCount==='0','Distant footsteps fade away');
  check('Walking outside hearing range leaves no permanent location trail',data().mapFootstepCount==='0'&&data().mapMistressVisible==='false');
  click('menu-button');click('reset');await until(()=>data().mistressElapsed==='0.000','Restart minimap state');
  check('Restart clears footstep history and restores the visible couch character',data().mistressFootstepSequence==='0'&&data().mapFootstepCount==='0'&&data().mistressActivity==='phone');
  check('The minimap and taller model have no fatal browser errors',game().getElementById('fatal').hidden);
  status.textContent='All minimap checks passed.';
}
async function runMistressChecks() {
  document.title='Shidan · Mistress routine QA';document.querySelector('header b').textContent='Household routines';
  const npcPos=()=>data().mistressPosition.split(',').map(Number),npcTime=()=>Number(data().mistressElapsed);
  check('Mistress starts using her phone on the couch while Shidan stays in her den',data().mistressActivity==='phone'&&data().mistressState==='acting'&&pos()[0]===-16&&pos()[2]===12);
  const programs=data().shaderPrograms,shadow=data().shadowRevision;
  for(let quarter=0;quarter<32&&data().mistressNoiseSequence==='0';quarter++)await advance(.25);
  check('Phone laughter produces independent house-wide noise and ripples',Number(data().mistressNoiseSequence)>0&&Number(data().mistressRipples)>0&&data().mistressNoiseKinds.includes('laugh')&&data().noiseSequence==='0');
  check('An explicit noise-cover indicator appears during mistress noise even with sound off',!game().getElementById('noise-cover').hidden&&data().mistressMasking==='true'&&game().getElementById('noise-cover').textContent.includes('still see')&&game().getElementById('sound').getAttribute('aria-label')==='Enable sound');
  if(new URLSearchParams(location.search).has('cover')) {
    document.querySelector('header').hidden=true;results.hidden=true;
    Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});return;
  }
  const noiseDuration=Number(data().mistressNoiseDuration),noiseLeft=Number(data().mistressNoiseRemaining);
  check('Each mistress noise episode lasts a random one to five seconds',noiseDuration>=1&&noiseDuration<=5&&noiseLeft>0&&noiseLeft<=noiseDuration);
  await advance(noiseLeft-.001);
  check('Noise masking and the laughter pose last until the selected duration ends',data().mistressMasking==='true'&&data().mistressLaughing==='true'&&!game().getElementById('noise-cover').hidden);
  click('menu-button');const pausedNoise=data().mistressNoiseRemaining;await advance(20);
  check('Pause freezes the active noise episode',data().mistressNoiseRemaining===pausedNoise);
  click('resume');await advance(.001);
  check('The noise-cover indicator disappears exactly with hearing masking',game().getElementById('noise-cover').hidden&&data().mistressMasking==='false');
  if(new URLSearchParams(location.search).has('noise-duration')) {status.textContent='All mistress noise-duration checks passed.';return;}
  click('menu-button');await until(()=>data().mode==='pause','Pause household routine');
  const elapsed=npcTime(),position=data().mistressPosition,remaining=data().mistressRemaining;
  await advance(20);
  check('Pause freezes routine travel, activity durations and ambient noise',npcTime()===elapsed&&data().mistressPosition===position&&data().mistressRemaining===remaining);
  click('resume');click('map-button');await advance(20);
  check('Opening the map also freezes the mistress',npcTime()===elapsed);
  click('close-atlas');
  const seen=new Set([data().mistressActivity]),states=new Set(),noises=new Set();let upstairs=false,stairs=false,walking=false,speedOK=true,finite=true;
  while(npcTime()<565&&seen.size<MISTRESS_ACTIVITIES.length) {
    await advance(1);
    const point=npcPos(),speed=Number(data().mistressSpeed);
    finite&&=point.every(Number.isFinite)&&Number.isFinite(speed);
    states.add(data().mistressState);
    if(data().mistressState==='acting')seen.add(data().mistressActivity);
    for(const kind of data().mistressNoiseKinds.split(',').filter(Boolean))noises.add(kind);
    upstairs||=point[1]>=4.19;stairs||=point[1]>.05&&point[1]<4.15;
    if(data().mistressState==='walking') {walking=true;speedOK&&=speed>3&&speed<7;}
  }
  check('The expanded random routine visits at least seven distinct household and outdoor tasks',seen.size>=7&&[...seen].every(id=>MISTRESS_ACTIVITIES.some(activity=>activity.id===id)));
  check('Routes walk between activities and use the stairs to reach upstairs',walking&&stairs&&upstairs&&states.has('entering')&&states.has('leaving'));
  check('Walking stays faster than Shidan walking and slower than sprinting',speedOK&&finite);
  check('Expanded household tasks provide additional noise-cover opportunities',noises.has('laugh')&&[...noises].some(kind=>!['laugh','cook'].includes(kind))&&[...noises].every(kind=>MISTRESS_ACTIVITIES.some(activity=>activity.noise===kind)));
  check('The mistress never moves Shidan or emits Shidan action noise',pos()[0]===-16&&pos()[2]===12&&data().noiseSequence==='0'&&data().happiness==='0');
  check('Activity changes reuse warmed shaders and cached sunlight',data().shaderPrograms===programs&&data().shadowRevision===shadow);
  click('menu-button');click('reset');await until(()=>data().mistressElapsed==='0.000','Restart household routine');
  check('Restart restores the couch routine and clears ambient events and ripples',data().mistressActivity==='phone'&&data().mistressState==='acting'&&data().mistressNoiseSequence==='0'&&data().mistressRipples==='0');
  await advance(600);await until(()=>data().mode==='gameover','Finish day with household routine');click('game-over-new');
  await until(()=>data().mode==='play','Start the next round');
  check('A new round resets the mistress without rebuilding the scene',data().mistressElapsed==='0.000'&&data().mistressActivity==='phone'&&data().mistressNoiseSequence==='0');
  check('Household rendering has no fatal errors',game().getElementById('fatal').hidden);
  status.textContent='All mistress checks passed.';
}
async function runNoiseChecks() {
  const sequence=()=>Number(data().noiseSequence),quiet=()=>data().noiseCount==='0'&&data().noiseRipples==='0';
  document.title='Shidan · Noise QA';document.querySelector('header b').textContent='Noise integration';
  check('A fresh round starts with no noise events or ripples',sequence()===0&&quiet());
  key('keydown','ShiftLeft');await wait(350);key('keyup','ShiftLeft');
  check('Holding Shift while stationary is silent',sequence()===0);
  mouse('mousedown');await until(()=>Number(data().consumeProgress)>.15,'Nibble quiet special hay');mouse('mouseup');
  check('Partially eating zero-happiness den hay is silent',sequence()===0&&quiet());
  key('keydown','Space');key('keyup','Space');await until(()=>data().grounded==='false','Tap a quiet small hop');await until(()=>data().grounded==='true','Land from small hop');
  check('A small tap jump creates no gameplay noise',sequence()===0);
  await walk(-14,12);
  key('keydown','Space');await until(()=>!game().getElementById('charge').hidden&&game().getElementById('charge-percent').textContent==='100%','Charge noisy long jump');
  const yaw=Number(data().camera.split(',')[0]),codes=[...(Math.abs(Math.cos(yaw))>.3?[Math.cos(yaw)>0?'KeyD':'KeyA']:[]),...(Math.abs(Math.sin(yaw))>.3?[Math.sin(yaw)>0?'KeyS':'KeyW']:[])];
  for(const code of codes)key('keydown',code);key('keyup','Space');
  await until(()=>sequence()>0,'Emit long-jump noise');
  check('Actual long jump emits a local five-metre event',data().lastNoiseKind==='long-jump'&&data().lastNoiseScope==='local'&&data().lastNoiseRadius==='5');
  check('Noisy actions produce ripple instances',Number(data().noiseRipples)>0);
  check('Gameplay hearing remains active with sound disabled',game().getElementById('sound').getAttribute('aria-label')==='Enable sound');
  await until(()=>pos()[0]>-10.7,'Escape den');for(const code of codes)key('keyup',code);await until(()=>data().grounded==='true','Land after long jump');
  await until(quiet,'Let the launch ripples fade');
  const beforeSprint=sequence();key('keydown','ShiftLeft');key('keydown','KeyD');await until(()=>sequence()>beforeSprint,'Sprint noisily');key('keyup','KeyD');key('keyup','ShiftLeft');
  check('Moving with Shift emits five-metre sprint noise',data().lastNoiseKind==='sprint'&&data().lastNoiseRadius==='5');
  click('menu-button');await until(()=>data().mode==='pause','Pause the ripple');
  const pausedSequence=sequence(),pausedRipples=data().noiseRipples;await wait(400);
  check('Pausing freezes noise emission and ripple lifetimes',sequence()===pausedSequence&&data().noiseRipples===pausedRipples);
  click('resume');await until(quiet,'Resume and fade old noise');
  check('Releasing sprint stops new emissions',sequence()===pausedSequence);
  // Approach the carrot itself: the sprint can nudge loose snacks, and the
  // older waypoint was close to the interaction radius after floor sliding.
  await walk(-12.3,17.4);await until(()=>data().consumeTarget==='carrot-0','Reach a happiness snack');
  const beforeEat=sequence(),snacks=data().consumableCount;mouse('mousedown');
  await until(()=>Number(data().consumeProgress)>.1&&sequence()>beforeEat,'Partially eat a noisy carrot');mouse('mouseup');
  check('Positive-happiness chewing is house-wide before completion',data().lastNoiseKind==='eat'&&data().lastNoiseScope==='house'&&data().lastNoiseRadius==='house');
  check('A cancelled noisy hold awards no score and keeps the item',data().happiness==='0'&&data().consumableCount===snacks);
  const cancelledSequence=sequence();await until(quiet,'Let chewing noise fade');
  check('Releasing the item stops further chewing pulses',sequence()===cancelledSequence);
  await walk(-10.5,17);await until(()=>data().consumeTarget==='fountain-living','Reach quiet drinking water');
  const beforeDrink=sequence();mouse('mousedown');await until(()=>data().drinking==='true'&&data().rabbitAction==='drink','Drink silently');
  await advance(.1);mouse('mouseup');
  check('Drinking fills the bladder without noise or ripples',data().bladder==='1.00'&&sequence()===beforeDrink&&quiet());
  key('keydown','ShiftLeft');key('keydown','KeyW');await until(()=>sequence()>beforeDrink,'Create noise before restart');key('keyup','KeyW');key('keyup','ShiftLeft');
  click('menu-button');click('reset');await until(()=>data().mode==='play'&&sequence()===0,'Restart clears noise');
  check('Restart clears both hearing events and visual ripples',quiet()&&sequence()===0);
  await advance(600);await until(()=>data().mode==='gameover','End the new day');
  check('Bedtime leaves a clean, silent new round',quiet()&&sequence()===0);
  check('Noise shader and game have no fatal error',game().getElementById('fatal').hidden);
  status.textContent='All noise checks passed.';
}
async function runLegendChecks() {
  document.title='Shidan · Item rewards QA';document.querySelector('header b').textContent='Item rewards';
  const board=game().getElementById('consumable-legend'),body=game().getElementById('consumable-legend-rows');
  const rows=()=>Object.fromEntries([...body.rows].map(row=>[row.dataset.legendItem,[row.cells[1].textContent,row.cells[2].textContent]]));
  const expected={'den-hay':['100%','0'],hay:['+40','0'],carrot:['+20','+10'],rabbitFood:['+20','+80'],bread:['+30','+20'],apple:['+25','+50'],banana:['+20','+40'],book:['+10','+20'],cake:['+50','+150'],noodles:['+30','+10'],wire:['0','+150'],cardboard:['+20','+100'],slippers:['0','+200'],poop:['+5','0'],water:['0','0']};
  check('Legend opens on the right side',board.open&&board.getBoundingClientRect().left>frame.clientWidth/2);
  check('All fifteen item rows show their exact energy and happiness rewards',body.rows.length===15&&Object.entries(expected).every(([id,reward])=>JSON.stringify(rows()[id])===JSON.stringify(reward)));
  check('Ordinary hay shows forty energy while special den hay keeps a full refill',rows().hay[0]==='+40'&&rows()['den-hay'][0]==='100%');
  const clock=game().getElementById('day-clock').getBoundingClientRect(),legend=board.getBoundingClientRect(),map=game().getElementById('map-button').getBoundingClientRect();
  check('Legend and map button leave the clock clear',legend.top>=clock.bottom&&map.top>=legend.bottom);
  check('Map access and legend remain on screen',legend.bottom<=frame.clientHeight&&map.bottom<=frame.clientHeight);
  const before=pos(),summary=board.querySelector('summary');summary.click();
  check('The reference board can collapse without hiding map access',!board.open&&game().getElementById('map-button').getBoundingClientRect().height>0);
  summary.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{code:'Space',bubbles:true}));
  summary.dispatchEvent(new frame.contentWindow.KeyboardEvent('keyup',{code:'Space',bubbles:true}));await wait(200);
  check('Legend keyboard navigation does not make Shidan jump',data().grounded==='true'&&pos()[1]===before[1]);
  if(!board.open)summary.click();
  check('Reopening keeps the same reward values',board.open&&body.rows.length===15&&rows().hay[0]==='+40');
  click('menu-button');click('reset');await until(()=>data().mode==='play','Restart with legend');
  check('Restart preserves the reward board and current hay balance',body.rows.length===15&&rows().hay[0]==='+40'&&data().energy==='100.00');
  check('Legend rendering has no fatal game error',game().getElementById('fatal').hidden);
  status.textContent='All item reward checks passed.';
}
document.getElementById('run').onclick=async()=>{
  results.replaceChildren();document.getElementById('run').disabled=true;
  try {
    const html=await(await fetch('/')).text();
    // Test-only clock injection; player state is driven solely by real handlers.
    const livePreview=new URLSearchParams(location.search).has('live');
    const normalMovement=livePreview||new URLSearchParams(location.search).has('cleanup');
    const seededResults=new URLSearchParams(location.search).has('results');
    const seed=seededResults?`const rows=[{id:'qa-high',name:'Sunny',score:100,finishedAt:'2026-01-01T00:00:00Z'},{id:'qa-mid',name:'Clover',score:20,finishedAt:'2026-01-02T00:00:00Z'},{id:'qa-tie',name:'Bunny',score:10,finishedAt:'2026-01-03T00:00:00Z'}];const store=new Map([['shidans-adventure.leaderboard.v1',JSON.stringify(rows)]]);const scores={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};`:'';
    const entry=`<script type="module">import {boot} from '/src/main.js';let now=0;document.addEventListener('qa-advance',event=>now+=event.detail*1000);${seed}boot({clockNow:${livePreview?'()=>performance.now()':'()=>now'},scoreStorage:${seededResults?'scores':'null'},maxNpcMovementPerFrame:${normalMovement?'.1':'Infinity'}});<\/script>`;
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    frame.srcdoc=html.replace('<head>','<head><base href="/">').replace('<script type="module" src="./src/start.js"></script>',entry);
    await loaded;await until(()=>data()?.ready==='true','Load real game');
    canvas().requestPointerLock=()=>Promise.reject(new frame.contentWindow.DOMException('QA fallback','NotAllowedError'));
    // A clean, full-window preview keeps visual QA out of the player's saved
    // scores and name, while retaining exactly the same production game.
    if(new URLSearchParams(location.search).has('preview')) {
      document.querySelector('header').hidden=true;results.hidden=true;
      Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});
      game().getElementById('player-name').value='Preview';return;
    }
    game().getElementById('player-name').value='Body QA';click('play');await until(()=>data().mode==='play','Start adventure');
    if(new URLSearchParams(location.search).has('pursuit')) {await runPursuitChecks();return;}
    if(new URLSearchParams(location.search).has('minimap')) {await runMinimapChecks();return;}
    if(new URLSearchParams(location.search).has('mistress')) {await runMistressChecks();return;}
    if(new URLSearchParams(location.search).has('noise')) {await runNoiseChecks();return;}
    if(new URLSearchParams(location.search).has('legend')) {await runLegendChecks();return;}
    check('Starts with ten carried balls, no world balls and an empty bladder',data().poopSupply==='10'&&data().poopCount==='0'&&data().bladder==='0.00');
    check('Original house banner is removed',!game().querySelector('.build-label'));
    check('Curiosity panel is removed and map access remains',!game().querySelector('.quest')&&!!game().getElementById('map-button'));
    const rect=game().getElementById('day-clock').getBoundingClientRect();
    check('Time and happiness share the upper-right panel',rect.left>frame.clientWidth/2&&rect.top<150&&game().getElementById('day-clock').contains(game().getElementById('happiness-value')));
    mouse('mousedown',2);mouse('mousedown',2);await wait(120);
    check('Rapid right clicks spend only one carried ball',data().poopSupply==='9'&&data().poopCount==='1');
    await advance(.999);key('keydown','KeyP');key('keyup','KeyP');await wait(100);
    check('Poop remains blocked before one second',data().poopSupply==='9');
    await advance(.001);key('keydown','KeyP');key('keyup','KeyP');await wait(100);
    check('P shares the cooldown and works at exactly one second',data().poopSupply==='8'&&data().poopCount==='2');
    check('Poop cooldown has a visible one-second timer',game().getElementById('poop-cooldown').textContent.includes('1.0s'));
    check('Cooldown text uses the larger font',parseFloat(frame.contentWindow.getComputedStyle(game().getElementById('poop-cooldown')).fontSize)>=14&&parseFloat(frame.contentWindow.getComputedStyle(game().getElementById('pee-cooldown')).fontSize)>=14);
    if(!new URLSearchParams(location.search).has('actions')) {
    for(let i=0;i<8;i++){await advance(1);mouse('mousedown',2);}
    await wait(150);check('Ten actions empty supply independently of map count',data().poopSupply==='0'&&data().poopCount==='10');
    await advance(1);mouse('mousedown',2);await wait(100);check('Empty supply prevents further drops',data().poopCount==='10');
    await until(()=>data().consumeTarget.startsWith('poop-'),'Reach a dropped ball');
    mouse('mousedown');await until(()=>data().lastConsumed==='poop','Eat dropped ball');mouse('mouseup');
    check('Eating removes a ball without granting carried supply',data().poopCount==='9'&&data().poopSupply==='0');
    const yaw=Number(data().camera.split(',')[0]);mouse('mousedown');
    frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent('mousemove',{clientX:300+yaw/.003,clientY:400}));mouse('mouseup');
    await walk(-17.2,12.1);await until(()=>data().consumeTarget==='den-hay','Reach special hay');
    mouse('mousedown');await until(()=>data().lastConsumedId==='den-hay','Eat den hay');mouse('mouseup');
    check('Special hay grants three balls on the starting visit',data().poopSupply==='3'&&data().denHayPoopReady==='false');
    mouse('mousedown');await until(()=>Number(data().consumeProgress)>=.3,'Eat hay again');await until(()=>Number(data().consumeProgress)===0,'Finish repeated hay');mouse('mouseup');
    check('Repeated den hay does not grant more balls during one stay',data().poopSupply==='3');
    }
    await walk(-14,12);
    key('keydown','Space');await until(()=>!game().getElementById('charge').hidden&&game().getElementById('charge-percent').textContent==='100%','Charge den escape');
    const escapeYaw=Number(data().camera.split(',')[0]),escapeKeys=[...(Math.abs(Math.cos(escapeYaw))>.3?[Math.cos(escapeYaw)>0?'KeyD':'KeyA']:[]),...(Math.abs(Math.sin(escapeYaw))>.3?[Math.sin(escapeYaw)>0?'KeyS':'KeyW']:[])];
    for(const code of escapeKeys)key('keydown',code);key('keyup','Space');
    await until(()=>pos()[0]>-10.7,'Escape den');for(const code of escapeKeys)key('keyup',code);await until(()=>data().grounded==='true','Land');
    if(!new URLSearchParams(location.search).has('actions')) {
    await walk(-12,17.1);await until(()=>data().consumeTarget==='carrot-0','Reach carrot');
    mouse('mousedown');await until(()=>data().rabbitAction==='eat','Show eating animation');await until(()=>data().lastConsumedId==='carrot-0','Eat carrot');mouse('mouseup');
    check('Eating still awards happiness before restart',Number(data().happiness)===10);
    }
    await walk(-10.5,17);await until(()=>data().consumeTarget==='fountain-living','Approach living-room fountain');
    mouse('mousedown');await until(()=>data().rabbitAction==='drink','Show drinking animation');
    check('Drinking activates the rabbit animation',data().drinking==='true'&&data().rabbitAction==='drink');
    await advance(.1);mouse('mouseup');await wait(120);
    check('Exactly 0.1 active second of drinking fills exactly 1%',data().bladder==='1.00'&&data().drinking==='false');
    check('Partial drinking leaves 99% in this fountain and all other fountains untouched',data().fountainRemaining==='99.00'&&Object.entries(JSON.parse(data().fountainWater)).every(([id,value])=>id==='fountain-living'||value===100));
    key('keydown','KeyQ');key('keyup','KeyQ');
    check('Q below a full bladder leaves water, cooldown and puddles unchanged',data().bladder==='1.00'&&data().peeing==='false'&&data().puddleCount==='0'&&data().drinkCooldown==='0.000'&&data().fountainRemaining==='99.00');
    check('The HUD requires a full bladder before peeing',game().getElementById('pee-cooldown').textContent==='Q · fill to 100%');
    mouse('mousedown');await advance(9.899);mouse('mouseup');await wait(120);
    key('keydown','KeyQ');key('keyup','KeyQ');
    check('A 99.99% bladder is still blocked without starting a cooldown',data().bladder==='99.99'&&data().peeing==='false'&&data().puddleCount==='0'&&data().drinkCooldown==='0.000');
    mouse('mousedown');await advance(.001);mouse('mouseup');await wait(120);
    check('Drinking caps at 100% and stops at full bladder',data().bladder==='100.00'&&data().drinking==='false');
    check('One full bladder depletes exactly one fountain',data().fountainRemaining==='0.00'&&game().getElementById('consume-action').textContent==='Empty · refills next round');
    key('keydown','KeyQ');key('keyup','KeyQ');await wait(120);
    check('Q starts a one-second pee and a sixty-second cooldown',data().bladder==='100.00'&&data().peeing==='true'&&data().puddleCount==='1'&&data().drinkCooldown==='60.000');
    await until(()=>data().rabbitAction==='pee','Show pee animation');
    const beforePee=pos(),supply=data().poopSupply;
    for(const code of ['KeyW','ShiftLeft','Space','KeyR','KeyP','KeyQ','KeyM','KeyV']) {key('keydown',code);key('keyup',code);}
    mouse('mousedown',2);mouse('mousedown');click('home');
    await advance(.5);mouse('mouseup');await until(()=>data().peeProgress==='0.500','Halfway through pee');
    check('Bladder drains linearly over the pee second',data().bladder==='50.00'&&data().peeing==='true');
    check('Pee blocks movement, jump, home, poop, drinking, eating and view actions',Math.hypot(pos()[0]-beforePee[0],pos()[1]-beforePee[1],pos()[2]-beforePee[2])<.03&&data().poopSupply===supply&&data().drinking==='false'&&data().consumeProgress==='0.00'&&game().getElementById('atlas').hidden&&game().getElementById('survey').hidden);
    check('Pee progress and decimal cooldown are visible',!game().getElementById('pee-progress').hidden&&game().getElementById('pee-cooldown').textContent.includes('0.5s'));
    click('menu-button');await until(()=>data().mode==='pause','Pause pee');await advance(100);
    check('Pausing freezes pee progress and its cooldown',data().bladder==='50.00'&&data().peeProgress==='0.500'&&data().drinkCooldown==='59.500');click('resume');
    await advance(.499);await until(()=>data().peeProgress==='0.999','Just before pee completes');
    check('Pee action remains locked before one second',data().peeing==='true'&&data().bladder==='0.10');
    await advance(.001);await until(()=>data().peeing==='false','Finish pee at one second');
    check('Pee finishes at exactly one second with 59 seconds cooldown',data().bladder==='0.00'&&data().drinkCooldown==='59.000');
    mouse('mousedown');mouse('mouseup');check('Cooldown prevents drinking',data().bladder==='0.00');
    await advance(58.9);mouse('mousedown');mouse('mouseup');check('Cooldown stays active at 59.9 seconds',data().bladder==='0.00'&&data().drinkCooldown==='0.100');
    await advance(.1);mouse('mousedown');await advance(.1);mouse('mouseup');await wait(120);
    check('Cooldown ends at sixty seconds while a depleted fountain stays empty',data().bladder==='0.00'&&data().drinkCooldown==='0.000'&&data().fountainRemaining==='0.00');
    await walk(-7,17);await walk(-3.5,17);await walk(-3.5,14.8);await until(()=>data().consumeTarget==='fountain-foyer','Reach another room’s fountain');
    check('Another room has its own full reservoir',data().fountainRemaining==='100.00');
    mouse('mousedown');await advance(.1);mouse('mouseup');await wait(120);
    check('The next fountain fills the bladder independently without replenishing the empty fountain',data().bladder==='1.00'&&data().fountainRemaining==='99.00'&&JSON.parse(data().fountainWater)['fountain-living']===0);
    key('keydown','KeyQ');key('keyup','KeyQ');
    check('Partial bladder still cannot pee after an earlier cooldown expires',data().peeing==='false'&&data().puddleCount==='1'&&data().bladder==='1.00'&&data().drinkCooldown==='0.000');
    mouse('mousedown');await advance(9.9);mouse('mouseup');
    key('keydown','KeyQ');key('keyup','KeyQ');await wait(100);check('Another full bladder can pee again while earlier puddles persist',data().puddleCount==='2'&&data().peeing==='true');
    click('menu-button');await until(()=>data().mode==='pause','Open restart menu');
    check('Escape menu offers Restart game',game().getElementById('reset').textContent==='Restart game');
    click('reset');await until(()=>data().mode==='play'&&data().dayRemaining==='600.00','Restart a partially peed round');
    check('Restart clears the active pee, bladder, balls, puddles and cooldowns',data().peeing==='false'&&data().bladder==='0.00'&&data().poopCount==='0'&&data().poopSupply==='10'&&data().puddleCount==='0'&&data().drinkCooldown==='0.000');
    check('Restart preserves the name and restores a fresh complete round',data().happiness==='0'&&data().energy==='100.00'&&data().consumableCount==='40'&&data().chewableCount==='22'&&data().discoveries==='0'&&data().freeDenJump==='true'&&game().getElementById('score-player').textContent==='Body QA'&&Math.hypot(pos()[0]+16,pos()[2]-12)<.03);
    check('Restart restores all fourteen fountain reservoirs',Object.values(JSON.parse(data().fountainWater)).length===14&&Object.values(JSON.parse(data().fountainWater)).every(value=>value===100));
    await advance(600);await until(()=>data().mode==='gameover','Finish day');
    click('game-over-new');await until(()=>data().mode==='play','Start the next day from results');
    check('New day resets supply, bladder, puddles and cooldowns',data().poopSupply==='10'&&data().poopCount==='0'&&data().bladder==='0.00'&&data().puddleCount==='0'&&data().drinkCooldown==='0.000');
    check('No fatal browser error',game().getElementById('fatal').hidden);status.textContent='All body resource checks passed.';
  } catch(error) {
    const li=document.createElement('li');li.className='fail';li.textContent=error.message;results.append(li);status.textContent='Failed';console.error(error);
  } finally {document.getElementById('run').disabled=false;}
};
if(new URLSearchParams(location.search).has('preview')) document.getElementById('run').click();
