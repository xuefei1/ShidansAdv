import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGameplayGestures } from '../src/touch-gestures.js';

function fixture() {
  const document = new EventTarget();
  const state = { active: true };
  const detach = bindGameplayGestures(document, () => state.active);
  function send(type, fingers = 0, target = 'canvas', cancelable = true) {
    document.closest = selector => {
      if (selector === '#touch-controls') return ['action','stick'].includes(target) ? document : null;
      if (selector === '.legend-scroll') {
        if (target === 'scrollingLegend') return {scrollHeight:250,clientHeight:100};
        if (target === 'shortLegend') return {scrollHeight:100,clientHeight:100};
        return null;
      }
      return ['hudButton', 'action'].includes(target) ? document : null;
    };
    const event = Object.assign(new Event(type, { cancelable }), { touches: Array(fingers) });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  }
  return { state, send, detach };
}

test('touch gameplay suppresses selection, dragging, context menus and all Safari pinch phases', () => {
  const { state, send, detach } = fixture();
  const defaults = ['selectstart', 'dragstart', 'contextmenu', 'dblclick', 'gesturestart', 'gesturechange', 'gestureend'];
  for (const type of defaults) assert.equal(send(type), true, type);
  assert.equal(send('gesturechange', 2, 'canvas', false), false);
  state.active = false;
  for (const type of defaults) assert.equal(send(type), false, type);
  assert.equal(send('touchmove', 2), false);
  state.active = true;
  detach();
  for (const type of [...defaults, 'touchstart', 'touchmove']) assert.equal(send(type, 2), false, type);
});

test('active play reserves single-finger drags and two-finger gestures for game controls', () => {
  const { send, state } = fixture();
  for (const type of ['touchstart', 'touchmove']) {
    for (const target of ['canvas', 'hudLabel', 'stick', 'action', 'shortLegend']) {
      assert.equal(send(type, 1, target), true, type);
      assert.equal(send(type, 2, target), true, type);
    }
    assert.equal(send(type, 1, 'scrollingLegend'), false, type);
    assert.equal(send(type, 2, 'scrollingLegend'), true, type);
    assert.equal(send(type, 1, 'hudButton'), false, type);
    assert.equal(send(type, 2, 'hudButton'), false, type);
    assert.equal(send(type, 1, 'canvas', false), false, type);
  }
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchend', 'click', 'wheel', 'keydown']) {
    assert.equal(send(type, 2), false, type);
  }
  state.active = false;
  for (const type of ['touchstart', 'touchmove']) assert.equal(send(type, 1, 'canvas'), false, type);
});
