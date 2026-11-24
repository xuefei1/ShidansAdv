const FREE_LOOK_MS = 3000;
const FOLLOW_PITCH = .43;

export class TouchCamera {
  constructor() { this.reset(); }
  reset() {
    this.movementYaw = null;
    this.rear = false;
    this.resumeAt = 0;
  }
  setMovement(right, forward, yaw) {
    if (Math.hypot(right, forward) <= .05) this.movementYaw = null;
    else if (this.movementYaw === null) {
      this.movementYaw = yaw;
      this.resumeAt = 0;
    }
  }
  noteSwipe(now) {
    this.resumeAt = now + FREE_LOOK_MS;
  }
  setRear(held) {
    this.rear = held;
    if (held) this.resumeAt = 0;
  }
  update(yaw, pitch, facing, now, dt) {
    if (now < this.resumeAt) return {yaw, pitch};
    const delta = facing + Math.PI - yaw;
    const blend = -Math.expm1(-6 * dt);
    return {
      yaw: yaw + Math.atan2(Math.sin(delta), Math.cos(delta)) * blend,
      pitch: pitch + (FOLLOW_PITCH - pitch) * blend
    };
  }
}
