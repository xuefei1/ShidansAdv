import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from './house.js';
import { createRabbit } from './model.js';
import { RabbitController, DEN, clamp } from './physics.js';
import { Sound } from './audio.js';
import { FLOOR_HEIGHT, BOUNDS, HOUSE, LANDMARKS, roomAt } from './layout.js';
import { drawLevelMap } from './level-map.js';
import { bindMouseControls } from './mouse.js';
import { createPoopBalls } from './poop.js';
import { upperRoomsVisible } from './visibility.js';
import { createRenderProfile } from './render-profile.js';
import { renderPixelRatio } from './render-quality.js';
import { createConsumables } from './consumables.js';
import { consumableDetails, consumptionSeconds } from './consumable-data.js';
import { DayClock, DAY_SECONDS, formatCountdown } from './day-cycle.js';
import { createDayLighting } from './day-lighting.js';
import { resetAdventure } from './adventure-session.js';
import { Leaderboard, HappinessRun } from './happiness.js';

const elements = new Map();
const $ = id => { if (!elements.has(id)) elements.set(id, document.getElementById(id)); return elements.get(id); };
const canvas = $('game');
function setText(id, value) { const element = $(id); if (element.textContent !== value) element.textContent = value; }
function setData(name, value) { if (canvas.dataset[name] !== value) canvas.dataset[name] = value; }
function setHidden(id, value) { const element = $(id); if (element.hidden !== value) element.hidden = value; }
function fatal(message) { setText('fatal-text', message); $('fatal').hidden = false; }
window.addEventListener('error', event => {
  // Host/browser extensions can also emit errors in this window. Only errors
  // originating in our game modules should replace the game with a fatal dialog.
  const source = event.filename || '';
  if (source.startsWith(new URL('./src/', location.href).href) || source.startsWith(new URL('./vendor/', location.href).href)) fatal(`The game could not continue: ${event.message}`);
});

