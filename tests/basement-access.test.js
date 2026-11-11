import test from 'node:test';
import assert from 'node:assert/strict';
import {BasementAccess,BASEMENT_UNLOCK_HAPPINESS} from '../src/basement-access.js';
import {HappinessRun,Leaderboard} from '../src/happiness.js';

function fixture() {
  const gate={locked:false,changes:[],setLocked(value){this.locked=value;this.changes.push(value);}};
  const access=new BasementAccess(gate),run=new HappinessRun(new Leaderboard(null),{id:()=> 'gate-round'});
  run.start('Shidan');
  const consume=happiness=>{run.consume({kind:'consume',happiness});return access.update(run.score);};
  return {gate,access,run,consume};
}

test('completed happiness rewards unlock at exactly 200 and signal a notice only once',()=>{
  const {gate,access,consume}=fixture();
  assert.equal(BASEMENT_UNLOCK_HAPPINESS,200);assert.equal(gate.locked,true);
  assert.equal(consume(150),false);assert.equal(consume(40),false);assert.equal(gate.locked,true);
  assert.equal(consume(10),true);assert.equal(access.unlocked,true);
  assert.equal(consume(150),false);assert.equal(access.update(350),false);
  assert.deepEqual(gate.changes,[true,false]);
});

test('a reward crossing 200 unlocks, while zero happiness and unfinished eating cannot',()=>{
  const {gate,access,run,consume}=fixture();
  run.consume({kind:'progress',happiness:500});assert.equal(access.update(run.score),false);
  assert.equal(consume(0),false);assert.equal(consume(150),false);
  assert.equal(consume(80),true);assert.equal(run.score,230);assert.equal(gate.locked,false);
});

test('archiving or resetting score alone never relocks a round; a new adventure resets its milestone',()=>{
  const {gate,access,run,consume}=fixture();consume(200);
  assert.equal(run.finish({finished:true}).score,200);assert.equal(run.score,0);
  assert.equal(access.update(run.score),false);assert.equal(gate.locked,false);
  run.restart();access.reset();assert.equal(gate.locked,true);
  assert.equal(consume(150),false);assert.equal(consume(50),true);
  assert.deepEqual(gate.changes,[true,false,true,false]);
});

test('invalid score samples cannot unlock a basement',()=>{
  const {access,gate}=fixture();
  for(const score of [undefined,null,'200',NaN,Infinity,-200,199.999,Number.MAX_SAFE_INTEGER+1])assert.equal(access.update(score),false);
  assert.equal(gate.locked,true);
});
