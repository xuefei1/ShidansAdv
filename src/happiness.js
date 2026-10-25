export const LEADERBOARD_KEY = 'shidans-adventure.leaderboard.v1';
export const PLAYER_NAME_KEY = 'shidans-adventure.player-name';
export const playerName = value => typeof value === 'string' ? [...value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim().replace(/\s+/g,' ')].slice(0,24).join('') : '';
const validEntry = e => e && typeof e.id==='string' && playerName(e.name) && Number.isSafeInteger(e.score) && e.score>=0 && typeof e.finishedAt==='string' && Number.isFinite(Date.parse(e.finishedAt));
const sorted = entries => entries.sort((a,b)=>b.score-a.score || a.finishedAt.localeCompare(b.finishedAt) || a.id.localeCompare(b.id));

// Local browser storage only. Failures retain the result for this page session
// and are surfaced in the UI instead of breaking the bedtime transition.
export class Leaderboard {
  constructor(storage) {
    this.storage=storage; this.entries=[]; this.saved=!!storage;
    try { this.entries=this.read(); } catch { this.saved=false; }
  }
  read() {
    const raw=this.storage?.getItem(LEADERBOARD_KEY);
    if(!raw) return [];
    const rows=JSON.parse(raw);
    if(!Array.isArray(rows)) throw new Error('Invalid leaderboard');
    return sorted(rows.filter(validEntry).map(e=>({id:e.id,name:playerName(e.name),score:e.score,finishedAt:e.finishedAt})));
  }
  record(entry) {
    if(!validEntry(entry)) throw new Error('Invalid score');
    // Merge the latest saved rows so another tab's completed runs are retained.
    let existing=[];
    try { existing=this.read(); } catch { /* Repair corrupt storage on a successful write. */ }
    this.entries=sorted([...new Map([...existing,...this.entries,entry].map(e=>[e.id,e])).values()]);
    try {
      if(!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(LEADERBOARD_KEY,JSON.stringify(this.entries)); this.saved=true;
    } catch { this.saved=false; }
    return this.saved;
  }
  get name() { try { return playerName(this.storage?.getItem(PLAYER_NAME_KEY)); } catch { return ''; } }
  rememberName(name) { try { this.storage?.setItem(PLAYER_NAME_KEY,playerName(name)); } catch { /* Scoring still works. */ } }
}

export class HappinessRun {
  constructor(board, {id=()=>crypto.randomUUID(), now=()=>new Date().toISOString()}={}) {
    this.board=board; this.makeId=id; this.now=now; this.active=false; this.score=0; this.name=''; this.lastResult=null;
  }
  start(name) {
    if(this.active) return true;
    name=playerName(name); if(!name) return false;
    this.id=this.makeId(); this.name=name; this.score=0; this.active=true; this.lastResult=null;
    this.board.rememberName(name); return true;
  }
  consume(event) {
    if(this.active && event.kind==='consume' && Number.isSafeInteger(event.happiness) && event.happiness>0) this.score+=event.happiness;
  }
  finish(clock) {
    if(!this.active || !clock.finished) return null;
    const result={id:this.id,name:this.name,score:this.score,finishedAt:this.now()};
    this.active=false; this.lastResult=result; this.board.record(result); this.score=0;
    return result;
  }
}
