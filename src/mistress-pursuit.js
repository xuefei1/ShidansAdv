import { MISTRESS_ACTIVITIES, MISTRESS_DOCK_SECONDS, MISTRESS_WALK_SPEED } from './mistress-ai.js';
import { DEN, FLOOR_HEIGHT } from './layout.js';
import { canHearNoise } from './noise.js';
import { withinInteractionReach } from './table-refuges.js';

export const LOST_SIGHT_SECONDS=2;
export const SPRINT_REACQUIRE_SECONDS=2;
export const CAPTURE_SECONDS=3;
export const SCOLD_SECONDS=5;
export const CAPTURE_RADIUS=.8;
export const CAPTURE_HEIGHT=1.35;
export const CHASE_REPLAN_SECONDS=.35;
export const CORNER_PAUSE_SECONDS=.25;
export const POOP_CLEAN_SECONDS=.2;
export const PEE_CLEAN_SECONDS=10;
export const CLEANUP_REACH=1.3;
export const CLEANUP_HEIGHT=2;
export const PEE_RAGE_BONUS=.05;
export const SURFACE_INTERCEPT_WAIT=1.8;
// String-pulled doorway routes often split a right angle into diagonal turns.
const CORNER_ANGLE=40*Math.PI/180;
const EPSILON=1e-8;
const valid=p=>p&&['x','y','z'].every(axis=>Number.isFinite(p[axis]));
const copy=p=>({x:p.x,y:p.y,z:p.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const smooth=t=>t*t*(3-2*t);
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const key=p=>`${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
const couch=MISTRESS_ACTIVITIES.find(activity=>activity.id==='phone');

export function chaseSpeedMultiplier(elapsed) {
  return .7+.05*Math.min(4,Math.max(0,Math.floor((Number.isFinite(elapsed)?elapsed:0)/120)));
}

// The ordinary household controller remains independently testable. This layer
// interrupts it with perception, routed pursuit, searching and capture. The
// caller supplies real forward-cone sight and a separate close-contact ray.
export class MistressPursuit {
  constructor(routine,{random=Math.random}={}) {
    this.routine=routine;this.navigation=routine.navigation;this.random=random;
    this.reset();
  }
  reset() {
    this.routine.reset();this.elapsed=0;this.phase='routine';
    this._position=copy(this.routine.position);this._renderPosition=copy(this.routine.renderPosition);
    this._yaw=this.routine.yaw;this._speed=0;this._state='idle';this._activity='idle';this._poseWeight=0;
    this._events=[];this._noiseIds=new Set();this._noiseIdOrder=[];
    this._path=[];this._pathIndex=0;this._nextPlanAt=0;this._plannedGoal=null;this._lastKnown=null;
    this._lostSight=0;this._searchDeadline=0;this._sprintMutedUntil=0;this._captureRemaining=0;this._scoldRemaining=0;
    this._investigatingNoise=false;this._investigationSource=null;this._investigationGoal=null;
    this._tableArrivalPending=false;
    this._surfaceIntercept=null;
    this._rememberedChew=null;this._cleanupTarget=null;this._cleanupRemaining=0;
    this._rageBonus=0;this._sprintSpeed=8.2;this._topSprintSpeed=8.8;this._walkingSpeed=MISTRESS_WALK_SPEED;
    this._cornerPause=0;this._turnYaw=0;this._handledCorners=new Map();
    this._detach=null;this._dock=null;this._lookUntil=0;this._returnReason='';
    this.chaseMultiplier=.7;this.chaseSpeed=8.2*.7;this.blocked=false;this.lastDetection='';
  }
  get noise() {return this.routine.noise;}
  get definition() {return this.phase==='routine'?this.routine.definition:this._activity==='phone'?couch:null;}
  get position() {return this.phase==='routine'?this.routine.position:this._position;}
  get renderPosition() {return this.phase==='routine'?this.routine.renderPosition:this._renderPosition;}
  get yaw() {return this.phase==='routine'?this.routine.yaw:this._yaw;}
  get speed() {return this.phase==='routine'?this.routine.speed:this._speed;}
  get state() {return this.phase==='routine'?this.routine.state:this._state;}
  get activity() {return this.phase==='routine'?this.routine.activity:this._activity;}
  get poseWeight() {return this.phase==='routine'?this.routine.poseWeight:this._poseWeight;}
  get activityTime() {return this.phase==='routine'?this.routine.activityTime:this.phase==='scolding'?SCOLD_SECONDS-this._scoldRemaining:
    this.phase==='cleanup'?this._cleanupDuration-this._cleanupRemaining:0;}
  get remaining() {return this.phase==='routine'?this.routine.remaining:this.phase==='search'?this.searchRemaining:
    this.phase==='scolding'?this.scoldRemaining:this.phase==='cleanup'?this.cleanupRemaining:this.captureRemaining;}
  get laughing() {return this.phase==='routine'&&this.routine.laughing;}
  get maskingNoise() {
    // Expiring ripple/history events are not proof that she is still making
    // that sound after walking away or interrupting the household activity.
    return this.phase==='routine'&&!!this.routine.makingNoise;
  }
  get playerLocked() {return this.phase==='caught';}
  get captureRemaining() {return Math.max(0,this._captureRemaining);}
  get scoldRemaining() {return Math.max(0,this._scoldRemaining);}
  get cleanupTarget() {return this.phase==='cleanup'?this._cleanupTarget:null;}
  get cleanupKind() {return this.phase==='cleanup'?this._cleanupTarget?.kind??'': '';}
  get cleanupTargetId() {return this.phase==='cleanup'?this._cleanupTarget?.id??null:null;}
  get cleanupRemaining() {return this.phase==='cleanup'?Math.max(0,this._cleanupRemaining):0;}
  get _cleanupDuration() {return this._cleanupTarget?.kind==='pee'?PEE_CLEAN_SECONDS:POOP_CLEAN_SECONDS;}
  get rageBonus() {return this._rageBonus;}
  get rageSpeedBonus() {return this._topSprintSpeed*this._rageBonus;}
  get walkSpeed() {return this._walkingSpeed;}
  get investigating() {return this.phase==='chase'&&this._investigatingNoise;}
  get investigationSource() {return this._investigationSource;}
  get investigationGoal() {return this._investigationGoal;}
  get searchRemaining() {return this.phase==='search'?Math.max(0,this._searchDeadline-this.elapsed):0;}
  get lostSightFor() {return this._lostSight;}
  get sprintHearingCooldown() {return Math.max(0,this._sprintMutedUntil-this.elapsed);}
  get cornerPauseRemaining() {return Math.max(0,this._cornerPause);}
  get returnReason() {return this._returnReason;}
  get route() {return this.phase==='routine'?this.routine.route:this._path.map(copy);}
  takeEvents() {return this._events.splice(0);}
  _emit(kind,details={}) {
    this._events.push(Object.freeze({kind,time:this.elapsed,...details}));
    if(this._events.length>32)this._events.shift();
  }
  _random() {const n=this.random();return Number.isFinite(n)?clamp(n,0,1-Number.EPSILON):.5;}
  _safe(player) {
    if(!valid(player))return true;
    if(this._inDen(player))return true;
    return this.navigation.isRabbitSafe?.(player,this.position)??false;
  }
  _inDen(player) {
    return valid(player)&&(this.navigation.isDen?.(player)??
      (Math.hypot(player.x-DEN.x,player.z-DEN.z)<DEN.radius&&player.y<FLOOR_HEIGHT-.35));
  }
  _target(point) {
    if(!valid(point))return null;
    if(this.navigation.pursuitTarget)return this.navigation.pursuitTarget(point,this.position,{preferFrom:true});
    return this.navigation.canStand&&!this.navigation.canStand(point)?null:copy(point);
  }
  _surfaceGoal(point) {
    const interaction=this.navigation.reachInteraction?.(point)??this.navigation.tableInteraction?.(point);
    const id=interaction?.key??interaction?.table?.id;
    if(!id){this._surfaceIntercept=null;return this._target(point);}
    const intercept=this._surfaceIntercept;
    if(intercept?.id===id&&(this.navigation.canStand?.(intercept.goal)??true)) {
      // Commit to reaching one side rather than chasing a rabbit's faster
      // orbit from front to back. Once there, wait briefly for an interception;
      // a rabbit that stops at the far end still gets a fresh approach.
      if(distance(this._position,intercept.goal)>.05)return intercept.goal;
      if(intercept.arrivedAt===null)intercept.arrivedAt=this.elapsed;
      if(this.elapsed-intercept.arrivedAt<SURFACE_INTERCEPT_WAIT)return intercept.goal;
    }
    const goal=this._target(point);
    this._surfaceIntercept=goal?{id,goal:copy(goal),arrivedAt:null}:null;
    return goal;
  }
  _rememberNoise(event) {
    const id=event.id;
    if(id===undefined||id===null)return false;
    if(this._noiseIds.has(id))return false;
    this._noiseIds.add(id);this._noiseIdOrder.push(id);
    if(this._noiseIdOrder.length>256)this._noiseIds.delete(this._noiseIdOrder.shift());
    return true;
  }
  _hear(context,safe) {
    let heard=null;
    const clock=Number.isFinite(context.noiseElapsed)?context.noiseElapsed:this.elapsed;
    for(const event of context.noiseEvents??[]) {
      if(event?.source!=='shidan'||!this._rememberNoise(event))continue;
      // Rejected pulses are consumed too: neither laughter nor a grace period
      // queues up an old noise to replay once hearing becomes available.
      if(safe||this.maskingNoise||!valid(event.position)||this._safe(event.position))continue;
      if(this.phase==='scolding'&&event.kind!=='eat')continue;
      if(Number.isFinite(event.expiresAt)&&event.expiresAt<=clock+EPSILON)continue;
      if(event.kind==='sprint'&&this.elapsed<this._sprintMutedUntil-EPSILON)continue;
      if(!canHearNoise(event,this.renderPosition))continue;
      if(event.kind==='eat')this._rememberedChew=Object.freeze(copy(event.position));
      heard=event;
    }
    return heard;
  }
  _observe(context) {
    if(!valid(context.player)) {
      this._hear(context,true);return {safe:false,visible:false,heard:null};
    }
    const safe=this._safe(context.player),heard=this._hear(context,safe||this.phase==='caught');
    const visible=valid(context.player)&&!this._inDen(context.player)&&
      (typeof context.seen==='function'?context.seen(this):!!context.seen);
    this._currentlySeen=visible;
    if(this.phase==='caught'||(this.phase==='scolding'&&!visible&&!heard))return {safe,visible,heard:null};
    if(this.phase==='scolding'&&(visible||heard)){this._scoldRemaining=0;this._returnReason='';}
    const cleanupEnded=this.phase==='cleanup'&&!this._cleanupExists(this._cleanupTarget);
    if(cleanupEnded)this._finishCleanup(false,context);
    const cleanup=context.cleanupTarget;
    if(this._cleanupExists(cleanup)) {
      if(this.phase!=='cleanup'||(cleanup.kind==='pee'&&this.cleanupKind==='poop'))this._beginCleanup(cleanup);
      else if(cleanup.id===this.cleanupTargetId&&cleanup.kind===this.cleanupKind)this._cleanupTarget=cleanup;
    }
    // Sight and noises continue to be observed, but waste remains the task
    // until it is cleaned or removed. Only a pee puddle preempts a poop ball.
    if(this.phase==='cleanup'||cleanupEnded)return {safe,visible,heard};
    if(visible||heard) {
      const location=visible?context.player:heard.position;
      this._lastKnown=copy(location);this.lastDetection=visible?'sight':heard.kind;
      if(this.phase!=='chase')this._beginChase();
      if(visible) {
        if(this._investigatingNoise)this._plannedGoal=null;
        this._investigatingNoise=false;this._investigationSource=this._investigationGoal=null;
        this._tableArrivalPending=false;
      } else {
        this._investigatingNoise=true;this._investigationSource=Object.freeze(copy(heard.position));
        this._investigationGoal=null;this._plannedGoal=null;this._lostSight=0;
        this._tableArrivalPending=false;
        this._surfaceIntercept=null;
      }
    }
    if(this.phase==='chase'&&visible)this._lostSight=0;
    if(this.phase==='chase'&&safe&&!visible&&!this._investigatingNoise)this._beginSearch();
    if(this._contactClear(context))this._catch();
    return {safe,visible,heard};
  }
  canAttemptCapture(player) {
    const table=this.navigation.reachInteraction?.(player)??this.navigation.tableInteraction?.(player);
    return (this.phase==='chase'||this.phase==='search')&&!this._detach&&!this._safe(player)&&
      withinInteractionReach(player,this.renderPosition,table,{reach:CAPTURE_RADIUS,height:CAPTURE_HEIGHT});
  }
  _contactClear(context) {
    if(!this.canAttemptCapture(context.player))return false;
    return typeof context.contactClear==='function'?!!context.contactClear(this):context.contactClear===true;
  }
  _beginChase() {
    this._takeControl();
    this.phase='chase';this._state=this._detach?'leaving':'walking';
    if(!this._detach){this._activity='idle';this._poseWeight=0;}
    this._dock=null;this._lostSight=0;this._nextPlanAt=this.elapsed;this._plannedGoal=null;
    this._tableArrivalPending=false;
    this._surfaceIntercept=null;
    this._path=[];this._pathIndex=0;this._cornerPause=0;this._handledCorners.clear();
    this._emit('chase-started',{reason:this.lastDetection});
  }
  _takeControl() {
    const wasRoutine=this.phase==='routine';
    if(wasRoutine) {
      this._position=copy(this.routine.position);this._renderPosition=copy(this.routine.renderPosition);
      this._yaw=this.routine.yaw;this._speed=Math.min(this.routine.speed,this._walkingSpeed);
      this._activity=this.routine.activity;this._poseWeight=this.routine.poseWeight;
      if(this._poseWeight>EPSILON&&this.routine.definition.seat) {
        this._detach={from:copy(this._renderPosition),weight:this._poseWeight,time:0,
          duration:Math.max(.1,MISTRESS_DOCK_SECONDS*this._poseWeight),yaw:this._yaw};
      }
    }
    if(!wasRoutine&&!this._detach&&this._poseWeight>EPSILON&&this._dock) {
      this._detach={from:copy(this._renderPosition),weight:this._poseWeight,time:0,
        duration:Math.max(.1,MISTRESS_DOCK_SECONDS*this._poseWeight),yaw:this._yaw};
    }
    this.routine.stopNoise?.();
  }
  _cleanupExists(target) {
    return !!target&&(target.kind==='pee'||target.kind==='poop')&&target.id!==undefined&&target.id!==null&&
      valid(target.position)&&typeof target.exists==='function'&&target.exists();
  }
  _beginCleanup(target) {
    if(this.phase==='cleanup')this._emit('cleanup-cancelled',{id:this.cleanupTargetId,cleanupKind:this.cleanupKind,reason:'preempted'});
    this._takeControl();this.phase='cleanup';this._cleanupTarget=target;this._cleanupRemaining=this._cleanupDuration;
    this._state=this._detach?'leaving':'walking';
    if(!this._detach){this._activity='cleaning';this._poseWeight=0;}
    this._dock=null;this._lostSight=0;this._plannedGoal=null;this._nextPlanAt=this.elapsed;
    this._path=[];this._pathIndex=0;
    this._investigatingNoise=false;this._investigationSource=this._investigationGoal=null;
    this._tableArrivalPending=false;
    this._emit('cleanup-started',{id:target.id,cleanupKind:target.kind});
  }
  _canClean(target) {
    if(!this._cleanupExists(target))return false;
    const table=this.navigation.reachInteraction?.(target.position)??this.navigation.tableInteraction?.(target.position);
    if(!withinInteractionReach(target.position,this._position,table,{reach:CLEANUP_REACH,height:CLEANUP_HEIGHT}))return false;
    return typeof target.canClean==='function'?!!target.canClean(this._position):
      (this.navigation.segmentClear?.(this._position,target.position)??true);
  }
  _finishCleanup(removed,context) {
    const target=this._cleanupTarget;
    if(removed&&target?.kind==='pee') {this._rageBonus+=PEE_RAGE_BONUS;this._refreshSpeeds();}
    this._emit(removed?'cleanup-finished':'cleanup-cancelled',{id:target?.id,cleanupKind:target?.kind});
    this._cleanupTarget=null;this._cleanupRemaining=0;this._activity='idle';this._poseWeight=0;this._speed=0;
    const chewing=this._rememberedChew;this._rememberedChew=null;
    if(chewing) {
      this._lastKnown=copy(chewing);this.lastDetection='eat';this._beginChase();
      this._investigatingNoise=true;this._investigationSource=chewing;this._investigationGoal=null;
    } else if(this._currentlySeen&&valid(context.player)) {
      this._lastKnown=copy(context.player);this.lastDetection='sight';this._beginChase();
      this._investigatingNoise=false;this._investigationSource=this._investigationGoal=null;
    } else {
      this._lastKnown=copy(this._position);this._beginSearch();
    }
  }
  _cleanup(dt,context) {
    const target=this._cleanupTarget;
    if(!this._cleanupExists(target)){this._finishCleanup(false,context);return;}
    const hasGoal='goal' in target,suppliedGoal=target.goal;
    if(hasGoal&&!valid(suppliedGoal)){this._finishCleanup(false,context);return;}
    if(this._detach){this._undock(dt);return;}
    if(this._canClean(target)) {
      this._state='acting';this._activity='cleaning';this._poseWeight=1;this._speed=0;
      this._cleanupRemaining=Math.max(0,this._cleanupRemaining-dt);
      if(this._cleanupRemaining<=EPSILON) {
        // The live object may have been eaten, replaced or pushed while she
        // worked. Only its owner can remove it and confirm a successful clean.
        const removed=this._canClean(target)&&typeof target.remove==='function'&&target.remove()===true;
        this._finishCleanup(removed,context);
      }
      return;
    }
    this._cleanupRemaining=this._cleanupDuration;this._state='walking';this._activity='cleaning';this._poseWeight=0;
    if(this.elapsed>=this._nextPlanAt) {
      const goal=hasGoal?suppliedGoal:
        this.navigation.nearestReachable?.(target.position,this._position,{maxDistance:3});
      if(!goal||(!this._plannedGoal||distance(goal,this._plannedGoal)>.2||this._pathIndex>=this._path.length)&&!this._plan(goal)) {
        this._finishCleanup(false,context);return;
      }
      this._nextPlanAt=this.elapsed+CHASE_REPLAN_SECONDS;
    }
    this._walk(dt,this.chaseSpeed,{corners:true,movementScale:context.movementScale});this._activity='cleaning';
    if(this._canClean(target)){this._state='acting';this._poseWeight=1;this._speed=0;}
    else if(this._pathIndex>=this._path.length)this._finishCleanup(false,context);
  }
  _beginSearch() {
    if(this.phase==='search')return;
    this.phase='search';this._lostSight=0;this._searchDeadline=this.elapsed+10+10*this._random();
    this._surfaceIntercept=null;
    this._investigatingNoise=false;this._investigationSource=this._investigationGoal=null;
    this._sprintMutedUntil=this.elapsed+SPRINT_REACQUIRE_SECONDS;
    this._speed=Math.min(this._speed,this._walkingSpeed);this._cornerPause=0;
    this._path=[];this._pathIndex=0;this._plannedGoal=null;this._lookUntil=0;
    if(!this._detach){this._state='walking';this._activity='idle';this._poseWeight=0;}
    this._emit('search-started');
  }
  _catch() {
    this.phase='caught';this._captureRemaining=CAPTURE_SECONDS;this._speed=0;
    this._investigatingNoise=false;this._investigationSource=this._investigationGoal=null;
    this._rememberedChew=null;
    this._state='idle';this._activity='idle';this._poseWeight=0;
    this._path=[];this._pathIndex=0;this._cornerPause=0;
    this._emit('caught');
  }
  _beginScold() {
    const radius=DEN.radius+(this.navigation.radius??.5)+.18;
    const candidates=[Math.PI,Math.PI/2,-Math.PI/2,0,Math.PI-.35,Math.PI+.35].map(angle=>
      ({x:DEN.x+Math.sin(angle)*radius,y:0,z:DEN.z+Math.cos(angle)*radius}));
    const canStand=point=>valid(point)&&(this.navigation.canStand?.(point)??true);
    const nearby=this.navigation.nearestReachable?.(candidates[0],undefined,{maxDistance:3});
    const stance=candidates.find(canStand)??(canStand(nearby)?nearby:null)??(canStand(couch.approach)?couch.approach:this._position);
    this._position=copy(stance);this._renderPosition=copy(stance);this._yaw=Math.atan2(DEN.x-stance.x,DEN.z-stance.z);
    this.phase='scolding';this._scoldRemaining=SCOLD_SECONDS;this._returnReason='capture';
    this._state='acting';this._activity='angry';this._poseWeight=1;this._speed=0;
    this._path=[];this._pathIndex=0;this._plannedGoal=null;this._detach=this._dock=null;this._cornerPause=0;
    this._handledCorners.clear();this._emit('scold-started');
  }
  _resumeFromScold() {
    const resumed=this.routine.resumeFrom(this._position,{yaw:this._yaw,elapsed:this.elapsed});
    if(!resumed){this._scoldRemaining=.25;return;}
    this.phase='routine';this._returnReason='';this._lostSight=0;this._scoldRemaining=0;
    this._emit('routine-resumed');
  }
  _beginReturn(reason) {
    this.phase='returning';this._returnReason=reason;this._speed=0;
    this._path=[];this._pathIndex=0;this._plannedGoal=null;this._nextPlanAt=this.elapsed;
    this._state='walking';this._activity='idle';this._poseWeight=0;this._dock=null;
    this._cornerPause=0;this._handledCorners.clear();
  }
  _restoreRoutine() {
    const sequence=this.noise.sequence;
    this.routine.reset();this.routine.elapsed=this.elapsed;this.routine.noise.elapsed=this.elapsed;
    this.routine.noise.sequence=sequence;
    this.phase='routine';this._returnReason='';this._path=[];this._dock=null;this._detach=null;
    this._speed=0;this._lostSight=0;this._emit('routine-resumed');
  }
  _plan(goal) {
    const path=this.navigation.findPath(this._position,goal);
    this._nextPlanAt=this.elapsed+CHASE_REPLAN_SECONDS;
    if(!path.length){this.blocked=true;return false;}
    this.blocked=false;this._path=path.map(copy);this._pathIndex=0;this._plannedGoal=copy(goal);
    while(this._pathIndex<this._path.length&&distance(this._position,this._path[this._pathIndex])<EPSILON)this._pathIndex++;
    return true;
  }
  _sharpCorner(index) {
    if(index>=this._path.length-1)return false;
    const corner=this._path[index],next=this._path[index+1];
    if(this._handledCorners.has(key(corner)))return false;
    const ax=corner.x-this._position.x,az=corner.z-this._position.z,bx=next.x-corner.x,bz=next.z-corner.z;
    const length=Math.hypot(ax,az)*Math.hypot(bx,bz);
    return length>EPSILON&&Math.acos(clamp((ax*bx+az*bz)/length,-1,1))>=CORNER_ANGLE;
  }
  _walk(dt,maximum,{corners=false,movementScale=1}={}) {
    // A short pause survives route refreshes at this corner, but a later lap
    // around the furniture must brake again when she returns to it.
    for(const [id,position] of this._handledCorners)if(distance(this._position,position)>2)this._handledCorners.delete(id);
    if(this._cornerPause>EPSILON) {
      this._speed=0;this._cornerPause=Math.max(0,this._cornerPause-dt);
      this._yaw+=angleDifference(this._turnYaw,this._yaw)*Math.min(1,dt*12);return;
    }
    if(this._pathIndex>=this._path.length){this._speed=0;this._state='idle';return;}
    this._state='walking';this._activity='idle';this._poseWeight=0;
    const travelDt=dt*movementScale;
    if(travelDt<=EPSILON)return;
    const next=this._path[this._pathIndex],sharp=corners&&this._sharpCorner(this._pathIndex);
    const length=distance(this._position,next),brakeDistance=Math.max(1.4,maximum*maximum/24+.3);
    const desired=sharp&&length<brakeDistance?Math.min(maximum,Math.sqrt(24*Math.max(0,length-.025))):maximum;
    const before=this._speed;
    this._speed+=clamp(desired-this._speed,-12*travelDt,10*travelDt);
    let movement=(before+this._speed)*.5*travelDt;
    // Rounding can leave a stopped walker a few millimetres before a corner.
    if(sharp&&length<.04)movement=Math.max(movement,length);
    for(let walked=0;movement>EPSILON&&this._pathIndex<this._path.length&&walked<128;walked++) {
      const target=this._path[this._pathIndex],remaining=distance(this._position,target);
      if(remaining<EPSILON){this._pathIndex++;continue;}
      const corner=corners&&this._sharpCorner(this._pathIndex),take=Math.min(movement,remaining),ratio=take/remaining;
      this._yaw=Math.atan2(target.x-this._position.x,target.z-this._position.z);
      this._position.x+=(target.x-this._position.x)*ratio;this._position.y+=(target.y-this._position.y)*ratio;
      this._position.z+=(target.z-this._position.z)*ratio;movement-=take;
      Object.assign(this._renderPosition,this._position);
      if(take>=remaining-EPSILON) {
        Object.assign(this._position,target);Object.assign(this._renderPosition,target);this._pathIndex++;
        if(corner) {
          this._handledCorners.set(key(target),copy(target));if(this._handledCorners.size>64)this._handledCorners.delete(this._handledCorners.keys().next().value);
          const outgoing=this._path[this._pathIndex];this._turnYaw=Math.atan2(outgoing.x-target.x,outgoing.z-target.z);
          this._cornerPause=CORNER_PAUSE_SECONDS;this._speed=0;break;
        }
      }
    }
    if(this._pathIndex>=this._path.length){this._speed=0;this._state='idle';}
  }
  _undock(dt) {
    const transition=this._detach;transition.time=Math.min(transition.duration,transition.time+dt);
    const t=smooth(transition.time/transition.duration);this._poseWeight=transition.weight*(1-t);
    for(const axis of ['x','y','z'])this._renderPosition[axis]=transition.from[axis]+(this._position[axis]-transition.from[axis])*t;
    this._yaw=transition.yaw;this._speed=0;this._state='leaving';
    if(transition.time>=transition.duration-EPSILON){this._detach=null;this._poseWeight=0;this._activity='idle';this._state='walking';}
  }
  _search(dt,movementScale) {
    if(this.elapsed>=this._searchDeadline-EPSILON){this._beginReturn('search');return;}
    if(this._pathIndex>=this._path.length) {
      if(this._lookUntil>this.elapsed){this._speed=0;this._state='idle';this._yaw+=dt*.85;return;}
      const center=this.navigation.nearestReachable?.(this._lastKnown??this._position,this._position,{maxDistance:3})??this._position;
      const goal=this.navigation.randomNearby?.(center,6,this.random);
      if(goal&&distance(goal,this._position)>.35&&this._plan(goal))this._lookUntil=0;
      else {this._lookUntil=this.elapsed+.8+this._random();this._state='idle';this._speed=0;return;}
    }
    this._walk(dt,this._walkingSpeed,{movementScale});
    if(this._pathIndex>=this._path.length)this._lookUntil=this.elapsed+.8+this._random();
  }
  _return(dt,movementScale) {
    if(this._detach){this._undock(dt);return;}
    if(this._dock) {
      this._dock.time=Math.min(MISTRESS_DOCK_SECONDS,this._dock.time+dt);
      const weight=smooth(this._dock.time/MISTRESS_DOCK_SECONDS);
      this._state='entering';this._activity='phone';this._poseWeight=weight;this._yaw=couch.yaw;
      for(const axis of ['x','y','z'])this._renderPosition[axis]=couch.approach[axis]+(couch.seat[axis]-couch.approach[axis])*weight;
      if(this._dock.time>=MISTRESS_DOCK_SECONDS-EPSILON)this._restoreRoutine();
      return;
    }
    if(distance(this._position,couch.approach)<.02) {this._dock={time:0};this._speed=0;return;}
    if(this.elapsed>=this._nextPlanAt&&(!this._plannedGoal||this._pathIndex>=this._path.length))this._plan(couch.approach);
    this._walk(dt,this._walkingSpeed,{movementScale});
  }
  _advance(dt,context) {
    const observation=this._observe(context);
    if(this.phase==='routine') {
      const emitted=this.routine.update(dt,{movementScale:context.movementScale,walkingSpeed:this._walkingSpeed});this.elapsed=this.routine.elapsed;return emitted;
    }
    this.elapsed+=dt;this.routine.elapsed=this.elapsed;this.noise.advance(this.elapsed);
    if(this.phase==='caught') {
      this._captureRemaining=Math.max(0,this._captureRemaining-dt);
      if(this._captureRemaining<=EPSILON){this._emit('return-den');this._beginScold();}
      return [];
    }
    if(this.phase==='scolding') {
      this._scoldRemaining=Math.max(0,this._scoldRemaining-dt);
      if(this._scoldRemaining<=EPSILON)this._resumeFromScold();
      return [];
    }
    if(this.phase==='cleanup'){this._cleanup(dt,context);return [];}
    if(this.phase==='returning'){this._return(dt,context.movementScale);return [];}
    if(this.phase==='chase') {
      this._lostSight=observation.visible||this._investigatingNoise?0:this._lostSight+dt;
      if(!this._investigatingNoise&&this._lostSight>LOST_SIGHT_SECONDS+EPSILON){this._beginSearch();}
      if(this.phase==='chase') {
        if(this._detach){this._undock(dt);return [];}
        if(this.elapsed>=this._nextPlanAt&&this._lastKnown) {
          const target=(this._investigatingNoise?this._investigationGoal??this._target(this._investigationSource):this._surfaceGoal(this._lastKnown))??(observation.visible?
            this.navigation.nearestReachable?.(this._lastKnown,this._position,{maxDistance:4}):null);
          if(!target) {
            if(!observation.visible)this._beginSearch();
            else {this._speed=0;this._state='idle';this._nextPlanAt=this.elapsed+CHASE_REPLAN_SECONDS;}
            return [];
          }
          if(this._investigatingNoise&&!this._investigationGoal)this._investigationGoal=Object.freeze(copy(target));
          if(!this._plannedGoal||distance(target,this._plannedGoal)>.45||this._pathIndex>=this._path.length)this._plan(target);
          else this._nextPlanAt=this.elapsed+CHASE_REPLAN_SECONDS;
        }
        this._walk(dt,this.chaseSpeed,{corners:true,movementScale:context.movementScale});
        if(this._pathIndex>=this._path.length&&this._lastKnown) {
          const look=Math.atan2(this._lastKnown.x-this._position.x,this._lastKnown.z-this._position.z);
          this._yaw+=angleDifference(look,this._yaw)*Math.min(1,dt*10);
        }
        if(this._contactClear(context))this._catch();
        if(this.phase==='chase'&&this._investigatingNoise&&this._investigationGoal&&
          this._pathIndex>=this._path.length&&distance(this._position,this._investigationGoal)<.05) {
          // The host checks physical hand contact after movement. Give that
          // fresh zero-time observation a chance before leaving a table's
          // perimeter, where ordinary eye rays may be blocked by the slab.
          if((this.navigation.reachInteraction?.(context.player)??this.navigation.tableInteraction?.(context.player))&&
            this.canAttemptCapture(context.player)&&!this._tableArrivalPending) {
            this._tableArrivalPending=true;return [];
          }
          if(this._rememberedChew&&distance(this._rememberedChew,this._investigationSource)<.05)this._rememberedChew=null;
          this._beginSearch();
        }
        return [];
      }
    }
    if(this.phase==='search') {
      if(this._detach)this._undock(dt);else this._search(dt,context.movementScale);
      if(this._contactClear(context))this._catch();
    }
    return [];
  }
  _refreshSpeeds() {
    this.chaseSpeed=this._sprintSpeed*this.chaseMultiplier+this.rageSpeedBonus;
    this._walkingSpeed=MISTRESS_WALK_SPEED+this.rageSpeedBonus;
  }
  update(dt,context={}) {
    if(context.active===false||!Number.isFinite(dt)||dt<0||!Number.isFinite(this.elapsed+dt))return [];
    const suppliedScale=context.movementScale??1;
    context={...context,movementScale:Number.isFinite(suppliedScale)?clamp(suppliedScale,0,1):0};
    this._sprintSpeed=Number.isFinite(context.sprintSpeed)?Math.max(0,context.sprintSpeed):8.2;
    this._topSprintSpeed=Number.isFinite(context.topSprintSpeed)?Math.max(0,context.topSprintSpeed):8.8;
    const dayEnd=Number.isFinite(context.dayElapsed)?context.dayElapsed:this.elapsed+dt;
    this.chaseMultiplier=chaseSpeedMultiplier(dayEnd);this._refreshSpeeds();
    if(dt===0){this._observe(context);return [];}
    const emitted=[];let left=Math.min(600,dt);
    for(let steps=0;left>EPSILON&&steps<12001;steps++) {
      const take=Math.min(.05,left);left-=take;
      this.chaseMultiplier=chaseSpeedMultiplier(Math.max(0,dayEnd-left));this._refreshSpeeds();
      emitted.push(...this._advance(take,context));
    }
    return emitted.filter(event=>event.expiresAt>this.elapsed+EPSILON);
  }
}
