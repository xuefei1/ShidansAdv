import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMouseControls } from '../src/mouse.js';

function setup(request) {
  const canvas = new EventTarget(), document = new EventTarget(), window = new EventTarget();
  const state = { allowed: true, poops: 0, denied: 0, look: [], locks: [] };
  canvas.focus = () => {}; canvas.requestPointerLock = request;
  canvas.setPointerCapture = () => { throw new Error('Pointer capture must not be called'); };
  document.pointerLockElement = null;
  const controls = bindMouseControls({ canvas, document, window, canControl: () => state.allowed,
    onPoop: () => state.poops++, onLook: (x, y) => state.look.push([x, y]), onLockDenied: () => state.denied++, onLockChange: (...value) => state.locks.push(value) });
  const emit = (target, name, args = {}) => { const event = Object.assign(new Event(name, { cancelable: true }), args); target.dispatchEvent(event); return event; };
  return { canvas, document, window, state, controls, emit };
}
test('left click remains usable when mouse locking throws', () => {
  const t = setup(() => { throw new DOMException('Not allowed', 'SecurityError'); });
  t.emit(t.canvas, 'mousedown', { button: 0, clientX: 10, clientY: 20 });
  t.emit(t.window, 'mousemove', { clientX: 30, clientY: 25 });
  assert.equal(t.state.denied, 1); assert.deepEqual(t.state.look, [[20, 5]]); assert.equal(t.state.poops, 0);
});
test('promise rejections fall back safely and repeated clicks can retry', async () => {
  const t = setup(() => Promise.reject(new DOMException('Denied', 'NotAllowedError')));
  t.emit(t.canvas, 'mousedown', { button: 0 }); await new Promise(setImmediate);
  t.emit(t.canvas, 'mousedown', { button: 0 }); await new Promise(setImmediate);
  assert.equal(t.state.denied, 2);
});
test('no simultaneous pointer-lock requests during repeated clicks', async () => {
  let finish, requests = 0;
  const t = setup(() => { requests++; return new Promise(resolve => { finish = resolve; }); });
  t.controls.lock(); t.controls.lock(); assert.equal(requests, 1);
  finish(); await new Promise(setImmediate);
});
test('right click spawns exactly one ball and never requests pointer lock', () => {
  let locks = 0; const t = setup(() => locks++);
  for (let i = 0; i < 4; i++) {
    t.emit(t.canvas, 'mousedown', { button: 2 }); t.emit(t.window, 'mouseup', { button: 2 });
    const context = t.emit(t.canvas, 'contextmenu'); assert.equal(context.defaultPrevented, true);
  }
  assert.equal(t.state.poops, 4); assert.equal(locks, 0);
});
test('paused/title/overview states cannot spawn balls or change the camera', () => {
  const t = setup(); t.state.allowed = false;
  t.emit(t.canvas, 'mousedown', { button: 2 }); t.emit(t.canvas, 'mousedown', { button: 0 });
  t.emit(t.window, 'mousemove', { clientX: 20, clientY: 10 });
  assert.equal(t.state.poops, 0); assert.deepEqual(t.state.look, []);
});
test('denied lock notification is not mistaken for loss of an active lock', () => {
  const t = setup(); t.emit(t.document, 'pointerlockchange');
  assert.deepEqual(t.state.locks.at(-1), [false, false]);
  t.document.pointerLockElement = t.canvas; t.emit(t.document, 'pointerlockchange');
  t.document.pointerLockElement = null; t.emit(t.document, 'pointerlockchange');
  assert.deepEqual(t.state.locks.at(-1), [false, true]);
});
test('mouseup and blur stop drag without depending on pointer IDs', () => {
  const t = setup(); t.emit(t.canvas, 'mousedown', { button: 0, clientX: 0, clientY: 0 });
  t.emit(t.window, 'blur'); t.emit(t.window, 'mousemove', { clientX: 9, clientY: 9 });
  assert.deepEqual(t.state.look, [[0, 0]]);
});
