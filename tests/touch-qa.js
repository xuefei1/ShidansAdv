const frame = document.querySelector('#app'), status = document.querySelector('#status'), results = document.querySelector('#results');
const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
const game = () => frame.contentDocument, win = () => frame.contentWindow, element = id => game().getElementById(id);
const data = () => element('game')?.dataset, position = () => data().position.split(',').map(Number);
const cameraYaw = () => Number(data().camera.split(',')[0]);
const cameraPitch = () => Number(data().camera.split(',')[1]);
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
function gesturePrevented(target, type, contactCount = 0) {
  const event = new (win().Event)(type, {bubbles:true, cancelable:true});
  if (contactCount) {
    // Synthetic gestures exercise the handlers even on a desktop without TouchEvent constructors.
    Object.defineProperty(event, 'touches', {value:Array.from({length:contactCount}, () => ({target}))});
  }
  target.dispatchEvent(event);
  return event.defaultPrevented;
}
function checkBrowserGestures(label, active, target) {
  const doc = game(), surface = doc.documentElement;
  const styleOf = node => win().getComputedStyle(node);
  const hasState = surface.dataset.touchPlaying === 'true';
  const suppressed = node => {
    const style = styleOf(node);
    return style.touchAction === 'none' && style.userSelect === 'none' &&
      (!win().CSS.supports('-webkit-touch-callout','none') || style.getPropertyValue('-webkit-touch-callout') === 'none');
  };
  if (active) {
    check('Touch play disables browser pan, zoom and text selection across the HUD and controls',
      hasState && [surface, target, element('game'), element('touch-stick'), element('touch-jump')].every(suppressed));
    check('The game claims one-finger swipes on the scene and movement pad',
      [element('game'), element('touch-stick')].every(node =>
        gesturePrevented(node, 'touchstart', 1) && gesturePrevented(node, 'touchmove', 1)));
    check('The item legend permits vertical scrolling and ordinary buttons keep their taps',
      styleOf(doc.querySelector('.legend-scroll')).touchAction === 'pan-y' &&
      !gesturePrevented(element('map-button'), 'touchstart', 1));
  } else {
    check(label + ' restores browser touch and selection styles', !hasState &&
      styleOf(surface).touchAction !== 'none' && styleOf(target).userSelect !== 'none');
  }
  const wrong = ['selectstart','contextmenu','dragstart','dblclick','gesturestart','gesturechange','gestureend']
    .filter(type => gesturePrevented(target, type) !== active);
  for (const type of ['touchstart','touchmove']) {
    if (gesturePrevented(target, type, 2) !== active) wrong.push(type);
  }
  check(label + (active ? ' suppresses native pinch and long-press events' : ' leaves native gesture events available'),
    !wrong.length, wrong.join(', '));
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
function swipe(target, start, dx, dy = 0) {
  pointer('pointerdown',4,target,start);
  const end={clientX:start.clientX+dx,clientY:start.clientY+dy};
  pointer('pointermove',4,target,end); pointer('pointerup',4,target,end);
}
async function restartAtDen() {
  element('menu-button').click(); element('reset').click();
  await until(() => data().mode === 'play' && Math.hypot(position()[0]+16,position()[2]-12)<.05 &&
    data().consumeTarget === 'den-hay', 'Start a fresh round with the hay back at its original position');
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
  await restartAtDen();
}
async function checkHeldStickCamera(scene, openScene) {
  await until(nearFollow, 'Line up the camera before testing screen-relative walking');
  const pad = element('touch-stick'), stick = center('touch-stick'), initialYaw = cameraYaw();
  const steer = (x, y) => pointer('pointermove', 7, pad, {clientX:stick.clientX+x, clientY:stick.clientY+y});
  function distanceAlong(from, x, z) {
    const to = position();
    return (to[0] - from[0]) * x + (to[2] - from[2]) * z;
  }
  const backwardX = Math.sin(initialYaw), backwardZ = Math.cos(initialYaw);
  const rightX = Math.cos(initialYaw), rightZ = -Math.sin(initialYaw);
  const start = position();
  pointer('pointerdown', 7, pad, stick);
  steer(0, 90);
  await until(() => distanceAlong(start, backwardX, backwardZ) > .75, 'Walk toward the bottom of the screen');
  check('Holding down moves backward on screen without orbiting the camera', angleGap(cameraYaw(), initialYaw) < .03);
  steer(0, 0);
  const centeredAt = performance.now();
  await until(() => performance.now() - centeredAt > 600, 'Rest the same finger in the joystick dead zone');
  await new Promise(resolve => win().requestAnimationFrame(() => win().requestAnimationFrame(resolve)));
  check('Centering the pad keeps the camera fixed until the finger lifts', angleGap(cameraYaw(), initialYaw) < .03);

  const beforeRight = position();
  steer(90, 0);
  await until(() => distanceAlong(beforeRight, rightX, rightZ) > .75, 'Move right after moving backward');
  check('Switching to right stays screen-relative on the same stick contact', angleGap(cameraYaw(), initialYaw) < .03);
  steer(0, 0);
  swipe(scene, openScene, 155, 100);
  await until(() => angleGap(cameraYaw(), initialYaw) > .4 && cameraPitch() > .65, 'Angle and tilt the normal view before using Rear');
  const orbitYaw = cameraYaw(), orbitPitch = cameraPitch();
  const rear = element('touch-rear'), rearCenter = center('touch-rear');
  const showsFace = () => angleGap(cameraYaw(), facing()) < .015 && cameraPitch() === .43;
  pointer('pointerdown', 13, rear, rearCenter);
  await until(showsFace, 'Show Shidan’s face from the standard height while holding Rear');
  const rearStartFacing = facing();
  steer(0, 90);
  await until(() => angleGap(facing(), orbitYaw) < .09, 'Walk toward the normal camera while holding Rear');
  check('Rear stays in front of Shidan as she backs toward the screen', showsFace() && angleGap(facing(), rearStartFacing) > .8);
  const beforeLeft = position();
  steer(-90, 0);
  await until(() => distanceAlong(beforeLeft, -Math.cos(orbitYaw), Math.sin(orbitYaw)) > .65, 'Steer left while holding Rear');
  check('Rear tracks the turn and keeps movement relative to the normal view', showsFace() && angleGap(facing(), orbitYaw) > .8);
  pointer('pointerup', 13, rear, rearCenter);
  await until(() => cameraYaw() === orbitYaw && cameraPitch() === orbitPitch, 'Release Rear without releasing the stick');
  check('Releasing Rear restores the precise swipe angle and tilt', cameraYaw() === orbitYaw && cameraPitch() === orbitPitch);

  // A quick thumb transfer can re-engage the pad in its dead zone.
  pointer('pointerup', 7, pad, stick);
  pointer('pointerdown', 17, pad, stick);
  await delay(420);
  check('Re-grabbing the stick interrupts pending recentering', angleGap(cameraYaw(), orbitYaw) < .03);
  pointer('pointerup', 17, pad, stick);
  await until(nearFollow, 'The camera follows again after the stick is released');
  check('Releasing after a side move recenters behind the new heading', angleGap(cameraYaw(), orbitYaw) > .8);

  const followedYaw = cameraYaw();
  pointer('pointerdown', 18, pad, stick);
  const beforeSwipe = position();
  pointer('pointermove', 18, pad, {clientX:stick.clientX, clientY:stick.clientY-90});
  await until(() => distanceAlong(beforeSwipe, -Math.sin(followedYaw), -Math.cos(followedYaw)) > .35, 'Walk forward before manually turning the camera');
  swipe(scene, openScene, -520);
  await until(() => angleGap(cameraYaw(), followedYaw) > 1.4, 'Look around with a second finger on the canvas');
  const turnedYaw = cameraYaw(), beforeForward = position();
  await until(() => distanceAlong(beforeForward, -Math.sin(turnedYaw), -Math.cos(turnedYaw)) > .7, 'Move forward in the manually rotated view');
  check('A swipe updates the direction of a stick already held down', angleGap(cameraYaw(), turnedYaw) < .03);
  pointer('pointermove', 18, pad, stick);
  swipe(scene, openScene, -220);
  await until(() => angleGap(cameraYaw(), turnedYaw) > .55, 'Look aside just before releasing the joystick');
  const manualYaw = cameraYaw();
  pointer('pointerup', 18, pad, stick);
  await delay(1000);
  check('Releasing the stick preserves the manual swipe’s three-second grace', angleGap(cameraYaw(), manualYaw) < .03);
  await until(nearFollow, 'Return from manual look with the stick released');
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
async function checkTabletLifecycle() {
  const doc = game(), view = win(), jump = element('touch-jump'), at = center('touch-jump');
  const advance = seconds => doc.dispatchEvent(new view.CustomEvent('qa-advance', {detail:seconds}));
  const before = Number(data().dayRemaining);
  pointer('pointerdown', 24, jump, at);
  await until(() => !element('charge').hidden, 'Hold Jump before the simulated toolbar appears');
  view.dispatchEvent(new view.Event('blur'));
  pointer('pointerup', 24, jump, at);
  await resize(844, 335);
  advance(1);
  await until(() => Number(data().dayRemaining) === before - 1 || !element('pause').hidden, 'Advance the game with the toolbar visible');
  check('A visible iPad toolbar blur and landscape resize keep the round running and cancel the held jump',
    element('pause').hidden && element('rotate-notice').hidden && element('charge').hidden &&
    position()[1] === 0 && !jump.classList.contains('is-held') && visible('touch-stick') &&
    Number(data().dayRemaining) === before - 1);
  await resize(844, 390);

  // These temporary properties model a backgrounded tab in the isolated test iframe.
  Object.defineProperties(doc, {
    hidden: {value:true, configurable:true}, visibilityState: {value:'hidden', configurable:true}
  });
  try {
    doc.dispatchEvent(new view.Event('visibilitychange'));
    check('A hidden iPad tab pauses immediately', !element('pause').hidden);
    advance(12);
  } finally {
    delete doc.hidden; delete doc.visibilityState;
    doc.dispatchEvent(new view.Event('visibilitychange'));
  }
  element('resume').click();
  advance(1);
  await until(() => Number(data().dayRemaining) < before - 1, 'Return from the hidden tab and advance one active second');
  check('The round excludes the time spent in the background', Number(data().dayRemaining) === before - 2);

  view.dispatchEvent(new view.PageTransitionEvent('pagehide', {persisted:true}));
  check('Page navigation also pauses a touch round', !element('pause').hidden);
  view.dispatchEvent(new view.PageTransitionEvent('pageshow', {persisted:true}));
  element('resume').click();
  await until(() => visible('touch-stick'), 'Resume touch play after page navigation');
}
async function run() {
  const html = await (await fetch('../')).text();
  const entry = `<script type="module">import {boot} from '/src/main.js';
    // Desktop-site mode can report macOS on an iPad. Spies keep native system prompts out of the harness.
    Object.defineProperties(navigator, {
      userAgent:{value:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 CriOS/130.0 Safari/605.1.15'},
      platform:{value:'MacIntel'}, maxTouchPoints:{value:5}
    });
    const root=document.documentElement;
    root.dataset.fullscreenRequests=root.dataset.orientationLocks='0';
    Object.defineProperty(document,'fullscreenEnabled',{value:true});
    root.requestFullscreen=async()=>{root.dataset.fullscreenRequests=String(Number(root.dataset.fullscreenRequests)+1)};
    Object.defineProperty(screen,'orientation',{value:{lock:async()=>{root.dataset.orientationLocks=String(Number(root.dataset.orientationLocks)+1)},unlock(){}}});
    const values=new Map();let elapsed=0;document.addEventListener('qa-advance',event=>elapsed+=event.detail*1000);
    boot({scoreStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},clockNow:()=>elapsed});<\/script>`;
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, {once:true}));
  frame.srcdoc = html.replace('<head>', '<head><base href="/">').replace('<script type="module" src="./src/start.js"></script>', entry);
  await loaded;
  await until(() => data()?.ready === 'true', 'Prepare the actual game');
  setPreference('input-preference-title', 'touch');
  checkBrowserGestures('The touch title screen', false, game().querySelector('#welcome h1'));
  element('game').requestPointerLock = () => Promise.reject(new Error('QA tests drag fallback'));
  element('player-name').value = 'Touch QA'; element('play').click();
  await until(() => data().mode === 'play', 'Start a touch round with the desktop-site iPad profile');
  await checkTabletLifecycle();
  await changeMode('desktop');
  win().dispatchEvent(new (win().Event)('blur'));
  check('Keyboard play still pauses on window blur', !element('pause').hidden);
  element('resume').click();
  checkBrowserGestures('Keyboard and mouse play', false, element('energy-value'));
  const chips = ['day-countdown', 'happiness-value', 'energy-value', 'bladder-value', 'poop-count'];
  check('Phone HUD fits with keyboard and mouse, without drawing thumb controls', !visible('touch-stick') && chips.every(fits));
  await checkDesktopCamera();
  const clockWidth = element('day-clock').getBoundingClientRect().width;
  await changeMode('touch');
  checkBrowserGestures('Touch play', true, element('energy-value'));
  element('menu-button').click();
  await until(() => !element('pause').hidden, 'Open Pause using touch controls');
  checkBrowserGestures('The touch pause menu', false, game().querySelector('#pause h2'));
  element('resume').click();
  element('map-button').click();
  await until(() => !element('atlas').hidden, 'Open the floor map from the HUD');
  checkBrowserGestures('The touch map', false, game().querySelector('#atlas h2'));
  element('close-atlas').click();
  await until(() => visible('touch-stick'), 'Resume touch play after closing the map');
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
  checkBrowserGestures('The rotate prompt', false, element('rotate-title'));
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
  await checkHeldStickCamera(scene, openScene);
  await restartAtDen();
  const resting=cameraYaw();swipe(scene,openScene,-190);
  await until(()=>angleGap(cameraYaw(),resting)>.45,'Look aside before starting to walk');
  const yaw=cameraYaw(),stick=center('touch-stick');
  pointer('pointerdown',7,element('touch-stick'),stick);
  pointer('pointermove',7,element('touch-stick'),{clientX:stick.clientX+90*Math.cos(yaw),clientY:stick.clientY+90*Math.sin(yaw)});
  await until(() => position()[0] > -12.6, 'Walk east to the den fence with the touch stick');
  check('A swipe followed by a held stick gives a straight eastward approach',Math.abs(position()[2]-12)<.3 && angleGap(cameraYaw(),yaw)<.03);
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
  const device = game().documentElement.dataset;
  check('Simulated iPad play, resume and restart never request native fullscreen or orientation lock',
    device.fullscreenRequests === '0' && device.orientationLocks === '0');
  checkBrowserGestures('The Game Over screen', false, game().querySelector('#game-over h2'));
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
