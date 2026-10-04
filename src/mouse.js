// Pointer lock is optional. An ordinary click must never depend on pointer
// capture (setPointerCapture throws for inactive/synthetic pointer IDs).
export function bindMouseControls({ canvas, document, window, canControl, onLook, onPoop, onLockChange, onLockDenied }) {
  let dragging = false, lastX = 0, lastY = 0, pending = false, wasLocked = false;
  const denied = () => { pending = false; onLockDenied(); };
  const clear = () => { dragging = false; };
  function unlock() {
    clear();
    try { if (document.pointerLockElement === canvas) document.exitPointerLock?.(); } catch { denied(); }
  }
  function lock() {
    if (!canControl() || pending || document.pointerLockElement === canvas) return;
    if (typeof canvas.requestPointerLock !== 'function') { denied(); return; }
    pending = true;
    try {
      const result = canvas.requestPointerLock();
      if (result?.then) Promise.resolve(result).then(() => {
        pending = false;
        if (!canControl()) unlock();
      }, denied);
    } catch { denied(); }
  }
  document.addEventListener('pointerlockerror', denied);
  document.addEventListener('pointerlockchange', () => {
    pending = false;
    const locked = document.pointerLockElement === canvas, lostLock = wasLocked && !locked;
    wasLocked = locked;
    if (locked && !canControl()) { unlock(); return; }
    onLockChange(locked, lostLock);
  });
  canvas.addEventListener('mousedown', event => {
    if (!canControl()) return;
    if (event.button === 2) { event.preventDefault(); canvas.focus(); onPoop(); return; }
    if (event.button !== 0) return;
    canvas.focus(); dragging = true; lastX = event.clientX; lastY = event.clientY; lock();
  });
  window.addEventListener('mouseup', event => { if (event.button === 0) clear(); });
  window.addEventListener('blur', clear);
  window.addEventListener('mousemove', event => {
    if (!canControl()) return;
    let x = 0, y = 0;
    if (document.pointerLockElement === canvas) { x = event.movementX; y = event.movementY; }
    else if (dragging) { x = event.clientX - lastX; y = event.clientY - lastY; lastX = event.clientX; lastY = event.clientY; }
    if (Number.isFinite(x) && Number.isFinite(y)) onLook(x, y);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  return { lock, unlock, clear };
}
