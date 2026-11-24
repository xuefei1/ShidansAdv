const FREE_LOOK_MS = 3000;
const STICK_RELEASE_GRACE_MS = 250;
const FOLLOW_PITCH = .43;

export class TouchCamera {
  constructor() { this.reset(); }
  reset() {
    this.stickHeld = false;
    this.rear = false;
    this.resumeAt = 0;
  }
  setStickHeld(held, now) {
    this.stickHeld = held;
    // Give the thumb time to reposition. A recent manual swipe keeps its longer delay.
    if (!held) this.resumeAt = Math.max(this.resumeAt, now + STICK_RELEASE_GRACE_MS);
  }
  noteSwipe(now) {
    this.resumeAt = now + FREE_LOOK_MS;
  }
  view(yaw, pitch, facing) {
    // The orbit angle locates the camera. Placing it in front shows her face and what's behind her.
    return this.rear ? {yaw: facing, pitch: FOLLOW_PITCH} : {yaw, pitch};
  }
  update(yaw, pitch, facing, now, dt) {
    if (this.stickHeld || this.rear || now < this.resumeAt) return {yaw, pitch};
    const delta = facing + Math.PI - yaw;
    const blend = -Math.expm1(-6 * dt);
    return {
      yaw: yaw + Math.atan2(Math.sin(delta), Math.cos(delta)) * blend,
      pitch: pitch + (FOLLOW_PITCH - pitch) * blend
    };
  }
}
