// An independent GPU check for production privacy glass and heart-room models.
// It never changes a running adventure, saved score or controller state.
import * as THREE from '/vendor/three.module.js';
import {World} from '/src/physics.js';
import {BASEMENT} from '/src/layout.js';
import {createMirrorMaze,MAZE_GLASS_COLOR} from '/src/mirror-maze.js';
import {MAZE_LAYOUTS,getMazeLayout} from '/src/maze-layout-catalog.js';
import {createMazeHeart} from '/src/maze-heart.js';
import {createRabbit} from '/src/model.js';
import {createWaterFountains} from '/src/fountains.js';

const canvas=document.getElementById('game'),status=document.getElementById('fixture-status');
const params=new URLSearchParams(parent.location.search);
let failed=false;
function fail(message){failed=true;canvas.dataset.fixture='failed';status.textContent=`FAILED: ${message}`;console.error(message);}
window.addEventListener('error',event=>fail(event.message));
try {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(1.5,devicePixelRatio));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>fail([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'));
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xdde6e5);
  const world=new World();world.basement=BASEMENT;world.fixtures=new Map();
  const layoutId=params.get('layout')??MAZE_LAYOUTS[0].id;
  const maze=createMirrorMaze({parent:scene,world,layoutProvider:()=>getMazeLayout(layoutId)}),heart=createMazeHeart({parent:scene,world,layout:maze.layout});
  createWaterFountains(scene,world,{mazeLayout:()=>maze.layout});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(48,40),new THREE.MeshStandardMaterial({color:0xa0abb7,roughness:.95}));
  floor.rotation.x=-Math.PI/2;floor.position.y=BASEMENT.y-.01;scene.add(floor);
  scene.add(new THREE.HemisphereLight(0xe4f0ff,0x827e91,2.5));
  const light=new THREE.DirectionalLight(0xffeac5,2.2);light.position.set(2,10,5);scene.add(light);
  const center=maze.layout.heart,rabbit=createRabbit();
  rabbit.root.position.set(center.x-.65,BASEMENT.y,center.z+.35);
  rabbit.root.rotation.y=Math.atan2(.65,-1.2);scene.add(rabbit.root);
  const camera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.10,100);
  // A diagonal view keeps the carrot print, small plush and Shidan visible
  // together, with privacy walls behind them. It stays inside the chamber.
  const viewSide=params.get('side')==='back'?-1:1;
  camera.position.set(center.x+viewSide*1.65,BASEMENT.y+2.3,center.z+viewSide*1.7);
  camera.lookAt(center.x-.05,BASEMENT.y+.40,center.z-.15);
  const panes=[];maze.group.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.mazeGlass)panes.push(mesh);});
  if(!panes.length)throw Error('The maze has no privacy-glass panes');
  for(const mesh of panes) {
    const material=mesh.material;
    if(!material.isMeshBasicMaterial||material.color.getHex()!==MAZE_GLASS_COLOR||!material.transparent||Math.abs(material.opacity-.92)>1e-9||!material.forceSinglePass||material.side!==THREE.DoubleSide)
      throw Error('A privacy pane does not use single-pass, light-independent blue glass at 8% transparency');
    if(material.transmission>0||material.userData.mazeReflection)throw Error('A privacy pane still requests an extra reflection/transmission pass');
  }
  // Catch accidental scene-copy/render-target work. Normal alpha glass needs
  // only the main scene render; no reflection cache or GPU readback is used.
  const setTarget=renderer.setRenderTarget.bind(renderer);let capturePasses=0;
  renderer.setRenderTarget=(target,...args)=>{if(target)capturePasses++;return setTarget(target,...args);};
  // Probe the actual shader from opposite viewing sides under opposing orange
  // and blue lights. Use the normal framebuffer only: no scene-copy targets.
  const probe=new THREE.Scene();probe.background=new THREE.Color(0x7f7f7f);
  const sheet=new THREE.Mesh(new THREE.PlaneGeometry(2,2),maze.glassMaterial);probe.add(sheet);
  const warm=new THREE.DirectionalLight(0xffa000,10),cool=new THREE.DirectionalLight(0x0066ff,10);
  warm.position.set(1,2,2);cool.position.set(-1,2,-2);probe.add(warm,cool);
  const probeCamera=new THREE.PerspectiveCamera(46,innerWidth/innerHeight,.1,10),pixel=new Uint8Array(4);
  const sideColor=side=>{
    probeCamera.position.set(0,0,side*2);probeCamera.lookAt(0,0,0);renderer.render(probe,probeCamera);
    const gl=renderer.getContext();gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    return [...pixel];
  };
  const front=sideColor(1),back=sideColor(-1);
  const bothBlue=front.slice(0,3).every((value,index)=>Math.abs(value-back[index])<=1)&&front[2]>front[1]&&front[1]>front[0];
  if(!bothBlue)throw Error(`Opposite pane faces are not consistently blue: ${front}; ${back}`);
  canvas.dataset.blueFaces=JSON.stringify({front,back,bothBlue});sheet.geometry.dispose();
  canvas.dataset.basementScene=JSON.stringify({type:'maze',layoutId:maze.layout.layoutId,layoutName:maze.layout.layoutName});
  canvas.dataset.mazeLayout=JSON.stringify(maze.layout);
  let previous=performance.now(),elapsed=0,frames=0;
  function frame(now) {
    requestAnimationFrame(frame);if(failed)return;
    const dt=Math.min(.1,(now-previous)/1000);previous=now;elapsed+=dt;
    rabbit.animate(elapsed,0,true,0,BASEMENT.y,'eat');heart.update(dt,camera,{burst:true});
    renderer.render(scene,camera);frames++;
    const glass={opacity:.92,transparency:.08,reflections:false,capturePasses,paneCount:panes.length,renderCalls:renderer.info.render.calls};
    canvas.dataset.mazeGlass=JSON.stringify(glass);canvas.dataset.heartCount=String(heart.heartCount);canvas.dataset.frames=String(frames);
    if(capturePasses)fail('Privacy glass unexpectedly rendered a scene-copy pass');
    if(renderer.info.render.calls>180)fail('Privacy-glass fixture exceeds its main-scene draw budget');
    const gl=renderer.getContext(),error=gl.getError();if(error!==gl.NO_ERROR)fail(`WebGL error ${error}`);
    if(!failed&&frames>=12&&heart.heartCount>0)canvas.dataset.fixture='passed';
    status.textContent=`${maze.layout.layoutName} · blue on both sides · 8% transparent · ${renderer.info.render.calls} draws`;
  }
  requestAnimationFrame(frame);
} catch(error){fail(error.message);}
