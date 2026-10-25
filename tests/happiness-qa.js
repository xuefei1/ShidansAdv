const frame=document.getElementById('app'),results=document.getElementById('results'),status=document.getElementById('status');
const prefix=`shidans-adventure.qa.${crypto.randomUUID()}.`,ownedKeys=new Set();
// Exercise actual browser persistence under unique test-only keys. Never write
// to the player's leaderboard; remove only this runner's own keys afterwards.
const saved={get:key=>localStorage.getItem(prefix+key)??undefined,clear:()=>{for(const key of ownedKeys)localStorage.removeItem(prefix+key);ownedKeys.clear();}};
window.happinessQAStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>{localStorage.setItem(prefix+key,value);ownedKeys.add(key);}};
window.addEventListener('pagehide',()=>saved.clear());
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const game=()=>frame.contentDocument,canvas=()=>game().getElementById('game');
async function until(condition,label) {
  status.textContent=label;const deadline=performance.now()+120000;
  while(!condition()) {if(performance.now()>deadline || !game().getElementById('fatal').hidden) throw Error(`Timed out: ${label}`);await wait(40);}
}
function check(label,passed) {
  const li=document.createElement('li');li.className=passed?'pass':'fail';li.textContent=`${passed?'PASS':'FAIL'}: ${label}`;results.append(li);
  if(!passed) throw Error(label);
}
const key=(type,code)=>canvas().dispatchEvent(new frame.contentWindow.KeyboardEvent(type,{code,bubbles:true}));
const mouse=type=>canvas().dispatchEvent(new frame.contentWindow.MouseEvent(type,{button:0,clientX:300,clientY:400,bubbles:true}));
const pos=()=>canvas().dataset.position.split(',').map(Number);
const score=()=>Number(canvas().dataset.happiness);
const progress=()=>Number(canvas().dataset.consumeProgress);
const click=id=>game().getElementById(id).click();
const advance=seconds=>game().dispatchEvent(new frame.contentWindow.CustomEvent('qa-advance',{detail:seconds}));
async function load() {
  const html=await(await fetch('/')).text();
  const entry=`<script type="module">import {boot} from '/src/main.js';let offset=0;document.addEventListener('qa-advance',e=>offset+=e.detail*1000);boot({clockNow:()=>offset,scoreStorage:parent.happinessQAStorage});<\/script>`;
  const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  frame.srcdoc=html.replace('<head>','<head><base href="/">').replace('<script type="module" src="./src/start.js"></script>',entry);
  await loaded;await until(()=>canvas()?.dataset.ready==='true','Prepare the real game');
  canvas().requestPointerLock=()=>Promise.reject(new frame.contentWindow.DOMException('QA fallback','NotAllowedError'));
}
async function walk(x,z) {
  const held=new Set();
  const setKeys=codes=>{for(const c of [...held])if(!codes.includes(c)){key('keyup',c);held.delete(c);}for(const c of codes)if(!held.has(c)){key('keydown',c);held.add(c);}};
  const deadline=performance.now()+120000;
  status.textContent=`Walking to (${x}, ${z})`;
  try {
    while(performance.now()<deadline) {
      const p=pos(),dx=x-p[0],dz=z-p[2];
      if(Math.hypot(dx,dz)<.3) {setKeys([]);await wait(700);if(Math.hypot(x-pos()[0],z-pos()[2])<.6)return;}
      setKeys([...(Math.abs(dx)>.17?[dx>0?'KeyD':'KeyA']:[]),...(Math.abs(dz)>.17?[dz>0?'KeyS':'KeyW']:[])]);
      await wait(40);
    }
    throw Error(`Could not walk to ${x}, ${z}: ${pos()}`);
  } finally {setKeys([]);}
}
document.getElementById('run').onclick=async()=>{
  results.replaceChildren();saved.clear();document.getElementById('run').disabled=true;
  try {
    await load();click('play');check('Blank name cannot start a round',!game().getElementById('welcome').hidden);
    game().getElementById('player-name').value='Happiness QA';click('play');await until(()=>canvas().dataset.mode==='play','Start named run');
    check('Named round starts with zero happiness and all 22 chewables',score()===0&&canvas().dataset.chewableCount==='22');
    check('Special hay prompt uses its four-second reward-based hold',game().getElementById('consume-action').textContent.includes('4 seconds'));
    mouse('mousedown');await until(()=>canvas().dataset.lastConsumedId==='den-hay','Eat special hay');mouse('mouseup');check('Permanent hay never farms happiness',score()===0);
    const yaw=Number(canvas().dataset.camera.split(',')[0]);mouse('mousedown');
    frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent('mousemove',{clientX:300+yaw/.003,clientY:400}));mouse('mouseup');
    key('keydown','Space');await until(()=>game().getElementById('charge-percent').textContent==='100%','Charge escape');key('keyup','Space');key('keydown','KeyD');
    await until(()=>pos()[0]>-11,'Escape den');key('keyup','KeyD');await until(()=>canvas().dataset.grounded==='true','Land');
    check('First outward den escape spends no energy and uses its daily allowance',Number(canvas().dataset.energy)===100&&canvas().dataset.freeDenJump==='false');
    await walk(-11.7,17.6);await until(()=>canvas().dataset.consumeTarget==='carrot-0','Reach carrot');
    check('Carrot prompt includes both rewards',game().getElementById('consume-energy').textContent==='+20 energy · +10 happiness');
    const carrotPosition=canvas().dataset.consumePosition;
    key('keydown','KeyA');await until(()=>canvas().dataset.consumePosition!==carrotPosition&&canvas().dataset.consumeTarget==='carrot-0','Nudge the carrot');key('keyup','KeyA');
    check('Shidan pushes the carrot and can still eat it',canvas().dataset.consumePosition!==carrotPosition);
    mouse('mousedown');await until(()=>progress()>=.3,'Partially eat carrot');mouse('mouseup');await until(()=>progress()===0,'Cancel hold');check('Partial chewing grants no happiness',score()===0);
    mouse('mousedown');await until(()=>canvas().dataset.lastConsumedId==='carrot-0','Finish carrot');mouse('mouseup');check('Finished carrot grants 10 happiness',score()===10);
    check('Ceilings and roof remain visible in normal play',canvas().dataset.roofVisible==='true'&&canvas().dataset.interiorCeilingsVisible==='true');
    click('view');await until(()=>canvas().dataset.roofVisible==='false','Open cutaway');
    check('House view can expose the rooms',canvas().dataset.interiorCeilingsVisible==='false');
    click('roof-view');await until(()=>canvas().dataset.roofVisible==='true','Show full roof');
    check('Show roof reveals the complete exterior',canvas().dataset.interiorCeilingsVisible==='true'&&canvas().dataset.visibleFloor==='1');
    click('view');await until(()=>canvas().dataset.roofVisible==='true'&&game().getElementById('survey').hidden,'Return to normal play');
    click('menu-button');click('back-title');check('Manual title does not save an unfinished run',saved.get('shidans-adventure.leaderboard.v1')===undefined);
    check('Active run keeps the original name',game().getElementById('player-name').disabled&&game().getElementById('player-name').value==='Happiness QA');
    click('play');await until(()=>canvas().dataset.mode==='play','Continue named run');check('Continuing preserves happiness',score()===10);
    check('Home and title do not renew the used free jump',canvas().dataset.freeDenJump==='false');
    advance(480);await until(()=>canvas().dataset.dayPhase==='Night','Night');check('Happiness survives the day-night transition',score()===10);
    advance(120);await until(()=>canvas().dataset.mode==='title','Bedtime saves score');
    check('Bedtime records the name and score before reset',canvas().dataset.lastScore==='10'&&canvas().dataset.lastPlayer==='Happiness QA'&&score()===0);
    check('Main screen displays the completed score',game().getElementById('day-ended').textContent.includes('earned 10 happiness'));
    click('show-leaderboard');check('Leaderboard shows the completed run',game().getElementById('leaderboard-rows').textContent.includes('Happiness QA10'));
    await load();click('show-leaderboard');check('Saved score survives a full game reload',game().getElementById('leaderboard-rows').textContent.includes('Happiness QA10'));click('close-leaderboard');
    game().getElementById('player-name').value='Second player';click('play');await until(()=>canvas().dataset.mode==='play','Start second round');check('New player starts at zero with ten minutes',score()===0&&canvas().dataset.dayRemaining==='600.00');
    check('A fresh day restores the free den escape',canvas().dataset.freeDenJump==='true');
    advance(600);await until(()=>canvas().dataset.mode==='title','Save zero-score round');click('show-leaderboard');
    check('Zero scores are saved and scores sort descending',game().querySelectorAll('#leaderboard-rows tr').length===2&&game().querySelector('#leaderboard-rows tr').textContent.includes('Happiness QA10'));
    check('No fatal game error',game().getElementById('fatal').hidden);status.textContent='All happiness browser checks passed.';
  } catch(error) {const li=document.createElement('li');li.className='fail';li.textContent=error.message;results.append(li);status.textContent=error.message;console.error(error);}
  finally {saved.clear();mouse('mouseup');for(const c of ['Space','KeyD','KeyA','KeyW','KeyS'])key('keyup',c);document.getElementById('run').disabled=false;}
};
await load();
