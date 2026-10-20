import * as THREE from '../vendor/three.module.js';
import { dayState } from './day-cycle.js';
import { FLOOR_HEIGHT } from './layout.js';

export const LOCAL_LIGHT_LIMIT = 4;
const palette = {
  zenith:[0x8cc9ee,0x8b78ab,0x081429], horizon:[0xe3eff1,0xe6a17f,0x25334d],
  sky:[0xfff6db,0xf3be99,0x8da7df], ground:[0x99aca1,0x9e7b7b,0x5a6078],
  sun:[0xffe8b9,0xffa262,0x9db7f4], fill:[0xc9e5f0,0xc9b3d9,0x869acb],
};
const colors=Object.fromEntries(Object.entries(palette).map(([key,values])=>[key,values.map(c=>new THREE.Color(c))]));
function tint(target,key,state) { const c=colors[key]; target.copy(c[0]).lerp(c[1],state.dusk).lerp(c[2],state.night); }
const lerp=(a,b,t)=>a+(b-a)*t;

export function createDayLighting(scene, {sun,fill,hemisphere}, lamps) {
  const sky = new THREE.Group(); sky.name='Day and night sky'; scene.add(sky);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms:{zenith:{value:new THREE.Color()},horizon:{value:new THREE.Color()}},
    vertexShader:'varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:`uniform vec3 zenith; uniform vec3 horizon; varying vec3 direction;
      void main(){ float height=max(0.0,normalize(direction).y); gl_FragColor=vec4(mix(horizon,zenith,pow(height,0.6)),1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    side:THREE.BackSide,depthWrite:false,
  });
  const dome=new THREE.Mesh(new THREE.SphereGeometry(190,24,12),skyMaterial);
  dome.name='Sky gradient'; dome.frustumCulled=false; dome.renderOrder=-100; sky.add(dome);
  const points=[];
  for(let i=0;i<240;i++) {
    const y=.12+.86*((i*.61803398875)%1), a=i*2.39996323, r=Math.sqrt(1-y*y)*175;
    points.push(Math.cos(a)*r,y*175,Math.sin(a)*r);
  }
  const stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)),
    new THREE.PointsMaterial({color:0xe4edff,size:.5,transparent:true,opacity:0,depthWrite:false,fog:false}));
  stars.name='Night stars'; stars.frustumCulled=false; stars.renderOrder=-99; sky.add(stars);
  const moon=new THREE.Mesh(new THREE.SphereGeometry(3.6,16,12),new THREE.MeshBasicMaterial({color:0xfff0ce,transparent:true,opacity:0,depthWrite:false,fog:false}));
  moon.name='Moon'; moon.position.set(-75,42,-150); moon.renderOrder=-99; sky.add(moon);

  // A fixed light count avoids shader compilation at dusk. No additional shadow
  // maps: nearby lamps light Shidan and furnishings, while all shades glow.
  const slots=Array.from({length:LOCAL_LIGHT_LIMIT},()=>{
    const light=new THREE.PointLight(0xffc58d,0,14,2); light.castShadow=false; scene.add(light);
    return {light,fixture:null,weight:0};
  });
  let state=dayState(0);
  function update(elapsed,player,camera,dt=0,surveying=false) {
    state=dayState(elapsed);
    tint(skyMaterial.uniforms.zenith.value,'zenith',state); tint(skyMaterial.uniforms.horizon.value,'horizon',state);
    scene.background.copy(skyMaterial.uniforms.horizon.value); scene.fog.color.copy(scene.background);
    tint(hemisphere.color,'sky',state); tint(hemisphere.groundColor,'ground',state);
    hemisphere.intensity=lerp(lerp(2,1.05,state.dusk),.6,state.night);
    tint(sun.color,'sun',state); sun.intensity=lerp(lerp(3.3,1.5,state.dusk),.22,state.night);
    tint(fill.color,'fill',state); fill.intensity=lerp(1.1,.4,state.night);
    lamps.glowMaterial.emissiveIntensity=state.lamps*2.8;
    stars.material.opacity=state.stars*.9; moon.material.opacity=state.stars;
    sky.position.copy(camera.position);
    // Select by rabbit position, not viewing direction, so looking around never
    // swaps lights. Retain current slots and fade replacements to avoid popping.
    const candidates=lamps.fixtures.map(f=>({f,d:(f.x-player.x)**2+(f.z-player.z)**2+((f.floor*FLOOR_HEIGHT)-player.y)**2*16}))
      .sort((a,b)=>a.d-b.d).slice(0,LOCAL_LIGHT_LIMIT).map(c=>c.f);
    const claimed=new Set(slots.filter(s=>candidates.includes(s.fixture)).map(s=>s.fixture));
    const fade=dt>0?Math.min(1,dt*4):1;
    for(const slot of slots) {
      const retained=candidates.includes(slot.fixture);
      if(!retained && slot.weight>.01 && state.lamps>0) slot.weight=Math.max(0,slot.weight-fade);
      else {
        if(!retained) { slot.fixture=candidates.find(f=>!claimed.has(f)); slot.weight=0; if(slot.fixture) claimed.add(slot.fixture); }
        slot.weight=Math.min(1,slot.weight+fade);
      }
      if(slot.fixture) {
        const f=slot.fixture; slot.light.position.set(f.x,f.y-.12,f.z);
        slot.light.intensity=state.lamps*slot.weight*(f.kind==='floor'?12:32)*(surveying ? .65 : 1);
      }
    }
    return state;
  }
  return {update,slots,sky,stars,moon,get state(){return state;}};
}
