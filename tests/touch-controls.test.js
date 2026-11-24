import test from 'node:test';
import assert from 'node:assert/strict';
import { bindTouchControls } from '../src/touch-controls.js';
import { DEN, RabbitController, World } from '../src/physics.js';

function fixture(callbacks = {}) {
  const events = [], nodes = {}, input = { x: 0, z: 0, jump: false, run: false };
  const window = new EventTarget(), document = new EventTarget();
  const state = { allowed: true };
  for (const name of ['canvas', 'stick', 'jump', 'interact', 'sprint', 'poop', 'pee', 'rear']) {
    const node = new EventTarget(), captures = new Set(), classes = new Set(), properties = new Map();
    node.style = { setProperty: properties.set.bind(properties), removeProperty: properties.delete.bind(properties) };
    node.classList = { add: classes.add.bind(classes), remove: classes.delete.bind(classes) };
    node.setAttribute = (key, value) => node[key] = value;
    node.setPointerCapture = id => captures.add(id);
    node.hasPointerCapture = id => captures.has(id);
    node.releasePointerCapture = id => captures.delete(id);
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    nodes[name] = node;
  }
  const controls = bindTouchControls({ ...nodes, window, document, canControl: () => state.allowed,
    onMove: (right, forward) => { input.x = right; input.z = -forward; },
    onJump: (held, cancelled) => { events.push(['jump', held, cancelled]); input.jump = held; },
    onPrimary: (...args) => events.push(['interact', ...args]), onLook: (...args) => events.push(['look', ...args]),
    onRear: held => events.push(['rear', held]),
    onSprint: active => { input.run = active; }, onPoop: () => events.push(['poop']), onPee: () => events.push(['pee']),
    ...callbacks
  });
  function emit(target, name, pointerId = 0, clientX = 50, clientY = 50, options = {}) {
    const event = Object.assign(new Event(name, { cancelable: true }), { pointerId, clientX, clientY, button: 0, pointerType: 'touch', ...options });
    target.dispatchEvent(event); return event;
  }
  return { ...nodes, window, document, input, events, emit, controls, state };
}

test('two contacts move Shidan through the real den fence with a charged jump, without a keyboard', () => {
  const view = fixture(), player = new RabbitController(new World());
  const advance = frames => { for (let frame = 0; frame < frames; frame++) player.update(1/60, view.input); };
  view.emit(view.stick, 'pointerdown', 4, 100, 50);
  advance(140);
  assert.ok(player.x < DEN.x + DEN.radius && player.x > DEN.x + DEN.radius - .6);
  view.emit(view.jump, 'pointerdown', 7);
  advance(55);
  view.emit(view.window, 'pointerup', 7); advance(1);
  assert.equal(player.lastJump, 'long'); assert.equal(player.lastJumpFree, true);
  advance(70);
  assert.ok(player.x > DEN.x + DEN.radius);
  assert.equal(view.input.x, 1);
  view.emit(view.window, 'pointerup', 4); assert.equal(view.input.x, 0);
});

test('steering has a dead zone, proportional travel and capped diagonals independent of look', () => {
  const view = fixture();
  view.emit(view.stick, 'pointerdown', 10, 52, 50); assert.equal(view.input.x, 0);
  view.emit(view.window, 'pointermove', 10, 66, 50); assert.ok(view.input.x > .4 && view.input.x < .5);
  view.emit(view.canvas, 'pointerdown', 20, 100, 150);
  view.emit(view.window, 'pointermove', 10, 150, -50);
  view.emit(view.window, 'pointermove', 20, 130, 140);
  assert.equal(Math.round(Math.hypot(view.input.x, view.input.z) * 1000), 1000);
  assert.ok(view.input.x > 0 && view.input.z < 0);
  assert.deepEqual(view.events, [['look', 30, -10]]);
  view.emit(view.window, 'pointerup', 20); assert.ok(view.input.x > 0);
});

test('rear view follows its own finger while steering and swiping, including capture loss', () => {
  const view = fixture();
  view.emit(view.stick, 'pointerdown', 1, 100, 50);
  view.emit(view.canvas, 'pointerdown', 2);
  view.emit(view.rear, 'pointerdown', 3);
  view.emit(view.rear, 'pointerdown', 4);
  view.emit(view.window, 'pointerup', 4);
  view.emit(view.window, 'pointercancel', 2);
  assert.deepEqual(view.events, [['rear', true]]);
  assert.equal(view.rear.hasPointerCapture(3), true);
  view.emit(view.rear, 'lostpointercapture', 3);
  view.emit(view.window, 'pointerup', 3);
  assert.deepEqual(view.events.slice(1), [['rear', false]]);
  assert.equal(view.input.x, 1);
  view.emit(view.rear, 'pointerdown', 5);
  view.emit(view.window, 'pointerup', 5);
  assert.deepEqual(view.events.slice(2), [['rear', true], ['rear', false]]);
  view.emit(view.canvas, 'pointerdown', 6);
  view.emit(view.rear, 'pointerdown', 7);
  view.controls.reset();
  assert.deepEqual(view.events.slice(4), [['rear', true], ['rear', false]]);
  assert.equal(view.input.x, 0);
});

