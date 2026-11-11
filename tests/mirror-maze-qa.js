import {MAZE_LAYOUTS} from '/src/maze-layout-catalog.js';
const frame=document.getElementById('app'),results=document.getElementById('results'),status=document.getElementById('status');
const params=new URLSearchParams(location.search),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const game=()=>frame.contentDocument,canvas=()=>game()?.getElementById('game'),data=()=>canvas()?.dataset;
const pos=()=>data().position.split(',').map(Number),layout=()=>JSON.parse(data().mazeLayout);
const validMazeScene=()=>{
  const scene=JSON.parse(data().basementScene??'null');
  return scene?.type==='maze'&&MAZE_LAYOUTS.some(entry=>entry.id===scene.layoutId&&entry.name===scene.layoutName)&&layout().layoutId===scene.layoutId;
};
const key=(type,code)=>canvas().dispatchEvent(new frame.contentWindow.KeyboardEvent(type,{code,bubbles:true}));
const mouse=type=>canvas().dispatchEvent(new frame.contentWindow.MouseEvent(type,{button:0,clientX:300,clientY:400,bubbles:true}));
const click=id=>game().getElementById(id).click();
function check(label,passed) {
  const item=document.createElement('li');item.className=passed?'pass':'fail';item.textContent=`${passed?'PASS':'FAIL'}: ${label}`;results.append(item);
  if(!passed)throw Error(label);
}
async function until(condition,label) {
  status.textContent=label;const deadline=performance.now()+180000;
  while(!condition()) {
    if(performance.now()>deadline||game()?.getElementById('fatal')?.hidden===false)throw Error(`Timed out: ${label} (${data()?.position}; target ${data()?.consumeTarget})`);
    await wait(40);
  }
}
async function advance(seconds) {
  game().dispatchEvent(new frame.contentWindow.CustomEvent('qa-advance',{detail:seconds}));
  await new Promise(resolve=>frame.contentWindow.requestAnimationFrame(()=>frame.contentWindow.requestAnimationFrame(resolve)));await wait(100);
}
async function faceNorth() {
  const yaw=Number(data().camera.split(',')[0]);mouse('mousedown');
  frame.contentWindow.dispatchEvent(new frame.contentWindow.MouseEvent('mousemove',{clientX:300+yaw/.003,clientY:400}));mouse('mouseup');
  await until(()=>Math.abs(Number(data().camera.split(',')[0]))<.001,'Align normal movement controls');
}
async function walk(x,z,{run=false,target=null}={}) {
  const held=new Set(),deadline=performance.now()+180000;
  const set=codes=>{for(const code of [...held])if(!codes.includes(code)){key('keyup',code);held.delete(code);}for(const code of codes)if(!held.has(code)){key('keydown',code);held.add(code);}};
  status.textContent=`Walking to (${x.toFixed(1)}, ${z.toFixed(1)})`;
  try {
    while(performance.now()<deadline) {
      if(target&&data().consumeTarget===target){set([]);await wait(450);if(data().consumeTarget===target)return;continue;}
      const p=pos(),dx=x-p[0],dz=z-p[2],distance=Math.hypot(dx,dz),sliding=data().surface==='wood';
      // Release before wood-floor coasting reaches a waypoint. Firm basement
      // ground stops quickly; maze turns happen at the centres of its cells.
      if(distance<(sliding ? .42 : .30)||(held.size>0&&distance<(sliding ? .65 : .26))) {
        set([]);await wait(sliding?700:250);
        if(target&&data().consumeTarget===target)return;
        if(Math.hypot(x-pos()[0],z-pos()[2])<(sliding ? .42 : .30))return;
        continue;
      }
      const yaw=Number(data().camera.split(',')[0]),forward=-Math.sin(yaw)*dx-Math.cos(yaw)*dz,right=Math.cos(yaw)*dx-Math.sin(yaw)*dz;
      set([...(run&&distance>3?['ShiftLeft']:[]),...(Math.abs(right)>.15?[right>0?'KeyD':'KeyA']:[]),...(Math.abs(forward)>.15?[forward>0?'KeyW':'KeyS']:[])]);
      await wait(distance<1?75:40);
    }
    throw Error(`Blocked route to ${x},${z} at ${pos()}`);
  } finally {set([]);}
}
async function eat(id,label=id) {
  // Loose props can coast into a snack approach. Quiet hay is harmless to the
  // exact 200-point setup, so eat it normally if it takes the nearest prompt.
  if(id==='carrot-0'&&data().consumeTarget==='hay-0') {
    mouse('mousedown');try{await until(()=>data().lastConsumedId==='hay-0','Nibble the hay blocking the carrot');}finally{mouse('mouseup');}
  }
  await until(()=>data().consumeTarget===id,`Reach ${label}`);mouse('mousedown');
  try {await until(()=>data().lastConsumedId===id,`Finish ${label}`);}finally{mouse('mouseup');}
}
function pathBetween(maze,start,goals) {
  const queue=[start],previous=new Map([[start,null]]),target=new Set(goals);
  for(let index=0;index<queue.length;index++) {
    const at=queue[index];if(target.has(at)){const route=[];for(let id=at;id!==null;id=previous.get(id))route.unshift(maze.cells[id]);return route;}
    for(const next of maze.cells[at].links)if(!previous.has(next)){previous.set(next,at);queue.push(next);}
  }
  throw Error('Maze graph has no route to its heart');
}
async function unlockBasement() {
  await faceNorth();await walk(-14,12);key('keydown','Space');
  await until(()=>!game().getElementById('charge').hidden&&game().getElementById('charge-percent').textContent==='100%','Charge a real den escape');
  key('keydown','KeyD');key('keyup','Space');await until(()=>pos()[0]>-10.8,'Jump over the den fence');key('keyup','KeyD');
  await until(()=>data().grounded==='true','Land outside the den');
  await walk(-12,14.5);await walk(-12,17.1,{target:'carrot-0'});await eat('carrot-0','the living-room carrot');
  await walk(-12,15);for(const [x,z] of [[-6,15],[-6,4],[-14,4],[-14,-5.8],[-19,-5.8]])await walk(x,z,{run:true});
  await walk(-18,-5,{target:'wire-library-lamp'});await eat('wire-library-lamp','the library cable');
  await walk(-18,-6.4,{target:'book-2'});await eat('book-2','the first library book');
  await walk(-18,-14.8);await walk(-17,-14.8,{target:'book-3'});await eat('book-3','the second library book');
  check('Normal held consumption reaches 200 happiness and unlocks the basement',data().happiness==='200'&&data().basementUnlocked==='true');
  for(const [x,z] of [[-18,-14.8],[-19,-5.8],[-19,-4.1],[-22.4,-4.1],[-22.4,-18.2]])await walk(x,z,{run:true});
  await until(()=>data().mapFloor==='-1'&&data().grounded==='true','Reach the basement landing');
}
function perimeterRoute(maze,entrance) {
  const {westX:west,eastX:east,northZ:north,southZ:south}=maze.perimeter;
  // The lower stair landing is west of the stair cheek. Leave it horizontally
  // before turning north: cutting diagonally around its rear corner can snag
  // the rabbit on the cheek or the expanded maze's new north boundary.
  const landingExit=[west,pos()[2]];
  if(entrance.side==='west')return [landingExit,[west,entrance.z],[entrance.inside.x,entrance.inside.z]];
  if(entrance.side==='north')return [landingExit,[west,north],[entrance.x,north],[entrance.inside.x,entrance.inside.z]];
  if(entrance.side==='east')return [landingExit,[west,north],[east,north],[east,entrance.z],[entrance.inside.x,entrance.inside.z]];
  return [landingExit,[west,south],[entrance.x,south],[entrance.inside.x,entrance.inside.z]];
}
async function reachHeart() {
  const maze=layout(),plans=maze.entrances.map(entrance=>{
    const cells=pathBetween(maze,entrance.cell,maze.heart.cellIds),waypoints=perimeterRoute(maze,entrance);
    let previous={x:pos()[0],z:pos()[2]},distance=0;
    for(const [x,z] of waypoints){distance+=Math.hypot(x-previous.x,z-previous.z);previous={x,z};}
    const corridorDistance=cells.slice(1).reduce((sum,cell,index)=>sum+Math.hypot(cell.x-cells[index].x,cell.z-cells[index].z),0);
    return {entrance,cells,waypoints,cost:distance+corridorDistance};
  }).sort((a,b)=>a.cost-b.cost),plan=plans[0];
  for(const [x,z] of plan.waypoints)await walk(x,z,{run:true});
  check('A perimeter entrance leads into the generated maze',pos()[0]>maze.bounds.minX&&pos()[0]<maze.bounds.maxX&&pos()[2]>maze.bounds.minZ&&pos()[2]<maze.bounds.maxZ);
  for(const cell of plan.cells.slice(1))await walk(cell.x,cell.z,{run:true});
  check('The generated passages lead to the central carpet',Math.hypot(pos()[0]-maze.heart.x,pos()[2]-maze.heart.z)<4);
  await until(()=>!!data().mazeGlass,'Render the frosted privacy walls');
  const glass=JSON.parse(data().mazeGlass);
  check('Privacy walls are 8% transparent and use no reflection captures',glass.opacity===.92&&glass.transparency>=.05&&glass.transparency<=.10&&glass.reflections===false&&glass.capturePasses===0);
}
async function centralInteractions() {
  const maze=layout(),houseCount=data().consumableCount,snackCount=Number(data().mazeConsumableCount);
  const sources=JSON.parse(data().mazeSupplies);
  check('The carrot is a carpet drawing, with no consumable heart carrot',!sources.some(item=>item.id==='maze-heart-carrot')&&sources.length===snackCount);
  const nearestCell=point=>maze.cells.reduce((best,cell)=>Math.hypot(cell.x-point.x,cell.z-point.z)<Math.hypot(best.x-point.x,best.z-point.z)?cell:best);
  const start=nearestCell({x:pos()[0],z:pos()[2]});
  const snacks=sources.map(item=>({item,route:pathBetween(maze,start.id,[nearestCell(item).id])})).sort((a,b)=>a.route.length-b.route.length);
  const snack=snacks[0];
  for(const cell of snack.route)await walk(cell.x,cell.z,{target:snack.item.id});
  await walk(snack.item.x+.7,snack.item.z,{target:snack.item.id});await eat(snack.item.id,'a one-use maze snack');
  check('Maze food is one-use and does not change household snack counts',data().consumableCount===houseCount&&Number(data().mazeConsumableCount)===snackCount-1);
  for(const cell of pathBetween(maze,nearestCell(snack.item).id,maze.heart.cellIds))await walk(cell.x,cell.z);
  await walk(maze.heart.x-1.05,maze.heart.z+1.25,{target:'maze-heart-hay'});await eat('maze-heart-hay','the special carpet hay');
  check('The permanent carpet hay fully recharges energy',data().energy==='100.00');
  await walk(maze.heart.x+.85,maze.heart.z+1.25);
  await walk(maze.heart.x,maze.heart.z,{target:'maze-blue-bunny'});
  await until(()=>data().consumeTarget==='maze-blue-bunny','Approach the blue rabbit plush');
  const score=Number(data().happiness),noise=Number(data().noiseSequence);mouse('mousedown');
  await until(()=>Number(data().plushProgress)>=.55,'Share an interrupted kiss');mouse('mouseup');await wait(200);
  check('Releasing early cancels the five-second kiss without a happiness reward',data().plushCompleted==='false'&&data().plushProgress==='0.000'&&Number(data().happiness)===score);
  mouse('mousedown');await until(()=>Number(data().heartCount)>0&&Number(data().plushProgress)>.3,'Show floating hearts during the kiss');
  check('Affection produces hearts, an eating pose and globally audible noise',Number(data().heartCount)>0&&data().rabbitAction==='eat'&&Number(data().noiseSequence)>noise&&data().lastNoiseKind==='affection'&&data().lastNoiseScope==='house');
  await until(()=>Number(data().plushProgress)>=4.5,'Keep kissing through 4.5 seconds');
  check('The five-second kiss remains incomplete at 4.5 seconds with many hearts',data().plushCompleted==='false'&&Number(data().happiness)===score&&Number(data().heartCount)>=20);
  await until(()=>data().plushCompleted==='true','Complete the full five-second kiss');mouse('mouseup');
  check('The completed kiss awards exactly 500 happiness',Number(data().happiness)===score+500);
  if(params.has('capture')) {
    document.querySelector('header').hidden=true;results.hidden=true;Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});
    status.textContent='Privacy glass maze hearts preview ready.';return;
  }
  mouse('mousedown');await wait(5300);mouse('mouseup');
  check('The plush cannot award the bonus a second time',data().plushCompleted==='true'&&Number(data().happiness)===score+500);
  click('menu-button');await advance(125);click('resume');
  check('Menus preserve the depleted maze food and one-time plush reward',data().plushCompleted==='true'&&Number(data().mazeConsumableCount)===snackCount-1);
  const oldLayoutId=layout().layoutId;click('menu-button');click('reset');await until(()=>data().happiness==='0'&&data().basementUnlocked==='false','Start a fresh magical basement');
  check('A new game chooses a different designed maze and resets its supplies and plush',validMazeScene()&&layout().layoutId!==oldLayoutId&&data().plushCompleted==='false'&&Number(data().mazeConsumableCount)>=10&&Number(data().mazeConsumableCount)<=20&&Object.values(JSON.parse(data().fountainWater)).every(amount=>amount===100));
  check('The privacy glass maze round has no fatal rendering error',game().getElementById('fatal').hidden);
  status.textContent='All privacy glass maze checks passed.';
}
document.getElementById('run').onclick=async()=>{
  document.getElementById('run').disabled=true;results.replaceChildren();
  try {
    if(params.has('fixture')) {
      const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
      frame.srcdoc='<!doctype html><html><head><base href="/"><style>body{margin:0;overflow:hidden;background:#dbe5ed}canvas{display:block;width:100vw;height:100vh}#fixture-status{position:fixed;left:24px;bottom:20px;padding:10px 16px;background:#fff8e9e8;border-radius:10px;color:#405369;font:14px system-ui}</style></head><body><canvas id="game" aria-label="Frosted privacy glass maze with Shidan and the blue bunny"></canvas><div id="fixture-status">Preparing frosted privacy glass…</div><script type="module" src="/tests/maze-mirror-fixture.js"><\/script></body></html>';
      await loaded;await until(()=>data()?.fixture==='passed'||data()?.fixture==='failed','Verify the privacy-glass GPU scene');
      check('The frosted glass renders with 8% transparency and no shader errors',data().fixture==='passed');
      const glass=JSON.parse(data().mazeGlass);
      check('Privacy glass renders directly without reflection or transmission captures',glass.capturePasses===0&&glass.reflections===false&&glass.opacity===.92&&glass.transparency===.08);
      check('Opposite pane faces render the same blue under warm and cool lights',JSON.parse(data().blueFaces).bothBlue===true);
      check('The preview uses one of five designed maze layouts',validMazeScene());
      document.querySelector('header').hidden=true;results.hidden=true;Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});
      status.textContent='All privacy glass GPU fixture checks passed.';return;
    }
    const html=await(await fetch('/')).text(),entry=`<script type="module">import {boot} from '/src/main.js';import {mazeRandom} from '/src/mirror-maze-layout.js';let now=0;const store=new Map();document.addEventListener('qa-advance',event=>now+=event.detail*1000);boot({clockNow:()=>now,scoreStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)},mazeRandom:mazeRandom(0x5a1da)});<\/script>`;
    const loaded=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
    frame.srcdoc=html.replace('<head>','<head><base href="/">').replace('<script type="module" src="./src/start.js"></script>',entry);
    await loaded;await until(()=>data()?.ready==='true','Prepare the actual game');
    canvas().requestPointerLock=()=>Promise.reject(new frame.contentWindow.DOMException('QA fallback','NotAllowedError'));
    game().getElementById('player-name').value='Privacy maze QA';
    check('The house retains 46 snacks and 22 chewables',data().consumableCount==='46'&&data().chewableCount==='22');
    check('The magical scene has 10–20 random snacks and four fountains',Number(data().mazeConsumableCount)>=10&&Number(data().mazeConsumableCount)<=20&&Object.keys(JSON.parse(data().fountainWater)).length===18);
    const maze=layout();check('The maze has four entrances and a connected central chamber',maze.entrances.length===4&&maze.entrances.every(entrance=>pathBetween(maze,entrance.cell,maze.heart.cellIds).length>1));
    check('The basement selects maze content and one of five named layouts',MAZE_LAYOUTS.length===5&&validMazeScene());
    if(params.has('tour')) {
      click('tour');await until(()=>!game().getElementById('survey').hidden,'Open the normal house tour');game().querySelector('#survey [data-floor="-1"]').click();
      await until(()=>data().visibleFloor==='-1'&&data().basementCeilingVisible==='false','Inspect the frosted-glass labyrinth');
      check('The basement tour shows the generated scene without its ceiling',data().basementVisible==='true'&&data().visibleFloor==='-1'&&game().getElementById('fatal').hidden);
      document.querySelector('header').hidden=true;results.hidden=true;Object.assign(frame.style,{position:'fixed',inset:'0',height:'100vh',minHeight:'0'});
      status.textContent='All privacy glass tour checks passed.';return;
    }
    click('play');await until(()=>data().mode==='play','Begin the named adventure');await unlockBasement();await reachHeart();await centralInteractions();
  } catch(error) {status.textContent=`FAILED: ${error.message}`;console.error(error);}finally{document.getElementById('run').disabled=false;}
};
