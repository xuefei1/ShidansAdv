export function bindTouchControls({
  canvas, stick, jump, interact, sprint, poop, pee, canControl,
  onMove, onLook, onJump, onPrimary, onSprint, onPoop, onPee,
  window = canvas.ownerDocument.defaultView, document = canvas.ownerDocument
}) {
  const contacts = new Map(), occupied = new Set(), removers = [];
  let running = false;

  function listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    removers.push(() => target.removeEventListener(type, listener, options));
  }
  function setRun(active) {
    if (active === running) return;
    running = active;
    sprint.setAttribute('aria-pressed', String(active));
    onSprint(active);
  }
  function steer(contact, clientX, clientY) {
    const rawX = clientX - contact.centerX, rawY = clientY - contact.centerY;
    const distance = Math.hypot(rawX, rawY);
    const unitX = distance ? rawX / distance : 0, unitY = distance ? rawY / distance : 0;
    const strength = Math.min(distance / contact.radius, 1);
    stick.style.setProperty('--stick-x', `${unitX * strength * contact.radius}px`);
    stick.style.setProperty('--stick-y', `${unitY * strength * contact.radius}px`);
    const magnitude = Math.max(0, (strength - .12) / .88);
    if (!magnitude && contact.moving) setRun(false);
    contact.moving = magnitude > 0;
    onMove(magnitude ? unitX * magnitude : 0, magnitude ? -unitY * magnitude : 0);
  }
  function finish(id, cancel) {
    const contact = contacts.get(id);
    if (!contact) return;
    const { target } = contact;
    contacts.delete(id);
    occupied.delete(target);
    target.classList.remove('is-held');
    if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
    if (target === stick) {
      stick.style.removeProperty('--stick-x'); stick.style.removeProperty('--stick-y');
      onMove(0, 0); setRun(false);
    } else if (target === jump) onJump(false, cancel);
    else if (target === interact) onPrimary(false, cancel);
  }
  function reset() {
    for (const id of [...contacts.keys()]) finish(id, true);
    setRun(false);
  }
  function begin(target, event) {
    if (!canControl() || event.button !== 0) return;
    event.preventDefault();
    if (target.disabled || occupied.has(target) || contacts.has(event.pointerId)) return;
    const contact = { target, clientX: event.clientX, clientY: event.clientY };
    contacts.set(event.pointerId, contact); occupied.add(target);
    target.classList.add('is-held');
    try { target.setPointerCapture?.(event.pointerId); } catch {}
    if (target === stick) {
      const bounds = stick.getBoundingClientRect();
      contact.centerX = bounds.left + bounds.width / 2; contact.centerY = bounds.top + bounds.height / 2;
      contact.radius = Math.max(1, Math.min(bounds.width, bounds.height) * .32);
      steer(contact, event.clientX, event.clientY);
    } else if (target === jump) onJump(true, false);
    else if (target === interact) onPrimary(true, false);
    else if (target === sprint) setRun(!running);
    else if (target === poop) onPoop();
    else if (target === pee) onPee();
  }
  for (const target of [canvas, stick, jump, interact, sprint, poop, pee]) {
    listen(target, 'pointerdown', event => begin(target, event), { passive: false });
    listen(target, 'lostpointercapture', event => {
      if (contacts.get(event.pointerId)?.target === target) finish(event.pointerId, true);
    });
    listen(target, 'contextmenu', event => { if (canControl()) event.preventDefault(); });
  }
  listen(window, 'pointermove', event => {
    const contact = contacts.get(event.pointerId);
    if (!contact) return;
    if (!canControl()) { reset(); return; }
    if (contact.target === stick) steer(contact, event.clientX, event.clientY);
    else if (contact.target === canvas) {
      onLook(event.clientX - contact.clientX, event.clientY - contact.clientY);
      contact.clientX = event.clientX; contact.clientY = event.clientY;
    }
  });
  listen(window, 'pointerup', event => finish(event.pointerId, !canControl()));
  listen(window, 'pointercancel', event => finish(event.pointerId, true));
  listen(window, 'blur', reset);
  listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  return { reset, detach() { reset(); removers.splice(0).forEach(remove => remove()); } };
}
