export const BASEMENT_UNLOCK_HAPPINESS = 200;

// A round milestone remains unlocked even after its final score is archived.
// Only a fresh adventure resets it; pausing or returning home does not.
export class BasementAccess {
  constructor(gate) { this.gate=gate; this.reset(); }
  get unlocked() { return !this.gate.locked; }
  update(happiness) {
    if(this.unlocked || !Number.isSafeInteger(happiness) || happiness<BASEMENT_UNLOCK_HAPPINESS)return false;
    this.gate.setLocked(false);
    return true;
  }
  reset() { this.gate.setLocked(true); }
}
