export function createLandscapeSession({ window, document }) {
  const root = document.documentElement, orientation = window.screen?.orientation;
  let active = false, pending = null, ownsFullscreen = false, ownsLock = false;
  function unlock() {
    if (!ownsLock) return;
    ownsLock = false;
    try { orientation.unlock(); } catch {}
  }
  function release() {
    unlock();
    if (!ownsFullscreen) return;
    ownsFullscreen = false;
    if (document.fullscreenElement === root) {
      try { Promise.resolve(document.exitFullscreen?.()).catch(() => {}); } catch {}
    }
  }
  function fullscreenChanged() {
    if (ownsFullscreen && document.fullscreenElement !== root) {
      ownsFullscreen = false;
      unlock();
    }
  }
  document.addEventListener('fullscreenchange', fullscreenChanged);
  async function request() {
    if (!document.fullscreenElement && root.requestFullscreen && document.fullscreenEnabled !== false) {
      try {
        await root.requestFullscreen();
        ownsFullscreen = document.fullscreenElement === root;
      } catch {}
    }
    if (!active) { release(); return; }
    const inFullscreen = document.fullscreenElement;
    if (orientation?.lock && !ownsLock) {
      try {
        await orientation.lock('landscape');
        ownsLock = true;
        if (!active || inFullscreen && document.fullscreenElement !== inFullscreen) unlock();
      } catch {}
    }
    if (!active) release();
  }
  function leave() { active = false; release(); }
  return {
    enter(mode) {
      if (mode !== 'touch') { leave(); return; }
      active = true;
      if (!pending) pending = request().finally(() => { pending = null; });
      return pending;
    },
    leave,
    portraitBlocked(mode) {
      return mode === 'touch' && window.innerHeight > window.innerWidth;
    },
    dispose() {
      leave();
      document.removeEventListener('fullscreenchange', fullscreenChanged);
    }
  };
}
