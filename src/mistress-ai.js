import { FLOOR_HEIGHT } from './layout.js';
import { MistressNavigation } from './mistress-navigation.js';
import { canHearNoise, MAX_NOISE_EVENTS } from './noise.js';

export const MISTRESS_WALK_SPEED = 3.5;
export const MISTRESS_DOCK_SECONDS = 1.2;
export const MISTRESS_NOISE_DURATION = Object.freeze([1,5]);
const EPSILON = 1e-8;
const point = (x,y,z) => Object.freeze({x,y,z});
const copy = p => ({x:p.x,y:p.y,z:p.z});
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const smooth = t => t*t*(3-2*t);

// Navigation ends beside a piece of furniture. The short authored docking
// motion then sits or lies down, rather than asking the walker to cross it.
export const MISTRESS_ACTIVITIES = Object.freeze([
  {id:'phone',room:'living',name:'Phone on the couch',approach:point(-15.8,0,6.9),seat:point(-15.8,0,5.90),yaw:0,duration:[24,40],noise:'laugh',interval:[4,8]},
  {id:'cooking',room:'kitchen',name:'Cooking',approach:point(21.25,0,10.5),yaw:Math.PI/2,duration:[18,28],noise:'cook',interval:[2.5,5]},
  {id:'eating',room:'kitchen',name:'Eating in the kitchen',approach:point(17,0,17.2),seat:point(15.7,0,17.10),yaw:Math.PI,duration:[16,24]},
  {id:'laundry',room:'utility',name:'Doing laundry',approach:point(20.65,0,-16),yaw:Math.PI/2,duration:[16,24]},
  {id:'mopping',room:'foyer',name:'Mopping the entrance hall',approach:point(0,0,9),yaw:0,duration:[16,24]},
  {id:'reading',room:'reading',name:'Reading upstairs',approach:point(3.75,FLOOR_HEIGHT,-10.9),seat:point(3.45,FLOOR_HEIGHT,-12.80),yaw:0,duration:[18,28]},
  {id:'sleeping',room:'bedroom',name:'Sleeping',approach:point(-11.8,FLOOR_HEIGHT,-13.65),seat:point(-13.6,FLOOR_HEIGHT,-14),yaw:0,duration:[24,36]},
  {id:'humming',room:'hall',name:'Humming in the hallway',animation:'humming',approach:point(-2,0,-.5),yaw:0,duration:[10,16],noise:'hum',interval:[2.5,4]},
  {id:'tidying',room:'library',name:'Tidying the library books',animation:'tidying',approach:point(-12,0,-17.4),yaw:Math.PI,duration:[10,16],noise:'rustle',interval:[2.5,4]},
  {id:'watering',room:'garden-room',name:'Watering the houseplants',animation:'gardening',approach:point(4.5,0,-15),yaw:Math.PI/2,duration:[10,16],noise:'water',interval:[2.5,4]},
  {id:'typing',room:'study',name:'Typing in the attic studio',animation:'typing',approach:point(15.5,FLOOR_HEIGHT,-10.2),yaw:Math.PI,duration:[10,16],noise:'typing',interval:[2,3.5]},
  {id:'dusting',room:'gallery',name:'Dusting the upstairs gallery',animation:'tidying',approach:point(-11,FLOOR_HEIGHT,.1),yaw:0,duration:[10,16],noise:'rustle',interval:[2.5,4]},
  {id:'rug-shaking',room:'balcony',name:'Shaking a rug on the balcony',animation:'tidying',approach:point(-4.8,FLOOR_HEIGHT,-22.2),yaw:Math.PI/2,duration:[10,16],noise:'shake',interval:[2.5,4]},
  {id:'gardening',room:'yard',name:'Gardening in the backyard',animation:'gardening',approach:point(7,0,-28.4),yaw:0,duration:[10,16],noise:'garden',interval:[2.5,4]},
  {id:'sweeping',room:'front-yard',name:'Sweeping the front path',animation:'vacuuming',approach:point(0,0,25),yaw:0,duration:[10,16],noise:'sweep',interval:[2.5,4]},
].map(activity=>Object.freeze({animation:activity.id,...activity,duration:Object.freeze(activity.duration),
  ...(activity.interval ? {interval:Object.freeze(activity.interval)} : {})})));
