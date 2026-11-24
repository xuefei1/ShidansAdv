const storageKey = 'shidans-adventure.input-mode.v1';
const choices = new Set(['auto', 'touch', 'desktop']);
const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyP', 'KeyQ', 'KeyC', 'KeyR', 'KeyM', 'KeyV']);

export function createInputMode({ window, storage, onChange = () => {} }) {
  const query = feature => window.matchMedia?.(feature);
  const coarse = query('(pointer: coarse)'), fine = query('(pointer: fine)'), anyFine = query('(any-pointer: fine)');
  const anyCoarse = query('(any-pointer: coarse)');
  const queries = [coarse, fine, anyFine, anyCoarse].filter(Boolean);
  let preference = 'auto', intent = null;
  try {
    const saved = storage?.getItem(storageKey);
    if (choices.has(saved)) preference = saved;
  } catch {}
  function resolve() {
    if (preference !== 'auto') return preference;
    if (intent) return intent;
    if (coarse?.matches) return 'touch';
    if (fine?.matches || anyFine?.matches) return 'desktop';
    return anyCoarse?.matches || window.navigator?.maxTouchPoints > 0 ? 'touch' : 'desktop';
  }
  let mode = resolve();
  function update(preferenceChanged = false) {
    const next = resolve();
    if (mode === next && !preferenceChanged) return;
    mode = next;
    onChange(mode, preference);
  }
  function capabilitiesChanged() { update(); }
  for (const media of queries) media.addEventListener?.('change', capabilitiesChanged);
  return {
    get mode() { return mode; },
    get preference() { return preference; },
    setPreference(next) {
      if (!choices.has(next) || next === preference) return;
      preference = next;
      intent = null;
      try { storage?.setItem(storageKey, next); } catch {}
      update(true);
    },
    noteGameplay(event) {
      if (preference !== 'auto' || event.target?.isContentEditable ||
          event.target?.closest?.('input, textarea, select') || event.isComposing) return;
      if (event.type === 'pointerdown' && event.pointerType === 'touch') intent = 'touch';
      else if (event.type === 'pointerdown' && event.pointerType === 'mouse') intent = 'desktop';
      else if (event.type === 'keydown' && gameKeys.has(event.code) && !event.metaKey && !event.ctrlKey && !event.altKey)
        intent = 'desktop';
      else return;
      update();
    },
    dispose() {
      for (const media of queries) media.removeEventListener?.('change', capabilitiesChanged);
    }
  };
}
