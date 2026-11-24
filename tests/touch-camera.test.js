import assert from 'node:assert/strict';
import test from 'node:test';
import { TouchCamera } from '../src/touch-camera.js';

test('the orbit stays put for three seconds after the last swipe movement', () => {
  const camera = new TouchCamera();
  const position = now => camera.update(1, .8, Math.PI, now, 1/60);
  camera.noteSwipe(5000);
  assert.deepEqual(position(7200), {yaw:1,pitch:.8});
  camera.noteSwipe(7500);
  camera.noteSwipe(8000);
  assert.deepEqual(position(10999), {yaw:1,pitch:.8});
  assert.ok(position(11000).yaw < 1 && position(11000).pitch < .8);
});

test('holding the stick holds the orbit through a backward turn and a sideways turn', () => {
  const camera = new TouchCamera();
  const orbit = {yaw: 0, pitch: .8};
  camera.setStickHeld(true, 0);
  for (const facing of [0, Math.PI / 2, -Math.PI / 2]) {
    assert.deepEqual(camera.update(orbit.yaw, orbit.pitch, facing, 7000, .1), orbit);
  }
  camera.setStickHeld(false, 7100);
  assert.deepEqual(camera.update(0, .8, 0, 7349, .1), orbit);
  const turning = camera.update(0, .8, 0, 7350, .1);
  assert.ok(turning.yaw > 0 && turning.yaw < Math.PI);
  camera.setStickHeld(true, 7360);
  assert.deepEqual(camera.update(turning.yaw, turning.pitch, 0, 9000, .1), turning);
});

test('releasing the stick preserves the three-second delay from a manual swipe', () => {
  const camera = new TouchCamera();
  camera.setStickHeld(true, 0);
  camera.noteSwipe(1200);
  camera.setStickHeld(false, 1800);
  const orbit = {yaw: .9, pitch: .6};
  assert.deepEqual(camera.update(.9, .6, Math.PI, 4199, .1), orbit);
  assert.ok(camera.update(.9, .6, Math.PI, 4200, .1).yaw < .9);
});

test('rear view shows the room behind her current facing and restores the manual orbit on release', () => {
  const camera = new TouchCamera();
  const orbit = {yaw: 1.8, pitch: 1.1};
  camera.setStickHeld(true, 0);
  camera.rear = true;
  for (const facing of [0, Math.PI, -Math.PI / 2]) {
    assert.deepEqual(camera.view(orbit.yaw, orbit.pitch, facing), {yaw: facing, pitch: .43});
    assert.deepEqual(camera.update(orbit.yaw, orbit.pitch, facing, 5000, .1), orbit);
  }
  camera.rear = false;
  assert.deepEqual(camera.view(orbit.yaw, orbit.pitch, Math.PI), orbit);
});

test('reset clears held rear view, stick contact and any swipe delay', () => {
  const camera = new TouchCamera();
  camera.rear = true;
  camera.setStickHeld(true, 5000);
  camera.noteSwipe(5000);
  camera.reset();
  assert.equal(camera.rear, false);
  assert.ok(camera.update(.9, .6, Math.PI, 5000, .1).yaw < .9);
});

test('automatic orbit takes the short turn across the angle seam at different frame rates', () => {
  function orbit(fps) {
    const camera = new TouchCamera();
    let yaw = Math.PI-.04;
    for(let frame=0;frame<fps;frame++)yaw=camera.update(yaw,.43,.04,frame*1000/fps,1/fps).yaw;
    return yaw;
  }
  assert.ok(Math.abs(orbit(30)-orbit(120))<1e-8);
  assert.ok(Math.abs(orbit(30)-(Math.PI+.04))<.001);
});