const definitions = new Map(MISTRESS_ACTIVITIES.map(activity=>[activity.id,activity]));

class MistressNoise {
  constructor() { this.reset(); }
  reset() { this.elapsed=0;this.sequence=0;this._events=[]; }
  stop() {this._events.length=0;}
  get events() { return this._events.slice(); }
  get activeKinds() { return [...new Set(this._events.map(event=>event.kind))]; }
  audibleTo(listener) { return this._events.filter(event=>event.expiresAt>this.elapsed+EPSILON && canHearNoise(event,listener)); }
  canHear(event,listener) { return this._events.includes(event) && event.expiresAt>this.elapsed+EPSILON && canHearNoise(event,listener); }
  emit(kind,position,time,lifetime=MISTRESS_NOISE_DURATION[0]) {
    lifetime=Number.isFinite(lifetime)?clamp(lifetime,...MISTRESS_NOISE_DURATION):MISTRESS_NOISE_DURATION[0];
    const event=Object.freeze({id:++this.sequence,source:'mistress',kind,scope:'house',radius:null,
      position:Object.freeze(copy(position)),time,lifetime,expiresAt:time+lifetime});
    this._events.push(event);
    if(this._events.length>MAX_NOISE_EVENTS) this._events.shift();
    return event;
  }
  advance(time) {
    this.elapsed=time;
    this._events=this._events.filter(event=>event.expiresAt>time+EPSILON);
  }
}

