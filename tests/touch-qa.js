const frame = document.querySelector('#app'), status = document.querySelector('#status'), results = document.querySelector('#results');
const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
const game = () => frame.contentDocument, win = () => frame.contentWindow, element = id => game().getElementById(id);
const data = () => element('game')?.dataset, position = () => data().position.split(',').map(Number);
const visible = id => element(id).getBoundingClientRect().width > 0;
function check(label, pass, detail = '') {
  const item = document.createElement('li'); item.textContent = (pass ? 'PASS: ' : 'FAIL: ') + label + (detail ? ' — ' + detail : '');
  if (!pass) item.className = 'fail';
  results.append(item);
  if (!pass) throw Error(item.textContent);
}
async function until(predicate, label) {
  status.textContent = label;
  const start = performance.now();
  while (!predicate()) {
    if (element('fatal')?.hidden === false || performance.now() - start > 45000)
      throw Error(label + ' at ' + data()?.position);
    await delay(25);
  }
}
function fits(id) {
  const bounds = element(id).getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.top >= -1 &&
    bounds.right <= win().innerWidth + 1 && bounds.bottom <= win().innerHeight + 1;
}
function center(id) {
  const bounds = element(id).getBoundingClientRect();
  return { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
}
function hit(id) {
  const {clientX, clientY} = center(id);
  return element(id).contains(game().elementFromPoint(clientX, clientY));
}
function pointer(type, id, target, coords) {
  target.dispatchEvent(new (win().PointerEvent)(type, {bubbles:true, cancelable:true, pointerType:'touch',
    pointerId:id, button:type === 'pointermove' ? -1 : 0, buttons:type === 'pointerup' || type === 'pointercancel' ? 0 : 1, ...coords}));
}
function setPreference(id, value) {
  element(id).value = value;
  element(id).dispatchEvent(new (win().Event)('change', {bubbles:true}));
}
async function changeMode(value) {
  element('menu-button').click();
  setPreference('input-preference-pause', value); element('resume').click();
  await until(() => data().mode === 'play' && game().body.dataset.inputMode === value, 'Switch control preference to ' + value);
}
async function resize(width, height) {
  frame.width = width; frame.height = height;
  await until(() => win().innerWidth === width && win().innerHeight === height, 'Resize preview');
  await new Promise(resolve => win().requestAnimationFrame(() => win().requestAnimationFrame(resolve)));
}
async function run() {
  const html = await (await fetch('../')).text();
  const entry = `<script type="module">import {boot} from '/src/main.js';
    const values=new Map();let elapsed=0;document.addEventListener('qa-advance',event=>elapsed+=event.detail*1000);
    boot({scoreStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},clockNow:()=>elapsed});<\/script>`;
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once:true}));
  frame.srcdoc = html.replace('<head>', '<head><base href="/">').replace('<script type="module" src="./src/start.js"></script>', entry);
  await loaded;
  await until(() => data()?.ready === 'true', 'Prepare the actual game');
  element('game').requestPointerLock = () => Promise.reject(new Error('QA tests drag fallback'));
  element('player-name').value = 'Touch QA'; setPreference('input-preference-title', 'desktop'); element('play').click();
  await until(() => data().mode === 'play', 'Start a small-screen keyboard game');
  const chips = ['day-countdown', 'happiness-value', 'energy-value', 'bladder-value', 'poop-count'];
  check('Phone HUD fits with keyboard and mouse, without drawing thumb controls', !visible('touch-stick') && chips.every(fits));
  const clockWidth = element('day-clock').getBoundingClientRect().width;
  await changeMode('touch');
  check('Choosing touch on the same phone keeps the compact clock', visible('touch-stick') && element('day-clock').getBoundingClientRect().width === clockWidth);
  const controls = ['touch-stick', 'touch-jump', 'touch-interact', 'touch-sprint', 'touch-poop', 'touch-pee', 'menu-button'];
  for (const [width, height] of [[667,375],[844,390],[1280,800]]) {
    await resize(width,height);
    const covered = controls.filter(id => !fits(id) || !hit(id));
    check(`Thumb controls and pause fit and receive input at ${width} × ${height}`, !covered.length, covered.join(', '));
  }
  await changeMode('desktop');
  check('Large viewport also supports keyboard without touch controls', !visible('touch-stick'));
  await changeMode('touch'); await resize(844,390);
  const jumpCenter = center('touch-jump');
  pointer('pointerdown',2,element('touch-jump'),jumpCenter);
  await until(() => !element('charge').hidden && element('charge-percent').textContent === '100%', 'Charge before rotating');
  await resize(390,844);
  await until(() => !element('rotate-notice').hidden, 'Rotate prompt appears');
  const remaining = data().dayRemaining;
  game().dispatchEvent(new (win().CustomEvent)('qa-advance',{detail:15})); await delay(100);
  check('Portrait rotation cancels holds, hides controls, and pauses the clock', !visible('touch-stick') && element('day-clock').dataset.paused === 'true' && remaining === data().dayRemaining);
  pointer('pointerup',2,element('touch-jump'),jumpCenter); await resize(844,390);
  await until(() => element('rotate-notice').hidden && visible('touch-stick'), 'Rotate back into landscape');
  check('Rotation does not release an accidental long jump', position()[1] === 0 && data().grounded === 'true' && element('charge').hidden);
  const openScene = {clientX:430,clientY:220}, scene = game().elementFromPoint(openScene.clientX,openScene.clientY);
  check('A free swipe area reaches the game canvas', scene === element('game'));
  const yawBefore = Number(data().camera.split(',')[0]);
  pointer('pointerdown',4,scene,openScene); pointer('pointermove',4,scene,{clientX:410,clientY:220}); pointer('pointerup',4,scene,openScene);
  await until(() => Number(data().camera.split(',')[0]) !== yawBefore, 'Swipe the camera');
  check('Swiping changes the camera without starting an interaction', Number(data().consumeProgress) === 0);
  await until(() => data().consumeTarget === 'den-hay', 'Reach the den hay from spawn');
  const use = element('touch-interact'), useCenter = center('touch-interact');
  pointer('pointerdown',6,use,useCenter);
  await until(() => Number(data().consumeProgress) > .05, 'Start eating with the context button');
  pointer('pointercancel',6,use,useCenter);
  await until(() => Number(data().consumeProgress) === 0, 'Cancel the touch hold');
  check('Interrupting the context button awards nothing', data().lastConsumedId !== 'den-hay' && data().poopSupply === '10');
  pointer('pointerdown',6,use,useCenter);
  await until(() => data().lastConsumedId === 'den-hay', 'Complete a fresh hold on the hay');
  pointer('pointerup',6,use,useCenter);
  check('Holding Interact finishes the normal four-second den hay action', Number(data().energy) === 100);
  const yaw = Number(data().camera.split(',')[0]), stick = center('touch-stick');
  pointer('pointerdown',7,element('touch-stick'),stick);
  pointer('pointermove',7,element('touch-stick'),{clientX:stick.clientX+90*Math.cos(yaw),clientY:stick.clientY+90*Math.sin(yaw)});
  await until(() => position()[0] > -12.6, 'Walk east to the den fence with the touch stick');
  pointer('pointerdown',9,element('touch-jump'),jumpCenter);
  await until(() => !element('charge').hidden && element('charge-percent').textContent === '100%', 'Charge with a second contact while holding the stick');
  pointer('pointerup',9,element('touch-jump'),jumpCenter);
  await until(() => position()[0] > -11.4, 'Clear the den fence without keyboard input');
  pointer('pointerup',7,element('touch-stick'),stick);
  check('Two independent contacts escape the den with no energy cost', Number(data().energy) === 100);
  const oldCount = Number(data().poopCount), oldSupply = Number(data().poopSupply), ball = element('touch-poop'), ballCenter = center('touch-poop');
  pointer('pointerdown',12,ball,ballCenter); pointer('pointerup',12,ball,ballCenter);
  await until(() => Number(data().poopCount) === oldCount+1, 'Drop one ball with the action button');
  check('Touch actions use normal resources', Number(element('poop-count').textContent) === oldSupply-1 && element('fatal').hidden);
  game().dispatchEvent(new (win().CustomEvent)('qa-advance',{detail:601}));
  await until(() => data().mode === 'gameover', 'Reach bedtime and record the touch round');
  check('The local score, long jump and dropped ball reach Game Over', data().lastPlayer === 'Touch QA' && data().finalRank === '1' &&
    element('result-poop').textContent === '1' && element('result-long-jumps').textContent === '1' && !visible('touch-stick'));
  status.textContent = 'All touch and compact HUD checks passed.';
}
document.querySelector('#run').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true; results.replaceChildren();
  try { await resize(844,390); await run(); }
  catch (error) { status.textContent = 'Failed: ' + error.message; }
  finally { button.disabled = false; }
});
