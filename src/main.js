import * as THREE from '../vendor/three.module.js';
import { createHouse, batchStaticGeometry } from './house.js';
import { createRabbit } from './model.js';
import { visualHeadroom } from './rabbit-clearance.js';
import { RabbitController, DEN, clamp, SURFACES } from './physics.js';
import { Sound } from './audio.js';
import { FLOOR_HEIGHT, BOUNDS, HOUSE, LANDMARKS, roomAt, floorAt } from './layout.js';
import { createTerrainBackdrop } from './terrain-backdrop.js';
import { drawLevelMap } from './level-map.js';
import { bindMouseControls } from './mouse.js';
import { createPoopBalls } from './poop.js';
import { upperRoomsVisible, basementRoomsVisible } from './visibility.js';
import { createRenderProfile } from './render-profile.js';
import { renderPixelRatio, cameraNearPlane } from './render-quality.js';
import { createConsumables } from './consumables.js';
import { consumableDetails, consumptionSeconds } from './consumable-data.js';
import { DayClock, DAY_SECONDS, formatCountdown } from './day-cycle.js';
import { createDayLighting } from './day-lighting.js';
import { resetAdventure } from './adventure-session.js';
import { Leaderboard, HappinessRun } from './happiness.js';
import { createWaterFountains } from './fountains.js';
import { MAX_CARRIED_POOP } from './poop-supply.js';
import { NoiseSystem } from './noise.js';
import { createNoiseRipples } from './noise-ripples.js';
import { renderConsumableLegend } from './consumable-legend.js';
import { MistressAI } from './mistress-ai.js';
import { createMistressModel } from './mistress-model.js';
import { MistressSight, MistressFootsteps } from './mistress-awareness.js';
import { MistressPursuit, CAPTURE_SECONDS } from './mistress-pursuit.js';
import { MistressCapture } from './mistress-capture.js';
import { MistressVision } from './mistress-vision.js';
import { createMistressCone } from './mistress-cone.js';
import { MistressCleanupSight } from './mistress-cleanup.js';
import { RoundStats } from './round-stats.js';
import { createBasementGate } from './basement-gate.js';
import { BasementAccess } from './basement-access.js';
import {createMirrorMaze} from './mirror-maze.js';
import {createMazeHeart} from './maze-heart.js';
import {AFFECTION_SECONDS} from './maze-affection.js';
import {BasementSceneDirector} from './basement-scenes.js';
import {MistressNavigation} from './mistress-navigation.js';

