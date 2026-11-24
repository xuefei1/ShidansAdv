const nativeGestures = ['contextmenu', 'selectstart', 'dragstart', 'dblclick', 'gesturestart', 'gesturechange', 'gestureend'];
const touchEvents = ['touchstart', 'touchmove'];
const nativeControls = 'button, summary, input, select, textarea, label, a[href]';

export function bindGameplayGestures(document, isActive) {
  const options = { capture: true, passive: false };
  function preventGesture(event) {
    if (event.cancelable && isActive()) event.preventDefault();
  }
  function preventPagePanOrPinch(event) {
    if (!event.cancelable || !isActive()) return;
    const target = event.target;
    // Native HUD buttons need their touch-generated click even with a thumb on the stick.
    // The action buttons under #touch-controls consume Pointer Events directly.
    if (target.closest?.(nativeControls) && !target.closest('#touch-controls')) return;
    const list = target.closest?.('.legend-scroll');
    if (event.touches.length === 1 && list && list.scrollHeight > list.clientHeight) return;
    // Claim the first finger before WebKit interprets a downward camera drag as a page pan.
    event.preventDefault();
  }
  for (const type of nativeGestures) document.addEventListener(type, preventGesture, options);
  for (const type of touchEvents) document.addEventListener(type, preventPagePanOrPinch, options);
  return () => {
    for (const type of nativeGestures) document.removeEventListener(type, preventGesture, options);
    for (const type of touchEvents) document.removeEventListener(type, preventPagePanOrPinch, options);
  };
}
