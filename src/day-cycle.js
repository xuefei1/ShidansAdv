export const DAY_SECONDS = 10 * 60;
export const NIGHT_START = DAY_SECONDS - 2 * 60;

// Uses monotonic real time, independently of the physics step cap. Transitions
// settle the preceding interval, so a menu never lends time to the next frame.
export class DayClock {
  constructor(now = 0) { this.reset(now); }
  reset(now = 0) { this.elapsed = 0; this.previous = now; this.active = false; }
  get remaining() { return Math.max(0, DAY_SECONDS - this.elapsed); }
  get finished() { return this.remaining === 0; }
  update(now) {
    if (!Number.isFinite(now) || now < this.previous) return;
    if (this.active) this.elapsed = Math.min(DAY_SECONDS, this.elapsed + (now - this.previous) / 1000);
    this.previous = now;
    if (this.finished) this.active = false;
  }
  setActive(active, now) { this.update(now); this.active = !!active && !this.finished; }
}

export function formatCountdown(seconds) {
  const whole = Math.ceil(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function dayState(elapsed) {
  const t = Math.max(0, Math.min(DAY_SECONDS, elapsed));
  return {
    phase: t >= NIGHT_START ? 'Night' : t >= 330 ? 'Dusk' : t >= 180 ? 'Afternoon' : 'Noon',
    dusk: smooth(0, 360, t),
    night: smooth(330, NIGHT_START, t),
    lamps: smooth(345, NIGHT_START, t),
    stars: smooth(405, NIGHT_START, t),
  };
}
