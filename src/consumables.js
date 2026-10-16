import * as THREE from '../vendor/three.module.js';
import { cube, cylinder, ellipsoid, beam } from './model.js';
import { batchStaticGeometry } from './render-batching.js';
import { ConsumableSystem } from './consumable-system.js';
import { CONSUMABLE_TYPES, CONSUMABLE_SLOTS } from './consumable-data.js';
import { FLOOR_HEIGHT } from './layout.js';

// One small original model per food, instanced by kind/floor. Shared vertex colours
// keep the new props to at most 18 draws, including the upstairs cutaway layer.
function model(type) {
  const group = new THREE.Group(), color = CONSUMABLE_TYPES[type].color;
  const ball = (c,x,y,z,sx,sy,sz) => ellipsoid(group,c,x,y,z,sx,sy,sz);
  const box = (c,x,y,z,w,h,d) => cube(group,c,x,y,z,w,h,d);
  const rod = (c,a,b,r) => beam(group,c,a,b,r);
  if (type === 'hay') {
    // A dense cylindrical sheaf with narrow, bent grass blades and uneven tips.
    // The solid inner bundle fills gaps; the blades give it a grassy silhouette.
    cylinder(group,0xb3ac61,0,.16,0,.225,.30,.225,24);
    const shades = [0xa7ad65,0xc6bd70,0xdfcc87,0xb7b76d,0xe5d596];
    for (let i = 0; i < 120; i++) {
      const angle = i * 2.399963, radius = .255 * Math.sqrt((i+.5)/120);
      const x = Math.cos(angle)*radius, z = Math.sin(angle)*radius;
      const height = .37 + (Math.sin(i*5.17)+1)*.075, width = .012 + (i%3)*.003;
      const lean = .025 + (i%5)*.009, dx = Math.cos(angle), dz = Math.sin(angle);
      const points = [
        [x-dz*width,.02,z+dx*width], [x+dz*width,.02,z-dx*width],
        [x+dx*lean*.3-dz*width*.7,height*.66,z+dz*lean*.3+dx*width*.7],
        [x+dx*lean*.3+dz*width*.7,height*.66,z+dz*lean*.3-dx*width*.7],
        [x+dx*lean,height,z+dz*lean],
      ];
      const vertices = [];
      // Separate reverse faces retain lighting on both sides without adding a
      // second material batch to the instanced hay model.
      for (const triangle of [[0,1,2],[1,3,2],[2,3,4]]) {
        for (const index of [...triangle,...triangle.toReversed()]) vertices.push(...points[index]);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); geometry.computeVertexNormals();
      group.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:shades[i%shades.length],roughness:1})));
    }
    // A thin twine loop keeps the cut grass together without wooden braces.
    const tie = new THREE.Mesh(new THREE.TorusGeometry(.255,.009,5,32),new THREE.MeshStandardMaterial({color:0x9d8152,roughness:1}));
    tie.rotation.x = Math.PI/2; tie.position.y = .17; group.add(tie);
  } else if (type === 'carrot') {
    const carrot = cylinder(group,color,0,.14,0,.03,.48,.12,12); carrot.rotation.z = -1.25;
    for (let i = 0; i < 3; i++) rod(0x85a65e,[.21,.22,0],[.33+i*.035,.31+(i%2)*.08,(i-1)*.09],.024);
    for (let i = 0; i < 3; i++) rod(0xd37b3c,[-.10+i*.10,.18+i*.025,-.06],[-.09+i*.10,.19+i*.025,.06],.008);
  } else if (type === 'rabbitFood' || type === 'noodles') {
    cylinder(group, type === 'rabbitFood' ? color : 0xc6dae0,0,.12,0,.22,.22,.3,20);
    cylinder(group,0xf9edcc,0,.235,0,.27,.02,.27,20);
    if (type === 'rabbitFood') {
      for (let i = 0; i < 14; i++) { const a = i*2.4, r = .055+ i%3*.065; ball(i%2 ? 0x88734d : 0xb09a69,Math.sin(a)*r,.27+(i%2)*.025,Math.cos(a)*r,.04,.035,.065); }
    } else {
      for (let i = 0; i < 6; i++) {
        const curve = new THREE.CatmullRomCurve3(Array.from({length:7},(_,j) => new THREE.Vector3(-.2+j*.067,.27+Math.sin(j+i)*.02,-.15+i*.06+Math.sin(j*2)*.025)));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,12,.014,5,false), new THREE.MeshStandardMaterial({color,roughness:1})));
      }
      rod(0xa6855e,[-.3,.28,-.03],[.29,.31,.12],.014); rod(0xa6855e,[-.3,.28,-.1],[.29,.31,.05],.014);
    }
  } else if (type === 'bread') {
    ball(color,0,.16,0,.3,.16,.19);
    for (let i = -1; i <= 1; i++) { const slash = box(0xf4d8a3,i*.14,.296,0,.035,.015,.17); slash.rotation.y = -.4; }
  } else if (type === 'apple') {
    ball(color,-.055,.2,0,.19,.19,.19); ball(color,.055,.2,0,.19,.19,.19);
    rod(0x806346,[0,.35,0],[.025,.47,0],.018);
    const leaf = ball(0x8eac62,.09,.42,0,.10,.025,.045); leaf.rotation.z = .35;
  } else if (type === 'banana') {
    const points = [[-.27,.23,0],[-.17,.09,0],[0,.06,0],[.18,.12,0],[.28,.28,0]].map(p => new THREE.Vector3(...p));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,.065,8,false),new THREE.MeshStandardMaterial({color,roughness:1})));
    rod(0x8f8150,[-.28,.22,0],[-.31,.28,0],.027); rod(0x8f8150,[.28,.27,0],[.30,.33,0],.027);
  } else if (type === 'book') {
    box(0xf2e4c7,0,.10,0,.39,.13,.46);
    for (const y of [.025,.18]) box(color,0,y,0,.45,.035,.5);
    box(0x658996,-.21,.10,0,.035,.16,.5);
    box(0xe5c782,.04,.202,0,.16,.008,.20);
    for (const y of [.07,.11,.14]) box(0xcbbda2,.201,y,0,.004,.006,.4);
  } else if (type === 'cake') {
    cylinder(group,0xf6ead9,0,.025,0,.35,.04,.35,24);
    cylinder(group,0xe4be87,0,.16,0,.26,.25,.26,24);
    cylinder(group,color,0,.16,0,.263,.045,.263,24);
    cylinder(group,0xfff0d9,0,.30,0,.275,.07,.275,24);
    for (let i = 0; i < 5; i++) ball(0xfff5df,Math.sin(i*1.256)*.18,.35,Math.cos(i*1.256)*.18,.055,.05,.055);
    ball(0xcb7067,0,.39,0,.075,.065,.075); rod(0x809057,[0,.43,0],[.03,.49,0],.012);
  }
  group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  batchStaticGeometry(group, { cellSize: Infinity });
  return group.children[0];
}

