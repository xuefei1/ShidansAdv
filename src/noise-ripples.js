import * as THREE from '../vendor/three.module.js';
import { FLOOR_HEIGHT, HOUSE } from './layout.js';

export const MAX_NOISE_RIPPLES = 64;
export const RIPPLE_SECONDS = .92;
export const RIPPLE_DELAY = .13;
export const RIPPLE_CLEARANCE = .035;

const localTint = new THREE.Color(0xb2cdd0), houseTint = new THREE.Color(0xd6ba7c), footstepTint=new THREE.Color(0xcd787b);
const validPosition = position => position && ['x','y','z'].every(axis => Number.isFinite(position[axis]));
const upperInterior = ripple => ripple.y >= FLOOR_HEIGHT-.1 && ripple.x >= HOUSE.minX && ripple.x <= HOUSE.maxX && ripple.z >= HOUSE.minZ && ripple.z <= HOUSE.maxZ;

// Rings are a cue for noise rather than a literal depiction of its hearing
// radius. One small, fixed instanced draw covers every active ripple.
export function createNoiseRipples(scene, world) {
  const geometry = new THREE.RingGeometry(.90,1,64);
  geometry.rotateX(-Math.PI/2);
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NOISE_RIPPLES),1);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NOISE_RIPPLES*3),3);
  opacity.setUsage(THREE.DynamicDrawUsage);tint.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('rippleOpacity',opacity);geometry.setAttribute('rippleTint',tint);
  const material = new THREE.ShaderMaterial({
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader:`attribute float rippleOpacity;
      attribute vec3 rippleTint;
      varying vec2 ringUv; varying float ringOpacity; varying vec3 ringTint;
      #include <fog_pars_vertex>
      void main(){
        ringUv=uv; ringOpacity=rippleOpacity; ringTint=rippleTint;
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`varying vec2 ringUv; varying float ringOpacity; varying vec3 ringTint;
      #include <fog_pars_fragment>
      void main(){
        float radius=length(ringUv-vec2(0.5))*2.0;
        float softEdge=smoothstep(0.90,0.935,radius)*(1.0-smoothstep(0.965,1.0,radius));
        gl_FragColor=vec4(ringTint,ringOpacity*softEdge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,
    fog:true,toneMapped:false,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-2,
  });
  const mesh = new THREE.InstancedMesh(geometry,material,MAX_NOISE_RIPPLES);
  mesh.name='Shidan noise ripples';mesh.count=0;mesh.frustumCulled=false;
  mesh.castShadow=mesh.receiveShadow=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const transform = new THREE.Object3D(), ripples = [], seen = new Set(), seenOrder = [];
  let upperVisible = true;

  function sync() {
    mesh.count=0;
    for(const ripple of ripples) {
      if(ripple.age<0 || (!upperVisible && upperInterior(ripple))) continue;
      const progress=Math.min(1,ripple.age/RIPPLE_SECONDS);
      const eased=1-(1-progress)**2;
      const radius=ripple.startRadius+(ripple.endRadius-ripple.startRadius)*eased;
      const alpha=ripple.opacity*Math.sqrt(Math.max(0,Math.sin(progress*Math.PI)))*(1-progress*.45);
      transform.position.set(ripple.x,ripple.y,ripple.z);
      transform.rotation.set(0,0,0);transform.scale.set(radius,1,radius);transform.updateMatrix();
      const index=mesh.count++;mesh.setMatrixAt(index,transform.matrix);
      opacity.setX(index,alpha);tint.setXYZ(index,ripple.tint.r,ripple.tint.g,ripple.tint.b);
    }
    mesh.instanceMatrix.needsUpdate=true;opacity.needsUpdate=true;tint.needsUpdate=true;
  }

  return {
    mesh,
    get count() {return ripples.length;},
    get visibleCount() {return mesh.count;},
    emit(events, elapsed=null) {
      let changed=false;
      for(const event of events || []) {
        const household=event?.source==='mistress'&&typeof event.kind==='string'&&event.kind.length>0;
        if(!validPosition(event?.position) || (!household&&!['long-jump','sprint','eat','laugh','cook'].includes(event.kind))) continue;
        if(event.id!==undefined) {
          if(seen.has(event.id)) continue;
          seen.add(event.id);seenOrder.push(event.id);
          if(seenOrder.length>MAX_NOISE_RIPPLES*2) seen.delete(seenOrder.shift());
        }
        const position=event.position, y=world.support(position.x,position.z,position.y+.1,true).y+RIPPLE_CLEARANCE;
        const age=Number.isFinite(elapsed)&&Number.isFinite(event.time) ? Math.max(0,elapsed-event.time) : 0;
        const footstep=household&&event.kind==='footstep',running=footstep&&event.gait==='run';
        const house=event.scope==='house', count=footstep?(running?2:1):house ? 3 : 2;
        for(let ring=0;ring<count;ring++) if(age-ring*RIPPLE_DELAY<RIPPLE_SECONDS) ripples.push({
          x:position.x,y,z:position.z,age:age-ring*RIPPLE_DELAY,
          startRadius:footstep ? .18 : house ? .4 : .32,endRadius:footstep?(running?1.25:.85):house ? 2.05 : 1.5,
          tint:footstep?footstepTint:house ? houseTint : localTint,opacity:footstep?(running ? .19 : .12):house ? .26 : .22,
        });
        if(ripples.length>MAX_NOISE_RIPPLES)ripples.splice(0,ripples.length-MAX_NOISE_RIPPLES);
        changed=true;
      }
      if(changed)sync();
    },
    update(dt) {
      if(!(dt>0) || !Number.isFinite(dt) || !ripples.length)return;
      for(let index=ripples.length-1;index>=0;index--) {
        const ripple=ripples[index];ripple.age+=dt;
        if(ripple.age+1e-9>=RIPPLE_SECONDS)ripples.splice(index,1);
      }
      sync();
    },
    clear() {ripples.length=0;seen.clear();seenOrder.length=0;mesh.count=0;},
    setUpperVisible(visible) {
      if(upperVisible===!!visible)return;
      upperVisible=!!visible;if(ripples.length)sync();
    },
  };
}
