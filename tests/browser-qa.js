// Browser integration checks use the actual game DOM and keyboard handlers.
// Open /tests/browser.html and click Run. No debug teleport or private game API.
const frame = document.getElementById('app'), results = document.getElementById('results');
import { DEN } from '../src/layout.js';
import { SURFACES } from '../src/physics.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (label, passed, detail = '') => {
  const li = document.createElement('li'); li.className = passed ? 'pass' : 'fail'; li.textContent = `${passed ? 'PASS' : 'FAIL'}: ${label}${detail ? ` (${detail})` : ''}`; results.append(li);
  if (!passed) throw new Error(label);
};
const disableRunners = disabled => ['run', 'route', 'stairs'].forEach(id => { document.getElementById(id).disabled = disabled; });
async function waitForScene(canvas) {
  const deadline = performance.now() + 15000;
  while (canvas.dataset.ready !== 'true') {
    if (performance.now() > deadline || !canvas.ownerDocument.getElementById('fatal').hidden) throw new Error('The game did not finish preparing its graphics.');
    await wait(50);
  }
}
document.getElementById('run').addEventListener('click', async () => {
  results.replaceChildren(); disableRunners(true);
  const w = frame.contentWindow, d = frame.contentDocument, canvas = d.getElementById('game');
  const key = (type, code) => canvas.dispatchEvent(new w.KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.replace('Key', '').toLowerCase(), bubbles: true }));
  const pos = () => canvas.dataset.position.split(',').map(Number);
  try {
    await waitForScene(canvas);
    check('WebGL scene initialized', canvas.dataset.ready === 'true');
    d.getElementById('play').click(); await wait(150);
    if (!d.getElementById('pause').hidden) d.getElementById('resume').click();
    check('Play enters game', !d.getElementById('hud').hidden && d.getElementById('welcome').hidden);
    check('The ceiling slab is visible during downstairs play', canvas.dataset.ceilingVisible === 'true');
    const start = pos(); key('keydown', 'KeyD'); await wait(350); key('keyup', 'KeyD'); await wait(100);
    check('Held WASD moves Shidan', pos()[0] > start[0] + .2, pos().join(', '));
    key('keydown', 'KeyR'); key('keyup', 'KeyR'); await wait(100);
    check('R returns to the enlarged den', Math.abs(pos()[0] - DEN.x) < .02 && Math.abs(pos()[2] - DEN.z) < .02);
    const mouse = (type, button, x = 300, y = 400) => canvas.dispatchEvent(new w.MouseEvent(type, { button, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const originalLock = canvas.requestPointerLock;
    try {
      canvas.requestPointerLock = () => { throw new w.DOMException('Denied in this browser', 'SecurityError'); };
      for (let i = 0; i < 3; i++) { mouse('mousedown', 0); mouse('mouseup', 0); }
      await wait(80);
      check('Left clicks survive a throwing capture API', d.getElementById('fatal').hidden && d.getElementById('pause').hidden);
      canvas.requestPointerLock = () => Promise.reject(new w.DOMException('Denied', 'NotAllowedError'));
      mouse('mousedown', 0); mouse('mouseup', 0); await wait(80);
      check('Rejected pointer lock is handled without a crash', d.getElementById('fatal').hidden);
    } finally { canvas.requestPointerLock = originalLock; }
    const initialCount = Number(canvas.dataset.poopCount);
    for (let i = 0; i < 3; i++) { mouse('mousedown', 2); mouse('mouseup', 2); mouse('contextmenu', 2); }
    await wait(150);
    check('Every right click produces exactly one ball', Number(canvas.dataset.poopCount) === initialCount + 3);
    await wait(1700);
    check('Poop balls settle on the floor and remain', Number(canvas.dataset.poopCount) === initialCount + 3 && Number(canvas.dataset.lastPoopPosition.split(',')[1]) >= .06);
    key('keydown', 'Space'); key('keyup', 'Space'); await wait(150);
    check('A very quick Space tap is not lost between frames', pos()[1] > .1, `height ${pos()[1]}`);
    await wait(550);
    key('keydown', 'Space'); await wait(750);
    check('Holding Space charges the jump', !d.getElementById('charge').hidden && d.getElementById('charge-percent').textContent === '100%');
    key('keydown', 'KeyD'); key('keyup', 'Space'); await wait(500);
    check('Charged jump clears the taller fence', pos()[1] > DEN.fenceHeight, `height ${pos()[1]}`);
    await wait(650); key('keyup', 'KeyD'); await wait(450);
    check('Escaping updates the wood surface and objective', canvas.dataset.surface === 'wood' && d.getElementById('step-den').classList.contains('done'), pos().join(', '));
    d.getElementById('menu-button').click(); await wait(80);
    const paused = pos(); key('keydown', 'KeyW'); await wait(250); key('keyup', 'KeyW');
    check('Pause opens menu and freezes movement', !d.getElementById('pause').hidden && JSON.stringify(paused) === JSON.stringify(pos()));
    mouse('mousedown', 2); mouse('mouseup', 2); await wait(50);
    check('Pause does not spawn or remove balls', Number(canvas.dataset.poopCount) === initialCount + 3);
    d.getElementById('resume').click(); await wait(150);
    check('Resume closes menu', d.getElementById('pause').hidden);
    d.getElementById('view').click(); await wait(200);
    check('House view toggle works', d.getElementById('view').textContent.includes('Follow Shidan'));
    d.getElementById('view').click(); d.getElementById('home').click(); await wait(150);
    check('Return from overview restores controls', canvas.dataset.surface === 'bedding');
    check('Return home preserves poop balls', Number(canvas.dataset.poopCount) === initialCount + 3);
    key('keydown', 'KeyP'); key('keyup', 'KeyP'); await wait(100);
    check('P offers a trackpad-friendly poop shortcut', Number(canvas.dataset.poopCount) === initialCount + 4);
    d.getElementById('map-button').click(); await wait(100);
    const mapPosition = pos(); key('keydown', 'KeyW'); await wait(150); key('keyup', 'KeyW');
    check('The floor plan opens and pauses movement', !d.getElementById('atlas').hidden && JSON.stringify(mapPosition) === JSON.stringify(pos()));
    d.querySelector('#atlas [data-floor="1"]').click();
    check('The map switches to the upstairs and balcony', d.getElementById('atlas-floor-name').textContent.includes('Upstairs'));
    check('The map lists seven exploration landmarks', d.querySelectorAll('#discovery-list li').length === 7);
    d.getElementById('close-atlas').click(); await wait(100);
    check('Closing the map resumes exploration', d.getElementById('atlas').hidden && d.getElementById('pause').hidden);
    d.getElementById('view').click(); d.querySelector('#survey [data-floor="1"]').click(); await wait(100);
    check('The cutaway reveals the upper floor on demand', canvas.dataset.visibleFloor === '1');
    d.querySelector('#survey [data-floor="0"]').click(); await wait(100);
    check('Ground-floor cutaway exposes the rooms below', canvas.dataset.visibleFloor === '0');
    check('The house tour can still cut away the ceiling', canvas.dataset.ceilingVisible === 'false');
    d.getElementById('garden-view').click(); await wait(100);
    check('Garden tour can be selected', d.getElementById('garden-view').textContent === 'Front view');
    d.getElementById('view').click();
    d.getElementById('menu-button').click(); d.getElementById('back-title').click();
    check('Back to title restores the title screen', !d.getElementById('welcome').hidden && d.getElementById('hud').hidden);
    check('No fatal browser error', d.getElementById('fatal').hidden);
  } catch (error) { console.error(error); }
  finally { disableRunners(false); }
});

// Real held-key traversal of both flights and the garden loop, using only DOM
// telemetry for steering. No position mutation, debug teleport or alternate physics.
async function walkRoute(stairOnly = false) {
  results.replaceChildren(); disableRunners(true);
  const w = frame.contentWindow, d = frame.contentDocument, canvas = d.getElementById('game'), status = document.getElementById('route-status');
  const held = new Set(), key = (type, code) => canvas.dispatchEvent(new w.KeyboardEvent(type, { code, bubbles: true }));
  const keys = codes => {
    for (const code of [...held]) if (!codes.includes(code)) { key('keyup', code); held.delete(code); }
    for (const code of codes) if (!held.has(code)) { key('keydown', code); held.add(code); }
  };
  const pos = () => canvas.dataset.position.split(',').map(Number);
  const originalLock = canvas.requestPointerLock;
  async function walk(x, z, expectedY = 0) {
    const from = pos(), timeout = performance.now() + (Math.hypot(x - from[0], z - from[2]) / 1.5 + 8) * 1000;
    let old = from, oldTime = performance.now(), vx = 0, vz = 0;
    while (performance.now() < timeout) {
      await wait(40);
      const p = pos(), now = performance.now(), dt = Math.max(.016, (now - oldTime) / 1000);
      vx = vx * .45 + (p[0] - old[0]) / dt * .55; vz = vz * .45 + (p[2] - old[2]) / dt * .55;
      const surface = SURFACES[canvas.dataset.surface];
      const dx = x - p[0], dz = z - p[2], drag = surface.grip ? Infinity : surface.drag;
      if (Math.hypot(dx, dz) < .2 && Math.hypot(vx, vz) < .3) { keys([]); check(`Walk to (${x}, ${z})`, Math.abs(p[1] - expectedY) < .15, `floor ${p[1]}`); return; }
      const codes = [];
      if (Math.abs(dx) > .09 && !(dx * vx > 0 && Math.abs(dx) <= Math.abs(vx) / drag + .04)) codes.push(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dz) > .09 && !(dz * vz > 0 && Math.abs(dz) <= Math.abs(vz) / drag + .04)) codes.push(dz > 0 ? 'KeyS' : 'KeyW');
      keys(codes); old = p; oldTime = now;
      if (canvas.dataset.mode !== 'play') throw new Error('Keep the test tab active while walking the route.');
    }
    keys([]); check(`Walk to (${x}, ${z})`, false, pos().join(', '));
  }
  try {
    await waitForScene(canvas);
    canvas.requestPointerLock = () => Promise.reject(new w.DOMException('Use QA drag fallback', 'NotAllowedError'));
    d.getElementById('play').click(); await wait(200); if (!d.getElementById('pause').hidden) d.getElementById('resume').click();
    const yaw = Number(canvas.dataset.camera.split(',')[0]);
    canvas.dispatchEvent(new w.MouseEvent('mousedown', { button: 0, clientX: 200, clientY: 200, bubbles: true }));
    w.dispatchEvent(new w.MouseEvent('mousemove', { clientX: 200 + yaw / .003, clientY: 200 }));
    w.dispatchEvent(new w.MouseEvent('mouseup', { button: 0 }));
    keys(['Space']); await wait(750); keys(['KeyD']); await wait(1300); keys([]); await wait(1000);
    check('Escape starts the level route', canvas.dataset.surface === 'wood');
    if (stairOnly) {
      status.textContent = 'Walking to the stairs';
      for (const point of [[-7,17,0], [2.5,17,0], [2.5,15.8,0]]) await walk(...point);
      check('Upper rooms appear before the first stair', canvas.dataset.visibleFloor === '1');
      check('The ceiling remains visible at the stair approach', canvas.dataset.ceilingVisible === 'true');
      const revision = canvas.dataset.shadowRevision;
      status.textContent = 'Climbing to the middle landing';
      await walk(2.5, 8.5, 2.1);
      check('Upper rooms and ceiling remain visible halfway up', canvas.dataset.visibleFloor === '1' && canvas.dataset.ceilingVisible === 'true');
      check('The climb reuses its cached sunlight shadow', canvas.dataset.shadowRevision === revision);
      status.textContent = 'Complete: stopped halfway up the stairs for visual review.';
      return;
    }
    const legs = [
      ['Entrance hall', [[-7,17,0],[2.5,17,0]]],
      ['Indoor staircase', [[2.5,1,4.2],[1,0,4.2]]],
      ['Reading room and balcony', [[1,-6,4.2],[0,-6,4.2],[0,-22.5,4.2]]],
      ['Balcony and outdoor stairs', [[20.5,-22.5,4.2],[20.5,-24,4.2],[20.5,-36,0]]],
      ['Backyard loop', [[20.5,-37,0],[2,-37,0],[2,-29,0],[0,-22,0],[0,-17,0],[0,-6,0],[1,-6,0],[1,0,0]]],
      ['Front lawn', [[0,0,0],[0,29,0],[10,29,0],[10,22.6,0],[0,22.6,0],[0,18,0]]],
    ];
    for (const [name, points] of legs) { status.textContent = 'Walking: ' + name; for (const point of points) await walk(...point); }
    check('Full route finishes without fatal error', d.getElementById('fatal').hidden);
    status.textContent = 'Complete: den escape, entrance, upstairs, balcony, garden stairs, backyard, and back inside.';
  } catch (error) { status.textContent = error.message; console.error(error); }
  finally { keys([]); canvas.requestPointerLock = originalLock; disableRunners(false); }
}
document.getElementById('route').addEventListener('click', () => walkRoute());
document.getElementById('stairs').addEventListener('click', () => walkRoute(true));
