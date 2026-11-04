import * as THREE from '../vendor/three.module.js';
import { BOUNDS, DEN, FLOOR_HEIGHT, HOUSE, BASEMENT } from './layout.js';
import { MISTRESS_VIEW_ANGLE, MISTRESS_VIEW_RANGE } from './mistress-vision.js';

export { MISTRESS_VIEW_ANGLE, MISTRESS_VIEW_RANGE } from './mistress-vision.js';
export const MISTRESS_CONE_CLEARANCE = .04;
export const MISTRESS_CONE_REFRESH = .1;
const STAIR_CLEARANCE = .09;
const RAYS = 33;
const RADII = [.45,1,2,4,7,11,16,23,31,40,MISTRESS_VIEW_RANGE];
const EPSILON = 1e-6;
const validPoint = p => p && ['x','y','z'].every(axis=>Number.isFinite(p[axis]));
const upperInterior = p => p.y>=FLOOR_HEIGHT-.1 && p.x>=HOUSE.minX && p.x<=HOUSE.maxX && p.z>=HOUSE.minZ && p.z<=HOUSE.maxZ;
const basementInterior = p => p.y<-.3;
const routineColor = new THREE.Color(0xd5ae58), chaseColor = new THREE.Color(0xdd6259), maskedColor = new THREE.Color(0x84bac7);

// Entry distance of a horizontal ray into a static opaque box. Height is
// checked separately, so low cover remains a matter for the precise detector.
function entryDistance(x,z,dx,dz,box) {
  let near=0,far=MISTRESS_VIEW_RANGE;
  for(const [value,direction,low,high] of [[x,dx,box.minX,box.maxX],[z,dz,box.minZ,box.maxZ]]) {
    if(Math.abs(direction)<EPSILON) {if(value<=low || value>=high)return Infinity;}
    else {
      const a=(low-value)/direction,b=(high-value)/direction;
      near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
      if(far<=near+EPSILON)return Infinity;
    }
  }
  // Sitting/lying can place the floor anchor inside its own supporting prop.
  // Do not let that support erase the whole forward indicator.
  return near>EPSILON ? near : Infinity;
}

function lotDistance(x,z,dx,dz) {
  let distance=MISTRESS_VIEW_RANGE;
  if(dx>EPSILON)distance=Math.min(distance,(BOUNDS.maxX-x)/dx);
  else if(dx<-EPSILON)distance=Math.min(distance,(BOUNDS.minX-x)/dx);
  if(dz>EPSILON)distance=Math.min(distance,(BOUNDS.maxZ-z)/dz);
  else if(dz<-EPSILON)distance=Math.min(distance,(BOUNDS.minZ-z)/dz);
  return Math.max(0,distance);
}

