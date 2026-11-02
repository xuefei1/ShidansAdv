// Small original, synthesized effects. Nothing is fetched and no music is autoplayed.
export class Sound {
  constructor() { this.enabled = false; this.context = null; this.householdCue=null; }
  toggle() {
    this.enabled = !this.enabled;
    this.householdCue=null;
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
  householdEpisode(event,elapsed,listener) {
    if(!this.enabled||!this.context||!event||event.source!=='mistress'||!Number.isFinite(elapsed)||
      !Number.isFinite(event.expiresAt)||event.expiresAt<=elapsed)return;
    // Repeat gentle cues throughout a live episode. Skip missed beats rather
    // than queuing an audio burst after a delayed frame or background tab.
    if(this.householdCue?.event===event&&elapsed-this.householdCue.time<.7)return;
    const volume=Math.max(.15,1-Math.hypot(listener.x-event.position.x,listener.y-event.position.y,listener.z-event.position.z)/35);
    this.householdCue={event,time:elapsed};
    this.household(event.kind,volume,event.expiresAt-elapsed);
  }
  household(kind, volume=1, remaining=Infinity) {
    // Gentle, original cues; gameplay hearing does not depend on this toggle.
    const cue=(frequency,duration,gain,slide,delay=0)=>{
      const length=Math.min(duration,remaining-delay);
      if(length>.015)this.tone(frequency,length,gain,slide,delay);
    };
    if(kind==='laugh') {
      for(let i=0;i<3;i++) cue(390-i*32,.14,.018*volume,.74,i*.19);
    } else if(kind==='cook') {
      cue(920,.07,.013*volume,.48);
      cue(610,.10,.010*volume,.66,.12);
    } else if(kind==='footstep') {
      cue(105,.075,.014*volume,.55);
    } else if(kind==='alert') {
      cue(440,.16,.022*volume,1.25);
      cue(550,.22,.018*volume,.85,.17);
    } else {
      // A soft household rustle/hum for additional chores and outdoor tasks.
      cue(220,.35,.012*volume,.92);
      cue(330,.16,.009*volume,.7,.18);
    }
  }
  chime() { [523.25, 659.25, 783.99].forEach((hz, i) => this.tone(hz, .35, .025, 1, i * .1)); }
}
