const frame=document.getElementById('app'),results=document.getElementById('results'),status=document.getElementById('status');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const game=()=>frame.contentDocument,canvas=()=>game().getElementById('game'),data=()=>canvas().dataset;
const key=(type,code)=>canvas().dispatchEvent(new frame.contentWindow.KeyboardEvent(type,{code,bubbles:true}));
const mouse=(type,button=0)=>canvas().dispatchEvent(new frame.contentWindow.MouseEvent(type,{button,clientX:300,clientY:400,bubbles:true}));
const click=id=>game().getElementById(id).click(),pos=()=>data().position.split(',').map(Number);
const advance=async seconds=>{game().dispatchEvent(new frame.contentWindow.CustomEvent('qa-advance',{detail:seconds}));await wait(100);};
function check(label,passed) {
  const li=document.createElement('li');li.className=passed?'pass':'fail';li.textContent=`${passed?'PASS':'FAIL'}: ${label}`;results.append(li);
  if(!passed) throw Error(label);
}
async function until(condition,label) {
  status.textContent=label;const deadline=performance.now()+240000;
  while(!condition()) {status.dataset.game=JSON.stringify(data());if(performance.now()>deadline || !game().getElementById('fatal').hidden) throw Error(`Timed out: ${label} (${JSON.stringify(data())})`);await wait(40);}
}
async function walk(x,z) {
  const held=new Set(),deadline=performance.now()+240000;
  const setKeys=codes=>{for(const code of [...held])if(!codes.includes(code)){key('keyup',code);held.delete(code);}for(const code of codes)if(!held.has(code)){key('keydown',code);held.add(code);}};
  status.textContent=`Walking to (${x}, ${z})`;
  try {
    while(performance.now()<deadline) {
      const p=pos(),dx=x-p[0],dz=z-p[2];
      if(Math.hypot(dx,dz)<.23) {setKeys([]);await wait(600);if(Math.hypot(x-pos()[0],z-pos()[2])<.23)return;}
      const yaw=Number(data().camera.split(',')[0]),forward=-Math.sin(yaw)*dx-Math.cos(yaw)*dz,right=Math.cos(yaw)*dx-Math.sin(yaw)*dz;
      setKeys([...(Math.abs(right)>.14?[right>0?'KeyD':'KeyA']:[]),...(Math.abs(forward)>.14?[forward>0?'KeyW':'KeyS']:[])]);await wait(40);
    }
    throw Error(`Could not walk to ${x},${z}: ${pos()}`);
  } finally {setKeys([]);}
}
document.getElementById('run').onclick=async()=>{
  results.replaceChildren();document.getElementById('run').disabled=true;
  try {
    const html=await(await fetch('/')).text();
    // Test-only clock injection; player state is driven solely by real handlers.
    const entry=`<script type="module">import {boot} from '/src/main.js';let now=0;document.addEventListener('qa-advance',event=>now+=event.detail*1000);boot({clockNow:()=>now,scoreStorage:null});<\/script>`;
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
    check('Special hay grants ten balls on the starting visit',data().poopSupply==='10'&&data().denHayPoopReady==='false');
    mouse('mousedown');await until(()=>Number(data().consumeProgress)>=.3,'Eat hay again');await until(()=>Number(data().consumeProgress)===0,'Finish repeated hay');mouse('mouseup');
    check('Repeated den hay does not grant more balls during one stay',data().poopSupply==='10');
    }
    await walk(-14,12);
    key('keydown','Space');await until(()=>game().getElementById('charge-percent').textContent==='100%','Charge den escape');
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
    mouse('mousedown');await advance(9.9);mouse('mouseup');await wait(120);
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
    key('keydown','KeyQ');key('keyup','KeyQ');await wait(100);check('Puddles persist across subsequent pees',data().puddleCount==='2');
    click('menu-button');await until(()=>data().mode==='pause','Open restart menu');
    check('Escape menu offers Restart game',game().getElementById('reset').textContent==='Restart game');
    click('reset');await until(()=>data().mode==='play'&&data().dayRemaining==='600.00','Restart a partially peed round');
    check('Restart clears the active pee, bladder, balls, puddles and cooldowns',data().peeing==='false'&&data().bladder==='0.00'&&data().poopCount==='0'&&data().poopSupply==='10'&&data().puddleCount==='0'&&data().drinkCooldown==='0.000');
    check('Restart preserves the name and restores a fresh complete round',data().happiness==='0'&&data().energy==='100.00'&&data().consumableCount==='41'&&data().chewableCount==='22'&&data().discoveries==='0'&&data().freeDenJump==='true'&&game().getElementById('score-player').textContent==='Body QA'&&Math.hypot(pos()[0]+16,pos()[2]-12)<.03);
    check('Restart restores all fourteen fountain reservoirs',Object.values(JSON.parse(data().fountainWater)).length===14&&Object.values(JSON.parse(data().fountainWater)).every(value=>value===100));
    await advance(600);await until(()=>data().mode==='title','Finish day');
    check('New day resets supply, bladder, puddles and cooldowns',data().poopSupply==='10'&&data().poopCount==='0'&&data().bladder==='0.00'&&data().puddleCount==='0'&&data().drinkCooldown==='0.000');
    check('No fatal browser error',game().getElementById('fatal').hidden);status.textContent='All body resource checks passed.';
  } catch(error) {
    const li=document.createElement('li');li.className='fail';li.textContent=error.message;results.append(li);status.textContent='Failed';console.error(error);
  } finally {document.getElementById('run').disabled=false;}
};
if(new URLSearchParams(location.search).has('preview')) document.getElementById('run').click();
