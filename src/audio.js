// Small original, synthesized effects. Nothing is fetched. The enabled
// preference is separate from the browser's user-gesture audio unlock.
export const MISTRESS_STEP_AUDIO_RANGE=Object.freeze({routine:18,search:18,run:22});
export const MAX_FOOTSTEP_AUDIO_AGE=.25;
export const EFFECTS_GAIN=2.5;
export const MISTRESS_FOOTSTEP_GAIN=3;
export const MASTER_GAIN=3;
export const MAX_VOLUME=3;
const limiterCurve=Float32Array.from({length:4097},(_,i)=>.96*Math.tanh((i/2048-1)*1.2)/Math.tanh(1.2));
const validPoint=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export class Sound {
  constructor({createContext=null}={}) {
    this.enabled=true;this.context=null;this.householdCue=null;
    this._createContext=createContext??(()=>{
      const host=globalThis.window??globalThis,AudioContext=host.AudioContext??host.webkitAudioContext;
      return AudioContext?new AudioContext():null;
    });
    this._unlocking=null;this._unlockFailures=0;this._voices=new Set();
    this._stepEvents=new WeakSet();this._stepClock=-Infinity;this._lastStepTime=-Infinity;this._lastStepAt=-Infinity;
    this._footstepsPlayed=0;this._lastFootstep=null;this._rabbitFootstepsPlayed=0;
    this._volume=1;this._busContext=null;this._input=null;this._master=null;
  }
  get volume(){return this._volume;}
  setVolume(value) {
    if(!Number.isFinite(value))return this._volume;
    this._volume=clamp(value,0,MAX_VOLUME);
    if(this._master)this._master.gain.setValueAtTime(this._volume*MASTER_GAIN,this.context.currentTime);
    return this._volume;
  }
  _ensureOutput() {
    const context=this.context;
    if(this._busContext===context)return this._input;
    const master=context.createGain(),compressor=context.createDynamicsCompressor(),limiter=context.createWaveShaper();
    master.gain.setValueAtTime(this._volume*MASTER_GAIN,context.currentTime);
    for(const [name,value]of Object.entries({threshold:-12,knee:10,ratio:4,attack:.002,release:.12}))compressor[name].setValueAtTime(value,context.currentTime);
    // A final bounded transfer prevents concurrent effects or 300% volume from
    // clipping, while the compressor keeps individual impacts natural.
    limiter.curve=limiterCurve;limiter.oversample='none';
    master.connect(compressor);compressor.connect(limiter);limiter.connect(context.destination);
    this._busContext=context;this._input=master;this._master=master;
    return master;
  }
  get diagnostics() {
    return Object.freeze({enabled:this.enabled,volume:this._volume,contextState:this.context?.state??(this.context?'ready':'locked'),
      unlockFailures:this._unlockFailures,footstepsPlayed:this._footstepsPlayed,lastFootstep:this._lastFootstep,rabbitFootstepsPlayed:this._rabbitFootstepsPlayed});
  }
  unlock() {
    if(!this.enabled)return Promise.resolve(false);
    if(this._unlocking)return this._unlocking;
    try {
      if(!this.context||this.context.state==='closed')this.context=this._createContext();
      if(!this.context){this._unlockFailures++;return Promise.resolve(false);}
      const context=this.context;
      const resume=['suspended','interrupted'].includes(context.state)?context.resume():null;
      this._unlocking=Promise.resolve(resume).then(()=>this.enabled&&context===this.context&&
        !['suspended','interrupted','closed'].includes(context.state)).catch(()=>{
        this._unlockFailures++;return false;
      }).finally(()=>{this._unlocking=null;});
      return this._unlocking;
    } catch {
      this._unlockFailures++;return Promise.resolve(false);
    }
  }
  toggle() {
    this.enabled = !this.enabled;
    this.householdCue=null;
    if(this.enabled)this.unlock().then(ready=>{if(ready&&this.enabled)this.chime();});
    else {
      for(const voice of this._voices)try{voice.stop(this.context.currentTime);}catch{/* Already stopped. */}
      this._voices.clear();
    }
    return this.enabled;
  }
  tone(frequency, duration, gain = .035, slide = .5, delay = 0, {type='triangle'}={}) {
    if(!this.enabled||!this.context||['suspended','interrupted','closed'].includes(this.context.state)||
      ![frequency,duration,gain,slide,delay].every(Number.isFinite)||frequency<=0||duration<=0||gain<=0||slide<=0||delay<0)return;
    const context = this.context, t = context.currentTime + delay,volume=gain*EFFECTS_GAIN;
    const osc = context.createOscillator(), envelope = context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, t); osc.frequency.exponentialRampToValueAtTime(frequency * slide, t + duration);
    // The former exponential fall lost almost all useful energy immediately
    // after its peak. A short plateau and audible body make loudness match the
    // impact, with a zero tail to avoid clicks.
    const attack=Math.min(.003,duration*.12);
    envelope.gain.setValueAtTime(0, t);envelope.gain.linearRampToValueAtTime(volume,t+attack);
    envelope.gain.setValueAtTime(volume,t+duration*.25);
    envelope.gain.linearRampToValueAtTime(volume*.22,t+duration*.82);
    envelope.gain.linearRampToValueAtTime(0,t+duration);
    this._voices.add(osc);osc.onended=()=>{this._voices.delete(osc);osc.disconnect();envelope.disconnect();};
    osc.connect(envelope); envelope.connect(this._ensureOutput()); osc.start(t); osc.stop(t + duration + .01);
  }
  hop(long) { this.tone(long ? 270 : 340, .16, .035, 1.7); }
  land() { this.tone(135, .1, .022, .45); }
  step(wood,player) {
    const speed=Math.hypot(player?.vx??0,player?.vz??0);
    if(player?.sprinting!==true||player?.grounded!==true||!Number.isFinite(speed)||speed<=.6||
      !this.enabled||!this.context||['suspended','interrupted','closed'].includes(this.context.state))return false;
    this.tone(wood ? 190 : 115, .045, .009, .45);this._rabbitFootstepsPlayed++;return true;
  }
  mistressFootstep(event,listener,elapsed=event?.time) {
    if(!event||typeof event!=='object'||event.source!=='mistress'||event.kind!=='footstep'||
      !validPoint(event.position)||!validPoint(listener)||!Number.isFinite(elapsed)||!Number.isFinite(event.time)||
      !Number.isFinite(event.expiresAt)||!Number.isFinite(event.speed)||event.speed<=.05)return false;
    if(this._stepEvents.has(event))return false;
    this._stepEvents.add(event);
    // Reset only the chronological gate when a fresh round's active clock
    // restarts. Exact event identity still prevents replaying an old cue.
    if(elapsed<this._stepClock-1e-8){this._lastStepTime=-Infinity;this._lastStepAt=-Infinity;}
    this._stepClock=elapsed;
    const age=elapsed-event.time;
    if(age<-.001||age>MAX_FOOTSTEP_AUDIO_AGE+1e-8||event.expiresAt<=elapsed||event.time<=this._lastStepTime+1e-8)return false;
    this._lastStepTime=event.time;
    if(!this.enabled||!this.context||['suspended','interrupted','closed'].includes(this.context.state))return false;
    if(elapsed<=this._lastStepAt+1e-8)return false;
    const phase=event.phase??'routine',gait=event.gait==='run'||phase==='chase'?'run':
      event.gait==='search'||phase==='search'?'search':'routine';
    const range=MISTRESS_STEP_AUDIO_RANGE[gait],distance=Math.hypot(listener.x-event.position.x,listener.y-event.position.y,listener.z-event.position.z);
    const near=clamp(1-distance/range,0,1),attenuation=near*near*(3-2*near);
    const strength=Number.isFinite(event.strength)?clamp(event.strength,0,2):1;
    const impact=clamp(Math.sqrt(event.speed/3.5),.45,1.5)*strength*attenuation*MISTRESS_FOOTSTEP_GAIN;
    if(impact<=0)return false;
    const pitch=clamp(1+(event.speed-3.5)*.025,.9,1.2);
    // Keep a low heel thud, with a clearer upper tap that remains audible on
    // small speakers. Distance still controls both parts of the footfall.
    const profile=gait==='run'?{heel:150,toe:720,gain:.031,delay:.029,duration:.06}:
      gait==='search'?{heel:165,toe:620,gain:.011,delay:.075,duration:.065}:
      {heel:180,toe:840,gain:.019,delay:.05,duration:.065};
    this.tone(profile.heel*pitch,profile.duration,profile.gain*impact,.48);
    this.tone(profile.toe*pitch,.035,profile.gain*.45*impact,.65,profile.delay);
    this._lastStepAt=elapsed;this._footstepsPlayed++;this._lastFootstep=Object.freeze({phase,gait:gait==='routine'?'walk':gait,profile:gait,speed:event.speed,
      distance,range,gain:profile.gain*impact*EFFECTS_GAIN,time:event.time,foot:event.foot??null});
    return true;
  }
  previewFootsteps() {
    if(!this.enabled||!this.context||['suspended','interrupted','closed'].includes(this.context.state))return false;
    // A control-panel preview never creates gameplay events or changes their
    // sequence, clock, masking, or diagnostic footfall count.
    for(const [heel,toe,gain,delay]of [[180,840,.042,0],[165,620,.023,.4],[150,720,.085,.8]]) {
      this.tone(heel,.065,gain,.48,delay);this.tone(toe,.035,gain*.45,.65,delay+.05);
    }
    return true;
  }
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