// The QA entry point supplies a controllable monotonic clock. Normal play always
// uses real time through start.js; there are no time cheats in the game controls.
export async function boot({clockNow=()=>performance.now(),scoreStorage}={}) {
  $('play').disabled = $('tour').disabled = true;
  $('load-status').hidden = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(renderPixelRatio(innerWidth, innerHeight, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  const renderProfile = createRenderProfile(renderer, canvas);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe3e6d6);
  scene.fog = new THREE.Fog(0xe3e6d6, 140, 260);
  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, .04, 260);
  const hemisphere = new THREE.HemisphereLight(0xfff6db, 0x99aca1, 2.0); scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffe8b9, 3.3); sun.position.set(-18, 42, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 130 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00008; sun.shadow.radius = 3; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc9e5f0, 1.1); fill.position.set(7, 8, -4); scene.add(fill);
  const stage = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe1e4d2, roughness: 1 }));
  stage.rotation.x = -Math.PI / 2; stage.position.y = -.56; stage.receiveShadow = true; scene.add(stage);
  const { world, layers, upper, ceiling, lamps, roof } = createHouse(scene);
  layers.forEach(batchStaticGeometry);
  const daylight = createDayLighting(scene,{sun,fill,hemisphere},lamps);
  const dayClock = new DayClock(clockNow());
  let storage=scoreStorage; if(storage===undefined) try { storage=window.localStorage; } catch { /* Private browser settings can deny storage. */ }
  const leaderboard=new Leaderboard(storage), happiness=new HappinessRun(leaderboard);
  $('player-name').value=leaderboard.name;
  const rabbit = createRabbit(); scene.add(rabbit.root);
  // Shidan already has an animated contact shadow. Keep her and the tiny balls
  // out of the cached sun map, so they never leave a frozen shadow behind.
  rabbit.root.traverse(object => { object.castShadow = false; });
  const controller = new RabbitController(world);
  const consumables = createConsumables(scene, world);
  const poop = createPoopBalls(scene, world);
  const sound = new Sound();
  const keys = new Set();
  let mode = 'title', previousMode = 'play', overview = false, mapOpen = false, surveyFloor = 0, gardenView = false;
  let roofView=false;
  const discovered = new Set();
  let yaw = -.45, pitch = .43, distance = 5.2, time = 0, previousTime = performance.now();
  let toastUntil = 0, lastStep = 0, mapTick = 0, hudTick = 0;
  let escaped = false, upstairs = false, cameraInitialized = false, jumpSeen = false, queuedHop = false;
  let renderDirty = true, wasFrozen = false;
  let resourceElapsed=0;
  const target = new THREE.Vector3(), desiredCamera = new THREE.Vector3(), lookAt = new THREE.Vector3();
  const cameraRay = new THREE.Ray(), collisionPoint = new THREE.Vector3();
  const collisionBoxes = new WeakMap();

  function renderLeaderboard() {
    $('leaderboard-rows').replaceChildren(...leaderboard.entries.slice(0,10).map((entry,index)=>{
      const row=document.createElement('tr');
      if(entry.id===happiness.lastResult?.id) row.className='latest-score';
      for(const value of [String(index+1),entry.name,entry.score.toLocaleString()]) {
        const cell=document.createElement('td'); cell.textContent=value; row.append(cell);
      }
      return row;
    }));
    setHidden('leaderboard-empty',leaderboard.entries.length>0);
    setText('leaderboard-storage',leaderboard.saved ? 'Saved in this browser · top 10 completed adventures' : 'Storage unavailable. Scores are kept only while this page stays open.');
  }
  renderLeaderboard();
  $('show-leaderboard').addEventListener('click',()=>{
    renderLeaderboard(); setHidden('leaderboard',false); $('close-leaderboard').focus();
  });
  $('close-leaderboard').addEventListener('click',()=>{setHidden('leaderboard',true); $('show-leaderboard').focus();});

  function toast(text, seconds = 4) { setText('toast', text); $('toast').hidden = false; toastUntil = time + seconds; }
  const mouse = bindMouseControls({
    canvas, document, window, canControl: () => mode === 'play' && !overview && !mapOpen,
    onLook: (dx, dy) => { yaw -= dx * .003; pitch = clamp(pitch + dy * .0027, .06, 1.15); },
    onPoop: () => { poop.drop(controller); setText('poop-count', poop.physics.count.toLocaleString()); },
    onPrimary: held => { if (held) consumables.system.begin(controller, Math.min(.05, (performance.now() - previousTime) / 1000)); else consumables.system.cancel(); },
    onLockDenied: () => { $('camera-hint').hidden = false; setText('camera-hint', 'Drag to look · hold left-click near food to eat · scroll to zoom'); },
    onLockChange: (locked, lostLock) => { $('camera-hint').hidden = locked; if (lostLock && mode === 'play' && !overview && !mapOpen) pause(); },
  });
  function clearInput() {
    keys.clear(); mouse.clear(); consumables.system.cancel(); setHidden('consume-prompt', true); queuedHop = false; jumpSeen = false; controller.releaseInput();
    dayClock.setActive(mode==='play' && !overview && !mapOpen && !document.hidden,clockNow());
  }
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
    toast('Back in your cozy den. Hold left-click by the special hay to refill your energy.');
  }
  function setOverview() {
    if (mode !== 'play') return;
    overview = !overview; roofView=false;setText('roof-view','Show roof');mapOpen = false; $('atlas').hidden = true; surveyFloor = controller.y >= FLOOR_HEIGHT - .25 ? 1 : 0; clearInput(); renderAtlas();
    if (overview) { unlock(); toast('House view · press V to return to Shidan', 3); }
    else { cameraInitialized = false; canvas.focus(); }
    $('view').innerHTML = overview ? '<kbd>V</kbd> Follow Shidan' : '<kbd>V</kbd> House view';
  }
  function startAdventure() {
    if(!happiness.start($('player-name').value)) {
      returnToTitle(); $('player-name').setCustomValidity('Enter your name to start your adventure.'); $('player-name').reportValidity(); $('player-name').focus(); return;
    }
    $('player-name').value=happiness.name; $('player-name').disabled=true;
    setHidden('day-ended',true);
    escaped = upstairs = false; discovered.clear();
    ['step-den', 'step-upstairs', 'step-window'].forEach(id => $(id).classList.remove('done'));
    setText('quest-title', 'The world beyond the fence');
    setText('quest-text', 'Hold Space to charge, then release while moving to leap out of your den.');
    reset(); showGame(); lock(); toast('Eat and chew for happiness! Hold times depend on the rewards; check each item’s prompt.', 6);
  }
  $('play').addEventListener('click',startAdventure);
  $('player-name').addEventListener('input',()=>{$('player-name').setCustomValidity('');});
  $('player-name').addEventListener('keydown',event=>{if(event.key==='Enter' && !$('play').disabled) startAdventure();});
  $('tour').addEventListener('click', () => {
    mode = 'tour'; overview = true;roofView=false;setText('roof-view','Show roof');clearInput(); surveyFloor = 0; renderAtlas(); document.body.classList.add('touring');
    $('welcome').hidden = true; $('intro-caption').hidden = true; $('menu-button').hidden = false;
    $('menu-button').innerHTML = 'Explore as Shidan <kbd>Enter</kbd>';
  });
  $('menu-button').addEventListener('click', () => { if (mode === 'tour') startAdventure(); else pause(); });
  $('resume').addEventListener('click', resume);
  $('reset').addEventListener('click', () => { if(!happiness.active) startAdventure(); else { reset(); showGame(); } });
  function returnToTitle() {
    mode = 'title'; overview = false; mapOpen = false; $('atlas').hidden = true; clearInput(); unlock(); controller.reset(); cameraInitialized = false;
    document.body.classList.remove('playing', 'touring');
    $('pause').hidden = true; $('welcome').hidden = false; $('intro-caption').hidden = false; $('intro-footer').hidden = false;
    $('hud').hidden = true; $('menu-button').hidden = true; $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>';
    $('player-name').disabled=happiness.active;
    setText('play',happiness.active ? 'Continue adventure ↗' : 'Let’s explore ↗');
    setText('name-hint',happiness.active ? `Continuing as ${happiness.name} · your score and time are kept.` : 'Your completed score will be saved under this name.');
    $('play').focus();
  }
  $('back-title').addEventListener('click', returnToTitle);
  function finishDay() {
    const result=happiness.finish(dayClock);
    returnToTitle();
    resetAdventure({clock:dayClock,controller,consumables,poop},clockNow());
    resourceElapsed=0;
    escaped=upstairs=false; discovered.clear(); upperApproach=false;
    yaw=-.45; pitch=.43; distance=5.2; cameraInitialized=false;
    ['step-den','step-upstairs','step-window'].forEach(id=>$(id).classList.remove('done'));
    setData('lastConsumed',''); setData('lastConsumedId',''); setData('lastPoopPosition','');
    setText('poop-count','0'); setHidden('day-ended',false); setHidden('toast',true); toastUntil=0;
    if(result) {
      setText('day-ended',`${result.name} earned ${result.score.toLocaleString()} happiness! ${leaderboard.saved ? 'Your score is saved.' : 'Your score is kept for this session; browser storage is unavailable.'}`);
      setData('lastScore',String(result.score)); setData('lastPlayer',result.name); renderLeaderboard();
    }
    updateHUD(); drawMap(); renderDirty=true;
  }
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
    setText('atlas-floor-name', surveyFloor ? 'Upstairs & balcony' : 'Ground floor & garden');
    $('discovery-list').replaceChildren(...LANDMARKS.map((l, i) => {
      const li = document.createElement('li'); li.className = discovered.has(l.id) ? 'found' : '';
      li.textContent = `${discovered.has(l.id) ? '✓' : i + 1} ${l.name}`; li.title = l.hint; return li;
    }));
    document.querySelectorAll('[data-floor]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.floor) === surveyFloor)));
  }
  $('map-button').addEventListener('click', toggleMap); $('close-atlas').addEventListener('click', toggleMap);
  document.querySelectorAll('[data-floor]').forEach(button => button.addEventListener('click', () => { surveyFloor = Number(button.dataset.floor); renderAtlas(); }));
  $('garden-view').addEventListener('click', () => { gardenView = !gardenView; setText('garden-view', gardenView ? 'Front view' : 'Garden view'); });
  $('roof-view').addEventListener('click',()=>{roofView=!roofView;setText('roof-view',roofView?'Look inside':'Show roof');renderDirty=true;});
  $('sound').addEventListener('click', () => {
    const enabled = sound.toggle(); setText('sound', enabled ? 'Sound on' : 'Sound off');
    $('sound').setAttribute('aria-label', enabled ? 'Disable sound' : 'Enable sound');
  });
  addEventListener('keydown', event => {
    if(!$('leaderboard').hidden) {
      if(event.code==='Escape') $('close-leaderboard').click();
      if(event.code==='Tab') { event.preventDefault(); $('close-leaderboard').focus(); }
      return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && mode === 'play' && event.target === canvas) event.preventDefault();
    if (event.code === 'Escape') { if (mapOpen) { toggleMap(); return; } if (mode === 'pause') resume(); else pause(); return; }
    if (event.code === 'Enter' && mode === 'tour') { startAdventure(); return; }
    if (mode === 'play' && ['KeyM', 'KeyV'].includes(event.code)) {
      event.preventDefault(); if (!event.repeat) { if (event.code === 'KeyM') toggleMap(); else setOverview(); } return;
    }
    if (mode !== 'play' || event.target instanceof HTMLButtonElement) return;
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') jumpSeen = false;
    if (event.code === 'KeyR') reset();
    if (event.code === 'KeyP' && !overview && !mapOpen) { poop.drop(controller); setText('poop-count', poop.physics.count.toLocaleString()); }
    if (event.code === 'KeyC') { yaw = controller.facing + Math.PI; pitch = .43; }
  });
  addEventListener('keyup', event => {
    if (event.code === 'Space' && keys.has('Space') && !jumpSeen && mode === 'play' && !overview && !mapOpen) queuedHop = true;
    keys.delete(event.code);
  });
  addEventListener('blur', () => { clearInput(); if (mode === 'play') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
  canvas.addEventListener('wheel', event => { event.preventDefault(); distance = clamp(distance + event.deltaY * .004, 1.5, 9); }, { passive: false });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setPixelRatio(renderPixelRatio(innerWidth, innerHeight, devicePixelRatio));
    renderer.setSize(innerWidth, innerHeight); renderDirty = true;
  });
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
        if(solid.pushable)continue;
        let b = collisionBoxes.get(solid);
        if(!b) { b=new THREE.Box3(new THREE.Vector3(solid.minX-.12,solid.minY-.12,solid.minZ-.12),new THREE.Vector3(solid.maxX+.12,solid.maxY+.12,solid.maxZ+.12)); collisionBoxes.set(solid,b); }
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
    setText('happiness-value',happiness.score.toLocaleString()); setText('score-player',happiness.name || 'Your little adventure');
    setData('happiness',String(happiness.score));
    setText('day-countdown',formatCountdown(dayClock.remaining));
    setText('day-phase',daylight.state.phase);
    setText('day-caption',daylight.state.night===1 ? 'The house is lit' : 'Night falls at 2:00');
    $('day-clock').dataset.night=String(daylight.state.night===1);
    $('day-clock').dataset.paused=String(!dayClock.active);
    $('day-fill').style.width=`${dayClock.remaining/DAY_SECONDS*100}%`;
    setData('dayRemaining',dayClock.remaining.toFixed(2)); setData('dayPhase',daylight.state.phase);
    setData('lamps',daylight.state.lamps.toFixed(3));
    const energy = controller.energy.value.toFixed(2), nearby = consumables.system.target || consumables.system.nearest(controller);
    setText('energy-value', `${energy}%`); $('energy-fill').style.width = `${energy}%`;
    $('energy-meter').setAttribute('aria-valuenow', energy);
    $('energy-panel').dataset.low = String(controller.energy.value < 10);
    $('energy-panel').dataset.recovering = String(controller.energy.recovering);
    setText('energy-status', controller.energy.recovering ? 'Restoring energy…' : controller.sprintExhausted ? 'Rest to recover · release Shift to sprint' : controller.sprinting ? 'Sprinting · using energy' : 'Restoring 0.01% per second');
    setText('food-count', `${consumables.system.count} snacks · ${consumables.system.chewableCount} chewables`);
    setHidden('consume-prompt', !nearby || mode !== 'play' || overview || mapOpen);
    if (nearby) {
      const type = consumableDetails(nearby), progress = consumables.system.fraction, seconds=consumptionSeconds(nearby);
      setText('consume-name', type.name); setText('consume-energy', nearby.permanent ? '100% energy · unlimited' : [type.energy ? `+${type.energy} energy` : '',type.happiness ? `+${type.happiness} happiness` : ''].filter(Boolean).join(' · '));
      setText('consume-action', `${type.verb} · hold left mouse for ${seconds} ${seconds>1 ? 'seconds' : 'second'}`);
      $('consume-fill').style.width = `${progress*100}%`;
      $('consume-meter').setAttribute('aria-valuenow', (progress*100).toFixed(0));
    }
    setData('energy', energy); setData('sprinting', String(controller.sprinting));
    setData('freeDenJump',String(controller.hasFreeDenJump));setData('pushing',String(controller.pushing));
    setData('lastPushedId',controller.lastPushedId||'');
    setData('consumableCount', String(consumables.system.count));
    setData('chewableCount',String(consumables.system.chewableCount));
    setData('consumeTarget', nearby?.id || ''); setData('consumeProgress', consumables.system.progress.toFixed(2));
    setData('consumePosition',nearby?[nearby.x,nearby.y,nearby.z].map(v=>v.toFixed(3)).join(','):'');
    setData('energyRecovering', String(controller.energy.recovering));
    const distFromDen = Math.hypot(controller.x - DEN.x, controller.z - DEN.z);
    const high = controller.y > FLOOR_HEIGHT - .3;
    const onStairs = controller.surface === 'stairs';
    const room = roomAt(controller.x, controller.y, controller.z);
    setText('floor-label', onStairs ? 'ON THE STAIRS' : ['yard', 'front-yard', 'balcony'].includes(room?.id) ? 'OUTSIDE' : high ? 'UPSTAIRS' : 'GROUND FLOOR');
    setText('map-floor', high ? '2F' : '1F');
    setText('location', onStairs ? 'A little climb' : distFromDen < DEN.radius && !high ? 'Shidan’s den' : room?.name || 'The garden path');
    const surfaces = { bedding: 'Soft bedding · good grip', carpet: 'Cozy carpet · good grip', wood: 'Wooden floor · a little slide', stairs: 'Stair runner · steady paws', grass: 'Soft grass · sure-footed paws', deck: 'Outdoor deck · sure-footed paws' };
    setText('surface', surfaces[controller.surface]);
    if (canvas.dataset.surface !== controller.surface) $('surface-dot').style.background = controller.surface === 'wood' ? '#bd995d' : '#91a773';
    setHidden('charge', !controller.charging);
    if (controller.charging) {
      const power = Math.round(Math.min(1, controller.charge / .65) * 100);
      $('charge-fill').style.width = `${power}%`; setText('charge-percent', `${power}%`);
      const forward=Number(keys.has('KeyW') || keys.has('ArrowUp'))-Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const right=Number(keys.has('KeyD') || keys.has('ArrowRight'))-Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const cost = controller.jumpCost(controller.charge,{x:-Math.sin(yaw)*forward+Math.cos(yaw)*right,z:-Math.cos(yaw)*forward-Math.sin(yaw)*right});
      setText('charge-label', controller.surface === 'wood' || controller.surface === 'stairs' ? 'Slippery floor · free small hop' : cost===0 ? 'First den escape · no energy cost' : controller.energy.value < cost ? 'Low energy · free small hop' : `${power >= 100 ? 'Release!' : 'Crouch & spring'} · −${cost.toFixed(2)} energy`);
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
    setText('discoveries', `${discovered.size} / ${LANDMARKS.length} little discoveries`);
    if (escaped) {
      const next = LANDMARKS.find(l => !discovered.has(l.id));
      setText('quest-title', next ? 'A house full of possibilities' : 'Every corner, a little adventure');
      setText('quest-text', next ? next.hint : 'All seven discoveries found! Try another route through the windows, furniture, and hidden passages.');
    }
    if (time > toastUntil) setHidden('toast', true);
    // Useful DOM-level telemetry for browser QA, without exposing a mutable debug API.
    setData('position', `${controller.x.toFixed(2)},${controller.y.toFixed(2)},${controller.z.toFixed(2)}`);
    setData('surface', controller.surface); setData('mode', mode); setData('grounded', String(controller.grounded));
    setData('camera', `${yaw.toFixed(2)},${pitch.toFixed(2)}`);
    setData('poopCount', String(poop.physics.count));
    setData('poopActive', String(poop.physics.active.size));
    const latestPoop = poop.physics.balls[(poop.physics.cursor + poop.physics.capacity - 1) % poop.physics.capacity];
    if (latestPoop) setData('lastPoopPosition', `${latestPoop.x.toFixed(3)},${latestPoop.y.toFixed(3)},${latestPoop.z.toFixed(3)}`);
  }
  const map = $('map').getContext('2d');
  function drawMap() { drawLevelMap(map, 170, 192, controller, controller.y >= FLOOR_HEIGHT - .25 ? 1 : 0, discovered); }

  // Read-only diagnostics, sampled in batches so profiling does not alter play.
  const frameTimes = [], cpuTimes = [];
  let profileTime = performance.now();
  let upperApproach = false, shadowRevision = 0;

  function frame(now) {
    const cpuStart = performance.now();
    const frameMs = now - previousTime;
    requestAnimationFrame(frame);
    const dt = Math.min((now - previousTime) / 1000, .05); previousTime = now;
    dayClock.update(clockNow());
    if(dayClock.finished) finishDay();
    const resourceDt=Math.max(0,dayClock.elapsed-resourceElapsed); resourceElapsed=dayClock.elapsed;
    // Restock uses the same active-play seconds as the day, even after a slow
    // frame. Eating and movement keep their bounded simulation steps.
    consumables.handle(consumables.system.update(0,controller,resourceDt));
    const frozen = mode === 'pause' || mapOpen || document.hidden;
    if (frozen && wasFrozen && !renderDirty) return;
    wasFrozen = frozen; renderDirty = false;
    if (!document.hidden) frameTimes.push(frameMs);
    if (!frozen) time += dt;
    if (mode === 'play' && !overview && !frozen) {
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const input = { x: -Math.sin(yaw) * forward + Math.cos(yaw) * right, z: -Math.cos(yaw) * forward - Math.sin(yaw) * right, run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: keys.has('Space') };
      if (queuedHop) { controller.update(.0001, { ...input, jump: true }); queuedHop = false; }
      controller.update(dt, input);
      const resourceEvents = consumables.system.update(dt, controller,0);
      consumables.handle(resourceEvents);
      for (const event of resourceEvents) if (event.kind === 'consume') {
        const type = consumableDetails(event.item);
        happiness.consume(event);
        const rewards=[type.happiness ? `+${type.happiness} happiness` : '',type.energy ? `+${type.energy} energy` : ''].filter(Boolean).join(' · ');
        toast(event.item.permanent ? 'Energy fully restored! Your special hay is always here.' : `${type.name} · ${rewards}`, 2.2); sound.chime();
        setData('lastConsumed', event.item.type);
        setData('lastConsumedId', event.item.id);
      }
      consumables.sync(dt, consumables.system.target || consumables.system.nearest(controller), !!consumables.system.target);
      if (input.jump) jumpSeen = true;
      if (controller.lastJump) sound.hop(controller.lastJump === 'long');
      if (controller.jumpEnergyBlocked) toast('A little hop for now. Eat a snack to restore energy.', 3);
      if (controller.lastLanding) sound.land();
      const speed = Math.hypot(controller.vx, controller.vz);
      if (controller.grounded && speed > .6 && time - lastStep > .2) { sound.step(controller.surface === 'wood'); lastStep = time; }
      poop.update(dt, controller);
    } else consumables.sync(0);
    poop.sync();
    rabbit.root.position.set(controller.x, controller.y, controller.z);
    rabbit.root.rotation.y = mode === 'title' ? .43 : controller.facing;
    const speed = mode === 'play' ? Math.hypot(controller.vx, controller.vz) : 0;
    rabbit.animate(time, speed, controller.grounded, controller.charge / .8, world.support(controller.x, controller.z, controller.y + .01,true).y);
    updateCamera(dt);
    daylight.update(dayClock.elapsed,controller,camera,frozen?0:dt,overview||mode==='tour');
    if (time - hudTick >= .05 || frozen) { updateHUD(); hudTick = time; }
    if (mode === 'play' && !overview && !mapOpen && time - mapTick > .12) { drawMap(); mapTick = time; }
    const surveying = overview || mode === 'tour' || (mode === 'pause' && previousMode === 'tour');
    upperApproach = upperRoomsVisible(controller, upperApproach);
    const outside=controller.x<HOUSE.minX||controller.x>HOUSE.maxX||controller.z<HOUSE.minZ||controller.z>HOUSE.maxZ;
    const showUpper = surveying ? surveyFloor === 1||roofView : upperApproach||outside;
    const showCeiling = !surveying || surveyFloor === 1||roofView;
    consumables.setUpperVisible(showUpper);
    const showRoof=!surveying||roofView;
    if (upper.visible !== showUpper || ceiling.visible !== showCeiling || roof.shell.visible!==showRoof || roof.ceilings.visible!==showRoof) {
      upper.visible = showUpper; ceiling.visible = showCeiling;
      roof.shell.visible=roof.ceilings.visible=showRoof; renderer.shadowMap.needsUpdate = true;
    }
    setHidden('survey', !surveying || mode === 'pause');
    setData('mode', mode);
    setData('visibleFloor', upper.visible ? '1' : '0');
    setData('ceilingVisible', String(ceiling.visible));
    setData('roofVisible',String(roof.shell.visible));setData('interiorCeilingsVisible',String(roof.ceilings.visible));
    setData('discoveries', String(discovered.size));
    if (renderer.shadowMap.needsUpdate) setData('shadowRevision', String(++shadowRevision));
    renderProfile.begin();
    renderer.render(scene, camera);
    setData('shaderPrograms',String(renderer.info.programs.length));
    renderProfile.end(frameMs, performance.now() - cpuStart);
    if (!document.hidden) cpuTimes.push(performance.now() - cpuStart);
    if (now - profileTime >= 2000 && frameTimes.length) {
      const percentile = (values, p) => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * p)].toFixed(2);
      setData('performance', JSON.stringify({ frameMedian: percentile(frameTimes, .5), frameP95: percentile(frameTimes, .95), cpuMedian: percentile(cpuTimes, .5), cpuP95: percentile(cpuTimes, .95), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }));
      frameTimes.length = cpuTimes.length = 0; profileTime = now;
    }
  }
  updateCamera(0); daylight.update(0,controller,camera); updateHUD(); drawMap();
  // Compile the upstairs and window variants too, before any camera turn can
  // reveal them. compileAsync uses parallel shader compilation when available.
  await renderer.compileAsync(scene, camera);
  // Upload every chunk now, including off-screen rooms, so the first look in a
  // new direction does not allocate vertex buffers during play.
  const culling = [];
  scene.traverse(object => { if (object.isMesh) { culling.push([object, object.frustumCulled]); object.frustumCulled = false; } });
  rabbit.root.position.set(controller.x, controller.y, controller.z);
  renderer.render(scene, camera);
  for (const [object, enabled] of culling) object.frustumCulled = enabled;
  upper.visible = false;
  consumables.setUpperVisible(false);
  renderer.shadowMap.needsUpdate = true;
  previousTime = performance.now();
  $('load-status').hidden = true; $('play').disabled = $('tour').disabled = false;
  requestAnimationFrame(frame); setData('ready', 'true');
}