const elements = new Map();
const TOP_SPRINT_SPEED=Math.max(...Object.values(SURFACES).map(surface=>surface.run));
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
export async function boot({clockNow=()=>performance.now(),scoreStorage,maxNpcMovementPerFrame=.1,mazeRandom=Math.random}={}) {
  renderConsumableLegend($('consumable-legend-rows'));
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
  scene.add(createTerrainBackdrop());
  const basementScenes=new BasementSceneDirector({random:mazeRandom});
  const basementContent=basementScenes.next();
  const { world, layers, upper, ceiling, basement, basementCeiling, lamps, roof } = createHouse(scene,{basementType:basementContent.type,basementLayout:basementContent.layout});
  const ground=layers[0],outsideLayer=layers[2];
  layers.forEach(batchStaticGeometry);
  const basementAccess=new BasementAccess(createBasementGate({parent:ground,world}));
  const maze=createMirrorMaze({parent:basement,world,layoutProvider:()=>basementScenes.current.layout});
  const mazeHeart=createMazeHeart({parent:basement,world,layout:maze.layout});
  const daylight = createDayLighting(scene,{sun,fill,hemisphere},lamps);
  const dayClock = new DayClock(clockNow());
  let storage=scoreStorage; if(storage===undefined) try { storage=window.localStorage; } catch { /* Private browser settings can deny storage. */ }
  const leaderboard=new Leaderboard(storage), happiness=new HappinessRun(leaderboard);
  const roundStats=new RoundStats();
  $('player-name').value=leaderboard.name;
  const rabbit = createRabbit(); scene.add(rabbit.root);
  // Shidan already has an animated contact shadow. Keep her and the tiny balls
  // out of the cached sun map, so they never leave a frozen shadow behind.
  rabbit.root.traverse(object => { object.castShadow = false; });
  const controller = new RabbitController(world);
  const water = createWaterFountains(scene, world,{mazeLayout:()=>maze.layout});
  // Share the human navigation graph with loot placement so rabbit-only
  // passages cannot become protected food/chewing farms.
  const mistressRoutine=new MistressAI(world);
  const consumables = createConsumables(scene, world,{canSpawn:place=>!mistressRoutine.navigation.isRabbitSafe(place),mazeLayout:()=>maze.layout});
  // The fixed heart hay joins navigation after the household placement filter.
  mistressRoutine.navigation=new MistressNavigation(world);
  const poop = createPoopBalls(scene, world);
  consumables.system.setExternalItems(poop);
  const noise = new NoiseSystem(), noiseRipples = createNoiseRipples(scene,world);
  const mistress=new MistressPursuit(mistressRoutine), mistressModel=createMistressModel();scene.add(mistressModel.root);
  const mistressBounds=new THREE.Box3();mistressModel.root.updateMatrixWorld(true);
  mistressModel.root.traverseVisible(object=>{if(object.isMesh&&object!==mistressModel.shadow)mistressBounds.expandByObject(object);});
  setData('mistressStandingHeight',mistressBounds.max.y.toFixed(3));
  const mistressRipples=createNoiseRipples(scene,world);mistressRipples.mesh.name='Mistress noise ripples';
  const mistressStepRipples=createNoiseRipples(scene,world);mistressStepRipples.mesh.name='Mistress footstep ripples';
  const captureVisual=new MistressCapture();
  const mistressSight=new MistressSight([...layers,ceiling,...water.groups],{world}),mistressFootsteps=new MistressFootsteps();
  const enemyVision=new MistressVision(mistressSight,world),mistressCone=createMistressCone(scene,world);
  const cleanupSight=new MistressCleanupSight({vision:enemyVision,navigation:mistress.navigation,poop,water});
  let cleanupTick=-Infinity,cleanupCandidate=null,cleanupRevision='';
  const sightSamples=Array.from({length:8},()=>new THREE.Vector3());
  let mistressInView=false;
  let enemySeen=false,visionTick=-Infinity,visionState='',visionYaw=NaN,captureCount=0,npcMovementSpent=0;
  const npcMovementLimit=maxNpcMovementPerFrame===Infinity?Infinity:.1;
  const sound = new Sound();
  const volumeKey='shidans-adventure.effects-volume.v1';
  try {
    const stored=storage?.getItem(volumeKey),value=Number(stored);
    if(stored!==null&&stored!==undefined&&Number.isFinite(value)&&value>=0&&value<=3)sound.setVolume(value);
  } catch { /* Restricted storage leaves the default volume available. */ }
  $('effects-volume').value=String(Math.round(sound.volume*100));
  setText('effects-volume-value',`${Math.round(sound.volume*100)}%`);
  $('effects-volume').setAttribute('aria-valuetext',`${Math.round(sound.volume*100)} percent`);
  const keys = new Set();
  let mode = 'title', previousMode = 'play', overview = false, mapOpen = false, surveyFloor = 0, gardenView = false;
  let roofView=false;
  const discovered = new Set();
  let yaw = -.45, pitch = .43, distance = 5.2, time = 0, previousTime = performance.now();
  let toastUntil = 0, basementNoticeUntil = 0, lastStep = 0, mapTick = 0, hudTick = 0;
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
  function enemyContext(force=false) {
    const inDen=mistress.navigation.isDen(controller);
    const asleep=mistress.phase==='routine'&&mistress.state==='acting'&&mistress.activity==='sleeping';
    // Hidden passages need an immediate sight check on entry. The den itself
    // is always safe and needs no ray work at all.
    const hiding=!inDen&&mistress.phase==='chase'&&mistress.navigation.isRabbitSafe(controller,mistress.position);
    const table=mistress.navigation.tableAt(controller);
    const state=`${mistress.phase}:${table&&controller.y>=table.maxY-.03?table.id:''}`;
    const turn=Math.abs(Math.atan2(Math.sin(mistress.yaw-visionYaw),Math.cos(mistress.yaw-visionYaw)));
    if(inDen||asleep)enemySeen=false;
    else if(force||hiding||mistress.phase==='scolding'||state!==visionState||turn>.12||mistress.elapsed-visionTick>=.1) {
      syncMistressModel();syncRabbitModel();const eye=mistressModel.getSightPoints()[0];
      enemySeen=enemyVision.canSee({position:mistress.renderPosition,eye,yaw:mistress.yaw},controller,{samples:rabbit.getSightPoints()});
      visionTick=mistress.elapsed;visionState=state;visionYaw=mistress.yaw;
    }
    const revision=`${poop.physics.sequence}:${poop.physics.count}:${water.puddles.at(-1)?.id}:${water.puddles.length}`;
    if(asleep||['caught','scolding'].includes(mistress.phase))cleanupCandidate=null;
    else if(force||mistress.elapsed-cleanupTick>=.1||revision!==cleanupRevision||(cleanupCandidate&&(!cleanupCandidate.exists()||!cleanupCandidate.goal))) {
      syncMistressModel();
      cleanupCandidate=cleanupSight.scan({position:mistress.renderPosition,stance:mistress.position,
        eye:mistressModel.getSightPoints()[0],yaw:mistress.yaw},mistress.cleanupTarget);
      cleanupTick=mistress.elapsed;cleanupRevision=revision;
    }
    return {player:controller,peeing:water.system.peeing,seen:enemySeen,noiseEvents:noise.events,noiseElapsed:noise.elapsed,
      cleanupTarget:cleanupCandidate,topSprintSpeed:TOP_SPRINT_SPEED,
      dayElapsed:dayClock.elapsed,sprintSpeed:SURFACES[controller.surface]?.run||8.2,contactClear:closeContactClear};
  }
  function settlePursuitEvents() {
    for(const event of mistress.takeEvents()) {
      if(event.kind==='caught'||event.kind==='return-den') {
        keys.clear();mouse.clear();water.system.stop();consumables.system.cancel();
        controller.releaseInput();controller.vx=controller.vy=controller.vz=0;controller.sprinting=false;queuedHop=false;jumpSeen=false;
        noise.update(0,controller,{locked:true});
      }
      if(event.kind==='caught') {
        captureCount++;roundStats.caught();sound.household('alert');
        const interaction=mistress.navigation.reachInteraction(controller);
        captureVisual.begin({rabbit:controller,mistress:mistress.renderPosition,rabbitFacing:controller.facing,
          mistressYaw:mistress.yaw,support:interaction?.support??interaction?.table,headroom:visualHeadroom(world,controller)});
      }
      if(event.kind==='cleanup-finished')roundStats.cleanup(event.cleanupKind);
      if(event.kind==='chase-started')sound.household('alert',.7);
      if(event.kind==='cleanup-finished'&&event.cleanupKind==='pee') {
        toast(`Puddle cleaned · mistress rage +${Math.round(mistress.rageBonus*100)}% of top sprint speed`,4);
        sound.household('alert',.8);
      }
      if(event.kind==='return-den') {
        captureVisual.reset();
        controller.reset();mistressFootsteps.relocateListener(controller);poop.supply.observePosition(controller);
        enemySeen=false;visionTick=-Infinity;visionState='';visionYaw=NaN;cameraInitialized=false;yaw=-.45;pitch=.43;distance=5.2;
        toast('Back in the den. She has a few words for you…',5);
      }
    }
  }
  function closeContactClear() {
    syncMistressModel();return enemyVision.contactClear(mistressModel.getSightPoints()[0],controller,{
      stance:mistress.position,reachInteraction:mistress.navigation.reachInteraction(controller)});
  }
  function senseCloseContact(context) {
    if(!mistress.canAttemptCapture(controller,context))return;
    mistress.update(0,context);
  }
  function advanceWaterResources(delta) {
    const before=water.system.bladder.value,wasPeeing=water.system.peeing;
    water.advance(delta,controller);
    if(happiness.active) {
      if(wasPeeing)roundStats.urinate(Math.max(0,before-water.system.bladder.value));
      else roundStats.drink(Math.max(0,water.system.bladder.value-before));
    }
    return wasPeeing&&!water.system.peeing;
  }
  function advanceResources() {
    if(mode==='gameover')return;
    dayClock.update(clockNow());
    const delta=Math.max(0,dayClock.elapsed-resourceElapsed); resourceElapsed=dayClock.elapsed;
    consumables.handle(consumables.system.update(0,controller,delta));
    if(dayClock.finished) {advanceWaterResources(delta);return;}
    if(delta===0)advanceWaterResources(0);
    const householdSequence=mistress.noise.sequence,stepSequence=mistressFootsteps.cueSequence;
    // Catch-up can cross both quiet activities and walking. Small simulation
    // slices keep footsteps attached to the walking intervals they came from.
    for(let left=delta;left>1e-9;) {
      const step=Math.min(left,.05,water.system.peeing?water.system.peeRemaining:Infinity),context=enemyContext();
      context.dayElapsed=dayClock.elapsed-left+step;
      const movement=Math.min(step,Math.max(0,npcMovementLimit-npcMovementSpent));npcMovementSpent+=movement;
      context.movementScale=movement/step;mistress.update(step,context);
      senseCloseContact(context);settlePursuitEvents();
      mistressFootsteps.update(step,{player:controller,mistress});
      // Keep capture protection for the whole interval, including a slow frame
      // that crosses pee completion. Work on its puddle starts afterward.
      const peeFinished=advanceWaterResources(step);left-=step;
      if(peeFinished) {
        cleanupTick=-Infinity;cleanupRevision='';
        const completed=enemyContext(true);completed.dayElapsed=dayClock.elapsed-left;
        mistress.update(0,completed);senseCloseContact(completed);settlePursuitEvents();
      }
    }
    const householdEvents=mistress.noise.events.filter(event=>event.id>householdSequence);
    mistressRipples.update(delta);mistressRipples.emit(householdEvents,mistress.elapsed);
    // Sound follows the live episode, including its randomized cover duration.
    // The sound helper skips missed beats and never queues past its expiry.
    if(delta>0)sound.householdEpisode(mistress.noise.events.at(-1),mistress.elapsed,controller);
    const stepEvents=mistressFootsteps.cues.filter(event=>event.id>stepSequence);
    mistressStepRipples.update(delta);mistressStepRipples.emit(stepEvents,mistressFootsteps.elapsed);
    // Only the newest live footfall plays after a slow frame; old steps never
    // build an audio backlog. The minimap keeps its separate five-metre cues.
    const step=stepEvents.at(-1);
    if(step)sound.mistressFootstep(step,controller,mistressFootsteps.elapsed);
  }
  function nearestInteraction() {
    if(mazeHeart.action.active)return mazeHeart.item;
    if(water.system.target) return water.system.target;
    if(water.system.pending) return water.system.pending;
    if(consumables.system.target) return consumables.system.target;
    const food=consumables.system.nearest(controller), fountain=water.system.nearest(controller);
    const options=[food,fountain,mazeHeart.action.canReach(controller)?mazeHeart.item:null].filter(Boolean);
    return options.sort((a,b)=>Math.hypot(a.x-controller.x,a.z-controller.z)-Math.hypot(b.x-controller.x,b.z-controller.z))[0]??null;
  }
  function dropPoop() {
    advanceResources();
    if(dayClock.finished || water.system.peeing || mistress.playerLocked) return;
    const ball=poop.drop(controller,dayClock.elapsed);
    if(ball)roundStats.dropPoop(ball);
    else {
      toast(poop.supply.value===0 ? 'No poop balls left. Eat something to replenish your supply.' : 'Wait one second between poop balls.',2);
    }
    updateHUD();
  }
  function primaryAction(held) {
    // Settle the preceding active interval before changing the held action.
    // A 0.1-second drink earns exactly 1%, regardless of rendering speed.
    advanceResources();
    if(!held) { water.system.stop(); consumables.system.cancel();mazeHeart.action.cancel(); updateHUD(); return; }
    if(dayClock.finished || mistress.playerLocked) return;
    const nearby=nearestInteraction();
    water.system.stop(); consumables.system.cancel();mazeHeart.action.cancel();
    if(nearby?.id.startsWith('fountain-')) water.system.hold(controller);
    else if(!water.system.peeing) {
      const delay=Math.min(.05,(performance.now()-previousTime)/1000);
      if(nearby===mazeHeart.item)mazeHeart.action.begin(controller,delay);
      else consumables.system.begin(controller,delay);
    }
    updateHUD();
  }
  const mouse = bindMouseControls({
    canvas, document, window, canControl: () => mode === 'play' && !overview && !mapOpen,
    onLook: (dx, dy) => { yaw -= dx * .003; pitch = clamp(pitch + dy * .0027, .06, 1.15); },
    onPoop: dropPoop,
    onPrimary: primaryAction,
    onLockDenied: () => { $('camera-hint').hidden = false; setText('camera-hint', 'Drag to look · hold left-click to eat or drink · scroll to zoom'); },
    onLockChange: (locked, lostLock) => { $('camera-hint').hidden = locked; if (lostLock && mode === 'play' && !overview && !mapOpen) pause(); },
  });
  function clearInput() {
    mazeHeart.action.cancel();
    advanceResources();
    noise.update(0,controller,{locked:true});
    keys.clear(); mouse.clear(); water.system.stop(); consumables.system.cancel(); setHidden('consume-prompt', true); queuedHop = false; jumpSeen = false; controller.releaseInput();
    dayClock.setActive(mode==='play' && !overview && !mapOpen && !document.hidden,clockNow());
  }
  const { lock, unlock } = mouse;
  function showGame() {
    document.body.classList.add('playing'); document.body.classList.remove('touring');
    $('welcome').hidden = true; $('intro-caption').hidden = true; $('intro-footer').hidden = true;
    $('hud').hidden = false; $('menu-button').hidden = false; $('pause').hidden = true;$('game-over').hidden=true;
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
    advanceResources();
    if(water.system.peeing||mistress.playerLocked) return;
    controller.reset();mistressFootsteps.relocateListener(controller);yaw = -.45; pitch = .43; distance = 5.2; clearInput(); cameraInitialized = false;
    toast('Back in your cozy den. Hold left-click by the special hay to refill your energy.');
  }
  function setOverview() {
    if (mode !== 'play' || water.system.peeing || mistress.playerLocked) return;
    overview = !overview; roofView=false;setText('roof-view','Show roof');mapOpen = false; $('atlas').hidden = true; surveyFloor = floorAt(controller.y); clearInput(); renderAtlas();
    if (overview) { unlock(); toast('House view · press V to return to Shidan', 3); }
    else { cameraInitialized = false; canvas.focus(); }
    $('view').innerHTML = overview ? '<kbd>V</kbd> Follow Shidan' : '<kbd>V</kbd> House view';
  }
  function startAdventure() {
    sound.unlock();
    if(!happiness.start($('player-name').value)) {
      returnToTitle(); $('player-name').setCustomValidity('Enter your name to start your adventure.'); $('player-name').reportValidity(); $('player-name').focus(); return;
    }
    $('player-name').value=happiness.name; $('player-name').disabled=true;
    setHidden('day-ended',true);
    escaped = upstairs = false; discovered.clear();
    reset(); showGame(); lock(); toast('Watch her floor pattern: amber sight, blue noise masking. Her vision stays active while she laughs. The den is safe.', 6);
  }
  $('play').addEventListener('click',startAdventure);
  $('player-name').addEventListener('input',()=>{$('player-name').setCustomValidity('');});
  $('player-name').addEventListener('keydown',event=>{if(event.key==='Enter' && !$('play').disabled) startAdventure();});
  $('tour').addEventListener('click', () => {
    sound.unlock();
    mode = 'tour'; overview = true;roofView=false;setText('roof-view','Show roof');clearInput(); surveyFloor = 0; renderAtlas(); document.body.classList.add('touring');
    $('welcome').hidden = true; $('intro-caption').hidden = true; $('menu-button').hidden = false;
    $('menu-button').innerHTML = 'Explore as Shidan <kbd>Enter</kbd>';
  });
  $('menu-button').addEventListener('click', () => { if (mode === 'tour') startAdventure(); else if(mode==='pause')resume();else pause(); });
  $('resume').addEventListener('click', resume);
  $('reset').addEventListener('click', restartGame);
  function resetRunState() {
    basementScenes.next();maze.regenerate();mazeHeart.reset(maze.layout);
    resetAdventure({clock:dayClock,controller,consumables,poop,water,noise,noiseRipples,mistress,mistressRipples,mistressFootsteps,mistressStepRipples,basementAccess},clockNow());
    const navigation=new MistressNavigation(world);
    mistressRoutine.navigation=mistress.navigation=cleanupSight.navigation=navigation;
    captureVisual.reset();
    roundStats.reset();
    mistressInView=false;
    enemySeen=false;visionTick=-Infinity;visionState='';visionYaw=NaN;captureCount=0;npcMovementSpent=0;mistressCone.clear();
    cleanupSight.clear();cleanupTick=-Infinity;cleanupCandidate=null;cleanupRevision='';
    resourceElapsed=0;
    escaped=upstairs=false; discovered.clear(); upperApproach=basementApproach=false;
    yaw=-.45; pitch=.43; distance=5.2; cameraInitialized=false;
    daylight.update(0,controller,camera,0);
    roofView=gardenView=false;surveyFloor=0;previousMode='play';
    setText('roof-view','Show roof');setText('garden-view','Garden view');
    time=toastUntil=basementNoticeUntil=lastStep=mapTick=hudTick=0;
    setHidden('basement-notice',true);
    renderer.shadowMap.needsUpdate=true;
    for(const key of ['lastConsumed','lastConsumedId','lastPoopPosition','lastScore','lastPlayer']) setData(key,'');
    for(const key of ['finalRank','finalRankTotal','roundStats'])setData(key,'');
    setHidden('day-ended',true);setHidden('toast',true);renderDirty=true;
  }
  function restartGame() {
    const name=happiness.active ? happiness.name : $('player-name').value;
    if(!happiness.restart(name)) { startAdventure(); return; }
    clearInput();resetRunState();renderLeaderboard();
    $('player-name').value=happiness.name;$('player-name').disabled=true;
    showGame();updateHUD();drawMap();lock();
    toast('A fresh adventure! Ten minutes, full energy and a cozy den.',4);
  }
  function returnToTitle() {
    mode = 'title'; overview = false; mapOpen = false; $('atlas').hidden = true; clearInput(); unlock();
    if(!water.system.peeing) {controller.reset();mistressFootsteps.relocateListener(controller);}
    cameraInitialized = false;
    document.body.classList.remove('playing', 'touring');
    $('pause').hidden = true; $('game-over').hidden=true;$('welcome').hidden = false; $('intro-caption').hidden = false; $('intro-footer').hidden = false;
    $('hud').hidden = true; $('menu-button').hidden = true; $('menu-button').innerHTML = 'Pause <kbd>Esc</kbd>';
    $('player-name').disabled=happiness.active;
    setText('play',happiness.active ? 'Continue adventure ↗' : 'Let’s explore ↗');
    setText('name-hint',happiness.active ? `Continuing as ${happiness.name} · your score and time are kept.` : 'Your completed score will be saved under this name.');
    $('play').focus();
  }
  $('back-title').addEventListener('click', returnToTitle);
  $('game-over-new').addEventListener('click',restartGame);
  $('game-over-menu').addEventListener('click',()=>{mode='title';resetRunState();returnToTitle();updateHUD();renderDirty=true;});
  function renderGameOver(result,stats) {
    const rank=leaderboard.rank(result);
    setText('game-over-player',`${result.name}’s adventure`);
    setText('game-over-score',result.score.toLocaleString());
    setText('game-over-rank',`#${rank} of ${leaderboard.entries.length}`);
    setText('game-over-storage',leaderboard.saved?'Saved to this browser’s leaderboard · tied scores share a rank':'Browser storage unavailable · rank and score are kept for this session');
    const values={
      'result-items':stats.consumedTotal,'result-poop':stats.poopDropped,'result-puddles':stats.puddlesCreated,
      'result-water':`${stats.waterDrunk.toFixed(2)}%`,'result-urine':`${stats.urineProduced.toFixed(2)}%`,
      'result-captures':stats.captures,'result-hops':stats.hops,'result-long-jumps':stats.longJumps,
      'result-sprint':`${stats.sprintSeconds.toFixed(1)} s`,'result-distance':`${stats.distanceTravelled.toFixed(1)} m`,
      'result-cleaned-poop':stats.wasteCleaned.poop,'result-cleaned-pee':stats.wasteCleaned.pee,
    };
    for(const [id,value] of Object.entries(values))setText(id,String(value));
    $('game-over-items').replaceChildren(...Object.entries(stats.consumed).map(([key,count])=>{
      const row=document.createElement('tr'),name=document.createElement('th'),number=document.createElement('td');
      name.scope='row';name.textContent=consumableDetails(key==='den-hay'?{type:'hay',permanent:true}:{type:key}).name;
      number.textContent=String(count);row.append(name,number);row.dataset.item=key;return row;
    }));
    setData('lastScore',String(result.score));setData('lastPlayer',result.name);
    setData('finalRank',String(rank));setData('finalRankTotal',String(leaderboard.entries.length));setData('roundStats',JSON.stringify(stats));
  }
  function finishDay() {
    if(!happiness.active||mode==='gameover')return;
    const result=happiness.finish(dayClock);
    if(!result)return;
    const stats=roundStats.snapshot();mode='gameover';overview=false;mapOpen=false;captureVisual.reset();
    clearInput();unlock();$('atlas').hidden=$('pause').hidden=$('survey').hidden=$('leaderboard').hidden=true;
    $('hud').hidden=$('menu-button').hidden=$('welcome').hidden=$('intro-caption').hidden=$('intro-footer').hidden=true;
    setHidden('toast',true);toastUntil=0;renderGameOver(result,stats);renderLeaderboard();
    $('game-over').hidden=false;$('game-over-new').focus();updateHUD();renderDirty=true;
  }
  $('home').addEventListener('click', () => { reset(); canvas.focus(); });
  $('view').addEventListener('click', setOverview);
  function toggleMap() {
    if (mode !== 'play' || water.system.peeing || mistress.playerLocked) return;
    mapOpen = !mapOpen; clearInput(); $('atlas').hidden = !mapOpen;
    if (mapOpen) { surveyFloor = floorAt(controller.y); unlock(); renderAtlas(); }
    else canvas.focus();
  }
  function renderAtlas() {
    drawLevelMap($('atlas-canvas').getContext('2d'), 680, 740, controller, surveyFloor, discovered, true,{maze:maze.layout});
    setText('atlas-floor-name', surveyFloor===-1?'Basement':surveyFloor===1?'Upstairs & balcony':'Ground floor & garden');
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
    setText('audio-status',enabled?(sound.volume===0?'Raise volume to hear effects.':'Footsteps fade with distance.'):'Sound is off. Use Sound on to hear effects.');
    $('sound').setAttribute('aria-pressed',String(enabled));updateHUD();
  });
  $('effects-volume').addEventListener('input',()=>{
    sound.setVolume(Number($('effects-volume').value)/100);
    const percent=Math.round(sound.volume*100);
    setText('effects-volume-value',`${percent}%`);$('effects-volume').setAttribute('aria-valuetext',`${percent} percent`);
    setText('audio-status',sound.enabled?(percent===0?'Raise volume to hear effects.':'Footsteps fade with distance.'):'Sound is off. Use Sound on to hear effects.');
    sound.unlock();
    try {storage?.setItem(volumeKey,String(sound.volume));}catch{/* The live control still works without storage. */}
    updateHUD();
  });
  $('test-sound').addEventListener('click',async()=>{
    if(!sound.enabled){setText('audio-status','Sound is off. Use Sound on to hear the test.');return;}
    if(sound.volume===0){setText('audio-status','Raise volume to hear the test.');return;}
    const ready=await sound.unlock();
    if(ready){sound.previewFootsteps();setText('audio-status','Playing nearby footsteps.');}
    else setText('audio-status','Audio could not start. Try Sound off, then Sound on.');
    updateHUD();
  });
  $('audio-settings').addEventListener('toggle',()=>{
    if(!$('audio-settings').open)return;
    keys.clear();mouse.clear();controller.releaseInput();water.system.stop();consumables.system.cancel();queuedHop=false;jumpSeen=false;
  });
  canvas.addEventListener('mousedown',()=>sound.unlock());
  addEventListener('keydown', event => {
    if(mode==='play'&&!event.repeat&&event.target===canvas)sound.unlock();
    if(mode==='gameover') {
      if(event.code==='Tab') {
        const stops=[...$('game-over').querySelectorAll('button,[tabindex="0"]')],first=stops[0],last=stops.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
      return;
    }
    if(!$('leaderboard').hidden) {
      if(event.code==='Escape') $('close-leaderboard').click();
      if(event.code==='Tab') { event.preventDefault(); $('close-leaderboard').focus(); }
      return;
    }
    if(event.target instanceof Element&&event.target.closest('#audio-settings')) {
      if(event.code==='Escape') {event.preventDefault();$('audio-settings').open=false;canvas.focus();}
      return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code) && mode === 'play' && event.target === canvas) event.preventDefault();
    if (event.code === 'Escape') { if (mapOpen) { toggleMap(); return; } if (mode === 'pause') resume(); else pause(); return; }
    // Disclosure and scroll-region keys belong to the board, not Shidan.
    if(event.target instanceof Element && event.target.closest('#consumable-legend')) return;
    if (mode === 'play' && (water.system.peeing||mistress.playerLocked)) {
      advanceResources();if(water.system.peeing||mistress.playerLocked) { event.preventDefault();return; }
    }
    if (event.code === 'Enter' && mode === 'tour') { startAdventure(); return; }
    if (mode === 'play' && ['KeyM', 'KeyV'].includes(event.code)) {
      event.preventDefault(); if (!event.repeat) { if (event.code === 'KeyM') toggleMap(); else setOverview(); } return;
    }
    if (mode !== 'play' || event.target instanceof HTMLButtonElement) return;
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') jumpSeen = false;
    if (event.code === 'KeyR') reset();
    if (event.code === 'KeyP' && !overview && !mapOpen) dropPoop();
    if (event.code === 'KeyQ' && !overview && !mapOpen) {
      advanceResources();
      const pee=!dayClock.finished&&!mistress.playerLocked?water.pee(controller):null;
      if(pee) {
        roundStats.peeStarted(pee);
        keys.clear();mouse.clear();consumables.system.cancel();controller.releaseInput();
        controller.vx=controller.vz=0;controller.sprinting=false;queuedHop=false;jumpSeen=false;
        toast('Peeing… stay still for one second.',1);updateHUD();
      } else if(!dayClock.finished && water.system.bladder.value<100) {
        toast('Fill your bladder to 100% before peeing.',2);updateHUD();
      }
    }
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
    if (mode === 'title') {
      desiredCamera.set(DEN.x + 5.8 + Math.sin(time * .12) * .15, 3.8, DEN.z + 5.5);
      lookAt.set(DEN.x - 1.5, .65, DEN.z);
    } else if (overview || mode === 'tour' || (mode === 'pause' && previousMode === 'tour')) {
      const orbit = mode === 'tour' ? Math.sin(time * .08) * 1.5 : 0;
      if(surveyFloor===-1) {desiredCamera.set(38+orbit,34,43);lookAt.set(0,-3,-2);}
      else if (gardenView) { desiredCamera.set(-35, 38, -62); lookAt.set(0, 1.5, -12); }
      else { desiredCamera.set(46 + orbit, 60, 60); lookAt.set(0, 1, -3); }
    } else {
      const follow=mistress.playerLocked&&captureVisual.active?rabbit.root.position:controller;
      target.set(follow.x, follow.y + .62, follow.z);
      desiredCamera.set(follow.x + Math.sin(yaw) * Math.cos(pitch) * distance,
        target.y + Math.sin(pitch) * distance, follow.z + Math.cos(yaw) * Math.cos(pitch) * distance);
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
      desiredCamera.y = Math.max(follow.y + .27, desiredCamera.y);
      lookAt.copy(target);
    }
    if (!cameraInitialized) { camera.position.copy(desiredCamera); cameraInitialized = true; }
    else camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 8));
    const surveying=overview||mode==='tour'||(mode==='pause'&&previousMode==='tour');
    const near=cameraNearPlane(camera.position.distanceTo(lookAt),surveying);
    if(Math.abs(camera.near-near)>.0001){camera.near=near;camera.updateProjectionMatrix();}
    camera.lookAt(lookAt);
  }

  function updateHUD() {
    setData('soundEnabled',String(sound.enabled));
    setData('audio',JSON.stringify(sound.diagnostics));
    setText('happiness-value',happiness.score.toLocaleString()); setText('score-player',happiness.name || 'Your little adventure');
    setData('happiness',String(happiness.score));
    setData('basementUnlocked',String(basementAccess.unlocked));
    setText('day-countdown',formatCountdown(dayClock.remaining));
    setText('day-phase',daylight.state.phase);
    setText('day-caption',daylight.state.night===1 ? 'The house is lit' : 'Night falls at 2:00');
    $('day-clock').dataset.night=String(daylight.state.night===1);
    $('day-clock').dataset.paused=String(!dayClock.active);
    $('day-fill').style.width=`${dayClock.remaining/DAY_SECONDS*100}%`;
    setData('dayRemaining',dayClock.remaining.toFixed(2)); setData('dayPhase',daylight.state.phase);
    setData('lamps',daylight.state.lamps.toFixed(3));
    const energy = controller.energy.value.toFixed(2), nearby = nearestInteraction();
    const nearbyWater=nearby?.id.startsWith('fountain-') ? water.system.remaining(nearby) : null;
    setText('energy-value', `${energy}%`); $('energy-fill').style.width = `${energy}%`;
    $('energy-meter').setAttribute('aria-valuenow', energy);
    $('energy-panel').dataset.low = String(controller.energy.value < 10);
    $('energy-panel').dataset.recovering = String(controller.energy.recovering);
    setText('energy-status', controller.energy.recovering ? 'Restoring energy…' : controller.sprintExhausted ? 'Rest to recover · release Shift to sprint' : controller.sprinting ? 'Sprinting · using energy' : 'Restoring 0.01% every 0.5 seconds');
    const bladderValue=water.system.bladder.value;
    // Do not round a nearly full bladder up to a misleading 100.00%.
    const bladder=(bladderValue<100 ? Math.min(bladderValue,99.99) : bladderValue).toFixed(2), drinkWait=water.system.cooldownRemaining;
    const cooldownText=seconds=>(Math.ceil(Math.max(0,seconds)*10-1e-8)/10).toFixed(1);
    setText('bladder-value',`${bladder}%`); $('bladder-fill').style.width=`${bladder}%`;
    $('bladder-meter').setAttribute('aria-valuenow',bladder);
    $('bladder-panel').dataset.full=String(water.system.bladder.value===100);
    setText('bladder-status',water.system.peeing ? 'Emptying bladder · actions locked' : drinkWait>0 ? `${water.system.pending?'Keep holding · ready':'Drink again'} in ${cooldownText(drinkWait)}s` : water.system.bladder.value===100 ? 'Full · press Q to pee' : water.system.drinking ? 'Drinking · +10% per second' : nearbyWater===0 ? 'Fountain empty · try another room' : 'Hold left-click near a fountain');
    setText('pee-cooldown',water.system.peeing ? `Peeing · ${cooldownText(water.system.peeRemaining)}s` : drinkWait>0 ? `Pee ready in ${cooldownText(drinkWait)}s` : water.system.bladder.value===100 ? 'Q · pee ready · 0.0s' : 'Q · fill to 100%');
    setHidden('pee-progress',!water.system.peeing);
    $('pee-fill').style.width=`${water.system.peeProgress*100}%`;
    $('pee-progress').setAttribute('aria-valuenow',(water.system.peeProgress*100).toFixed(0));
    $('home').disabled=$('view').disabled=$('map-button').disabled=water.system.peeing||mistress.playerLocked;
    setText('poop-count',String(poop.supply.value));
    const poopWait=Math.max(0,poop.supply.nextPoopAt-dayClock.elapsed);
    setText('poop-status',water.system.peeing ? 'Wait until peeing finishes' : poop.supply.value===0 ? 'Eat to replenish your supply' : 'Right-click or P');
    setText('poop-cooldown',poopWait>0 ? `Poop ready in ${cooldownText(poopWait)}s` : 'Poop ready · 0.0s');
    setData('poopSupply',String(poop.supply.value)); setData('poopCapacity',String(MAX_CARRIED_POOP));
    setData('poopCooldown',poopWait.toFixed(3)); setData('denHayPoopReady',String(poop.supply.denHayRewardAvailable));
    setData('bladder',bladder); setData('drinking',String(water.system.drinking)); setData('drinkCooldown',drinkWait.toFixed(3));
    setData('drinkPending',water.system.pending?.id??'');
    setData('peeing',String(water.system.peeing));setData('peeProgress',water.system.peeProgress.toFixed(3));setData('peeRemaining',water.system.peeRemaining.toFixed(3));
    setData('puddleCount',String(water.puddles.length));
    setData('fountainRemaining',nearbyWater===null ? '' : nearbyWater.toFixed(2));
    setData('fountainWater',JSON.stringify(Object.fromEntries(water.items.map(item=>[item.id,water.system.remaining(item)]))));
    setText('food-count', `${consumables.system.count} snacks · ${consumables.system.chewableCount} chewables${controller.y<-1?` · ${consumables.system.mazeCount} maze treats`:''}`);
    setHidden('consume-prompt', !nearby || mode !== 'play' || overview || mapOpen || water.system.peeing||mistress.playerLocked);
    if (nearby) {
      const fountain=nearby.id.startsWith('fountain-');
      setHidden('consume-meter',fountain);
      if(fountain) {
        setText('consume-name','Water fountain'); setText('consume-energy',`${nearbyWater.toFixed(1)}% water left · +10% bladder per second`);
        setText('consume-action',nearbyWater===0 ? 'Empty · refills next round' : drinkWait>0 ? (water.system.pending?`Keep holding · drink in ${cooldownText(drinkWait)}s`:`Wait ${Math.ceil(drinkWait)}s after peeing`) : water.system.bladder.value===100 ? 'Bladder full · press Q to pee' : 'Drink · hold left mouse');
      } else if(nearby===mazeHeart.item) {
        setText('consume-name','Blue bunny plush');setText('consume-energy',mazeHeart.action.completed?'Already shared a special moment':'+500 happiness · once per adventure');
        setText('consume-action',mazeHeart.action.completed?'Come back next adventure for another kiss':`Give a kiss · hold left mouse for ${AFFECTION_SECONDS} seconds`);
        $('consume-fill').style.width=`${mazeHeart.action.fraction*100}%`;
        $('consume-meter').setAttribute('aria-valuenow',(mazeHeart.action.fraction*100).toFixed(0));
      } else {
        const type = consumableDetails(nearby), progress = consumables.system.fraction, seconds=consumptionSeconds(nearby);
        const poopReward=nearby.permanent&&!(nearby.mazeHay?poop.supply.mazeHayRewardAvailable:poop.supply.denHayRewardAvailable) ? 0 : type.poop||0;
        const rewards=[nearby.permanent ? '100% energy' : type.energy ? `+${type.energy} energy` : '',type.happiness ? `+${type.happiness} happiness` : '',poopReward ? `+${poopReward} poop balls` : ''].filter(Boolean).join(' · ');
        setText('consume-name', type.name); setText('consume-energy', rewards);
        setText('consume-action',`${type.verb} · hold left mouse for ${seconds} ${seconds>1 ? 'seconds' : 'second'}${nearby.permanent&&!poopReward ? ' · leave and re-enter for more poop' : ''}`);
        $('consume-fill').style.width = `${progress*100}%`;
        $('consume-meter').setAttribute('aria-valuenow', (progress*100).toFixed(0));
      }
    }
    setData('energy', energy); setData('sprinting', String(controller.sprinting));
    setData('freeDenJump',String(controller.hasFreeDenJump));setData('pushing',String(controller.pushing));
    setData('lastPushedId',controller.lastPushedId||'');
    setData('consumableCount', String(consumables.system.count));
    setData('mazeConsumableCount',String(consumables.system.mazeCount));
    if(canvas.dataset.mazeRevision!==String(maze.revision)) {
      setData('mazeLayout',JSON.stringify(maze.layout));setData('mazeRevision',String(maze.revision));
      setData('basementScene',JSON.stringify({type:basementScenes.current.type,layoutId:maze.layout.layoutId,layoutName:maze.layout.layoutName}));
      setData('mazeSupplies',JSON.stringify([...consumables.system.mazeSupplies.items.values()].map(({id,type,x,y,z})=>({id,type,x,y,z}))));
    }
    setData('plushCompleted',String(mazeHeart.action.completed));setData('plushProgress',mazeHeart.action.progress.toFixed(3));
    setData('chewableCount',String(consumables.system.chewableCount));
    setData('consumeTarget', nearby?.id || ''); setData('consumeProgress', consumables.system.progress.toFixed(2));
    setData('consumePosition',nearby?[nearby.x,nearby.y,nearby.z].map(v=>v.toFixed(3)).join(','):'');
    setData('energyRecovering', String(controller.energy.recovering));
    setData('hayCount',String([...consumables.system.items.values()].filter(item=>item.type==='hay').length));
    const distFromDen = Math.hypot(controller.x - DEN.x, controller.z - DEN.z);
    const floor=floorAt(controller.y),high=floor===1;
    const onStairs = controller.surface === 'stairs';
    const room = roomAt(controller.x, controller.y, controller.z);
    setText('floor-label', onStairs ? 'ON THE STAIRS' :floor===-1?'BASEMENT': ['yard', 'front-yard', 'balcony'].includes(room?.id) ? 'OUTSIDE' : high ? 'UPSTAIRS' : 'GROUND FLOOR');
    setText('map-floor',floor===-1?'B1':high?'2F':'1F');
    setText('location', onStairs ? (controller.y<0?'The basement stairs':'A little climb') : floor===-1 ? 'The frosted-glass maze' : distFromDen < DEN.radius && floor===0 ? 'Shidan’s den' : room?.name || 'The garden path');
    const surfaces = { bedding: 'Soft bedding · good grip', carpet: 'Cozy carpet · good grip', wood: 'Wooden floor · a little slide', stairs: 'Stair runner · steady paws', grass: 'Soft grass · sure-footed paws', deck: 'Outdoor deck · sure-footed paws',concrete:'Cement floor · sure-footed paws' };
    setText('surface', surfaces[controller.surface]);
    if (canvas.dataset.surface !== controller.surface) $('surface-dot').style.background = controller.surface === 'wood' ? '#bd995d' : '#91a773';
    setHidden('charge', !controller.charging);
    if (controller.charging) {
      const power = Math.round(Math.min(1, controller.charge / .65) * 100);
      $('charge-fill').style.width = `${power}%`; setText('charge-percent', `${power}%`);
      const forward=Number(keys.has('KeyW') || keys.has('ArrowUp'))-Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const right=Number(keys.has('KeyD') || keys.has('ArrowRight'))-Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const cost = controller.jumpCost(controller.charge,{x:-Math.sin(yaw)*forward+Math.cos(yaw)*right,z:-Math.cos(yaw)*forward-Math.sin(yaw)*right});
      setText('charge-label', controller.surface === 'wood' || controller.surface === 'stairs' ? 'Slippery floor · free small hop' : cost===0 ? 'Den jump · no energy cost' : controller.energy.value < cost ? 'Low energy · free small hop' : `${power >= 100 ? 'Release!' : 'Crouch & spring'} · −${cost.toFixed(2)} energy`);
    }
    if (!escaped && distFromDen > DEN.radius + .36 && controller.grounded) {
      escaped = true;
      toast('Your first great escape! Press M for rooms, shortcuts, and little discoveries.', 6); sound.chime();
    }
    if (!upstairs && high && controller.grounded && !onStairs) {
      upstairs = true;
      toast('Made it upstairs. The carpet is perfect for happy little leaps.', 5); sound.chime();
    }
    for (const l of LANDMARKS) {
      if (!discovered.has(l.id) && controller.grounded && Math.abs(controller.y - l.y) < .4 && Math.hypot(controller.x - l.x, controller.z - l.z) < l.radius) {
        discovered.add(l.id); toast(`A little discovery: ${l.name.toLowerCase()} (${discovered.size}/${LANDMARKS.length})`, 5); sound.chime();
      }
    }
    setText('discoveries', `${discovered.size} / ${LANDMARKS.length} little discoveries`);
    setData('escaped',String(escaped));
    if (time > toastUntil) setHidden('toast', true);
    if (time > basementNoticeUntil) setHidden('basement-notice', true);
    // Useful DOM-level telemetry for browser QA, without exposing a mutable debug API.
    setData('position', `${controller.x.toFixed(2)},${controller.y.toFixed(2)},${controller.z.toFixed(2)}`);
    setData('surface', controller.surface); setData('mode', mode); setData('grounded', String(controller.grounded));
    setData('camera', `${yaw.toFixed(2)},${pitch.toFixed(2)}`);
    setData('poopCount', String(poop.physics.count));
    setData('poopActive', String(poop.physics.active.size));
    setData('noiseSequence',String(noise.sequence));setData('noiseCount',String(noise.events.length));
    setData('noiseKinds',noise.activeKinds.join(','));setData('noiseRipples',String(noiseRipples.count));
    const latestNoise=noise.events.at(-1);
    setData('lastNoiseKind',latestNoise?.kind || '');setData('lastNoiseScope',latestNoise?.scope || '');
    setData('lastNoiseRadius',latestNoise?.radius===5 ? '5' : latestNoise ? 'house' : '');
    setData('lastNoisePosition',latestNoise ? [latestNoise.position.x,latestNoise.position.y,latestNoise.position.z].map(v=>v.toFixed(3)).join(',') : '');
    setData('mistressPosition',[mistress.position.x,mistress.position.y,mistress.position.z].map(v=>v.toFixed(3)).join(','));
    setData('mistressRenderPosition',[mistress.renderPosition.x,mistress.renderPosition.y,mistress.renderPosition.z].map(v=>v.toFixed(3)).join(','));
    setData('mistressActivity',mistress.activity);setData('mistressState',mistress.state);
    setData('mistressRemaining',mistress.remaining.toFixed(3));setData('mistressSpeed',mistress.speed.toFixed(3));
    setData('mistressElapsed',mistress.elapsed.toFixed(3));setData('mistressLaughing',String(mistress.laughing));
    setData('mistressNoiseSequence',String(mistress.noise.sequence));setData('mistressNoiseCount',String(mistress.noise.events.length));
    setData('mistressNoiseKinds',mistress.noise.events.map(event=>event.kind).join(','));setData('mistressRipples',String(mistressRipples.count));
    const latestHouseholdNoise=mistress.noise.events.at(-1);
    setData('mistressNoiseDuration',String(latestHouseholdNoise?.lifetime??0));
    setData('mistressNoiseRemaining',Math.max(0,(latestHouseholdNoise?.expiresAt??mistress.elapsed)-mistress.elapsed).toFixed(9));
    setData('mistressFootstepSequence',String(mistressFootsteps.sequence));
    setData('mistressFootstepCount',String(mistressFootsteps.events.length));
    setData('mistressPhase',mistress.phase);setData('mistressSeesPlayer',String(enemySeen));
    setData('mistressMasking',String(mistress.maskingNoise));setData('mistressChaseMultiplier',mistress.chaseMultiplier.toFixed(2));
    setData('mistressChaseSpeed',mistress.chaseSpeed.toFixed(3));setData('mistressLostSight',mistress.lostSightFor.toFixed(3));
    setData('mistressSearchRemaining',mistress.searchRemaining.toFixed(3));setData('mistressCaptureRemaining',mistress.captureRemaining.toFixed(3));
    setData('mistressCornerPause',mistress.cornerPauseRemaining.toFixed(3));setData('mistressDetection',mistress.lastDetection);
    setData('mistressInvestigating',String(mistress.investigating));setData('mistressScoldRemaining',mistress.scoldRemaining.toFixed(3));
    setData('mistressCleanupKind',mistress.cleanupKind);setData('mistressCleanupRemaining',mistress.cleanupRemaining.toFixed(3));
    setData('mistressCleanupTarget',mistress.cleanupTargetId??'');setData('mistressRageBonus',mistress.rageBonus.toFixed(2));
    setData('mistressRageSpeedBonus',mistress.rageSpeedBonus.toFixed(3));
    setData('captureCount',String(captureCount));
    setData('mistressStepRipples',String(mistressStepRipples.count));
    setData('mistressStepSequence',String(mistressFootsteps.cueSequence));
    setData('mistressStepCues',JSON.stringify(mistressFootsteps.cues));
    const playing=mode==='play'&&!overview&&!mapOpen;
    setHidden('noise-cover',!playing||!mistress.maskingNoise);
    setHidden('mistress-rage',!playing||mistress.rageBonus<=0);
    setText('mistress-rage',`Mistress rage +${Math.round(mistress.rageBonus*100)}% · +${mistress.rageSpeedBonus.toFixed(2)} m/s`);
    const warning=playing&&['chase','search','caught','scolding','cleanup'].includes(mistress.phase);
    setHidden('chase-warning',!warning);setHidden('danger-vignette',!warning||!['chase','caught'].includes(mistress.phase));
    $('chase-warning').dataset.phase=mistress.phase;
    setText('chase-title',mistress.phase==='cleanup'?(mistress.state==='acting'?'She’s cleaning…':'She spotted a mess!'):mistress.phase==='caught'?'Caught!':mistress.phase==='scolding'?'Someone’s in trouble…':mistress.phase==='search'?'She’s searching…':mistress.investigating?'She heard that!':'She’s after you!');
    const showDistance=playing&&['chase','search'].includes(mistress.phase);
    const separation=Math.hypot(controller.x-mistress.renderPosition.x,controller.y-mistress.renderPosition.y,controller.z-mistress.renderPosition.z);
    setHidden('chase-distance',!showDistance);setText('chase-distance-value',`${separation.toFixed(1)} m`);
    setData('mistressDistance',showDistance?separation.toFixed(3):'');
    setText('chase-detail',mistress.phase==='caught'?`Back in the den in ${(Math.ceil(mistress.captureRemaining*10-1e-8)/10).toFixed(1)}s`:mistress.phase==='scolding'?`A little talking-to · ${Math.ceil(mistress.scoldRemaining-1e-8)}s`:mistress.phase==='search'?'Stay hidden and quiet':mistress.investigating?'She’s checking the sound · move quietly':mistress.lastDetection==='sight'?'Break her sight · use cover and narrow passages':'She heard that · find cover and stay quiet');
    if(mistress.phase==='cleanup')setText('chase-detail',`${mistress.cleanupKind==='pee'?'Pee puddle':'Poop ball'} · ${mistress.state==='acting'?`${(Math.ceil(mistress.cleanupRemaining*10-1e-8)/10).toFixed(1)}s left`:'a little time to escape'}`);
    const latestPoop = poop.physics.balls.reduce((latest,ball)=>!latest||ball.id>latest.id?ball:latest,null);
    setData('lastPoopPosition',latestPoop ? `${latestPoop.x.toFixed(3)},${latestPoop.y.toFixed(3)},${latestPoop.z.toFixed(3)}` : '');
  }
  const map = $('map').getContext('2d');
  function syncMistressModel() {
    const position=mistress.renderPosition;
    const progress=mistress.playerLocked&&captureVisual.active?clamp(1-mistress.captureRemaining/CAPTURE_SECONDS,0,1):null;
    mistressModel.root.position.set(position.x,position.y,position.z);
    mistressModel.root.rotation.y=progress===null?mistress.yaw:captureVisual.sample(progress).mistressYaw;
    mistressModel.animate(mistress.elapsed,{activity:mistress.state==='walking'?'idle':(mistress.definition?.animation??mistress.activity),moving:mistress.state==='walking',speed:mistress.speed,activityTime:mistress.activityTime,laughing:mistress.laughing,poseWeight:mistress.poseWeight,cleanupKind:mistress.cleanupKind,enraged:mistress.rageBonus>0,
      captureProgress:progress,captureTarget:progress===null?null:controller,captureSupport:progress===null?null:captureVisual.support});
  }
  function syncRabbitModel() {
    const captured=mistress.playerLocked&&captureVisual.active;
    const progress=captured?clamp(1-mistress.captureRemaining/CAPTURE_SECONDS,0,1):0;
    let carryWeight=0,capturedHeadroom=Infinity;
    if(captured) {
      syncMistressModel();
      const pose=captureVisual.sample(progress,mistressModel.getCradlePoint());
      rabbit.root.position.copy(pose.position);rabbit.root.rotation.y=pose.facing;carryWeight=pose.carryWeight;capturedHeadroom=pose.headroom??Infinity;
    } else {
      rabbit.root.position.set(controller.x,controller.y,controller.z);
      rabbit.root.rotation.y=mode==='title'?.43:controller.facing;
    }
    const speed=mode==='play'?Math.hypot(controller.vx,controller.vz):0;
    const action=captured?'carried':water.system.peeing?'pee':water.system.drinking?'drink':consumables.system.target||mazeHeart.action.active?'eat':'idle';
    const rendered=captured?rabbit.root.position:controller;
    const clearance=Math.min(visualHeadroom(world,rendered),capturedHeadroom);
    rabbit.animate(time,captured?0:speed,controller.grounded,controller.charge/.8,
      world.support(rendered.x,rendered.z,rendered.y+.01,true).y,action,clearance,carryWeight);
    setData('rabbitDucking',String(rabbit.ducking));
    setData('rabbitHeadroom',Number.isFinite(clearance)?clearance.toFixed(3):'open');
    setData('rabbitRenderPosition',rabbit.root.position.toArray().map(value=>value.toFixed(3)).join(','));
    setData('mistressCaptureProgress',captured?progress.toFixed(4):'');
    setData('captureCarryWeight',carryWeight.toFixed(4));
    return action;
  }
  function drawMap() {
    if(!cameraInitialized) {syncMistressModel();updateCamera(0);}
    mistressModel.root.updateMatrixWorld(true);
    const joints=mistressModel.joints;
    [joints.head,joints.body,...joints.arms,...joints.shins].forEach((joint,index)=>joint.getWorldPosition(sightSamples[index]));
    joints.body.localToWorld(sightSamples[6].set(0,.2,0));
    joints.head.localToWorld(sightSamples[7].set(0,.15,0));
    mistressInView=mistressSight.inView(camera,sightSamples,{visible:mistressModel.root.visible});
    const ripples=mistressFootsteps.ripples;
    drawLevelMap(map,170,192,controller,floorAt(controller.y),discovered,false,{mistress:mistressInView?mistress.renderPosition:null,ripples,maze:maze.layout});
    setData('mapMistressVisible',String(mistressInView));setData('mapFootstepCount',String(ripples.length));
    setData('mapFootsteps',JSON.stringify(ripples));
  }

  // Read-only diagnostics, sampled in batches so profiling does not alter play.
  const frameTimes = [], cpuTimes = [];
  let profileTime = performance.now();
  let upperApproach = false,basementApproach=false,shadowRevision = 0;

  function frame(now) {
    const cpuStart = performance.now();
    const frameMs = now - previousTime;
    requestAnimationFrame(frame);
    const dt = Math.min((now - previousTime) / 1000, .1); previousTime = now;
    advanceResources();
    if(dayClock.finished&&happiness.active) finishDay();
    const frozen = mode === 'pause' || mode==='gameover' || mapOpen || document.hidden;
    if (frozen && wasFrozen && !renderDirty) return;
    wasFrozen = frozen; renderDirty = false;
    if (!document.hidden) frameTimes.push(frameMs);
    if (!frozen) time += dt;
    if (mode === 'play' && !overview && !frozen) {
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const input = { x: -Math.sin(yaw) * forward + Math.cos(yaw) * right, z: -Math.cos(yaw) * forward - Math.sin(yaw) * right, run: keys.has('ShiftLeft') || keys.has('ShiftRight'), jump: keys.has('Space'),locked:water.system.peeing||mistress.playerLocked,captured:mistress.playerLocked };
      const motionX=controller.x,motionZ=controller.z;
      let frameJump=null;
      if (queuedHop) { controller.update(.0001, { ...input, jump: true });frameJump=controller.lastJump; queuedHop = false; }
      controller.update(dt, input);
      frameJump=controller.lastJump||frameJump;
      if(frameJump)roundStats.jump(frameJump);
      // Actual substep displacement includes acceleration and collision stops;
      // sample before any capture/home teleport can change the position.
      if(dt>0)roundStats.travel(dt,{sprinting:controller.sprinting,speed:Math.hypot(controller.x-motionX,controller.z-motionZ)/dt});
      poop.supply.observePosition(controller);
      poop.supply.observeMazePosition(controller,maze.layout.heart);
      const affectionBefore=mazeHeart.action.progress;
      const affectionReward=mazeHeart.action.update(dt,controller,{blocked:water.system.peeing||mistress.playerLocked});
      if(affectionReward&&happiness.award(affectionReward)) {toast('A special kiss! +500 happiness ♡',5);sound.chime();}
      if(mazeHeart.action.active&&Math.hypot(controller.vx,controller.vz)<.5)controller.facing=Math.atan2(mazeHeart.item.x-controller.x,mazeHeart.item.z-controller.z);
      const previousConsumeProgress=consumables.system.progress;
      const resourceEvents = consumables.system.update(dt, controller,0);
      // A target alone is only a selection. Noise begins when the held action
      // actually progresses, including an interrupted hold or its final frame.
      const eating=consumables.system.progress>previousConsumeProgress ? consumables.system.target : resourceEvents.find(event=>event.kind==='consume')?.item;
      const noiseEvents=noise.update(dt,controller,{consuming:eating,affection:affectionReward>0||mazeHeart.action.progress>affectionBefore,longJump:controller.lastJump==='long',locked:water.system.peeing||mistress.playerLocked});
      noiseRipples.emit(noiseEvents);noiseRipples.update(dt);
      const context=enemyContext();mistress.update(0,context);senseCloseContact(context);settlePursuitEvents();
      consumables.handle(resourceEvents);
      for (const event of resourceEvents) if (event.kind === 'consume') {
        const type = consumableDetails(event.item);
        const poopGained=poop.supply.grantFromConsumption(event,controller);
        happiness.consume(event);
        if(basementAccess.update(happiness.score)) {
          setHidden('basement-notice',false);basementNoticeUntil=time+7;
          renderer.shadowMap.needsUpdate=true;
        }
        roundStats.consume(event);
        const rewards=[type.happiness ? `+${type.happiness} happiness` : '',type.energy ? `+${type.energy} energy` : '',poopGained ? `+${poopGained} poop balls` : ''].filter(Boolean).join(' · ');
        toast(event.item.permanent ? `Energy fully restored!${poopGained ? ` +${poopGained} poop balls.` : ` Leave and re-enter ${event.item.mazeHay?'the carpet':'the den'} for more poop balls.`}` : `${type.name} · ${rewards}`, 2.2); sound.chime();
        setData('lastConsumed', event.item.type);
        setData('lastConsumedId', event.item.id);
      }
      consumables.sync(dt, consumables.system.target || consumables.system.nearest(controller), !!consumables.system.target);
      if (input.jump) jumpSeen = true;
      if (controller.lastJump) sound.hop(controller.lastJump === 'long');
      if (controller.jumpEnergyBlocked) toast('A little hop for now. Eat a snack to restore energy.', 3);
      if (controller.lastLanding) sound.land();
      const speed = Math.hypot(controller.vx, controller.vz);
      if (controller.sprinting && controller.grounded && speed > .6 && time - lastStep > .2) { sound.step(controller.surface === 'wood',controller); lastStep = time; }
      poop.update(dt, controller);
    } else consumables.sync(0);
    poop.sync();
    const action=syncRabbitModel();
    const mistressPosition=mistress.renderPosition;syncMistressModel();
    setData('rabbitAction',action);
    updateCamera(dt);
    const surveying = overview || mode === 'tour' || (mode === 'pause' && previousMode === 'tour');
    const lightingAnchor=surveying?{x:controller.x,y:surveyFloor*FLOOR_HEIGHT,z:controller.z}:controller;
    daylight.update(dayClock.elapsed,lightingAnchor,camera,frozen?0:dt,surveying);
    if (time - hudTick >= .05 || frozen) { updateHUD(); hudTick = time; }
    upperApproach = upperRoomsVisible(controller, upperApproach);
    basementApproach=basementRoomsVisible(controller,basementApproach);
    const outside=controller.x<HOUSE.minX||controller.x>HOUSE.maxX||controller.z<HOUSE.minZ||controller.z>HOUSE.maxZ;
    const basementSurvey=surveying&&surveyFloor===-1;
    const showUpper = surveying ? !basementSurvey&&(surveyFloor===1||roofView) : upperApproach||outside;
    const showCeiling = !surveying || !basementSurvey&&(surveyFloor===1||roofView);
    const showBasement=surveying?basementSurvey:basementApproach;
    const showBasementCeiling=!basementSurvey||roofView;
    consumables.setFloorView(basementSurvey?-1:null);water.setFloorView(basementSurvey?-1:null);
    consumables.setUpperVisible(showUpper);
    water.setUpperVisible(showUpper);
    noiseRipples.setUpperVisible(showUpper);
    noiseRipples.mesh.visible=(mode==='play'&&!overview&&!mapOpen)||(mode==='pause'&&previousMode==='play');
    mistressRipples.setUpperVisible(showUpper);
    mistressRipples.mesh.visible=noiseRipples.mesh.visible;
    mistressStepRipples.setUpperVisible(showUpper);
    mistressStepRipples.mesh.visible=noiseRipples.mesh.visible;
    mistressModel.root.visible=(mistressPosition.y<FLOOR_HEIGHT-.1||showUpper)&&(!basementSurvey||floorAt(mistressPosition.y)===-1);
    rabbit.root.visible=!basementSurvey||floorAt(controller.y)===-1;
    const asleep=mistress.phase==='routine'&&mistress.state==='acting'&&mistress.activity==='sleeping';
    mistressCone.update(frozen?0:dt,{position:mistressPosition,yaw:mistress.yaw,phase:mistress.phase,masked:mistress.maskingNoise,basementVisible:showBasement,
      eye:mistressModel.getSightPoints()[0],upperVisible:showUpper,visible:!asleep&&((mode==='play'&&!overview&&!mapOpen)||(mode==='pause'&&previousMode==='play'))});
    setData('mistressConeVisible',String(mistressCone.mesh.visible));
    const showRoof=(!surveying||roofView)&&!basementSurvey;
    if (upper.visible !== showUpper || ceiling.visible !== showCeiling || roof.shell.visible!==showRoof || roof.ceilings.visible!==showRoof||basement.visible!==showBasement||basementCeiling.visible!==showBasementCeiling||ground.visible===basementSurvey) {
      upper.visible = showUpper; ceiling.visible = showCeiling;
      basement.visible=showBasement;basementCeiling.visible=showBasementCeiling;
      ground.visible=outsideLayer.visible=!basementSurvey;
      roof.shell.visible=roof.ceilings.visible=showRoof; renderer.shadowMap.needsUpdate = true;
    }
    if(mode==='play'&&!overview&&!mapOpen&&time-mapTick>.12) {drawMap();mapTick=time;}
    setHidden('survey', !surveying || mode === 'pause');
    setData('mode', mode);
    setData('visibleFloor',surveying?String(surveyFloor):floorAt(controller.y)===-1?'-1':upper.visible?'1':'0');
    setData('basementVisible',String(basement.visible));setData('basementCeilingVisible',String(basementCeiling.visible));
    setData('mapFloor',String(floorAt(controller.y)));setData('localLampFloors',JSON.stringify(daylight.slots.map(slot=>slot.fixture?.floor??null)));
    setData('ceilingVisible', String(ceiling.visible));
    setData('roofVisible',String(roof.shell.visible));setData('interiorCeilingsVisible',String(roof.ceilings.visible));
    setData('discoveries', String(discovered.size));
    if (renderer.shadowMap.needsUpdate) setData('shadowRevision', String(++shadowRevision));
    mazeHeart.update(frozen?0:dt,camera,{visible:showBasement});
    setData('heartCount',String(mazeHeart.heartCount));
    setData('mazeGlass',JSON.stringify({opacity:maze.glassMaterial.opacity,transparency:Number((1-maze.glassMaterial.opacity).toFixed(2)),reflections:false,capturePasses:0}));
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
    npcMovementSpent=0;
  }
  syncMistressModel();
  updateCamera(0); daylight.update(0,controller,camera); updateHUD(); drawMap();
  // Compile the upstairs and window variants too, before any camera turn can
  // reveal them. compileAsync uses parallel shader compilation when available.
  // Warm every household prop too, including phone/book/mop which are hidden
  // in other poses. Restore the current pose once their buffers are uploaded.
  const mistressVisibility=[];
  mistressModel.root.traverse(object=>{mistressVisibility.push([object,object.visible]);object.visible=true;});
  await renderer.compileAsync(scene, camera);
  // Upload every chunk now, including off-screen rooms, so the first look in a
  // new direction does not allocate vertex buffers during play.
  const culling = [];
  scene.traverse(object => { if (object.isMesh) { culling.push([object, object.frustumCulled]); object.frustumCulled = false; } });
  rabbit.root.position.set(controller.x, controller.y, controller.z);
  renderer.render(scene, camera);
  for(const [object,visible] of mistressVisibility)object.visible=visible;
  for (const [object, enabled] of culling) object.frustumCulled = enabled;
  upper.visible = false;
  consumables.setUpperVisible(false);
  water.setUpperVisible(false);
  renderer.shadowMap.needsUpdate = true;
  previousTime = performance.now();
  $('load-status').hidden = true; $('play').disabled = $('tour').disabled = false;
  requestAnimationFrame(frame); setData('ready', 'true');
}