// This controller has no reference to Shidan. The pursuit layer interrupts it,
// then resumes a fresh random journey from the final scolding stance.
export class MistressAI {
  constructor(world,{random=Math.random,navigation=null}={}) {
    this.navigation=navigation ?? new MistressNavigation(world);
    this.random=random;
    this.noise=new MistressNoise();
    this.reset();
  }
  get definition() { return definitions.get(this.activity); }
  get laughing() { return this.state==='acting' && this.activity==='phone' && this.elapsed<this._laughUntil-EPSILON; }
  get makingNoise() {return this.state==='acting'&&this.noise.events.some(event=>event.expiresAt>this.elapsed+EPSILON);}
  get route() { return this._path.map(copy); }
  get remaining() { return this.state==='acting' ? Math.max(0,this._duration-this.activityTime) : 0; }
  stopNoise() {this.noise.stop();this._laughUntil=-Infinity;}
  _random() {
    const value=this.random();
    return Number.isFinite(value) ? clamp(value,0,1-Number.EPSILON) : .5;
  }
  _range([min,max]) { return min+(max-min)*this._random(); }
  _shuffle(ids) {
    for(let i=ids.length-1;i>0;i--) {const j=Math.floor(this._random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
    return ids;
  }
  _nextActivity() {
    if(!this._bag.length) {
      this._bag=this._shuffle(MISTRESS_ACTIVITIES.map(activity=>activity.id));
      const last=this._bag.length-1;
      if(this._bag[last]===this.activity) [this._bag[0],this._bag[last]]=[this._bag[last],this._bag[0]];
    }
    return this._bag.pop();
  }
  reset() {
    this.elapsed=0;this.noise.reset();this.activity='phone';this.state='acting';this.activityTime=0;
    this.position=copy(this.definition.approach);this.renderPosition=copy(this.definition.seat);
    this.yaw=this.definition.yaw;this.speed=0;this.poseWeight=1;this.blocked=false;
    this._path=[];this._pathIndex=0;this._dockTime=0;this._laughUntil=-Infinity;this._noiseReadyAt=-Infinity;this._walkingSpeed=MISTRESS_WALK_SPEED;
    this._duration=this._range(this.definition.duration);this._nextNoise=this._range(this.definition.interval);
    this._bag=this._shuffle(MISTRESS_ACTIVITIES.filter(activity=>activity.id!=='phone').map(activity=>activity.id));
  }
  resumeFrom(position,{yaw=this.yaw,elapsed=this.elapsed}={}) {
    if(!position||!['x','y','z'].every(axis=>Number.isFinite(position[axis]))||
      (this.navigation.canStand&&!this.navigation.canStand(position)))return false;
    // Choose a reachable next task before changing any pose. Failed routing
    // cannot send her back to the couch or snap her into a distant seat.
    this._bag=this._shuffle(MISTRESS_ACTIVITIES.filter(activity=>activity.id!==this.activity).map(activity=>activity.id));
    let choice=null,path=null;
    for(let attempt=0;attempt<MISTRESS_ACTIVITIES.length-1;attempt++) {
      const candidate=definitions.get(this._nextActivity()),route=this.navigation.findPath(position,candidate.approach);
      if(route.length){choice=candidate;path=route.map(copy);break;}
    }
    if(!choice)return false;
    if(Number.isFinite(elapsed)&&elapsed>=this.elapsed)this.elapsed=elapsed;
    this.noise.advance(this.elapsed);this.stopNoise();
    this.position=copy(position);this.renderPosition=copy(position);
    this.yaw=Number.isFinite(yaw)?yaw:this.yaw;this.activity=choice.id;
    this.state='walking';this.activityTime=0;this.poseWeight=0;this.speed=this._walkingSpeed;
    this._path=path;this._pathIndex=0;this._dockTime=0;this._laughUntil=-Infinity;
    this._nextNoise=Infinity;this.blocked=false;
    return true;
  }
  _startActing() {
    this.stopNoise();
    this.state='acting';this.activityTime=0;this.speed=0;this.poseWeight=1;
    Object.assign(this.renderPosition,this.definition.seat ?? this.position);
    this.yaw=this.definition.yaw;
    this._duration=this._range(this.definition.duration);
    this._nextNoise=this.definition.interval ? this._range(this.definition.interval) : Infinity;
  }
  _beginJourney() {
    this.stopNoise();
    // Search only on activity changes. Static obstacles need no per-frame
    // replanning, and a malformed/disconnected level cannot cause teleporting.
    let choice=null,path=null;
    for(let attempt=0;attempt<MISTRESS_ACTIVITIES.length;attempt++) {
      const candidate=definitions.get(this._nextActivity());
      if(candidate.id===this.activity) continue;
      const route=this.navigation.findPath(this.position,candidate.approach);
      if(!route.length) continue;
      choice=candidate;path=route.map(copy);break;
    }
    if(!choice) {
      this.blocked=true;this._startActing();this._duration=5;return;
    }
    this.blocked=false;this.activity=choice.id;this.activityTime=0;this._path=path;this._pathIndex=0;
    this.state='walking';this.poseWeight=0;this.speed=this._walkingSpeed;
    Object.assign(this.renderPosition,this.position);
  }
  _beginLeaving() {
    this.stopNoise();
    if(!this.definition.seat) { this._beginJourney();return; }
    this.state='leaving';this._dockTime=0;this.speed=0;
  }
  _beginEntering() {
    Object.assign(this.position,this.definition.approach);
    if(!this.definition.seat) { this._startActing();return; }
    this.state='entering';this._dockTime=0;this.speed=0;this.poseWeight=0;
  }
  _dock(dt) {
    const available=MISTRESS_DOCK_SECONDS-this._dockTime,take=Math.min(dt,available);
    this._dockTime+=take;
    const t=smooth(clamp(this._dockTime/MISTRESS_DOCK_SECONDS,0,1));
    const weight=this.state==='entering' ? t : 1-t;
    this.poseWeight=weight;
    const a=this.definition.approach,b=this.definition.seat;
    this.renderPosition.x=a.x+(b.x-a.x)*weight;this.renderPosition.y=a.y+(b.y-a.y)*weight;
    this.renderPosition.z=a.z+(b.z-a.z)*weight;
    this.yaw=this.definition.yaw;
    this.speed=distance(a,b)*6*(this._dockTime/MISTRESS_DOCK_SECONDS)*(1-this._dockTime/MISTRESS_DOCK_SECONDS)/MISTRESS_DOCK_SECONDS;
    if(this._dockTime>=MISTRESS_DOCK_SECONDS-EPSILON) {
      if(this.state==='entering') this._startActing();
      else this._beginJourney();
    }
    return take;
  }
  _walk(dt) {
    let remaining=dt,used=0;
    while(this._pathIndex<this._path.length) {
      const next=this._path[this._pathIndex],length=distance(this.position,next);
      if(length<EPSILON) {Object.assign(this.position,next);this._pathIndex++;continue;}
      const take=Math.min(remaining,length/this._walkingSpeed),ratio=take*this._walkingSpeed/length;
      const dx=next.x-this.position.x,dz=next.z-this.position.z;
      this.position.x+=(next.x-this.position.x)*ratio;this.position.y+=(next.y-this.position.y)*ratio;
      this.position.z+=(next.z-this.position.z)*ratio;
      if(Math.abs(dx)+Math.abs(dz)>EPSILON) this.yaw=Math.atan2(dx,dz);
      Object.assign(this.renderPosition,this.position);
      this.speed=this._walkingSpeed;remaining-=take;used+=take;
      if(ratio>=1-EPSILON) {Object.assign(this.position,next);this._pathIndex++;}
      if(remaining<EPSILON) break;
    }
    if(this._pathIndex>=this._path.length) this._beginEntering();
    return used;
  }
  _act(dt,emitted) {
    const take=Math.min(dt,this._duration-this.activityTime),start=this.activityTime,end=start+take;
    if(this.definition.noise) {
      while(this._nextNoise<=end+EPSILON) {
        const time=this.elapsed+Math.max(0,this._nextNoise-start);
        // Keep the existing quiet gap when an episode was interrupted by an
        // activity change, even when the next noisy task is nearby.
        if(time+EPSILON<this._noiseReadyAt) {
          this._nextNoise=start+this._noiseReadyAt-this.elapsed;continue;
        }
        const lifetime=Math.round(this._range(MISTRESS_NOISE_DURATION)*1e9)/1e9;
        const event=this.noise.emit(this.definition.noise,this.renderPosition,time,lifetime);emitted.push(event);
        if(event.kind==='laugh') this._laughUntil=event.expiresAt;
        const quietGap=this._range(this.definition.interval);
        this._noiseReadyAt=event.expiresAt+quietGap;
        this._nextNoise+=lifetime+quietGap;
      }
    }
    this.activityTime=end;
    if(this.activityTime>=this._duration-EPSILON) this._beginLeaving();
    return take;
  }
  update(dt,{active=true,movementScale=1,walkingSpeed=MISTRESS_WALK_SPEED}={}) {
    if(!active || !Number.isFinite(dt) || dt<=0 || !Number.isFinite(this.elapsed+dt)) return [];
    if(this.state!=='acting')this.stopNoise();
    const travelScale=Number.isFinite(movementScale)?clamp(movementScale,0,1):0;
    this._walkingSpeed=Number.isFinite(walkingSpeed)&&walkingSpeed>=0?walkingSpeed:MISTRESS_WALK_SPEED;
    if(this.state==='walking')this.speed=this._walkingSpeed;
    const emitted=[];
    let remaining=dt;
    // A run lasts ten minutes. This limit also bounds accidental catch-up
    // work from an application feeding a many-day timestamp as a delta.
    if(remaining>600) {this.elapsed+=remaining-600;remaining=600;}
    for(let steps=0;remaining>EPSILON && steps<4096;steps++) {
      const state=this.state;
      // Walking may receive a smaller simulation budget after a slow frame.
      // Convert spent travel time back to active wall time, so task/clock
      // deadlines still advance and zero travel cannot stall this loop.
      const used=state==='acting' ? this._act(remaining,emitted) :
        state==='walking' ? travelScale>0&&this._walkingSpeed>EPSILON?this._walk(remaining*travelScale)/travelScale:remaining : this._dock(remaining);
      this.elapsed+=used;remaining-=used;
      if(used<EPSILON && this.state===state) break;
    }
    this.noise.advance(this.elapsed);
    const live=new Set(this.noise.events);
    return emitted.filter(event=>live.has(event)&&event.expiresAt>this.elapsed+EPSILON);
  }
}
