import test from 'node:test';
import assert from 'node:assert/strict';
import { createInputMode } from '../src/input-mode.js';

function setup({ width = 1280, touchPoints = 0, matches = [], saved = 'auto', storageFails = false } = {}) {
  const events = [], media = new Map();
  const storage = { getItem() { if (storageFails) throw new Error(); return saved; },
    setItem(key, value) { if (storageFails) throw new Error(); saved = value; } };
  const window = { innerWidth: width, navigator: { maxTouchPoints: touchPoints }, matchMedia(query) {
    const target = Object.assign(new EventTarget(), { matches: matches.includes(query) });
    media.set(query, target);
    return target;
  } };
  const controls = createInputMode({ window, storage, onChange: (...args) => events.push(args) });
  return { controls, events, media, saved: () => saved };
}

test('Auto defaults follow primary pointer capabilities independently of viewport dimensions', () => {
  for (const width of [375, 1440]) {
    assert.equal(setup({ width, matches: ['(pointer: coarse)', '(any-pointer: fine)'] }).controls.mode, 'touch');
    assert.equal(setup({ width, touchPoints: 5, matches: ['(pointer: fine)', '(any-pointer: coarse)'] }).controls.mode, 'desktop');
    assert.equal(setup({ width, touchPoints: 2 }).controls.mode, 'touch');
    assert.equal(setup({ width }).controls.mode, 'desktop');
  }
});

test('intentional gameplay switches a hybrid without reacting to typing, IME, hover or modified shortcuts', () => {
  const { controls, events } = setup({ touchPoints: 5 });
  controls.noteGameplay({ type: 'keydown', code: 'KeyW', target: { closest: () => ({}) } });
  controls.noteGameplay({ type: 'keydown', code: 'KeyW', isComposing: true });
  controls.noteGameplay({ type: 'keydown', code: 'KeyW', ctrlKey: true });
  controls.noteGameplay({ type: 'pointermove', pointerType: 'mouse' });
  controls.noteGameplay({ type: 'keydown', code: 'KeyT' });
  assert.equal(controls.mode, 'touch');
  controls.noteGameplay({ type: 'keydown', code: 'KeyW' });
  controls.noteGameplay({ type: 'pointerdown', pointerType: 'touch' });
  controls.noteGameplay({ type: 'pointerdown', pointerType: 'mouse' });
  assert.deepEqual(events, [['desktop', 'auto'], ['touch', 'auto'], ['desktop', 'auto']]);
});

test('explicit mode persists, including when it matches Auto, and overrides later input', () => {
  const { controls, events, saved } = setup({ touchPoints: 5 });
  controls.setPreference('touch');
  controls.noteGameplay({ type: 'keydown', code: 'Space' });
  controls.setPreference('nonsense');
  assert.deepEqual(events, [['touch', 'touch']]);
  assert.equal(saved(), 'touch');
  assert.equal(setup({ saved: saved() }).controls.mode, 'touch');
  controls.setPreference('desktop');
  controls.noteGameplay({ type: 'pointerdown', pointerType: 'touch' });
  assert.equal(controls.mode, 'desktop');
  controls.setPreference('auto');
  assert.equal(controls.mode, 'touch');
  const unavailable = setup({ storageFails: true }).controls;
  unavailable.setPreference('touch');
  assert.equal(unavailable.mode, 'touch');
});

test('Auto updates when reported pointing devices change before gameplay; disposal removes listeners', () => {
  const { controls, media } = setup();
  const coarse = media.get('(pointer: coarse)');
  coarse.matches = true;
  coarse.dispatchEvent(new Event('change'));
  assert.equal(controls.mode, 'touch');
  controls.dispose();
  coarse.matches = false;
  coarse.dispatchEvent(new Event('change'));
  assert.equal(controls.mode, 'touch');
});
