export const MAX_ENERGY = 100;
export const PASSIVE_REGEN = .01;
// Include the simultaneous passive recovery so a full bar lasts 30 seconds.
export const SPRINT_DRAIN = MAX_ENERGY / 30 + PASSIVE_REGEN;
export const HIGH_JUMP_THRESHOLD = .22;
export const FULL_JUMP_CHARGE = .65;

export function highJumpCost(charge) {
  const power = Math.max(0, Math.min(1, (charge - HIGH_JUMP_THRESHOLD) / (FULL_JUMP_CHARGE - HIGH_JUMP_THRESHOLD)));
  return 5 + power * 5;
}

export class Energy {
  constructor(value = MAX_ENERGY) {
    this.value = Math.max(0, Math.min(MAX_ENERGY, value));
    this.recoveries = [];
  }
  spend(amount) {
    if (this.value + 1e-9 < amount) return false;
    this.value = Math.max(0, this.value - amount);
    return true;
  }
  consume(amount) { this.recoveries.push({ rate: amount, remaining: 1 }); }
  refill() { this.value = MAX_ENERGY; this.recoveries = []; }
  get recovering() { return this.recoveries.length > 0; }
  update(dt, sprinting = false) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    let gain = PASSIVE_REGEN * dt;
    for (const recovery of this.recoveries) {
      const elapsed = Math.min(dt, recovery.remaining);
      gain += recovery.rate * elapsed;
      recovery.remaining -= elapsed;
    }
    this.recoveries = this.recoveries.filter(r => r.remaining > 1e-9);
    this.value = Math.max(0, Math.min(MAX_ENERGY, this.value + gain - (sprinting ? SPRINT_DRAIN * dt : 0)));
    if (this.value < 1e-9) this.value = 0;
  }
}
