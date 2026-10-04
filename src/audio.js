// Small original, synthesized effects. Nothing is fetched and no music is autoplayed.
export class Sound {
  constructor() { this.enabled = false; this.context = null; }
  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.context ||= new (window.AudioContext || window.webkitAudioContext)();
    if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
    if (this.enabled) this.chime();
    return this.enabled;
  }
  tone(frequency, duration, gain = .035, slide = .5, delay = 0) {
    if (!this.enabled || !this.context) return;
    const context = this.context, t = context.currentTime + delay;
    const osc = context.createOscillator(), envelope = context.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, t); osc.frequency.exponentialRampToValueAtTime(frequency * slide, t + duration);
    envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(gain, t + .008); envelope.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(envelope); envelope.connect(context.destination); osc.start(t); osc.stop(t + duration + .01);
  }
  hop(long) { this.tone(long ? 270 : 340, .16, .035, 1.7); }
  land() { this.tone(135, .1, .022, .45); }
  step(wood) { this.tone(wood ? 190 : 115, .045, .009, .45); }
  chime() { [523.25, 659.25, 783.99].forEach((hz, i) => this.tone(hz, .35, .025, 1, i * .1)); }
}
