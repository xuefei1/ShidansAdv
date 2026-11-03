import * as THREE from '../vendor/three.module.js';
import { cube, cylinder, ellipsoid, beam, mat } from './model.js';
import { batchStaticGeometry } from './render-batching.js';

const C = { skin:0xf2c6aa, blush:0xe5a5a0, hair:0x363343, sweater:0xc4b8d6,
  cuff:0xe1d9e9, trousers:0x75879a, shoes:0xf4ebd9, sole:0xccbea9,
  ink:0x353747, eye:0x645044, paper:0xfff0d6, sage:0xb0c4a0 };
export const MISTRESS_BODY_SCALE=1.5;
export const MISTRESS_STANDING_PELVIS=1.32;
const mix = (a,b,t) => a+(b-a)*t;
const clamp01 = value => Math.max(0,Math.min(1,Number.isFinite(value) ? value : 1));
const smooth = value => {const t=clamp01(value);return t*t*(3-2*t);};
const dockingLift = (weight,height,inFraction=.2,outFraction=.2) => height*smooth(weight/inFraction)*smooth((1-weight)/outFraction);
const joint = (parent,name,x=0,y=0,z=0) => {
  const group=new THREE.Group();group.name=name;group.position.set(x,y,z);parent.add(group);return group;
};

// The root is always a room-floor anchor, facing +Z. Sitting uses the .84 m
// sofa cushion (.68 m dining stool); sleeping puts her on the .96 m quilt,
// with her head toward -Z. Only joint transforms change during a routine.
export function createMistressModel() {
  const root=new THREE.Group();root.name='Mistress';
  const body=joint(root,'Mistress pelvis',0,MISTRESS_STANDING_PELVIS);
  // Scale the articulated person, keeping furniture-height props and the floor
  // anchor independent. Seats, the bed and counter poses are retargeted below.
  body.scale.setScalar(MISTRESS_BODY_SCALE);
  ellipsoid(body,C.trousers,0,-.025,0,.19,.135,.13);
  ellipsoid(body,C.sweater,0,.20,-.005,.23,.265,.15);
  cylinder(body,C.cuff,0,-.005,0,.18,.07,.19,16);
  cylinder(body,C.skin,0,.435,0,.071,.11,.067,12);
  const head=joint(body,'Mistress head',0,.64,.005);
  ellipsoid(head,C.hair,0,.015,-.035,.221,.24,.198);
  ellipsoid(head,C.skin,0,-.012,.045,.192,.214,.174);
  ellipsoid(head,C.hair,0,.15,-.005,.211,.115,.192);
  // Hair wraps behind the cheeks; its rounded locks have no flush face layers.
  const brows=[];
  for(const side of [-1,1]) {
    ellipsoid(head,C.hair,side*.185,-.035,-.025,.071,.225,.13);
    ellipsoid(head,C.skin,side*.195,-.03,.027,.035,.053,.036);
    ellipsoid(head,C.blush,side*.115,-.078,.189,.044,.020,.011);
    const brow=joint(head,side<0?'Left eyebrow':'Right eyebrow',side*.08,.067,.198);
    beam(brow,C.hair,[side*-.038,-.006,.009],[side*.041,.006,-.012],.009);
    brows.push(brow);
  }
  ellipsoid(head,C.hair,-.075,.123,.132,.136,.067,.105).rotation.z=-.25;
  ellipsoid(head,C.hair,.095,.125,.116,.12,.065,.105).rotation.z=.3;
  ellipsoid(head,C.hair,.205,-.057,-.065,.10,.13,.070);
  ellipsoid(head,0xbdadc9,.262,-.056,-.095,.033,.033,.025);
  ellipsoid(head,C.skin,0,-.041,.211,.025,.035,.024);
  beam(head,0xb67e74,[-.027,-.118,.197],[.027,-.118,.197],.006);
  const eyes=joint(head,'Open eyes'),closedEyes=joint(head,'Closed eyes');
  for(const side of [-1,1]) {
    ellipsoid(eyes,0xfffcf0,side*.077,.008,.199,.047,.059,.015);
    ellipsoid(eyes,C.eye,side*.077,.003,.214,.030,.045,.009);
    ellipsoid(eyes,C.ink,side*.077,.004,.222,.019,.036,.005);
    ellipsoid(eyes,0xffffff,side*.069,.022,.229,.010,.013,.004);
    beam(closedEyes,C.ink,[side*.043,-.005,.212],[side*.112,-.005,.201],.008);
  }

  const arms=[],forearms=[],legs=[],shins=[];
  for(const side of [-1,1]) {
    const arm=joint(body,side<0?'Left shoulder':'Right shoulder',side*.245,.36,0);
    ellipsoid(arm,C.sweater,0,-.105,0,.079,.167,.083);
    const forearm=joint(arm,side<0?'Left elbow':'Right elbow',0,-.245,0);
    ellipsoid(forearm,C.sweater,0,-.085,0,.068,.115,.070);
    cylinder(forearm,C.cuff,0,-.168,0,.065,.044,.063,12);
    ellipsoid(forearm,C.skin,0,-.216,.008,.052,.066,.044);
    const leg=joint(body,side<0?'Left hip':'Right hip',side*.115,-.03,0);
    ellipsoid(leg,C.trousers,0,-.17,0,.089,.225,.095);
    const shin=joint(leg,side<0?'Left knee':'Right knee',0,-.39,0);
    ellipsoid(shin,C.trousers,0,-.17,0,.076,.207,.078);
    ellipsoid(shin,C.shoes,0,-.375,.045,.088,.076,.130);
    cube(shin,C.sole,0,-.421,.052,.164,.028,.26);
    cube(shin,0xe2d7c4,0,-.351,.126,.097,.018,.054);
    arms.push(arm);forearms.push(forearm);legs.push(leg);shins.push(shin);
  }

  const phone=joint(body,'Phone',0,.22,.36);
  cube(phone,C.ink,0,0,0,.145,.235,.026);
  cube(phone,0xafd2d9,0,.006,.015,.122,.194,.006);
  cube(phone,0xeff5dd,-.018,.038,.019,.062,.008,.002);
  cube(phone,0xe7d4e7,.009,.003,.019,.072,.008,.002);
  ellipsoid(phone,0x8d9faa,0,-.103,.015,.009,.006,.003);
  // The screen is on local +Z; turn it inward and tilt it up to her face.
  phone.rotation.set(.28,Math.PI,0);
  const book=joint(body,'Reading book',0,.25,.39);
  for(const side of [-1,1]) {
    const half=joint(book,'Book half',side*.093,0,0);half.rotation.y=side*-.25;
    cube(half,0xc18f8d,0,-.010,-.01,.19,.25,.026);
    cube(half,C.paper,0,.003,.01,.165,.219,.018);
    for(let row=0;row<5;row++)cube(half,0xc8bca3,0,.072-row*.031,.020,.124,.005,.002);
  }
  book.rotation.x=-.35;
  const towel=joint(body,'Folded laundry',0,.23,.46);
  cube(towel,0xe7d4ac,0,0,0,.34,.06,.22);
  cube(towel,0xf1e2c0,0,.038,.006,.31,.018,.19);
  const bowl=joint(body,'Dinner bowl',-.14,.17,.34);
  cylinder(bowl,0xf3e5cc,0,0,0,.095,.08,.118,16);
  cylinder(bowl,0xd6b887,0,.043,0,.105,.009,.105,16);
  const spoon=joint(root,'Cooking spoon',.26,1.66,.62);
  // A slanted handle reaches from her hand over the near rim into the soup.
  beam(spoon,0xc49a70,[0,.015,0],[-.20,-.105,.25],.012);
  ellipsoid(spoon,0xc49a70,-.20,-.12,.28,.037,.021,.048);
  const pot=joint(root,'Cooking pot',0,1.52,.90);
  cylinder(pot,0x81979d,0,0,0,.17,.15,.17,20);
  cylinder(pot,0xd8ac72,0,.080,0,.143,.006,.143,20);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.160,.013,8,24),mat(0xb7c8c8));
  rim.rotation.x=Math.PI/2;rim.position.y=.084;pot.add(rim);
  for(const side of [-1,1])beam(pot,0x81979d,[side*.16,.03,0],[side*.25,.03,0],.024);
  const mop=joint(root,'Mop',.25,0,.59);
  cylinder(mop,0xb89875,0,.96,0,.018,1.86,.018,8);
  cylinder(mop,0x8aab9f,0,1.82,0,.027,.16,.027,8);
  cube(mop,0xb0bfc2,0,.05,0,.34,.07,.18);
  for(let i=-2;i<=2;i++)cube(mop,0xe9e2cf,i*.061,.026,.018,.05,.04,.25);

  // Joint-local batching leaves the skeleton articulated but makes each rigid
  // body part/prop one draw. Animated people never dirty the cached sun shadow.
  root.traverse(object=>{if(object.isMesh){object.castShadow=false;object.receiveShadow=true;}});
  const rigid=[body,head,eyes,closedEyes,...brows,...arms,...forearms,...legs,...shins,phone,book,towel,bowl,spoon,pot,mop];
  for(const group of rigid)batchStaticGeometry(group,{recursive:group===book,cellSize:Infinity});
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.44,24),new THREE.MeshBasicMaterial({
    color:0x443c35,transparent:true,opacity:.15,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-1,
  }));
  shadow.name='Mistress contact shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.018;root.add(shadow);
  const props={phone,book,towel,bowl,spoon,pot,mop};
  const capturePoint=new THREE.Vector3();

  function animate(time,{activity='idle',moving=false,speed=0,activityTime=0,laughing=false,poseWeight=1,cleanupKind='poop',enraged=false,captureProgress=null,captureTarget=null,captureSupport=null}={}) {
    time=Number.isFinite(time)?time:0;activityTime=Number.isFinite(activityTime)?activityTime:0;
    const weight=clamp01(poseWeight),walk=moving?Math.min(1,Math.max(0,Number.isFinite(speed)?speed:0)/3.5):0;
    const gait=time*11*(1+(Number.isFinite(speed)?Math.max(0,speed-3.5):0)*.12),swing=Math.sin(gait)*.23*walk;
    body.position.set(0,MISTRESS_STANDING_PELVIS+Math.abs(Math.sin(gait))*.027*walk,0);body.rotation.set(0,0,0);
    head.position.set(0,.64,.005);head.rotation.set(Math.sin(time*1.1)*.018,Math.sin(time*.43)*.035,0);
    for(let i=0;i<2;i++) {
      const phase=i===0?1:-1;
      arms[i].position.y=.36;
      arms[i].rotation.set(-swing*phase,0,phase*.07);
      forearms[i].rotation.set(-.10,0,0);
      legs[i].rotation.set(swing*phase,0,0);
      shins[i].position.y=-.39;
      shins[i].rotation.set(Math.max(0,-Math.sin(gait+(i?Math.PI:0)))*.25*walk,0,0);
    }
    Object.values(props).forEach(prop=>{prop.visible=false;});
    // Cleanup reuses small versions of existing props. Restore their authored
    // transforms before another household pose displays them again.
    towel.position.set(0,.23,.46);towel.rotation.set(0,0,0);towel.scale.setScalar(1);
    mop.scale.setScalar(1);
    eyes.visible=true;closedEyes.visible=false;shadow.visible=true;
    brows.forEach(brow=>brow.rotation.set(0,0,0));
    const rotate=(group,x,y=0,z=0)=>{group.rotation.x=mix(group.rotation.x,x,weight);group.rotation.y=mix(group.rotation.y,y,weight);group.rotation.z=mix(group.rotation.z,z,weight);};
    const handsForward=(upper=-.55,lower=-1.0)=>{
      arms.forEach((arm,i)=>rotate(arm,upper,0,i===0?.27:-.27));
      forearms.forEach((arm,i)=>rotate(arm,lower,0,i===0?.32:-.32));
    };
    const sit=(height,dining=false)=>{
      const lift=dining?dockingLift(weight,.50,.2,.1):Math.sin(Math.PI*weight)*.20;
      body.position.y=mix(body.position.y,height,weight)+lift;
      legs.forEach(leg=>rotate(leg,-Math.PI/2));shins.forEach(shin=>rotate(shin,Math.PI/2));
    };
    const visible=weight>.2;
    if(activity==='phone') {
      sit(1.11);handsForward();rotate(head,.13,0,laughing?Math.sin(activityTime*15)*.035:0);
      phone.visible=visible;
      if(laughing) {body.rotation.x=-.035*weight;body.position.y+=Math.sin(activityTime*18)*.016*weight;rotate(head,-.15);}
    } else if(activity==='reading') {
      sit(1.11);handsForward(-.62,-.92);rotate(head,.19);book.visible=visible;
    } else if(activity==='eating') {
      sit(.95,true);handsForward(-.58,-.90);bowl.visible=visible;
      // Lift her knees early in the sideways climb, keeping the lower legs
      // vertical in the narrow gap between the stool and the dining table.
      legs.forEach(leg=>{leg.rotation.x=-Math.PI/2*smooth(weight/.25);});
      shins.forEach((shin,index)=>{shin.rotation.x=-legs[index].rotation.x;});
      // Enter facing the open side of the chair, then turn toward the table
      // after clearing its corner leg. Descending feet stay in front of wood.
      body.rotation.y=Math.PI/2*smooth((weight-.15)/.10)*(1-smooth((weight-.8)/.14));
      rotate(arms[1],-1.45-Math.sin(activityTime*2.7)*.10,0,-.15);
      rotate(forearms[1],-1.15,0,-.16);rotate(head,.08+Math.sin(activityTime*2.7)*.025);
    } else if(activity==='cooking') {
      handsForward(-.95,-.62);rotate(head,.20);
      rotate(arms[1],-.95+Math.sin(activityTime*3)*.07,Math.cos(activityTime*3)*.04,-.13);
      spoon.visible=pot.visible=visible;
      spoon.position.set(.26+Math.sin(activityTime*3)*.035,1.66,.62+Math.cos(activityTime*3)*.025);
      spoon.rotation.set(Math.sin(activityTime*3)*.02,0,Math.sin(activityTime*3)*.06);
    } else if(activity==='laundry') {
      handsForward(-.90,-.90);rotate(head,.19);towel.visible=visible;
      rotate(forearms[0],-.90,0,.30+Math.sin(activityTime*2)*.17);
      rotate(forearms[1],-.90,0,-.30-Math.sin(activityTime*2)*.17);
    } else if(activity==='mopping') {
      handsForward(-.58,-.42);rotate(body,.07);rotate(head,.13);
      mop.visible=visible;mop.position.set(.25,0,.59+Math.sin(activityTime*2.2)*.15);
      mop.rotation.set(-.10+Math.sin(activityTime*2.2)*.06,Math.sin(activityTime*1.1)*.07,0);
      rotate(arms[0],-.65+Math.sin(activityTime*2.2)*.10,0,.18);
      rotate(arms[1],-.88+Math.sin(activityTime*2.2)*.10,0,-.10);
    } else if(activity==='cleaning') {
      // A balanced shallow squat keeps both feet planted while her hands wipe
      // or scoop close to the body. The tool stays inside her clear stance so
      // cleanup beside a wall cannot push a prop through nearby furniture.
      const bend=.32*weight,wipe=Math.sin(activityTime*8);
      body.position.y-=MISTRESS_BODY_SCALE*.39*(1-Math.cos(bend));body.position.z=-.06*weight;
      legs.forEach(leg=>rotate(leg,-.32));shins.forEach(shin=>rotate(shin,.32));
      rotate(head,.32,Math.sin(activityTime*3)*.025,0);
      arms.forEach((arm,index)=>rotate(arm,-.36+wipe*.025,0,index===0?.15:-.15));
      forearms.forEach((arm,index)=>rotate(arm,-.48-wipe*.04,0,index===0?.25:-.25));
      if(cleanupKind==='pee') {
        mop.visible=visible;mop.scale.setScalar(.65);
        mop.position.set(.18,0,.24+wipe*.035*weight);mop.rotation.set(0,0,0);
      } else {
        towel.visible=visible;towel.scale.setScalar(.42);
        towel.position.set(0,-.10,.22+wipe*.018);towel.rotation.set(-.10,Math.sin(activityTime*4)*.08,0);
      }
    } else if(activity==='angry') {
      // Fold one hand inward at the waist and wag the other raised fist while
      // shaking her head. Everything stays over her human-sized floor stance.
      const wag=Math.sin(activityTime*7),stamp=Math.max(0,Math.sin(activityTime*5));
      rotate(head,.12+Math.sin(activityTime*9)*.025,Math.sin(activityTime*5)*.12,0);
      brows.forEach((brow,index)=>{brow.rotation.z=(index===0?-1:1)*.38*weight;});
      rotate(arms[0],-.16,0,.15);rotate(forearms[0],-.65,0,.66);
      rotate(arms[1],-.24,0,-.18);rotate(forearms[1],-2.35+wag*.14,0,-.10);
      body.position.y+=stamp*.012*weight;
      shins[0].position.y=-.39+stamp*.025*weight;
    } else if(activity==='typing') {
      // Hands tap alternately over the study keyboard without a floating prop.
      handsForward(-.24,-1.85);rotate(head,.22);
      forearms.forEach((arm,index)=>rotate(arm,-1.85+Math.sin(activityTime*9+index*Math.PI)*.045,0,index===0?.28:-.28));
    } else if(activity==='humming') {
      // A small chest-level conducting gesture and a relaxed rhythmic nod.
      rotate(head,Math.sin(activityTime*3)*.045,Math.sin(activityTime*1.8)*.07,.035);
      rotate(arms[0],-.10,0,.07);rotate(forearms[0],-.55,0,.30);
      rotate(arms[1],-.22,0,-.15);rotate(forearms[1],-2.35+Math.sin(activityTime*4)*.14,0,-.12);
    } else if(activity==='tidying') {
      handsForward(-.20,-1.90);rotate(head,.16);
      rotate(arms[0],-.20+Math.sin(activityTime*2.8)*.07,0,.20);
      rotate(arms[1],-.20-Math.sin(activityTime*2.8)*.07,0,-.20);
    } else if(activity==='gardening') {
      // Two close, cupped hands tip forward as if tending or watering a plant.
      handsForward(-.18,-1.70);rotate(head,.20);
      rotate(forearms[0],-1.70+Math.sin(activityTime*1.8)*.07,0,.34);
      rotate(forearms[1],-1.70+Math.sin(activityTime*1.8)*.07,0,-.34);
    } else if(activity==='vacuuming') {
      handsForward(-.20,-1.90);rotate(head,.15);
      mop.visible=visible;mop.position.set(.25,0,.59+Math.sin(activityTime*2)*.10);
      mop.rotation.set(-.08+Math.sin(activityTime*2)*.04,Math.sin(activityTime)*.06,0);
      rotate(arms[0],-.20+Math.sin(activityTime*2)*.07,0,.18);
      rotate(arms[1],-.20+Math.sin(activityTime*2)*.07,0,-.10);
    } else if(activity==='sleeping') {
      // Arc over the bed edge before settling onto it. The raised head keeps
      // the back of her hair above the quilt rather than inside the mattress.
      body.position.y=mix(body.position.y,1.30,weight)+dockingLift(weight,1.10);
      head.position.z=mix(.005,.15,weight);rotate(body,-Math.PI/2,0,0);
      rotate(head,.045,0,.07);
      arms.forEach((arm,i)=>rotate(arm,-.46,0,i===0?.10:-.10));
      forearms.forEach((arm,i)=>rotate(arm,-.98,0,i===0?.30:-.30));
      legs.forEach(leg=>rotate(leg,.02));shins.forEach(shin=>rotate(shin,.035));
      if(weight>.5){eyes.visible=false;closedEyes.visible=true;}
      shadow.visible=weight<.5;
    }
    if(Number.isFinite(captureProgress)&&captureProgress>0) {
      const progress=clamp01(captureProgress),engage=smooth(progress/.22),cradle=smooth((progress-.38)/.45);
      let targetHeight=.3;
      if(captureTarget&&['x','y','z'].every(axis=>Number.isFinite(captureTarget[axis]))) {
        root.updateWorldMatrix(true,false);
        capturePoint.copy(captureTarget);root.worldToLocal(capturePoint);targetHeight=capturePoint.y;
      }
      // Deeply bend for a floor rabbit, or reach over the edge for a rabbit on
      // furniture. Rise again as the forearms fold into a supporting cradle.
      const high=Math.max(0,Math.min(1,(targetHeight-.3)/1.5));
      const reaching=smooth(progress/.28)*(1-smooth((progress-.38)/.48));
      const lean=mix(.55,.15,high)*reaching,knee=mix(.95,.22,high)*reaching;
      const carryHeight=Number.isFinite(captureSupport?.maxY)?Math.max(targetHeight,captureSupport.maxY-root.matrixWorld.elements[13]):targetHeight;
      const carryArm=-.85-.52*Math.max(0,Math.min(1,(carryHeight-.9)/.7));
      body.position.set(0,MISTRESS_STANDING_PELVIS-MISTRESS_BODY_SCALE*.39*(1-Math.cos(knee))+
        MISTRESS_BODY_SCALE*.03*(Math.cos(lean)-1),-MISTRESS_BODY_SCALE*.39*Math.sin(knee)+MISTRESS_BODY_SCALE*.03*Math.sin(lean));
      body.rotation.set(lean,0,0);
      legs.forEach(leg=>{leg.rotation.set(-lean-knee,0,0);});
      shins.forEach(shin=>{shin.position.y=-.39;shin.rotation.set(knee,0,0);});
      head.rotation.set(mix(.34,.10,cradle)*engage,0,0);
      arms.forEach((arm,index)=>{
        const side=index===0?1:-1;
        // Fold first beside the chest, then extend above a high slab rather
        // than swinging a hanging hand straight through its edge.
        const upper=high>.35?smooth((progress-.10)/.18):engage,lower=high>.35?smooth(progress/.12):engage;
        arm.rotation.set(mix(arm.rotation.x,mix(-lean+mix(.04,-1.05,high),carryArm,cradle),upper),0,side*mix(.07,.10,engage));
        forearms[index].rotation.set(mix(forearms[index].rotation.x,mix(mix(-.30,-1.15,high),-1.10,cradle),lower),0,side*.24*engage);
      });
      Object.values(props).forEach(prop=>{prop.visible=false;});
      eyes.visible=true;closedEyes.visible=false;shadow.visible=true;
    }
    // Rage is an expression layered over the active pose, including the normal
    // run gait. It does not restart a scold or replace the current animation.
    if(enraged)brows.forEach((brow,index)=>{brow.rotation.z=(index===0?-1:1)*.38;});
  }
  const sightPoints=[new THREE.Vector3(),new THREE.Vector3()];
  function getSightPoints() {
    root.updateWorldMatrix(true,true);
    head.localToWorld(sightPoints[0].set(0,.03,.14));
    body.localToWorld(sightPoints[1].set(0,.23,.08));
    return sightPoints;
  }
  const cradlePoint=new THREE.Vector3(),otherHand=new THREE.Vector3(),cradleOffset=new THREE.Vector3(),rootOrigin=new THREE.Vector3();
  function getCradlePoint() {
    root.updateWorldMatrix(true,true);
    forearms[0].localToWorld(cradlePoint.set(0,-.216,.008));
    forearms[1].localToWorld(otherHand.set(0,-.216,.008));
    cradlePoint.add(otherHand).multiplyScalar(.5);
    root.localToWorld(cradleOffset.set(0,-.34,.06));rootOrigin.setFromMatrixPosition(root.matrixWorld);
    return cradlePoint.add(cradleOffset.sub(rootOrigin));
  }
  animate(0);
  return {root,animate,getSightPoints,getCradlePoint,joints:{body,head,eyes,closedEyes,brows,arms,forearms,legs,shins},props,shadow};
}
