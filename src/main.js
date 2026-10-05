import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from './house.js';
import { createRabbit } from './model.js';
import { RabbitController, DEN, clamp } from './physics.js';
import { Sound } from './audio.js';
import { FLOOR_HEIGHT, BOUNDS, LANDMARKS, roomAt } from './layout.js';
import { drawLevelMap } from './level-map.js';
import { bindMouseControls } from './mouse.js';
import { createPoopBalls } from './poop.js';
import { upperRoomsVisible } from './visibility.js';

const elements = new Map();
const $ = id => { if (!elements.has(id)) elements.set(id, document.getElementById(id)); return elements.get(id); };
const canvas = $('game');
function fatal(message) { $('fatal-text').textContent = message; $('fatal').hidden = false; }
window.addEventListener('error', event => {
  // Host/browser extensions can also emit errors in this window. Only errors
  // originating in our game modules should replace the game with a fatal dialog.
  const source = event.filename || '';
  if (source.startsWith(new URL('./src/', location.href).href) || source.startsWith(new URL('./vendor/', location.href).href)) fatal(`The game could not continue: ${event.message}`);
});

try { boot(); } catch (error) { console.error(error); fatal(error.message); }

function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe3e6d6);
  scene.fog = new THREE.Fog(0xe3e6d6, 140, 260);
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, .04, 260);
  scene.add(new THREE.HemisphereLight(0xfff6db, 0x99aca1, 2.0));
  const sun = new THREE.DirectionalLight(0xffe8b9, 3.3); sun.position.set(-18, 42, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 130 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00008; sun.shadow.radius = 3; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc9e5f0, 1.1); fill.position.set(7, 8, -4); scene.add(fill);
  const stage = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe1e4d2, roughness: 1 }));
  stage.rotation.x = -Math.PI / 2; stage.position.y = -.56; stage.receiveShadow = true; scene.add(stage);
  const { world, layers, upper, ceiling } = createHouse(scene);
  layers.forEach(batchStaticGeometry);
  const rabbit = createRabbit(); scene.add(rabbit.root);
  // Shidan already has an animated contact shadow. Keep her and the tiny balls
  // out of the cached sun map, so they never leave a frozen shadow behind.
  rabbit.root.traverse(object => { object.castShadow = false; });
  const controller = new RabbitController(world);
  const poop = createPoopBalls(scene, world);
  const sound = new Sound();
  const keys = new Set();
  let mode = 'title', previousMode = 'play', overview = false, mapOpen = false, surveyFloor = 0, gardenView = false;
  const discovered = new Set();
  let yaw = -.45, pitch = .43, distance = 5.2, time = 0, previousTime = performance.now();
  let toastUntil = 0, lastStep = 0, mapTick = 0, hudTick = 0;
  let escaped = false, upstairs = false, cameraInitialized = false, jumpSeen = false, queuedHop = false;
  const target = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), lookAt = new THREE.Vector3();
  const cameraRay = new THREE.Ray(), collisionPoint = new THREE.Vector3();
  const collisionBoxes = new Map(world.solids.map(b => [b, new THREE.Box3(new THREE.Vector3(b.minX - .12, b.minY - .12, b.minZ - .12), new THREE.Vector3(b.maxX + .12, b.maxY + .12, b.maxZ + .12))]));

  function toast(text, seconds = 4) { $('toast').textContent = text; $('toast').hidden = false; toastUntil = time + seconds; }
  const mouse = bindMouseControls({
    canvas, document, window, canControl: () => mode === 'play' && !overview && !mapOpen,
    onLook: (dx, dy) => { yaw -= dx * .003; pitch = clamp(pitch + dy * .0027, .06, 1.15); },
    onPoop: () => { poop.drop(controller); $('poop-count').textContent = poop.physics.count.toLocaleString(); },
    onLockDenied: () => { $('camera-hint').hidden = false; $('camera-hint').textContent = 'Drag to look · right-click to poop · scroll to zoom'; },
    onLockChange: (locked, lostLock) => { $('camera-hint').hidden = locked; if (lostLock && mode === 'play' && !overview && !mapOpen) pause(); },
  });
  function clearInput() { keys.clear(); mouse.clear(); queuedHop = false; jumpSeen = false; controller.releaseInput(); }
  const { lock, unlock } = mouse;
  function showGame() {
    document.body.classList.add('playing'); document.body.classList.remove('touring');
    $('welcome').hidden = true; $('intro-caption').hidden = true; $('intro-footer').hidden = true;
    $('hud').hidden = false; $('menu-button').hidden = false; $('pause').hidden = true;
    mode = 'play'; overview = false; mapOpen = false; $('atlas').hidden = true; cameraInitialized = false; clearInput(); canvas.focus();
    $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>'; $('view').innerHTML = '<kbd>V</kbd> House view';
  }
  function pause() {
    if (mode !== 'play' && mode !== 'tour') return;
    mapOpen = false; $('atlas').hidden = true;
    previousMode = mode; mode = 'pause'; clearInput(); unlock(); $('pause').hidden = false; $('resume').focus();
  }
  function resume() {
    mode = previousMode; $('pause').hidden = true; clearInput(); canvas.focus();
    if (mode === 'play') lock();
  }
  function reset() {
    controller.reset(); yaw = -.45; pitch = .43; distance = 5.2; clearInput(); cameraInitialized = false;
    toast('Back in your cozy den. Hold Space, then release to leap.');
  }
  function setOverview() {
    if (mode !== 'play') return;
    overview = !overview; mapOpen = false; $('atlas').hidden = true; surveyFloor = controller.y >= FLOOR_HEIGHT - .25 ? 1 : 0; clearInput(); renderAtlas();
    if (overview) { unlock(); toast('House view · press V to return to Shidan', 3); }
    else { cameraInitialized = false; canvas.focus(); }
    $('view').innerHTML = overview ? '<kbd>V</kbd> Follow Shidan' : '<kbd>V</kbd> House view';
  }
  $('play').addEventListener('click', () => {
    escaped = upstairs = false; discovered.clear();
    ['step-den', 'step-upstairs', 'step-window'].forEach(id => $(id).classList.remove('done'));
    $('quest-title').textContent = 'The world beyond the fence';
    $('quest-text').textContent = 'Hold Space to charge, then release while moving to leap out of your den.';
    reset(); showGame(); lock(); toast('Hello, little explorer. Charge a jump to clear the fence.', 6);
  });
  $('tour').addEventListener('click', () => {
    mode = 'tour'; overview = true; surveyFloor = 0; renderAtlas(); document.body.classList.add('touring');
    $('welcome').hidden = true; $('intro-caption').hidden = true; $('menu-button').hidden = false;
    $('menu-button').innerHTML = 'Explore as Shidan <kbd>Enter</kbd>';
  });
  $('menu-button').addEventListener('click', () => { if (mode === 'tour') { $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>'; showGame(); } else pause(); });
  $('resume').addEventListener('click', resume);
  $('reset').addEventListener('click', () => { reset(); showGame(); });
  $('back-title').addEventListener('click', () => {
    mode = 'title'; overview = false; mapOpen = false; $('atlas').hidden = true; clearInput(); unlock(); controller.reset(); cameraInitialized = false;
    document.body.classList.remove('playing', 'touring');
    $('pause').hidden = true; $('welcome').hidden = false; $('intro-caption').hidden = false; $('intro-footer').hidden = false;
    $('hud').hidden = true; $('menu-button').hidden = true; $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>';
    $('play').focus();
  });
  $('home').addEventListener('click', () => { reset(); canvas.focus(); });
  $('view').addEventListener('click', setOverview);
  function toggleMap() {
    if (mode !== 'play') return;
    mapOpen = !mapOpen; clearInput(); $('atlas').hidden = !mapOpen;
    if (mapOpen) { surveyFloor = controller.y >= FLOOR_HEIGHT - .25 ? 1 : 0; unlock(); renderAtlas(); }
    else canvas.focus();
  }
  function renderAtlas() {
    drawLevelMap($('atlas-canvas').getContext('2d'), 680, 740, controller, surveyFloor, discovered, true);
    $('atlas-floor-name').textContent = surveyFloor ? 'Upstairs & balcony' : 'Ground floor & garden';
    $('discovery-list').replaceChildren(...LANDMARKS.map((l, i) => {
      const li = document.createElement('li'); li.className = discovered.has(l.id) ? 'found' : '';
      li.textContent = `${discovered.has(l.id) ? '✓' : i + 1} ${l.name}`; li.title = l.hint; return li;
    }));
    document.querySelectorAll('[data-floor]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.floor) === surveyFloor)));
  }
  $('map-button').addEventListener('click', toggleMap); $('close-atlas').addEventListener('click', toggleMap);
  document.querySelectorAll('[data-floor]').forEach(button => button.addEventListener('click', () => { surveyFloor = Number(button.dataset.floor); renderAtlas(); }));
  $('garden-view').addEventListener('click', () => { gardenView = !gardenView; $('garden-view').textContent = gardenView ? 'Front view' : 'Garden view'; });
  $('sound').addEventListener('click', () => {
    const enabled = sound.toggle(); $('sound').textContent = enabled ? 'Sound on' : 'Sound off';
    $('sound').setAttribute('aria-label', enabled ? 'Disable sound' : 'Enable sound');
  });
  addEventListener('keydown', event => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && mode === 'play' && event.target === canvas) event.preventDefault();
    if (event.code === 'Escape') { if (mapOpen) { toggleMap(); return; } if (mode === 'pause') resume(); else pause(); return; }
    if (event.code === 'Enter' && mode === 'tour') { $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>'; showGame(); return; }
    if (mode === 'play' && ['KeyM', 'KeyV'].includes(event.code)) {
      event.preventDefault(); if (!event.repeat) { if (event.code === 'KeyM') toggleMap(); else setOverview(); } return;
    }
    if (mode !== 'play' || event.target instanceof HTMLButtonElement) return;
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') jumpSeen = false;
    if (event.code === 'KeyR') reset();
    if (event.code === 'KeyP' && !overview && !mapOpen) { poop.drop(controller); $('poop-count').textContent = poop.physics.count.toLocaleString(); }
    if (event.code === 'KeyC') { yaw = controller.facing + Math.PI; pitch = .43; }
  });
  addEventListener('keyup', event => {
    if (event.code === 'Space' && keys.has('Space') && !jumpSeen && mode === 'play' && !overview && !mapOpen) queuedHop = true;
    keys.delete(event.code);
  });
  addEventListener('blur', () => { clearInput(); if (mode === 'play') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
  canvas.addEventListener('wheel', event => { event.preventDefault(); distance = clamp(distance + event.deltaY * .004, 1.5, 9); }, { passive: false });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); fatal('The graphics context was lost. Reload to resume exploration.'); });

  function updateCamera(dt) {
    // A close near-plane is useful beside furniture, but wastes depth precision
    // in the distant tour and makes thin rugs/planks flicker against the floor.
    const near = overview || mode === 'tour' ? .4 : .06;
    if (camera.near !== near) { camera.near = near; camera.updateProjectionMatrix(); }
    if (mode === 'title') {
      desiredCamera.set(DEN.x + 5.8 + Math.sin(time * .12) * .15, 3.8, DEN.z + 5.5);
      lookAt.set(DEN.x - 1.5, .65, DEN.z);
    } else if (overview || mode === 'tour' || (mode === 'pause' && previousMode === 'tour')) {
      const orbit = mode === 'tour' ? Math.sin(time * .08) * 1.5 : 0;
      if (gardenView) { desiredCamera.set(-35, 38, -62); lookAt.set(0, 1.5, -12); }
      else { desiredCamera.set(46 + orbit, 60, 60); lookAt.set(0, 1, -3); }
    } else {
      target.set(controller.x, controller.y + .62, controller.z);
      desiredCamera.set(controller.x + Math.sin(yaw) * Math.cos(pitch) * distance,
        target.y + Math.sin(pitch) * distance, controller.z + Math.cos(yaw) * Math.cos(pitch) * distance);
      // Prevent camera clipping through the real floor, furniture and back/side walls.
      desiredCamera.x = clamp(desiredCamera.x, BOUNDS.minX, BOUNDS.maxX); desiredCamera.z = clamp(desiredCamera.z, BOUNDS.minZ, BOUNDS.maxZ);
      cameraRay.origin.copy(target); cameraRay.direction.copy(desiredCamera).sub(target).normalize();
      let nearest = desiredCamera.distanceTo(target);
      for (const solid of world.query(Math.min(target.x, desiredCamera.x) - .12, Math.min(target.z, desiredCamera.z) - .12, Math.max(target.x, desiredCamera.x) + .12, Math.max(target.z, desiredCamera.z) + .12)) {
        const b = collisionBoxes.get(solid);
        if (b.containsPoint(target)) continue;
        if (cameraRay.intersectBox(b, collisionPoint)) nearest = Math.min(nearest, target.distanceTo(collisionPoint) - .12);
      }
      desiredCamera.copy(target).addScaledVector(cameraRay.direction, Math.max(.55, nearest));
      desiredCamera.y = Math.max(controller.y + .27, desiredCamera.y);
      lookAt.copy(target);
    }
    if (!cameraInitialized) { camera.position.copy(desiredCamera); cameraInitialized = true; }
    else camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 8));
    camera.lookAt(lookAt);
  }

  function updateHUD() {
    const distFromDen = Math.hypot(controller.x - DEN.x, controller.z - DEN.z);
    const high = controller.y > FLOOR_HEIGHT - .3;
    const onStairs = controller.surface === 'stairs';
    const room = roomAt(controller.x, controller.y, controller.z);
    $('floor-label').textContent = onStairs ? 'ON THE STAIRS' : ['yard', 'front-yard', 'balcony'].includes(room?.id) ? 'OUTSIDE' : high ? 'UPSTAIRS' : 'GROUND FLOOR';
    $('map-floor').textContent = high ? '2F' : '1F';
    $('location').textContent = onStairs ? 'A little climb' : distFromDen < DEN.radius && !high ? 'Shidan’s den' : room?.name || 'The garden path';
    const surfaces = { bedding: 'Soft bedding · good grip', carpet: 'Cozy carpet · good grip', wood: 'Wooden floor · a little slide', stairs: 'Stair runner · steady paws', grass: 'Soft grass · sure-footed paws', deck: 'Outdoor deck · sure-footed paws' };
    $('surface').textContent = surfaces[controller.surface];
    $('surface-dot').style.background = controller.surface === 'wood' ? '#bd995d' : '#91a773';
    $('charge').hidden = !controller.charging;
    if (controller.charging) {
      const power = Math.round(Math.min(1, controller.charge / .65) * 100);
      $('charge-fill').style.width = `${power}%`; $('charge-percent').textContent = `${power}%`;
      $('charge-label').textContent = controller.surface === 'wood' || controller.surface === 'stairs' ? 'Too slippery for a long jump' : power >= 100 ? 'Ready! Release Space' : 'Crouch & spring';
    }
    if (!escaped && distFromDen > DEN.radius + .36 && controller.grounded) {
      escaped = true; $('step-den').classList.add('done');
      toast('Your first great escape! Press M for rooms, shortcuts, and little discoveries.', 6); sound.chime();
    }
    if (!upstairs && high && controller.grounded && !onStairs) {
      upstairs = true; $('step-upstairs').classList.add('done');
      toast('Made it upstairs. The carpet is perfect for happy little leaps.', 5); sound.chime();
    }
    for (const l of LANDMARKS) {
      if (!discovered.has(l.id) && controller.grounded && Math.abs(controller.y - l.y) < .4 && Math.hypot(controller.x - l.x, controller.z - l.z) < l.radius) {
        discovered.add(l.id); toast(`A little discovery: ${l.name.toLowerCase()} (${discovered.size}/${LANDMARKS.length})`, 5); sound.chime();
        if (l.id === 'balcony') $('step-window').classList.add('done');
      }
    }
    $('discoveries').textContent = `${discovered.size} / ${LANDMARKS.length} little discoveries`;
    if (escaped) {
      const next = LANDMARKS.find(l => !discovered.has(l.id));
      $('quest-title').textContent = next ? 'A house full of possibilities' : 'Every corner, a little adventure';
      $('quest-text').textContent = next ? next.hint : 'All seven discoveries found! Try another route through the windows, furniture, and hidden passages.';
    }
    if (time > toastUntil) $('toast').hidden = true;
    // Useful DOM-level telemetry for browser QA, without exposing a mutable debug API.
    canvas.dataset.position = `${controller.x.toFixed(2)},${controller.y.toFixed(2)},${controller.z.toFixed(2)}`;
    canvas.dataset.surface = controller.surface; canvas.dataset.mode = mode; canvas.dataset.grounded = String(controller.grounded);
    canvas.dataset.camera = `${yaw.toFixed(2)},${pitch.toFixed(2)}`;
    canvas.dataset.poopCount = String(poop.physics.count);
    canvas.dataset.poopActive = String(poop.physics.active.size);
    const latestPoop = poop.physics.balls[(poop.physics.cursor + poop.physics.capacity - 1) % poop.physics.capacity];
    if (latestPoop) canvas.dataset.lastPoopPosition = `${latestPoop.x.toFixed(3)},${latestPoop.y.toFixed(3)},${latestPoop.z.toFixed(3)}`;
  }
  const map = $('map').getContext('2d');
  function drawMap() { drawLevelMap(map, 170, 192, controller, controller.y >= FLOOR_HEIGHT - .25 ? 1 : 0, discovered); }

  // Read-only diagnostics, sampled in batches so profiling does not alter play.
  const frameTimes = [], cpuTimes = [];
  let profileTime = performance.now();
  let upperApproach = false, shadowRevision = 0;

  function frame(now) {
    const cpuStart = performance.now();
    if (!document.hidden) frameTimes.push(now - previousTime);
    requestAnimationFrame(frame);
    const dt = Math.min((now - previousTime) / 1000, .05); previousTime = now;
    if (mode !== 'pause') time += dt;
    if (mode === 'play' && !overview && !mapOpen) {
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const input = { x: -Math.sin(yaw) * forward + Math.cos(yaw) * right, z: -Math.cos(yaw) * forward - Math.sin(yaw) * right, run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: keys.has('Space') };
      if (queuedHop) { controller.update(.0001, { ...input, jump: true }); queuedHop = false; }
      controller.update(dt, input);
      if (input.jump) jumpSeen = true;
      if (controller.lastJump) sound.hop(controller.lastJump === 'long');
      if (controller.lastLanding) sound.land();
      const speed = Math.hypot(controller.vx, controller.vz);
      if (controller.grounded && speed > .6 && time - lastStep > .2) { sound.step(controller.surface === 'wood'); lastStep = time; }
      poop.update(dt, controller);
      if (time - hudTick >= .05) { updateHUD(); hudTick = time; }
    }
    poop.sync();
    rabbit.root.position.set(controller.x, controller.y, controller.z);
    rabbit.root.rotation.y = mode === 'title' ? .43 : controller.facing;
    const speed = mode === 'play' ? Math.hypot(controller.vx, controller.vz) : 0;
    rabbit.animate(time, speed, controller.grounded, controller.charge / .8, world.support(controller.x, controller.z, controller.y + .01).y);
    updateCamera(dt);
    if (mode === 'play' && !overview && !mapOpen && time - mapTick > .12) { drawMap(); mapTick = time; }
    const surveying = overview || mode === 'tour' || (mode === 'pause' && previousMode === 'tour');
    upperApproach = upperRoomsVisible(controller, upperApproach);
    const showUpper = surveying ? surveyFloor === 1 : upperApproach;
    const showCeiling = !surveying || surveyFloor === 1;
    if (upper.visible !== showUpper || ceiling.visible !== showCeiling) {
      upper.visible = showUpper; ceiling.visible = showCeiling; renderer.shadowMap.needsUpdate = true;
    }
    $('survey').hidden = !surveying || mode === 'pause';
    canvas.dataset.visibleFloor = upper.visible ? '1' : '0';
    canvas.dataset.ceilingVisible = String(ceiling.visible);
    canvas.dataset.discoveries = String(discovered.size);
    if (renderer.shadowMap.needsUpdate) canvas.dataset.shadowRevision = String(++shadowRevision);
    renderer.render(scene, camera);
    if (!document.hidden) cpuTimes.push(performance.now() - cpuStart);
    if (now - profileTime >= 2000 && frameTimes.length) {
      const percentile = (values, p) => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * p)].toFixed(2);
      canvas.dataset.performance = JSON.stringify({ frameMedian: percentile(frameTimes, .5), frameP95: percentile(frameTimes, .95), cpuMedian: percentile(cpuTimes, .5), cpuP95: percentile(cpuTimes, .95), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
      frameTimes.length = cpuTimes.length = 0; profileTime = now;
    }
  }
  updateHUD(); drawMap(); requestAnimationFrame(frame); canvas.dataset.ready = 'true';
}
