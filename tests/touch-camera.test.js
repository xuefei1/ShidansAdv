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

test('new deliberate movement resumes follow but a steady stick does not cancel a new swipe', () => {
  const camera = new TouchCamera();
  camera.noteSwipe(0);
  camera.setMovement(.01, 0, 1);
  assert.equal(camera.update(1,.43,Math.PI,100,.1).yaw,1);
  camera.setMovement(1, 0, 1);
  const turn=camera.update(1,.43,Math.PI,110,.1).yaw;
  assert.ok(turn<1);
  camera.noteSwipe(117);
  camera.setMovement(.9, 0, turn);
  assert.equal(camera.update(turn,.43,Math.PI,121,.1).yaw,turn);
  assert.equal(camera.movementYaw,1);
  camera.setRear(true);camera.setRear(false);
  assert.equal(camera.movementYaw,1);
  camera.setMovement(0, 0, turn);camera.setMovement(0, 1, turn);
  assert.equal(camera.movementYaw,turn);
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
