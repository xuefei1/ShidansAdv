import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from './house.js';
import { createRabbit } from './model.js';
import { RabbitController, DEN, clamp } from './physics.js';
import { Sound } from './audio.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
function fatal(message) { $('fatal-text').textContent = message; $('fatal').hidden = false; }
window.addEventListener('error', event => fatal(`The game could not continue: ${event.message}`));

try { boot(); } catch (error) { console.error(error); fatal(error.message); }

function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe3e6d6);
  scene.fog = new THREE.Fog(0xe3e6d6, 35, 90);
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, .04, 140);
  scene.add(new THREE.HemisphereLight(0xfff6db, 0x99aca1, 2.5));
  const sun = new THREE.DirectionalLight(0xffe8b9, 3.3); sun.position.set(-3, 14, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 35 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00008; sun.shadow.radius = 3; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc9e5f0, 1.1); fill.position.set(7, 8, -4); scene.add(fill);
  const stage = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe1e4d2, roughness: 1 }));
  stage.rotation.x = -Math.PI / 2; stage.position.y = -.55; stage.receiveShadow = true; scene.add(stage);
  const { group: house, world, readingNook } = createHouse(scene);
  batchStaticGeometry(house);
  const rabbit = createRabbit(); scene.add(rabbit.root);
  const controller = new RabbitController(world);
  const sound = new Sound();
  const keys = new Set();
  let mode = 'title', previousMode = 'play', overview = false, dragging = false;
  let yaw = -.45, pitch = .39, distance = 4.1, time = 0, previousTime = performance.now();
  let toastUntil = 0, lastStep = 0, mapTick = 0, heldMouseX = 0, heldMouseY = 0;
  let escaped = false, upstairs = false, nook = false, cameraInitialized = false, jumpSeen = false, queuedHop = false;
  const target = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), lookAt = new THREE.Vector3();
  const cameraRay = new THREE.Ray(), collisionPoint = new THREE.Vector3();
  const collisionBoxes = world.solids.map(b => new THREE.Box3(new THREE.Vector3(b.minX - .12, b.minY - .12, b.minZ - .12), new THREE.Vector3(b.maxX + .12, b.maxY + .12, b.maxZ + .12)));

  function toast(text, seconds = 4) { $('toast').textContent = text; $('toast').hidden = false; toastUntil = time + seconds; }
  function clearInput() { keys.clear(); dragging = false; queuedHop = false; jumpSeen = false; controller.releaseInput(); }
  function unlock() { if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  function lock() {
    if (overview || mode !== 'play') return;
    // Embedded browsers may forbid pointer lock; drag-to-look remains available.
    try { const request = canvas.requestPointerLock?.(); request?.catch?.(() => { $('camera-hint').textContent = 'Drag the world to look around · scroll to zoom'; }); } catch { /* Drag fallback. */ }
  }
  function showGame() {
    document.body.classList.add('playing'); document.body.classList.remove('touring');
    $('welcome').hidden = true; $('intro-caption').hidden = true; $('intro-footer').hidden = true;
    $('hud').hidden = false; $('menu-button').hidden = false; $('pause').hidden = true;
    mode = 'play'; overview = false; cameraInitialized = false; clearInput(); canvas.focus();
    $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>'; $('view').innerHTML = '<kbd>V</kbd> House view';
  }
  function pause() {
    if (mode !== 'play' && mode !== 'tour') return;
    previousMode = mode; mode = 'pause'; clearInput(); unlock(); $('pause').hidden = false; $('resume').focus();
  }
  function resume() {
    mode = previousMode; $('pause').hidden = true; clearInput(); canvas.focus();
    if (mode === 'play') lock();
  }
  function reset() {
    controller.reset(); yaw = -.45; pitch = .39; distance = 4.1; clearInput(); cameraInitialized = false;
    toast('Back in your cozy den. Hold Space, then release to leap.');
  }
  function setOverview() {
    if (mode !== 'play') return;
    overview = !overview; clearInput();
    if (overview) { unlock(); toast('House view · press V to return to Shidan', 3); }
    else { cameraInitialized = false; canvas.focus(); }
    $('view').innerHTML = overview ? '<kbd>V</kbd> Follow Shidan' : '<kbd>V</kbd> House view';
  }
  $('play').addEventListener('click', () => {
    escaped = upstairs = nook = false;
    ['step-den', 'step-upstairs', 'step-window'].forEach(id => $(id).classList.remove('done'));
    $('quest-title').textContent = 'The world beyond the fence';
    $('quest-text').textContent = 'Hold Space to charge, then release while moving to leap out of your den.';
    reset(); showGame(); lock(); toast('Hello, little explorer. Charge a jump to clear the fence.', 6);
  });
  $('tour').addEventListener('click', () => {
    mode = 'tour'; overview = true; document.body.classList.add('touring');
    $('welcome').hidden = true; $('intro-caption').hidden = true; $('menu-button').hidden = false;
    $('menu-button').innerHTML = 'Explore as Shidan <kbd>Enter</kbd>';
  });
  $('menu-button').addEventListener('click', () => { if (mode === 'tour') { $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>'; showGame(); } else pause(); });
  $('resume').addEventListener('click', resume);
  $('reset').addEventListener('click', () => { reset(); showGame(); });
  $('back-title').addEventListener('click', () => {
    mode = 'title'; overview = false; clearInput(); unlock(); controller.reset(); cameraInitialized = false;
    document.body.classList.remove('playing', 'touring');
    $('pause').hidden = true; $('welcome').hidden = false; $('intro-caption').hidden = false; $('intro-footer').hidden = false;
    $('hud').hidden = true; $('menu-button').hidden = true; $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>';
    $('play').focus();
  });
  $('home').addEventListener('click', () => { reset(); canvas.focus(); });
  $('view').addEventListener('click', setOverview);
  $('sound').addEventListener('click', () => {
    const enabled = sound.toggle(); $('sound').textContent = enabled ? 'Sound on' : 'Sound off';
    $('sound').setAttribute('aria-label', enabled ? 'Disable sound' : 'Enable sound');
  });
  addEventListener('keydown', event => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && mode === 'play' && event.target === canvas) event.preventDefault();
    if (event.code === 'Escape') { if (mode === 'pause') resume(); else pause(); return; }
    if (event.code === 'Enter' && mode === 'tour') { $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>'; showGame(); return; }
    if (mode !== 'play' || event.target instanceof HTMLButtonElement) return;
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') jumpSeen = false;
    if (event.code === 'KeyR') reset();
    if (event.code === 'KeyV') setOverview();
    if (event.code === 'KeyC') { yaw = controller.facing + Math.PI; pitch = .39; }
  });
  addEventListener('keyup', event => {
    if (event.code === 'Space' && keys.has('Space') && !jumpSeen && mode === 'play' && !overview) queuedHop = true;
    keys.delete(event.code);
  });
  addEventListener('blur', () => { clearInput(); if (mode === 'play') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
  document.addEventListener('pointerlockchange', () => {
    $('camera-hint').hidden = document.pointerLockElement === canvas;
    // Esc releases pointer lock first in some browsers; pause reliably on that transition.
    if (!document.pointerLockElement && mode === 'play' && !overview) pause();
  });
  canvas.addEventListener('pointerdown', event => {
    if (mode !== 'play' || overview) return;
    canvas.focus(); dragging = true; heldMouseX = event.clientX; heldMouseY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId); lock();
  });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', event => {
    if (mode !== 'play' || overview) return;
    let dx = 0, dy = 0;
    if (document.pointerLockElement === canvas) { dx = event.movementX; dy = event.movementY; }
    else if (dragging) { dx = event.clientX - heldMouseX; dy = event.clientY - heldMouseY; heldMouseX = event.clientX; heldMouseY = event.clientY; }
    yaw -= dx * .003; pitch = clamp(pitch + dy * .0027, .06, 1.15);
  });
  canvas.addEventListener('wheel', event => { event.preventDefault(); distance = clamp(distance + event.deltaY * .004, 1.5, 7); }, { passive: false });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); fatal('The graphics context was lost. Reload to resume exploration.'); });

  function updateCamera(dt) {
    if (mode === 'title') {
      desiredCamera.set(-2.9 + Math.sin(time * .12) * .12, 1.65, 5.9);
      lookAt.set(-5.5, .64, 3.05);
    } else if (overview || mode === 'tour' || (mode === 'pause' && previousMode === 'tour')) {
      const orbit = mode === 'tour' ? Math.sin(time * .08) * 1.5 : 0;
      desiredCamera.set(18 + orbit, 17.5, 23); lookAt.set(0, 1.1, -.2);
    } else {
      target.set(controller.x, controller.y + .62, controller.z);
      desiredCamera.set(controller.x + Math.sin(yaw) * Math.cos(pitch) * distance,
        target.y + Math.sin(pitch) * distance, controller.z + Math.cos(yaw) * Math.cos(pitch) * distance);
      // Prevent camera clipping through the real floor, furniture and back/side walls.
      desiredCamera.x = clamp(desiredCamera.x, -7.76, 9.5); desiredCamera.z = clamp(desiredCamera.z, -6.73, 9.5);
      cameraRay.origin.copy(target); cameraRay.direction.copy(desiredCamera).sub(target).normalize();
      let nearest = desiredCamera.distanceTo(target);
      for (const b of collisionBoxes) {
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
    const high = controller.y > 3.1;
    const onStairs = controller.surface === 'stairs';
    $('floor-label').textContent = onStairs ? 'ON THE STAIRS' : high ? 'UPSTAIRS' : 'GROUND FLOOR';
    $('map-floor').textContent = high ? '2F' : '1F';
    $('location').textContent = onStairs ? 'A little climb' : high ? (controller.x < -3.3 ? 'The reading nook' : 'The quiet upstairs') : distFromDen < 1.6 ? 'Shidan’s den' : controller.z < -2.6 ? 'Kitchen & dining' : 'The living room';
    const surfaces = { bedding: 'Soft bedding · good grip', carpet: 'Cozy carpet · good grip', wood: 'Wooden floor · slippery paws', stairs: 'Stair runner · steady paws' };
    $('surface').textContent = surfaces[controller.surface];
    $('surface-dot').style.background = controller.surface === 'wood' ? '#bd995d' : '#91a773';
    $('charge').hidden = !controller.charging;
    if (controller.charging) {
      const power = Math.round(Math.min(1, controller.charge / .65) * 100);
      $('charge-fill').style.width = `${power}%`; $('charge-percent').textContent = `${power}%`;
      $('charge-label').textContent = controller.surface === 'wood' || controller.surface === 'stairs' ? 'Too slippery for a long jump' : power >= 100 ? 'Ready! Release Space' : 'Crouch & spring';
    }
    if (!escaped && distFromDen > 1.86 && controller.grounded) {
      escaped = true; $('step-den').classList.add('done');
      $('quest-title').textContent = 'A whole house to discover'; $('quest-text').textContent = 'Follow the little pawprints to the stairs on the right. What’s waiting upstairs?';
      toast('Your first great escape! Watch those slippery wooden floors.', 6); sound.chime();
    }
    if (!upstairs && high && controller.grounded && !onStairs) {
      upstairs = true; $('step-upstairs').classList.add('done'); $('quest-title').textContent = 'Softer floors, bigger dreams';
      $('quest-text').textContent = 'The carpet gives your paws their grip back. Find the cozy reading corner by the upstairs windows.';
      toast('Made it upstairs. The carpet is perfect for happy little leaps.', 5); sound.chime();
    }
    if (!nook && high && Math.hypot(controller.x - readingNook.x, controller.z - readingNook.z) < 1.4) {
      nook = true; $('step-window').classList.add('done'); $('quest-title').textContent = 'Home, sweet rabbit home';
      $('quest-text').textContent = 'You’ve explored your new home! Keep hopping, try the furniture, or return to the den with R.';
      toast('A cozy corner, just for you. First adventure complete! ♡', 7); sound.chime();
    }
    if (time > toastUntil) $('toast').hidden = true;
    // Useful DOM-level telemetry for browser QA, without exposing a mutable debug API.
    canvas.dataset.position = `${controller.x.toFixed(2)},${controller.y.toFixed(2)},${controller.z.toFixed(2)}`;
    canvas.dataset.surface = controller.surface; canvas.dataset.mode = mode; canvas.dataset.grounded = String(controller.grounded);
    canvas.dataset.camera = `${yaw.toFixed(2)},${pitch.toFixed(2)}`;
  }
  const map = $('map').getContext('2d');
  function drawMap() {
    const tx = x => 85 + x * 9.4, tz = z => 76 + z * 9.4;
    map.clearRect(0, 0, 170, 154); map.fillStyle = '#ede7d3'; map.fillRect(10, 10, 150, 132);
    map.strokeStyle = '#b6bc9f'; map.lineWidth = 2; map.strokeRect(10, 10, 150, 132);
    if (controller.y > 3.1) {
      map.fillStyle = '#bdc9a6'; map.fillRect(11, 11, 148, 51); map.fillStyle = '#e2baa5'; map.fillRect(tx(-2), tz(-6.4), 23, 29);
      map.fillStyle = '#9eb092'; map.fillRect(tx(-6.1), tz(-5.8), 13, 14);
    } else {
      map.fillStyle = '#a7ba98'; map.fillRect(tx(-6.1), tz(-1), 32, 12);
      map.fillStyle = '#d5ba91'; map.fillRect(tx(-1.6), tz(-.8), 16, 11);
      map.fillStyle = '#abc1a0'; map.fillRect(tx(-6.5), tz(-6.7), 45, 12);
      map.fillStyle = '#e5dbbd'; map.beginPath(); map.arc(tx(DEN.x), tz(DEN.z), 14, 0, Math.PI * 2); map.fill(); map.strokeStyle = '#ffffff'; map.stroke();
    }
    map.strokeStyle = '#b8a486'; map.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const z = tz(4.7 - i * .53); map.beginPath(); map.moveTo(tx(5.2), z); map.lineTo(tx(7.4), z); map.stroke(); }
    map.save(); map.translate(tx(controller.x), tz(controller.z)); map.rotate(-controller.facing + Math.PI);
    map.fillStyle = '#526b48'; map.beginPath(); map.moveTo(0, -6); map.lineTo(-4, 4); map.lineTo(4, 4); map.closePath(); map.fill(); map.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - previousTime) / 1000, .05); previousTime = now;
    if (mode !== 'pause') time += dt;
    if (mode === 'play' && !overview) {
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
      updateHUD();
    }
    rabbit.root.position.set(controller.x, controller.y, controller.z);
    rabbit.root.rotation.y = mode === 'title' ? .43 : controller.facing;
    const speed = mode === 'play' ? Math.hypot(controller.vx, controller.vz) : 0;
    rabbit.animate(time, speed, controller.grounded, controller.charge / .8, world.support(controller.x, controller.z, controller.y + .01).y);
    updateCamera(dt);
    if (time - mapTick > .09) { drawMap(); mapTick = time; }
    renderer.render(scene, camera);
  }
  updateHUD(); drawMap(); requestAnimationFrame(frame); canvas.dataset.ready = 'true';
}
