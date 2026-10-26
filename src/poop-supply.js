import { DEN } from './layout.js';
import { consumableDetails } from './consumable-data.js';

export const INITIAL_POOP = 10;
export const MAX_CARRIED_POOP = 50;
export const POOP_COOLDOWN = 1;

const withinDen = player => player && Math.hypot(player.x - DEN.x, player.z - DEN.z) < DEN.radius;
const insideDen = player => withinDen(player) && player.y < DEN.fenceHeight;

// Carried ammunition and den rewards are independent from balls on the map.
export class PoopSupply {
  constructor() { this.reset(); }
  reset() {
    this.value = INITIAL_POOP; this.nextPoopAt = 0;
    this.insideDen = true; this.denHayRewardAvailable = true;
  }
  grant(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const before = this.value;
    this.value = Math.min(MAX_CARRIED_POOP, this.value + Math.floor(amount));
    return this.value - before;
  }
  trySpend(nowSeconds) {
    if (!Number.isFinite(nowSeconds) || nowSeconds < 0 || !this.value || nowSeconds + 1e-9 < this.nextPoopAt) return false;
    this.value--; this.nextPoopAt = nowSeconds + POOP_COOLDOWN;
    return true;
  }
  observePosition(player) {
    // Jumping straight upward inside the fence is still the same visit. After
    // crossing outside, land back in the den before renewing the reward.
    if (!withinDen(player)) this.insideDen = false;
    else if (!this.insideDen && insideDen(player)) {
      this.insideDen = true; this.denHayRewardAvailable = true;
    }
  }
  grantFromConsumption(event, player) {
    if (event?.kind !== 'consume' || !event.item || event.item.type === 'poop') return 0;
    if (event.item.id === 'den-hay' && event.item.permanent) {
      this.observePosition(player);
      if (!insideDen(player) || !this.denHayRewardAvailable) return 0;
      // A visit's reward is used even at capacity; eating again cannot bank it.
      this.denHayRewardAvailable = false;
    }
    return this.grant(event.poop ?? consumableDetails(event.item)?.poop ?? 0);
  }
}
