# Shidan’s Adventure

A cozy third-person 3D action adventure starring Shidan, a black rabbit with a white nose patch and white paws. **Milestone 1 is a playable exploration prototype.**

## Play

On this Windows computer, double-click **`Start-Game.cmd`**. It starts the server and opens **http://localhost:4173** in your browser. Keep the server window open while playing. If the game is already running, just open that address.

On any computer with **Node.js 20 or newer**:

```sh
node scripts/serve.mjs
```

No package installation, account, build step, or internet connection is required to play. Three.js is pinned and included locally. Use a desktop browser with WebGL 2 support (Chrome, Edge, or Firefox). If the embedded browser cannot capture the mouse, drag the scene to look around; opening it in a regular browser is also supported.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Camera-relative movement |
| Mouse | Independently orbit the camera; click to capture it |
| Drag the scene | Camera fallback when pointer lock is unavailable |
| Left Shift | Run; acceleration is slower on wooden floors |
| Tap Space | Small hop, triggered on release |
| Hold Space, then release | Charged long jump on bedding and carpet; hold a movement key to travel |
| Scroll wheel | Camera distance |
| C | Center camera behind Shidan |
| V | Toggle an overview of the house |
| R | Return to the den |
| Esc | Pause / resume; releases the mouse |

**First adventure:** charge a jump in the den, release Space while moving to clear the fence, find the stairs on the right, then visit the upstairs reading nook. The exploration checklist is a tutorial, not the final happiness-scoring system.

## Included in milestone 1

- Original pastel, cartoon-style house with an open front for visibility: living room, kitchen, dining area, staircase, upstairs bedroom, study and reading nook.
- Circular den, 3 metres across, with a 1.1-metre white wire fence, bedding, hay, food and water bowls; folded cotton cover nearby.
- Original procedural Shidan model based on the three local reference photos, with black fur, white nose marking, white toes, ears, whiskers and a fluffy tail.
- Breathing, blinking, ear movement, running gait, crouch and airborne poses.
- Third-person orbit camera, running, tap jumps, charged jumps, furniture/ceiling collision, stair traversal and floor-dependent traction.
- Pause/resume, reset, minimap, house tour, three exploration objectives and optional synthesized sound effects.
- Local source control, automated physics checks, browser integration checks, and a static distribution build.

**Later milestones:** edible/chewable interactions and happiness points; the mistress, her phone/laughter, noise and line-of-sight detection, pursuit and capture; a day/bedtime timer and cotton cover; player names and a persistent leaderboard. These are planned, not implemented in this build. No player name is collected yet.

## Develop and verify

```sh
node scripts/check.mjs
node --test
node scripts/build.mjs
node scripts/serve.mjs --dist
```

`npm run dev`, `npm test`, `npm run check`, and `npm run build` are aliases if npm is installed. The plain Node commands also work with the bundled runtime available on this computer.

For input integration checks, run the development server, open **http://localhost:4173/tests/browser.html**, and click **Run input and menu checks**. Keep that tab foreground while the checks run. The runner exercises the actual game input handlers, fast tap buffering, charged escape, pause/resume, overview and title navigation.

The build writes `dist/`, which can be served by any static HTTP host. It has no runtime CDN calls, analytics or backend. Double-clicking `index.html` directly is unsupported because browser ES modules require an HTTP origin.

## Project map

| Path | Purpose |
| --- | --- |
| `src/main.js` | Scene, input, orbit camera, game state and tutorial UI |
| `src/physics.js` | Independent character controller, collision, stairs and traction |
| `src/model.js` | Procedural rabbit model, animation and geometry helpers |
| `src/house.js` | Furnished house, den, level collision and static mesh batching |
| `src/audio.js` | Original Web Audio effects |
| `tests/` | Physics and browser integration checks |
| `docs/DESIGN.md` | Story, game design and implementation decisions |
| `docs/ROADMAP.md` | Milestones and acceptance criteria |
| `docs/ASSETS.md` | Asset origins, licenses and future candidates |
| `docs/QA.md` | Verification and current limitations |
| `vendor/` | Pinned Three.js 0.180.0 with its MIT license |
| `pic/` | Local reference photos; excluded from Git, HTTP serving and builds |

## License

The repository’s original Apache-2.0 license is retained for project code and original assets. Three.js remains under its own MIT license in `vendor/THREE-LICENSE.txt`. Shidan’s personal reference photographs are not distributed. See `docs/ASSETS.md` for attribution and asset provenance.
