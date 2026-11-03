import {Sound} from '../src/audio.js';

const sampleRate=48000,origin=.04,listener={x:5,y:0,z:0};
const cue=(phase='routine',speed=3.5)=>({source:'mistress',kind:'footstep',time:0,expiresAt:1.2,
  position:{x:0,y:0,z:0},phase,gait:phase==='chase'?'run':phase==='search'?'search':'walk',speed,
  strength:phase==='chase'?Math.min(1.35,.65+speed/10):phase==='search'?Math.min(.75,.35+speed/12):Math.min(1,.45+speed/12)});
function offlineFacade(context) {
  const facade={state:'running',currentTime:origin,destination:context.destination,sampleRate};
  for(const name of ['createOscillator','createGain','createDynamicsCompressor','createWaveShaper','createBiquadFilter'])
    facade[name]=(...args)=>context[name](...args);
  return facade;
}
function legacyTone(context,frequency,duration,gain,slide=.5,delay=0) {
  const osc=context.createOscillator(),envelope=context.createGain(),t=origin+delay,volume=gain*2.5;
  osc.type='sine';osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(frequency*slide,t+duration);
  envelope.gain.setValueAtTime(0,t);envelope.gain.linearRampToValueAtTime(volume,t+.008);
  envelope.gain.exponentialRampToValueAtTime(Math.min(.0001,volume*.01),t+duration);
  osc.connect(envelope);envelope.connect(context.destination);osc.start(t);osc.stop(t+duration+.01);
}
async function render(action,{legacy=false,volume=1,muted=false,duration=.6}={}) {
  const context=new OfflineAudioContext(1,Math.ceil(duration*sampleRate),sampleRate),sound=new Sound();
  sound.context=offlineFacade(context);if(sound.setVolume)sound.setVolume(volume);sound.enabled=!muted;
  if(legacy){
    sound.tone=(...args)=>legacyTone(context,...args);
    sound.mistressFootstep=(event,point)=>{
      const gait=event.phase==='chase'?'run':event.phase==='search'?'search':'routine',range=gait==='run'?22:18;
      const distance=Math.hypot(point.x-event.position.x,point.y-event.position.y,point.z-event.position.z),near=Math.max(0,Math.min(1,1-distance/range));
      const impact=Math.max(.45,Math.min(1.5,Math.sqrt(event.speed/3.5)))*event.strength*near*near*(3-2*near)*3;
      const pitch=Math.max(.9,Math.min(1.2,1+(event.speed-3.5)*.025));
      const profile=gait==='run'?{heel:92,toe:316,gain:.031,delay:.029,duration:.06}:gait==='search'?{heel:112,toe:336,gain:.011,delay:.075,duration:.065}:{heel:126,toe:408,gain:.019,delay:.05,duration:.065};
      legacyTone(context,profile.heel*pitch,profile.duration,profile.gain*impact,.48);
      legacyTone(context,profile.toe*pitch,.035,profile.gain*.45*impact,.65,profile.delay);return impact>0;
    };
  }
  action(sound);return context.startRendering();
}
function rms(data,start=origin,end=.25) {
  const a=Math.floor(start*sampleRate),b=Math.min(data.length,Math.ceil(end*sampleRate));let sum=0;
  for(let i=a;i<b;i++)sum+=data[i]*data[i];return Math.sqrt(sum/Math.max(1,b-a));
}
async function measure(buffer) {
  const data=buffer.getChannelData(0);let peak=0;for(const value of data)peak=Math.max(peak,Math.abs(value));
  const context=new OfflineAudioContext(1,buffer.length,sampleRate),source=context.createBufferSource(),high=context.createBiquadFilter(),low=context.createBiquadFilter();
  source.buffer=buffer;high.type='highpass';high.frequency.value=300;low.type='lowpass';low.frequency.value=5000;
  source.connect(high);high.connect(low);low.connect(context.destination);source.start();
  const filtered=await context.startRendering();return {peak,rms:rms(data),speakerRms:rms(filtered.getChannelData(0))};
}
const db=value=>value>0?(20*Math.log10(value)).toFixed(1):'−∞';
const effects=[
  ['routine 5 m',sound=>sound.mistressFootstep(cue('routine',3.5),listener,0)],
  ['search 5 m',sound=>sound.mistressFootstep(cue('search',3.5),listener,0)],
  ['chase 5 m',sound=>sound.mistressFootstep(cue('chase',7),listener,0)],
  ['long jump',sound=>sound.hop(true)],['landing',sound=>sound.land()],['rabbit sprint step',sound=>sound.step(true,{sprinting:true,grounded:true,vx:8.2,vz:0})],
  ['laughter',sound=>sound.household('laugh')],['cooking',sound=>sound.household('cook')],['chime',sound=>sound.chime()],
];
let lastRows=[],previewURL=null;
async function run() {
  const status=document.querySelector('#status'),results=document.querySelector('#results'),checks=[];status.textContent='Rendering real audio buffers…';
  const rows=[];
  for(const [name,action]of effects) {
    const before=await measure(await render(action,{legacy:true})),after=await measure(await render(action));rows.push({name,before,after});
  }
  const add=(name,pass)=>checks.push(`${pass?'PASS':'FAIL'} ${name}`);
  for(const row of rows.slice(0,3)) {
    add(`${row.name}: more audible body than former envelope`,row.after.rms>row.before.rms*1.8);
    add(`${row.name}: stronger small-speaker band`,row.after.speakerRms>row.before.speakerRms*1.8);
  }
  const quiet=sound=>sound.tone(600,.15,.004,1);
  const normal=await measure(await render(quiet)),loud=await measure(await render(quiet,{volume:3}));
  add('300% volume increases a quiet effect',loud.rms>normal.rms*1.5);
  const mix=sound=>{for(let i=0;i<6;i++){sound.mistressFootstep(cue('chase',12),{x:0,y:0,z:0},0);sound.hop(true);sound.land();sound.chime();sound.household('alert');}};
  const maximum=await measure(await render(mix,{volume:3}));add('300% simultaneous effects stay below digital clipping',maximum.peak<=.985);
  const silent=await measure(await render(sound=>{sound.hop(true);sound.chime();sound.mistressFootstep(cue(),listener,0);},{muted:true,volume:3}));
  add('mute remains exact silence at 300%',silent.peak===0);
  const close=await measure(await render(effects[0][1])),far=await measure(await render(sound=>sound.mistressFootstep(cue(),{x:15,y:0,z:0},0))),outside=await measure(await render(sound=>sound.mistressFootstep(cue(),{x:18,y:0,z:0},0)));
  add('distance fade remains audible and reaches exact zero',close.rms>far.rms&&far.rms>0&&outside.peak===0);
  results.innerHTML='<table><thead><tr><th>Sound</th><th>Old RMS dBFS</th><th>New RMS dBFS</th><th>Old speaker dBFS</th><th>New speaker dBFS</th><th>Peak dBFS</th></tr></thead><tbody>'+rows.map(row=>`<tr><td>${row.name}</td><td>${db(row.before.rms)}</td><td>${db(row.after.rms)}</td><td>${db(row.before.speakerRms)}</td><td>${db(row.after.speakerRms)}</td><td>${db(row.after.peak)}</td></tr>`).join('')+'</tbody></table>';
  document.querySelector('#checks').textContent=checks.join('\n')+`\n300% mixed peak: ${maximum.peak.toFixed(4)} (${db(maximum.peak)} dBFS)`;
  status.textContent=`${checks.filter(x=>x.startsWith('PASS')).length}/${checks.length} audio output checks pass`;
  lastRows=rows;
}
function wav(buffer) {
  const data=buffer.getChannelData(0),bytes=new ArrayBuffer(44+data.length*2),view=new DataView(bytes),write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,36+data.length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,data.length*2,true);
  for(let i=0;i<data.length;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,data[i]))*32767,true);return new Blob([bytes],{type:'audio/wav'});
}
document.querySelector('#render').addEventListener('click',()=>run().catch(error=>{document.querySelector('#status').textContent=String(error.stack??error);}));
document.querySelector('#listen').addEventListener('click',async()=>{
  const buffers=[];for(const [,action]of effects)buffers.push(await render(action));
  const output=new AudioBuffer({numberOfChannels:1,length:buffers.reduce((sum,x)=>sum+x.length,0),sampleRate});let offset=0;
  for(const buffer of buffers){output.copyToChannel(buffer.getChannelData(0),0,offset);offset+=buffer.length;}
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(wav(output));const player=document.querySelector('#preview');player.src=previewURL;await player.play();
});
document.querySelector('#stop').addEventListener('click',()=>document.querySelector('#preview').pause());
run().catch(error=>{document.querySelector('#status').textContent=String(error.stack??error);});