test('a stick contact spans the center dead zone, direction changes and competing touches', () => {
  const events = [];
  const view = fixture({
    onStickHeld: held => events.push(['held', held]),
    onMove: (right, forward) => events.push(['move', right, forward || 0]),
  });
  view.emit(view.stick, 'pointerdown', 1);
  view.emit(view.stick, 'pointerdown', 1);
  view.emit(view.stick, 'pointerdown', 2);
  view.emit(view.window, 'pointerup', 2);
  view.emit(view.window, 'pointermove', 1, 100, 50);
  view.emit(view.window, 'pointermove', 1, 50, 50);
  view.emit(view.window, 'pointermove', 1, 50, 100);
  view.emit(view.window, 'pointerup', 1);
  view.emit(view.window, 'pointerup', 1);
  assert.deepEqual(events, [
    ['held', true], ['move', 0, 0], ['move', 1, 0], ['move', 0, 0], ['move', 0, -1],
    ['move', 0, 0], ['held', false],
  ]);
});

test('cancellation clears holds without sending a normal jump release or repeating a primary action', () => {
  for (const end of ['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'reset', 'detach']) {
    const stickHolds = [];
    const view = fixture({ onStickHeld: held => stickHolds.push(held) });
    view.emit(view.stick, 'pointerdown', 9);
    view.emit(view.jump, 'pointerdown', 3);
    view.emit(view.interact, 'pointerdown', 8);
    view.emit(view.jump, 'pointerdown', 5); view.emit(view.window, 'pointerup', 5);
    if (end === 'pointercancel') {
      for (const id of [3, 8, 9]) view.emit(view.window, end, id);
    } else if (end === 'lostpointercapture') {
      view.emit(view.jump, end, 3); view.emit(view.interact, end, 8); view.emit(view.stick, end, 9);
    } else if (end === 'blur') view.emit(view.window, 'blur');
    else if (end === 'hidden') { view.document.hidden = true; view.emit(view.document, 'visibilitychange'); }
    else view.controls[end]();
    for (const id of [3, 8, 9]) view.emit(view.window, 'pointerup', id);
    assert.deepEqual(stickHolds, [true, false], end);
    assert.deepEqual(view.events, [['jump', true, false], ['interact', true, false], ['jump', false, true], ['interact', false, true]], end);
    assert.equal(view.jump.hasPointerCapture(3), false);
    assert.equal(view.input.jump, false);
  }
});

test('run toggles independently and stops when the stick returns to rest', () => {
  const view = fixture();
  view.emit(view.sprint, 'pointerdown', 33); view.emit(view.window, 'pointerup', 33);
  view.emit(view.stick, 'pointerdown', 9, 50, 50); assert.equal(view.input.run, true);
  view.emit(view.window, 'pointermove', 9, 50, 18); assert.equal(view.input.z, -1);
  view.emit(view.window, 'pointermove', 9, 50, 50); assert.equal(view.input.run, false);
  view.emit(view.sprint, 'pointerdown', 33); view.emit(view.window, 'pointerup', 9);
  assert.equal(view.sprint['aria-pressed'], 'false');
});

test('taps emit once, disable compatibility mouse down, and do not act while inactive or detached', () => {
  const view = fixture();
  view.state.allowed = false;
  assert.equal(view.emit(view.poop, 'pointerdown', 1).defaultPrevented, false);
  view.state.allowed = true;
  assert.equal(view.emit(view.poop, 'pointerdown', 1).defaultPrevented, true);
  view.emit(view.poop, 'pointerdown', 2); view.emit(view.poop, 'click', 1);
  view.emit(view.window, 'pointerup', 1); view.emit(view.pee, 'pointerdown', 3);
  view.emit(view.jump, 'pointerdown', 6); view.emit(view.window, 'pointerup', 6);
  view.controls.detach(); view.emit(view.poop, 'pointerdown', 7);
  assert.deepEqual(view.events, [['poop'], ['pee'], ['jump', true, false], ['jump', false, false]]);
});
