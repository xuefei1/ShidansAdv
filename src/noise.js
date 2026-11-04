import { HOUSE, FLOOR_HEIGHT, BASEMENT } from './layout.js';
import { consumableDetails } from './consumable-data.js';

export const LOCAL_NOISE_RADIUS = 5;
export const NOISE_LIFETIME = 1.2;
export const SPRINT_NOISE_INTERVAL = .55;
export const EATING_NOISE_INTERVAL = .75;
export const MAX_NOISE_EVENTS = 64;
const EPSILON = 1e-9;
const validPosition = point => point && ['x','y','z'].every(axis => Number.isFinite(point[axis]));

// Rewarding chewing reaches the whole level, including balconies and both
// stairways. Keep its original 'house' metadata for the existing ripple style;
// household ambience remains indoors and movement keeps its local 5 m sphere.
export function canHearNoise(event, listener) {
  if (!event || !validPosition(listener) || !validPosition(event.position)) return false;
  if (event.scope === 'house') {
    if(event.source==='shidan'&&event.kind==='eat')return true;
    return listener.x >= HOUSE.minX && listener.x <= HOUSE.maxX &&
      listener.z >= HOUSE.minZ && listener.z <= HOUSE.maxZ && listener.y >= BASEMENT.y && listener.y <= FLOOR_HEIGHT * 2;
  }
  if (event.scope !== 'local' || event.radius !== LOCAL_NOISE_RADIUS) return false;
  return Math.hypot(listener.x-event.position.x,listener.y-event.position.y,listener.z-event.position.z) <= event.radius;
}

// Gameplay hearing is deliberately independent of audio playback and graphics.
// Future agents can query audibleTo(position), even while game sound is muted.
export class NoiseSystem {
  constructor() { this.reset(); }
  reset() {
    this.elapsed = 0; this.sequence = 0; this._events = [];
    this.sprint = null; this.eating = null; this.longJumpHeld = false;
  }
  get events() { return this._events.slice(); }
  get activeKinds() { return [...new Set(this._events.map(event => event.kind))]; }
  canHear(event, listener) {
    return this._events.includes(event) && event.expiresAt > this.elapsed + EPSILON && canHearNoise(event,listener);
  }
  audibleTo(listener) {
    return this._events.filter(event => event.expiresAt > this.elapsed + EPSILON && canHearNoise(event,listener));
  }
  emit(kind, player, time, emitted) {
    if (!Number.isFinite(time) || time + NOISE_LIFETIME <= this.elapsed + EPSILON) return;
    const houseWide = kind === 'eat';
    const event = Object.freeze({
      id: ++this.sequence, source: 'shidan', kind, scope: houseWide ? 'house' : 'local',
      radius: houseWide ? null : LOCAL_NOISE_RADIUS,
      position: Object.freeze({x:player.x,y:player.y,z:player.z}),
      time, lifetime:NOISE_LIFETIME, expiresAt:time+NOISE_LIFETIME,
    });
    this._events.push(event); emitted.push(event);
    if (this._events.length > MAX_NOISE_EVENTS) this._events.shift();
  }
  pulse(field, key, interval, kind, player, frameStart, emitted) {
    if (key === null) { this[field] = null; return; }
    if (!this[field] || this[field].key !== key) this[field] = {key,start:frameStart,next:0};
    const state = this[field], last = Math.floor((this.elapsed-state.start+EPSILON)/interval);
    // Old pulses that expired during a delayed update are never queued as a
    // burst. Integer cadence indices keep regular-frame rates consistent.
    const earliestLive = Math.floor((this.elapsed-NOISE_LIFETIME-state.start+EPSILON)/interval)+1;
    const first = Math.max(state.next,earliestLive,last-MAX_NOISE_EVENTS+1);
    for (let index=first,count=0; index<=last && count<MAX_NOISE_EVENTS; index++,count++) {
      this.emit(kind,player,state.start+index*interval,emitted);
    }
    state.next = last+1;
  }
  update(dt, player, {consuming=null,longJump=false,active=true,locked=false}={}) {
    if (!active || !Number.isFinite(dt) || dt<0 || !Number.isFinite(this.elapsed+dt)) return [];
    const frameStart = this.elapsed; this.elapsed += dt;
    this._events = this._events.filter(event => event.expiresAt > this.elapsed + EPSILON);
    const emitted = [];
    if (locked || !validPosition(player)) {
      this.sprint = this.eating = null; this.longJumpHeld = false;
      return emitted;
    }
    if (longJump && !this.longJumpHeld) this.emit('long-jump',validPosition(player.lastJumpPosition)?player.lastJumpPosition:player,this.elapsed,emitted);
    this.longJumpHeld = !!longJump;
    this.pulse('sprint',player.sprinting ? 'sprint' : null,SPRINT_NOISE_INTERVAL,'sprint',player,frameStart,emitted);
    const rewarding = consuming && (consumableDetails(consuming)?.happiness || 0)>0;
    this.pulse('eating',rewarding ? consuming.id ?? consuming.type : null,EATING_NOISE_INTERVAL,'eat',player,frameStart,emitted);
    return emitted;
  }
}
