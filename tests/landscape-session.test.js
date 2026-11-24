import test from 'node:test';
import assert from 'node:assert/strict';
import { createLandscapeSession } from '../src/landscape-session.js';

function setup(navigator = {}) {
  const document = Object.assign(new EventTarget(), { documentElement: {}, fullscreenElement: null });
  const calls = [];
  function changeFullscreen(element) {
    document.fullscreenElement = element;
    document.dispatchEvent(new Event('fullscreenchange'));
  }
  document.documentElement.requestFullscreen = async () => { calls.push('fullscreen'); changeFullscreen(document.documentElement); };
  document.exitFullscreen = async () => { calls.push('exit'); changeFullscreen(null); };
  const orientation = { lock: async direction => calls.push(direction), unlock: () => calls.push('unlock') };
  const window = { navigator, innerWidth: 390, innerHeight: 844, screen: { orientation } };
  const controls = createLandscapeSession({ document, window });
  return { controls, changeFullscreen, window, orientation, calls, document };
}

test('the portrait fallback tracks rotated viewport dimensions; desktop inputs are never blocked', async () => {
  const { controls, calls, window } = setup();
  assert.equal(controls.portraitBlocked('desktop'), false);
  assert.equal(controls.portraitBlocked('touch'), true);
  await controls.enter('desktop');
  assert.deepEqual(calls, []);
  [window.innerWidth, window.innerHeight] = [window.innerHeight, window.innerWidth];
  assert.equal(controls.portraitBlocked('touch'), false);
});

test('fullscreen and landscape are requested on touch entry and released on exit', async () => {
  const { controls, calls } = setup();
  const started = controls.enter('touch');
  assert.deepEqual(calls, ['fullscreen']);
  await started;
  await controls.enter('touch');
  controls.leave();
  assert.deepEqual(calls, ['fullscreen', 'landscape', 'unlock', 'exit']);
});

test('Apple mobile browsers stay in the normal viewport on start and resume, with the rotate prompt available', async () => {
  for (const navigator of [
    { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) CriOS/134.0 Mobile' },
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile' },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 },
    { platform: 'MacIntel', maxTouchPoints: 5 }
  ]) {
    const {controls, calls, window} = setup(navigator);
    await controls.enter('touch');
    assert.equal(controls.portraitBlocked('touch'), true);
    [window.innerWidth, window.innerHeight] = [844, 390];
    assert.equal(controls.portraitBlocked('touch'), false);
    controls.leave();
    await controls.enter('touch');
    controls.dispose();
    assert.deepEqual(calls, [], JSON.stringify(navigator));
  }
});

test('Android touch, Windows hybrids and desktop Mac touch simulation keep their fullscreen path', async () => {
  for (const navigator of [
    {userAgent: 'Mozilla/5.0 (Linux; Android 15)', maxTouchPoints: 5},
    {platform: 'Win32', maxTouchPoints: 10},
    {userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 0}
  ]) {
    const {controls, calls} = setup(navigator);
    await controls.enter('touch');
    controls.leave();
    assert.deepEqual(calls, ['fullscreen','landscape','unlock','exit']);
  }
});

test('failed or unsupported requests degrade to the rotate prompt and allow a later retry', async () => {
  const { controls, calls, orientation, document } = setup();
  const fullscreen = document.documentElement.requestFullscreen, lock = orientation.lock;
  document.documentElement.requestFullscreen = () => { throw new Error('Fullscreen denied'); };
  orientation.lock = () => Promise.reject(new Error('Unsupported'));
  await controls.enter('touch');
  assert.equal(controls.portraitBlocked('touch'), true);
  document.documentElement.requestFullscreen = fullscreen; orientation.lock = lock;
  await controls.enter('touch');
  controls.leave();
  assert.deepEqual(calls, ['fullscreen', 'landscape', 'unlock', 'exit']);
  delete document.documentElement.requestFullscreen; delete orientation.lock;
  await controls.enter('touch');
  controls.dispose();
  assert.equal(controls.portraitBlocked('touch'), true);
});

test('leaving while fullscreen is being entered cleans up without starting an orientation lock', async () => {
  const { controls, calls, document, changeFullscreen } = setup();
  let resolveRequest;
  document.documentElement.requestFullscreen = () => new Promise(resolve => { resolveRequest = resolve; });
  const started = controls.enter('touch');
  controls.leave();
  changeFullscreen(document.documentElement);
  resolveRequest();
  await started;
  assert.deepEqual(calls, ['exit']);
});

test('late lock resolution is released when leaving or losing fullscreen; existing fullscreen is preserved', async () => {
  for (const interrupt of ['leave', 'exitFullscreen']) {
    const { controls, calls, changeFullscreen, document, orientation } = setup();
    let resolveLock;
    changeFullscreen(document.documentElement);
    orientation.lock = () => new Promise(resolve => { resolveLock = resolve; });
    const started = controls.enter('touch');
    if (interrupt === 'leave') controls.leave(); else changeFullscreen(null);
    resolveLock();
    await started;
    controls.dispose();
    assert.deepEqual(calls, ['unlock']);
  }
});
