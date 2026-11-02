import { CONSUMABLE_TYPES } from './consumable-data.js';

export const ROUND_CONSUMABLE_TYPES=Object.freeze(['den-hay',...Object.keys(CONSUMABLE_TYPES),'poop']);
const validObject=value=>value!==null&&typeof value==='object';
const validAmount=value=>Number.isFinite(value)&&value>0&&value<=Number.MAX_SAFE_INTEGER;
const precise=value=>Math.round(value*1e9)/1e9;

// Round-local facts, independent of remaining supplies or scenery. The caller
// reports successful actions and actual resource transfers, never key presses
// or advertised rewards. Water/urine use bladder percentage points, not litres.
export class RoundStats {
  constructor() {this.reset();}
  reset() {
    this._consumed=Object.fromEntries(ROUND_CONSUMABLE_TYPES.map(type=>[type,0]));
    this._counts={consumedTotal:0,poopDropped:0,puddlesCreated:0,hops:0,longJumps:0,captures:0};
    this._cleaned={poop:0,pee:0};
    this._measures=Object.fromEntries(['waterDrunk','urineProduced','sprintSeconds','distanceTravelled'].map(key=>[key,{sum:0,carry:0}]));
    this._consumptionEvents=new WeakSet();this._droppedBalls=new WeakSet();this._peeEvents=new WeakSet();
    return this;
  }
  _add(key,amount) {
    if(!validAmount(amount))return false;
    const measure=this._measures[key],adjusted=amount-measure.carry,next=measure.sum+adjusted;
    if(!Number.isFinite(next)||next>Number.MAX_SAFE_INTEGER)return false;
    // Compensated summation preserves fractional frame transfers; snapshots
    // round at the same nanopercentage precision as the water simulation.
    measure.carry=(next-measure.sum)-adjusted;measure.sum=next;return true;
  }
  _increment(key) {
    if(!Number.isSafeInteger(this._counts[key]+1))return false;
    this._counts[key]++;return true;
  }
  consume(event) {
    if(!validObject(event)||event.kind!=='consume'||!validObject(event.item)||this._consumptionEvents.has(event))return false;
    const item=event.item,type=item.id==='den-hay'&&item.type==='hay'&&item.permanent===true?'den-hay':item.type;
    if(typeof type!=='string'||!Object.hasOwn(this._consumed,type)||!Number.isSafeInteger(this._consumed[type]+1)||!this._increment('consumedTotal'))return false;
    this._consumptionEvents.add(event);this._consumed[type]++;return true;
  }
  dropPoop(ball) {
    if(!validObject(ball)||!Number.isSafeInteger(ball.id)||ball.id<0||this._droppedBalls.has(ball)||!this._increment('poopDropped'))return false;
    this._droppedBalls.add(ball);return true;
  }
  drink(amount) {return this._add('waterDrunk',amount);}
  peeStarted(event) {
    if(!validObject(event)||event.kind!=='pee'||!validAmount(event.amount)||this._peeEvents.has(event)||!this._increment('puddlesCreated'))return false;
    this._peeEvents.add(event);return true;
  }
  urinate(amount) {return this._add('urineProduced',amount);}
  caught() {return this._increment('captures');}
  cleanup(kind) {
    if((kind!=='poop'&&kind!=='pee')||!Number.isSafeInteger(this._cleaned[kind]+1))return false;
    this._cleaned[kind]++;return true;
  }
  jump(kind) {return kind==='hop'?this._increment('hops'):kind==='long'?this._increment('longJumps'):false;}
  travel(dt,options={}) {
    if(!validObject(options))return false;
    const {sprinting=false,speed=0}=options;
    if(typeof sprinting!=='boolean')return false;
    if(!validAmount(dt)||!Number.isFinite(speed)||speed<0||!Number.isFinite(dt*speed))return false;
    if(speed===0)return false;
    const distance=dt*speed;
    if(distance>Number.MAX_SAFE_INTEGER-this._measures.distanceTravelled.sum||
      (sprinting&&dt>Number.MAX_SAFE_INTEGER-this._measures.sprintSeconds.sum))return false;
    this._add('distanceTravelled',distance);if(sprinting)this._add('sprintSeconds',dt);return true;
  }
  snapshot() {
    return Object.freeze({...this._counts,
      consumed:Object.freeze({...this._consumed}),
      ...Object.fromEntries(Object.entries(this._measures).map(([key,value])=>[key,precise(value.sum)])),
      wasteCleaned:Object.freeze({...this._cleaned}),
    });
  }
}