// A single persistent floor mesh: thin range arcs and cone edges over a very
// faint tint. No texture, extra light, shadows or per-frame geometry creation.
export function createMistressCone(scene,world) {
  const vertices=RAYS*RADII.length;
  const positions=new Float32Array(vertices*3), coordinates=new Float32Array(vertices*2);
  const layers=new Int8Array(vertices), rampTypes=new Int8Array(vertices);
  const ranges=new Float32Array(RAYS), indices=new Uint16Array((RAYS-1)*(RADII.length-1)*6);
  const geometry=new THREE.BufferGeometry();
  const positionAttribute=new THREE.BufferAttribute(positions,3),coordinateAttribute=new THREE.BufferAttribute(coordinates,2);
  const indexAttribute=new THREE.BufferAttribute(indices,1);
  for(const attribute of [positionAttribute,coordinateAttribute,indexAttribute])attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position',positionAttribute);geometry.setAttribute('conePoint',coordinateAttribute);
  geometry.setIndex(indexAttribute);geometry.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({
    uniforms:{...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      coneColor:{value:routineColor.clone()},coneOpacity:{value:.68},
      coneHalfAngle:{value:MISTRESS_VIEW_ANGLE/2},coneRange:{value:MISTRESS_VIEW_RANGE},
      den:{value:new THREE.Vector3(DEN.x,DEN.z,DEN.radius)},denHeight:{value:DEN.fenceHeight},
    },
    vertexShader:`attribute vec2 conePoint;
      varying vec2 floorPoint; varying vec3 worldPoint;
      #include <fog_pars_vertex>
      void main(){
        floorPoint=conePoint;worldPoint=position;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`uniform vec3 coneColor; uniform float coneOpacity;
      uniform float coneHalfAngle; uniform float coneRange;
      uniform vec3 den; uniform float denHeight;
      varying vec2 floorPoint; varying vec3 worldPoint;
      #include <fog_pars_fragment>
      void main(){
        if(worldPoint.y>=-0.25 && worldPoint.y<denHeight && distance(worldPoint.xz,den.xy)<den.z)discard;
        float radius=length(floorPoint);
        if(radius>coneRange)discard;
        float angle=abs(atan(floorPoint.x,floorPoint.y));
        float radialWidth=max(fwidth(radius),0.035);
        float arc=1.0-smoothstep(0.04,0.04+radialWidth,abs(mod(radius+2.5,5.0)-2.5));
        float nearArc=1.0-smoothstep(0.04,0.04+radialWidth,abs(radius-1.0));
        float angleWidth=max(fwidth(angle),0.003);
        float edge=1.0-smoothstep(0.002,0.002+angleWidth,abs(coneHalfAngle-angle));
        float axis=1.0-smoothstep(0.04,0.04+max(fwidth(floorPoint.x),0.035),abs(floorPoint.x));
        float dash=step(0.40,fract(radius*0.5));
        float hatchPhase=(floorPoint.x+floorPoint.y)*0.7;
        float hatch=1.0-smoothstep(0.065,0.065+max(fwidth(hatchPhase),0.012),abs(fract(hatchPhase)-0.5));
        float pattern=0.06+max(arc,nearArc)*0.50+edge*0.70+axis*dash*0.32+hatch*0.08;
        float fade=1.0-radius/coneRange*0.45;
        gl_FragColor=vec4(coneColor,min(0.85,coneOpacity*pattern*fade));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-2,fog:true,toneMapped:false,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Mistress field of view';
  mesh.castShadow=mesh.receiveShadow=false;mesh.frustumCulled=false;scene.add(mesh);
  const blockers=(world.solids??[]).filter(box=>!box.pushable&&!world.dynamicBoxes?.has(box)&&!box.id?.startsWith('glass:'));
  const activeBlockers=[];
  let sinceRefresh=MISTRESS_CONE_REFRESH,revision=0,lastX=NaN,lastY=NaN,lastZ=NaN,lastYaw=NaN,lastEye=NaN;

  function project(x,z,canProjectUpper,basement,index) {
    const ramp=world.rampAt?.(x,z),rampY=world.rampHeight?.(x,z);
    let y;
    if(ramp && rampY!==null && Number.isFinite(rampY)&&(!basement||(ramp.baseY??0)<0)) {
      y=rampY+STAIR_CLEARANCE;rampTypes[index]=(world.ramps?.indexOf(ramp)??0)+1;layers[index]=2;
    } else {
      const upperFootprint=(x>=HOUSE.minX&&x<=HOUSE.maxX&&z>=HOUSE.minZ&&z<=2)||
        (x>=-20&&x<=24&&z>=-25&&z<=-20);
      const upper=canProjectUpper&&upperFootprint;
      y=world.support(x,z,basement?BASEMENT.y+.12:upper?FLOOR_HEIGHT+.12:.16,true).y+MISTRESS_CONE_CLEARANCE;
      layers[index]=basement?-1:upper&&y>=FLOOR_HEIGHT-.1?1:0;rampTypes[index]=0;
    }
    return y;
  }
  function rebuild(source,yaw,eyeHeight) {
    const sine=Math.sin(yaw),cosine=Math.cos(yaw);
    activeBlockers.length=0;
    for(const box of blockers)if(eyeHeight>box.minY+.005&&eyeHeight<box.maxY-.005)activeBlockers.push(box);
    const sourceRamp=world.rampHeight?.(source.x,source.z);
    const onRamp=sourceRamp!==null&&Number.isFinite(sourceRamp)&&Math.abs(source.y-sourceRamp)<.3;
    const sourceFlight=onRamp?world.rampAt?.(source.x,source.z):null;
    const canProjectUpper=source.y>=FLOOR_HEIGHT-.3||(onRamp&&(sourceFlight?.baseY??0)+(sourceFlight?.height??0)>=FLOOR_HEIGHT-.3);
    const basement=basementInterior(source);
    for(let ray=0;ray<RAYS;ray++) {
      const angle=-MISTRESS_VIEW_ANGLE/2+MISTRESS_VIEW_ANGLE*ray/(RAYS-1);
      const dx=Math.sin(yaw+angle),dz=Math.cos(yaw+angle);
      let limit=lotDistance(source.x,source.z,dx,dz);
      for(const box of activeBlockers)limit=Math.min(limit,entryDistance(source.x,source.z,dx,dz,box)-.045);
      limit=Math.max(0,Math.min(MISTRESS_VIEW_RANGE,limit));ranges[ray]=limit;
      for(let band=0;band<RADII.length;band++) {
        const radius=Math.min(RADII[band],limit),index=ray*RADII.length+band;
        const x=source.x+dx*radius,z=source.z+dz*radius;
        positions[index*3]=x;positions[index*3+1]=project(x,z,canProjectUpper,basement,index);positions[index*3+2]=z;
        coordinates[index*2]=(x-source.x)*cosine-(z-source.z)*sine;
        coordinates[index*2+1]=(x-source.x)*sine+(z-source.z)*cosine;
      }
    }
    let count=0;
    const triangle=(a,b,c)=>{
      const heightSpread=Math.max(positions[a*3+1],positions[b*3+1],positions[c*3+1])-
        Math.min(positions[a*3+1],positions[b*3+1],positions[c*3+1]);
      const sameLayer=layers[a]===layers[b]&&layers[a]===layers[c]&&heightSpread<.35;
      const sameRamp=rampTypes[a]>0&&rampTypes[a]===rampTypes[b]&&rampTypes[a]===rampTypes[c];
      // Do not stretch a translucent sheet across a balcony edge or floor gap.
      if(!sameLayer&&!sameRamp)return;
      indices[count++]=a;indices[count++]=b;indices[count++]=c;
    };
    for(let ray=0;ray<RAYS-1;ray++)for(let band=0;band<RADII.length-1;band++) {
      const a=ray*RADII.length+band,b=a+RADII.length;
      triangle(a,b,a+1);triangle(a+1,b,b+1);
    }
    geometry.setDrawRange(0,count);
    positionAttribute.needsUpdate=true;coordinateAttribute.needsUpdate=true;indexAttribute.needsUpdate=true;
    lastX=source.x;lastY=source.y;lastZ=source.z;lastYaw=yaw;lastEye=eyeHeight;sinceRefresh=0;revision++;
  }

  return {
    mesh,
    get revision(){return revision;},
    get ranges(){return ranges.slice();},
    update(dt,{position,yaw=0,phase='routine',masked=false,upperVisible=true,basementVisible=true,visible=true,eyeHeight,eye}={}) {
      if(!Number.isFinite(dt)||dt<0)return;
      sinceRefresh=Math.min(MISTRESS_CONE_REFRESH,sinceRefresh+dt);
      const inLot=validPoint(position)&&position.x>=BOUNDS.minX&&position.x<=BOUNDS.maxX&&position.z>=BOUNDS.minZ&&position.z<=BOUNDS.maxZ&&position.y>=BASEMENT.y-.1&&position.y<=FLOOR_HEIGHT*2;
      const shown=!!visible&&inLot&&Number.isFinite(yaw)&&(upperVisible||!upperInterior(position))&&(basementVisible||!basementInterior(position));
      mesh.visible=shown;if(!shown)return;
      const alert=phase==='chase'||phase==='chasing'||phase==='caught'||phase==='capture';
      material.uniforms.coneColor.value.copy(masked?maskedColor:alert?chaseColor:routineColor);
      material.uniforms.coneOpacity.value=masked?.43:alert?.85:.68;
      const height=Number.isFinite(eye?.y)?eye.y:Number.isFinite(eyeHeight)?eyeHeight:position.y+2.3;
      const moved=Math.abs(position.x-lastX)>.025||Math.abs(position.y-lastY)>.025||Math.abs(position.z-lastZ)>.025||
        Math.abs(yaw-lastYaw)>.012||Math.abs(height-lastEye)>.05;
      if(!Number.isFinite(lastX)||(moved&&sinceRefresh>=MISTRESS_CONE_REFRESH))rebuild(position,yaw,height);
    },
    clear(){geometry.setDrawRange(0,0);mesh.visible=false;lastX=NaN;sinceRefresh=MISTRESS_CONE_REFRESH;},
    dispose(){scene.remove(mesh);geometry.dispose();material.dispose();},
  };
}
