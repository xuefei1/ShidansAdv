// Browser integration checks use the actual game DOM and keyboard handlers.
// Open /tests/browser.html and click Run. No debug teleport or private game API.
const frame = document.getElementById('app'), results = document.getElementById('results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (label, passed, detail = '') => {
  const li = document.createElement('li'); li.className = passed ? 'pass' : 'fail'; li.textContent = `${passed ? 'PASS' : 'FAIL'}: ${label}${detail ? ` (${detail})` : ''}`; results.append(li);
  if (!passed) throw new Error(label);
};
document.getElementById('run').addEventListener('click', async () => {
  results.replaceChildren(); document.getElementById('run').disabled = true;
  const w = frame.contentWindow, d = frame.contentDocument, canvas = d.getElementById('game');
  const key = (type, code) => canvas.dispatchEvent(new w.KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.replace('Key', '').toLowerCase(), bubbles: true }));
  const pos = () => canvas.dataset.position.split(',').map(Number);
  try {
    check('WebGL scene initialized', canvas.dataset.ready === 'true');
    d.getElementById('play').click(); await wait(150);
    if (!d.getElementById('pause').hidden) d.getElementById('resume').click();
    check('Play enters game', !d.getElementById('hud').hidden && d.getElementById('welcome').hidden);
    const start = pos(); key('keydown', 'KeyD'); await wait(350); key('keyup', 'KeyD'); await wait(100);
    check('Held WASD moves Shidan', pos()[0] > start[0] + .2, pos().join(', '));
    key('keydown', 'KeyR'); key('keyup', 'KeyR'); await wait(100);
    check('R returns to the den', Math.abs(pos()[0] + 4.5) < .02 && Math.abs(pos()[2] - 3.1) < .02);
    key('keydown', 'Space'); key('keyup', 'Space'); await wait(150);
    check('A very quick Space tap is not lost between frames', pos()[1] > .1, `height ${pos()[1]}`);
    await wait(550);
    key('keydown', 'Space'); await wait(750);
    check('Holding Space charges the jump', !d.getElementById('charge').hidden && d.getElementById('charge-percent').textContent === '100%');
    key('keydown', 'KeyD'); key('keyup', 'Space'); await wait(500);
    check('Charged jump clears fence height', pos()[1] > 1.1, `height ${pos()[1]}`);
    await wait(650); key('keyup', 'KeyD'); await wait(450);
    check('Escaping updates the wood surface and objective', canvas.dataset.surface === 'wood' && d.getElementById('step-den').classList.contains('done'), pos().join(', '));
    d.getElementById('menu-button').click(); await wait(80);
    const paused = pos(); key('keydown', 'KeyW'); await wait(250); key('keyup', 'KeyW');
    check('Pause opens menu and freezes movement', !d.getElementById('pause').hidden && JSON.stringify(paused) === JSON.stringify(pos()));
    d.getElementById('resume').click(); await wait(150);
    check('Resume closes menu', d.getElementById('pause').hidden);
    d.getElementById('view').click(); await wait(200);
    check('House view toggle works', d.getElementById('view').textContent.includes('Follow Shidan'));
    d.getElementById('view').click(); d.getElementById('home').click(); await wait(150);
    check('Return from overview restores controls', canvas.dataset.surface === 'bedding');
    d.getElementById('menu-button').click(); d.getElementById('back-title').click();
    check('Back to title restores the title screen', !d.getElementById('welcome').hidden && d.getElementById('hud').hidden);
    check('No fatal browser error', d.getElementById('fatal').hidden);
  } catch (error) { console.error(error); }
  finally { document.getElementById('run').disabled = false; }
});
