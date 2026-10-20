const frame=document.getElementById('app'),results=document.getElementById('results');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const game=()=>frame.contentDocument, canvas=()=>game().getElementById('game');
async function until(condition,label) {
  const deadline=performance.now()+20000;
  while(!condition()) { if(performance.now()>deadline) throw new Error(`Timed out: ${label}`); await wait(50); }
}
function check(label,passed) {
  const li=document.createElement('li'); li.className=passed?'pass':'fail'; li.textContent=`${passed?'PASS':'FAIL'}: ${label}`; results.append(li);
  if(!passed) throw new Error(label);
}
function advance(seconds) { game().dispatchEvent(new frame.contentWindow.CustomEvent('qa-advance',{detail:seconds})); }
const remaining=()=>Number(canvas().dataset.dayRemaining);
async function loadGame() {
  const html=await (await fetch('/')).text();
  const entry=`<script type="module">
    import {boot} from '/src/main.js';
    let offset=0;
    document.addEventListener('qa-advance',event=>{offset+=Math.max(0,Number(event.detail)||0)*1000;});
    boot({clockNow:()=>offset}).catch(error=>{console.error(error); document.getElementById('fatal').hidden=false;});
  <\/script>`;
  const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  frame.srcdoc=html.replace('<head>','<head><base href="/">').replace('<script type="module" src="./src/start.js"></script>',entry);
  await loaded; await until(()=>canvas()?.dataset.ready==='true','scene preparation');
  // Deterministic drag fallback; tests still exercise real input/menu handlers.
  canvas().requestPointerLock=()=>Promise.reject(new frame.contentWindow.DOMException('QA fallback','NotAllowedError'));
  game().getElementById('play').click(); await until(()=>canvas().dataset.mode==='play','play');
}
async function preview(seconds) {
  if(canvas()?.dataset.mode!=='play' || remaining()<600-seconds) await loadGame();
  if(!game().getElementById('pause').hidden) game().getElementById('resume').click();
  advance(Math.max(0,seconds-(600-remaining()))+.02);
}
document.getElementById('noon').onclick=()=>{results.replaceChildren();return loadGame();};
document.getElementById('dusk').onclick=()=>{results.replaceChildren();return preview(390);};
document.getElementById('night').onclick=()=>{results.replaceChildren();return preview(480);};
document.getElementById('finish').onclick=()=>advance(remaining()+1);
document.getElementById('run').onclick=async()=>{
  results.replaceChildren(); document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try {
    await loadGame();
    check('A fresh adventure starts at noon with ten minutes',remaining()>599 && canvas().dataset.dayPhase==='Noon');
    advance(60); await until(()=>remaining()<541,'minute passes');
    check('A delayed frame still counts a full real minute',remaining()===540);
    const pausedModes=[
      ['Pause menu',()=>game().getElementById('menu-button').click(),()=>game().getElementById('resume').click()],
      ['Map',()=>game().getElementById('map-button').click(),()=>game().getElementById('close-atlas').click()],
      ['House view',()=>game().getElementById('view').click(),()=>game().getElementById('view').click()],
      ['Title',()=>{game().getElementById('menu-button').click();game().getElementById('back-title').click();},()=>game().getElementById('play').click()],
    ];
    for(const [name,open,close] of pausedModes) {
      open(); await wait(180); const before=remaining(); advance(30); await wait(180);
      check(`${name} freezes the countdown`,Math.abs(remaining()-before)<.05);
      close(); advance(2); await until(()=>remaining()<before-1.5,'resume');
      check(`${name} resumes without charging paused time`,remaining()>before-3);
    }
    const beforeHome=remaining(); game().getElementById('home').click(); await wait(150);
    check('Returning to the den preserves the deadline',remaining()<=beforeHome && remaining()>beforeHome-1);
    const revision=canvas().dataset.shadowRevision;
    const programs=canvas().dataset.shaderPrograms;
    await preview(390); await until(()=>canvas().dataset.dayPhase==='Dusk','dusk');
    check('Dusk gradually turns on the house lamps',Number(canvas().dataset.lamps)>0 && Number(canvas().dataset.lamps)<1);
    await preview(480); await until(()=>canvas().dataset.dayPhase==='Night','night');
    check('At two minutes remaining it is fully night',remaining()<=120 && Number(canvas().dataset.lamps)===1);
    check('Daylight changes reuse the cached sunlight shadow',canvas().dataset.shadowRevision===revision);
    check('Night uses the precompiled shaders without new variants',canvas().dataset.shaderPrograms===programs);
    const w=frame.contentWindow;
    canvas().dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyP',bubbles:true}));
    canvas().dispatchEvent(new w.KeyboardEvent('keyup',{code:'KeyP',bubbles:true}));
    await until(()=>canvas().dataset.poopCount==='1','leave a ball');
    advance(remaining()+1); await until(()=>canvas().dataset.mode==='title','automatic timeout');
    check('Timeout automatically returns to the main screen',!game().getElementById('welcome').hidden && !game().getElementById('day-ended').hidden);
    check('Timeout clears the old run and restores noon',canvas().dataset.poopCount==='0' && canvas().dataset.energy==='100.00' && canvas().dataset.consumableCount==='41' && canvas().dataset.dayPhase==='Noon');
    game().getElementById('play').click(); await until(()=>canvas().dataset.mode==='play','new adventure');
    check('The next adventure starts with a fresh ten minutes',remaining()>599 && game().getElementById('day-ended').hidden);
    check('No fatal browser error',game().getElementById('fatal').hidden);
  } catch(error) {
    const li=document.createElement('li');li.className='fail';li.textContent=error.message;results.append(li);console.error(error);
  } finally { document.querySelectorAll('button').forEach(b=>b.disabled=false); }
};
document.querySelectorAll('button').forEach(b=>b.disabled=true);
await loadGame();
document.querySelectorAll('button').forEach(b=>b.disabled=false);
