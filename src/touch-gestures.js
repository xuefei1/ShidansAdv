const nativeGestures = ['contextmenu', 'selectstart', 'dragstart', 'dblclick', 'gesturestart', 'gesturechange', 'gestureend'];
const touchEvents = ['touchstart', 'touchmove'];
const nativeControls = 'button, summary, input, select, textarea, label, a[href]';

export function bindGameplayGestures(document, isActive) {
  const options = { capture: true, passive: false };
  function preventGesture(event) {
    if (event.cancelable && isActive()) event.preventDefault();
  }
  function preventPinch(event) {
    if (event.touches.length < 2) return;
    const target = event.target;
    // Native HUD buttons need their touch-generated click even with a thumb on the stick.
    // The action buttons under #touch-controls consume Pointer Events directly.
    if (target.closest?.(nativeControls) && !target.closest('#touch-controls')) return;
    preventGesture(event);
  }
  for (const type of nativeGestures) document.addEventListener(type, preventGesture, options);
  for (const type of touchEvents) document.addEventListener(type, preventPinch, options);
  return () => {
    for (const type of nativeGestures) document.removeEventListener(type, preventGesture, options);
    for (const type of touchEvents) document.removeEventListener(type, preventPinch, options);
  };
}