export function createConsumables(scene, world) {
  const system = new ConsumableSystem(world), visuals = new Map(), batches = new Map();
  const floors = [new THREE.Group(), new THREE.Group()];
  floors.forEach((g,i) => { g.name = `Consumables floor ${i}`; scene.add(g); });
  for (const type of Object.keys(CONSUMABLE_TYPES)) {
    const source = model(type);
    for (const floor of [0,1]) {
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, CONSUMABLE_SLOTS.length);
      mesh.name = `${type} collectibles`; mesh.count = 0; mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
      floors[floor].add(mesh); batches.set(`${type}:${floor}`, mesh);
    }
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(.32,.37,40),new THREE.MeshBasicMaterial({color:0xe9c66c,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x = -Math.PI/2; ring.visible = false; scene.add(ring);
  const sparkGeometry = new THREE.IcosahedronGeometry(.035,0);
  const sparks = new THREE.InstancedMesh(sparkGeometry,new THREE.MeshBasicMaterial({color:0xffdc82}),128);
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sparks.frustumCulled = false; sparks.count = 0; scene.add(sparks);
  const particles = [], transform = new THREE.Object3D();
  let time = 0, upperVisible = true;
  for (const item of system.items.values()) visuals.set(item.id,{item,age:1,state:'idle'});
  function handle(events) {
    for (const event of events) {
      const { item } = event;
      if (event.kind === 'spawn') visuals.set(item.id,{item,age:0,state:'spawn'});
      else {
        const visual = visuals.get(item.id); visual.age = 0; visual.state = 'consume';
        for (let i = 0; i < 12; i++) particles.push({x:item.x,y:item.y+.2,z:item.z,age:0,angle:i*Math.PI/6,speed:.3+(i%3)*.12});
      }
    }
  }
  function sync(dt = 0, target = null, interacting = false) {
    time += dt;
    for (const mesh of batches.values()) mesh.count = 0;
    for (const [id, visual] of visuals) {
      visual.age += dt;
      if (visual.state === 'consume' && visual.age >= .65) { visuals.delete(id); continue; }
      if (visual.state === 'spawn' && visual.age >= .6) visual.state = 'idle';
      const { item, age, state } = visual, floor = item.y >= FLOOR_HEIGHT-.1 ? 1 : 0;
      const t = state === 'consume' ? age/.65 : state === 'spawn' ? Math.min(1,age/.6) : 1;
      const scale = state === 'consume' ? (1-t)*(1+.35*Math.sin(t*Math.PI)) : state === 'spawn' ? 1-(1-t)**3 : 1;
      const bob = .02+Math.sin(time*2+item.x)*.016;
      transform.position.set(item.x,item.y+bob+(state==='consume' ? t*.65 : 0),item.z);
      transform.rotation.set(0, Math.sin(item.x*3+item.z)*.5+(state==='consume' ? t*2 : 0), target?.id===id && interacting ? Math.sin(time*35)*.045 : 0);
      transform.scale.setScalar(scale); transform.updateMatrix();
      const mesh = batches.get(`${item.type}:${floor}`); mesh.setMatrixAt(mesh.count++,transform.matrix);
    }
    for (const mesh of batches.values()) mesh.instanceMatrix.needsUpdate = true;
    ring.visible = !!target;
    if (target) { ring.position.set(target.x,target.y+.018,target.z); ring.scale.setScalar(1+Math.sin(time*4)*.06); }
    sparks.count = 0;
    for (let i = particles.length-1; i >= 0; i--) {
      const p = particles[i]; p.age += dt;
      if (p.age >= .85) { particles.splice(i,1); continue; }
      if (p.y >= FLOOR_HEIGHT && !upperVisible) continue;
      const t = p.age/.85;
      transform.position.set(p.x+Math.cos(p.angle)*p.speed*t,p.y+t*.85,p.z+Math.sin(p.angle)*p.speed*t);
      transform.rotation.set(t*3,p.angle,t*2); transform.scale.setScalar((1-t)*1.4); transform.updateMatrix();
      if (sparks.count < 128) sparks.setMatrixAt(sparks.count++,transform.matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
  }
  sync();
  return { system, handle, sync, setUpperVisible(visible) { upperVisible = visible; floors[1].visible = visible; } };
}
