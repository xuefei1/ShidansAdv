import {canReachConsumable} from './consumable-system.js';

export const AFFECTION_SECONDS=5;
export const AFFECTION_HAPPINESS=500;

// A held interaction is interruptible. No partial reward survives releasing,
// walking away, jumping, capture, peeing, menus or a new adventure.
export class MazeAffection {
  constructor(world,item) {this.world=world;this.item=item;this.reset();}
  reset() {this.completed=false;this.cancel();}
  cancel() {this.active=false;this.progress=0;this.delay=0;}
  canReach(player) {return canReachConsumable(player,this.item,this.world);}
  begin(player,delay=0) {
    this.cancel();
    if(this.completed||!this.canReach(player))return false;
    this.active=true;this.delay=Number.isFinite(delay)?Math.max(0,delay):0;return true;
  }
  update(dt,player,{blocked=false}={}) {
    if(!this.active||!Number.isFinite(dt)||dt<0)return 0;
    if(blocked||!this.canReach(player)){this.cancel();return 0;}
    const used=Math.min(dt,this.delay);this.delay-=used;
    this.progress=Math.min(AFFECTION_SECONDS,this.progress+dt-used);
    if(this.progress+1e-9<AFFECTION_SECONDS)return 0;
    this.completed=true;this.active=false;
    return AFFECTION_HAPPINESS;
  }
  get fraction(){return this.progress/AFFECTION_SECONDS;}
}
