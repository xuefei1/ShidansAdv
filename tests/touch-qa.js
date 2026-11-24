const frame = document.querySelector('#app'), status = document.querySelector('#status'), results = document.querySelector('#results');
const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
const game = () => frame.contentDocument, win = () => frame.contentWindow, element = id => game().getElementById(id);
const data = () => element('game')?.dataset, position = () => data().position.split(',').map(Number);
const cameraYaw = () => Number(data().camera.split(',')[0]);
const facing = () => Number(data().facing);
const angleGap = (first, second) => Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
const nearFollow = () => angleGap(cameraYaw(), facing() + Math.PI) < .09;
const visible = id => element(id).getBoundingClientRect().width > 0;
function check(label, pass, detail = '') {
  const item = document.createElement('li'); item.textContent = (pass ? 'PASS: ' : 'FAIL: ') + label + (detail ? ' — ' + detail : '');
  if (!pass) item.className = 'fail';
  results.append(item);
  if (!pass) throw Error(item.textContent);
}
async function until(predicate, label, timeout = 45000) {
  status.textContent = label;
  const start = performance.now();
  while (!predicate()) {
    if (element('fatal')?.hidden === false || performance.now() - start > timeout)
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
const touchActions = ['touch-jump', 'touch-interact', 'touch-sprint', 'touch-poop', 'touch-pee', 'touch-rear'];
function checkTouchLayout(width, height) {
  const size = Math.min(width, height);
  const actionSize = 1.3 * Math.max(48, Math.min(.094 * size, 64));
  const padSize = 1.3 * Math.max(92, Math.min(.18 * size, 132));
  const targets = ['touch-stick', ...touchActions];
  const wrongSize = [], blocked = [];
  for (const id of targets) {
    const target = element(id), rect = target.getBoundingClientRect();
    const expected = id === 'touch-stick' ? padSize : actionSize;
    if (Math.abs(rect.width - expected) > 1 || Math.abs(rect.height - expected) > 1) {
      wrongSize.push(`${id} ${Math.round(rect.width)}×${Math.round(rect.height)} (expected ${expected.toFixed(1)})`);
    }
    const points = [[.5,.5],[.12,.5],[.88,.5],[.5,.12],[.5,.88]];
    if (!fits(id) || points.some(([x,y]) => !target.contains(game().elementFromPoint(rect.left + x * rect.width, rect.top + y * rect.height)))) blocked.push(id);
  }
  const label = `${width} × ${height}`;
  check(`Action buttons and movement pad are 30% larger at ${label}`, !wrongSize.length, wrongSize.join(', '));
  check(`Thumb targets receive input across their enlarged area at ${label}`, !blocked.length, blocked.join(', '));
  check(`Pause and map remain accessible at ${label}`, ['menu-button','map-button'].every(id => fits(id) && hit(id)));

  const compact = width <= 1050 || height <= 720;
  const panels = [
    ['.energy', compact ? 70 : 170], ['.bladder', compact ? 70 : 170],
    ['.poop-counter', compact ? 56 : 170], ['.location', compact ? 135 : 170],
    ['.day-clock', compact ? 145 : 190], ['.minimap', compact ? 70 : 152]
  ];
  if (!compact) panels.push(['.consumable-legend',190]);
  const oversized = [];
  for (const [selector, maxWidth] of panels) {
    const rect = game().querySelector(selector).getBoundingClientRect();
    const isStat = ['.energy','.bladder','.poop-counter','.day-clock'].includes(selector);
    if (!rect.width || rect.width > maxWidth || (compact && isStat && rect.height > 38)) {
      oversized.push(`${selector} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
    }
  }
  check(`Side panels stay narrow at ${label}`, !oversized.length, oversized.join(', '));
  const obstructions = [];
  for (const selector of ['.minimap', '#consume-prompt']) {
    const panel = game().querySelector(selector).getBoundingClientRect();
    if (!panel.width) continue;
    for (const id of targets) {
      const button = element(id).getBoundingClientRect();
      if (Math.min(panel.right, button.right) > Math.max(panel.left, button.left) &&
          Math.min(panel.bottom, button.bottom) > Math.max(panel.top, button.top)) obstructions.push(`${selector} / ${id}`);
    }
  }
  check(`Map and interaction prompt stay clear of the thumb controls at ${label}`, !obstructions.length, obstructions.join(', '));
}
function pointer(type, id, target, coords) {
  target.dispatchEvent(new (win().PointerEvent)(type, {bubbles:true, cancelable:true, pointerType:'touch',
    pointerId:id, button:type === 'pointermove' ? -1 : 0, buttons:type === 'pointerup' || type === 'pointercancel' ? 0 : 1, ...coords}));
}
function swipe(target, start, dx) {
  pointer('pointerdown',4,target,start);
  const end={clientX:start.clientX+dx,clientY:start.clientY};
  pointer('pointermove',4,target,end); pointer('pointerup',4,target,end);
}
async function checkDesktopCamera() {
  const canvas=element('game'), before=cameraYaw();
  const mouse=(type,clientX)=>canvas.dispatchEvent(new (win().MouseEvent)(type,{bubbles:true,button:0,clientX,clientY:200}));
  const key=(type,code)=>canvas.dispatchEvent(new (win().KeyboardEvent)(type,{code,bubbles:true}));
  mouse('mousedown',250); mouse('mousemove',450); mouse('mouseup',450);
  await until(()=>angleGap(cameraYaw(),before)>.45,'Orbit using the desktop mouse');
  const manual=cameraYaw();
  key('keydown','KeyS');
  try {
    await until(()=>angleGap(facing(),manual)<.2,'Turn Shidan away from the desktop view');
  } finally {key('keyup','KeyS');}
  await delay(3300);
  check('Keyboard movement and three idle seconds leave the mouse camera unchanged',angleGap(cameraYaw(),manual)<.025&&!visible('touch-rear'));
  element('menu-button').click(); element('reset').click();
  await until(() => data().mode === 'play' && Math.hypot(position()[0]+16,position()[2]-12)<.05 &&
    data().consumeTarget === 'den-hay', 'Start a fresh round with the hay back at its original position');
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
  await checkDesktopCamera();
  const clockWidth = element('day-clock').getBoundingClientRect().width;
  await changeMode('touch');
  check('Choosing touch on the same phone keeps the compact clock', visible('touch-stick') && element('day-clock').getBoundingClientRect().width === clockWidth);
  await until(() => visible('consume-prompt'), 'Show the den hay interaction prompt before checking control spacing');
  for (const [width, height] of [[568,320],[667,375],[844,390],[1024,768],[1280,800]]) {
    await resize(width, height);
    checkTouchLayout(width, height);
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
  await until(nearFollow, 'Camera lines up behind the resting rabbit');
  const yawBefore = cameraYaw();
  swipe(scene,openScene,-240);
  await until(() => angleGap(cameraYaw(),yawBefore)>.55, 'Swipe the camera');
  check('Swiping changes the camera without starting an interaction', Number(data().consumeProgress) === 0);
  const freeLook=cameraYaw();
  await delay(1200);
  check('A released swipe remains available for free look before the timeout',angleGap(cameraYaw(),freeLook)<.03);
  await until(nearFollow,'Recenter behind Shidan after idle free look');
  check('Idle touch camera returns to Shidan’s heading without movement',nearFollow());
  const rear=element('touch-rear'), rearCenter=center('touch-rear');
  pointer('pointerdown',13,rear,rearCenter);
  await until(()=>angleGap(cameraYaw(),facing())<.09,'Hold the rear view');
  check('Rear view looks opposite the normal chase direction',angleGap(cameraYaw(),facing()+Math.PI)>3);
  pointer('pointerup',13,rear,rearCenter);
  await until(nearFollow,'Release rear view');
  check('Releasing rear view restores the forward view',nearFollow());
  await until(() => data().consumeTarget === 'den-hay', 'Reach the den hay from spawn');
  const use = element('touch-interact'), useCenter = center('touch-interact');
  pointer('pointerdown',6,use,useCenter);
  await until(() => Number(data().consumeProgress) > .05, 'Start eating with the context button');
  pointer('pointercancel',6,use,useCenter);
  await until(() => Number(data().consumeProgress) === 0, 'Cancel the touch hold');
  check('Interrupting the context button awards nothing', data().lastConsumedId !== 'den-hay' && data().poopSupply === '10');
  pointer('pointerdown',6,use,useCenter);
  // Eating advances on simulation frames, which can run much slower than wall time under software rendering.
  await until(() => data().lastConsumedId === 'den-hay', 'Complete a fresh hold on the hay', 120000);
  pointer('pointerup',6,use,useCenter);
  check('Holding Interact finishes the normal four-second den hay action', Number(data().energy) === 100);
  const resting=cameraYaw();swipe(scene,openScene,-190);
  await until(()=>angleGap(cameraYaw(),resting)>.45,'Look aside before starting to walk');
  const yaw=cameraYaw(),stick=center('touch-stick'),movedAt=performance.now();
  pointer('pointerdown',7,element('touch-stick'),stick);
  pointer('pointermove',7,element('touch-stick'),{clientX:stick.clientX+90*Math.cos(yaw),clientY:stick.clientY+90*Math.sin(yaw)});
  await until(()=>angleGap(cameraYaw(),yaw)>.08,'New movement interrupts free look');
  check('Starting the stick resumes camera follow before the idle timeout',performance.now()-movedAt<3000);
  await until(() => position()[0] > -12.6, 'Walk east to the den fence with the touch stick');
  check('Holding the stick steers straight as the camera turns',Math.abs(position()[2]-12)<.3);
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
