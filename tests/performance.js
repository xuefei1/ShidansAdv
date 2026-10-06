const app = document.getElementById('app'), button = document.getElementById('run'), status = document.getElementById('status'), output = document.getElementById('result');
const size = document.getElementById('size');
size.addEventListener('change', () => {
  const [width, height] = size.value.split('x');
  app.style.width = height ? `${width}px` : '100%'; app.style.height = height ? `${height}px` : '720px';
});
button.addEventListener('click', async () => {
  const w = app.contentWindow, d = app.contentDocument, canvas = d.getElementById('game');
  if (canvas.dataset.ready !== 'true') { status.textContent = 'Wait for the game to load.'; return; }
  button.disabled = size.disabled = true; output.textContent = ''; status.textContent = 'Orbiting; keep this tab active.';
  const oldLock = canvas.requestPointerLock;
  canvas.requestPointerLock = () => Promise.reject(new w.DOMException('Profile drag fallback', 'NotAllowedError'));
  d.getElementById('play').click();
  if (!d.getElementById('pause').hidden) d.getElementById('resume').click();
  const samples = [], start = performance.now(); let pointer = 400;
  const mouse = (type, x) => canvas.dispatchEvent(new w.MouseEvent(type, { button: 0, clientX: x, clientY: 350, bubbles: true }));
  mouse('mousedown', pointer);
  const sample = event => { if (performance.now() - start > 700) samples.push(event.detail); };
  canvas.addEventListener('renderprofile', sample);
  await new Promise(resolve => {
    const turn = now => {
      pointer = 400 - Math.min(1, (now - start) / 6000) * Math.PI * 2 / .003;
      mouse('mousemove', pointer);
      if (now - start < 6000) requestAnimationFrame(turn); else resolve();
    };
    requestAnimationFrame(turn);
  });
  mouse('mouseup', pointer); canvas.removeEventListener('renderprofile', sample); canvas.requestPointerLock = oldLock;
  const metric = (name, p) => { const values = samples.map(s => s[name]).filter(v => v !== null).sort((a,b) => a-b); return values.length ? +values[Math.floor((values.length - 1) * p)].toFixed(3) : null; };
  const result = { samples: samples.length, graphics: { ...JSON.parse(canvas.dataset.graphics), width: samples[0]?.width, height: samples[0]?.height }, viewSize: size.value, frameMedian: metric('frameMs', .5), frameP95: metric('frameMs', .95), cpuMedian: metric('cpuMs', .5), cpuP95: metric('cpuMs', .95), gpuMedian: metric('gpuMs', .5), gpuP95: metric('gpuMs', .95), callsMedian: metric('calls', .5), trianglesMedian: metric('triangles', .5), framesOver25ms: samples.filter(s => s.frameMs > 25).length, framesOver100ms: samples.filter(s => s.frameMs > 100).length };
  result.shaderPrograms = { first: samples[0]?.programs, last: samples.at(-1)?.programs };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let draws = 0; const countDraw = () => draws++;
  canvas.addEventListener('renderprofile', countDraw);
  d.getElementById('menu-button').click(); await wait(100); draws = 0; await wait(250);
  result.drawsWhilePaused = draws;
  // Resizing must still repaint once while paused.
  const previousHeight = app.style.height || '720px'; app.style.height = `${app.clientHeight + 1}px`;
  draws = 0; await wait(100); result.drawsOnPausedResize = draws;
  app.style.height = previousHeight;
  canvas.requestPointerLock = () => Promise.reject(new w.DOMException('Profile drag fallback', 'NotAllowedError'));
  d.getElementById('resume').click(); draws = 0; await wait(150); result.resumesRendering = draws > 0;
  d.getElementById('map-button').click(); await wait(100); draws = 0; await wait(250);
  result.drawsWithMapOpen = draws;
  canvas.removeEventListener('renderprofile', countDraw); canvas.requestPointerLock = oldLock;
  output.textContent = JSON.stringify(result, null, 2); status.textContent = 'Complete'; button.disabled = size.disabled = false;
});
