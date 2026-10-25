# Shidan’s Adventure

A cozy third-person 3D action adventure starring Shidan, a black rabbit with a white nose patch and white paws. **Explore, snack and recharge during a ten-minute day, from bright noon to a cozy, lamplit night.**

## Screenshots

Captured from the playable v0.3.0 build. Click an image to view it at full size.

| Title screen | Snack time in the sunny lounge |
| --- | --- |
| [![The title screen introducing Shidan in her den](docs/screenshots/title-screen.jpg)](docs/screenshots/title-screen.jpg) | [![Shidan beside a hay bundle, with the energy bar and eating prompt visible](docs/screenshots/lounge-snack.jpg)](docs/screenshots/lounge-snack.jpg) |
| **Exploring the clover backyard** | **A tour of Clover House** |
| [![Shidan exploring the backyard's vegetable beds and stepping-stone path](docs/screenshots/backyard-exploration.jpg)](docs/screenshots/backyard-exploration.jpg) | [![A cutaway overview of Clover House, its furnished rooms, den, stairs, and gardens](docs/screenshots/house-overview.jpg)](docs/screenshots/house-overview.jpg) |

## Play

**Windows:** double-click `Start-Game.cmd`.

**macOS (Apple silicon or Intel):** install [Node.js LTS](https://nodejs.org/en/download) once, then double-click `Start-Game.command`. The launcher opens the game in your default browser. Keep its Terminal window open while playing; Control-C stops the server. If Finder reports a permission problem after downloading a ZIP, open Terminal in the project folder and run `bash Start-Game.command` instead. See [the macOS guide](docs/MACOS.md).

**Any desktop with Node.js 22 or newer:**

```sh
node scripts/serve.mjs --open
```

Open **http://localhost:4173** if the browser does not open automatically. No package installation, account, build step, or runtime internet connection is needed. The game and Three.js engine are included locally. Use a browser with WebGL 2 support. Mouse capture is optional: drag the scene to look around when capture is unavailable, including in browsers with limited pointer-lock support.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrow keys | Camera-relative movement |
| Mouse | Independently orbit the camera; click to capture it |
| Drag the scene | Camera fallback when pointer lock is unavailable |
| Left Shift | Sprint about 2.5–3× walking speed; uses energy while moving |
| Tap Space | Small hop, triggered on release |
| Hold Space, then release | Charged long jump on bedding, carpet, grass, and balcony; hold a movement key to travel |
| Scroll wheel | Camera distance |
| Hold left mouse near an item | Eat or chew for the time shown in its prompt; releasing early cancels. |
| Right mouse click / P | Drop one poop ball behind Shidan |
| C | Center camera behind Shidan |
| V | House tour with floor, garden-view and Show roof / Look inside choices |
| M | Floor plan, route hints, and discoveries |
| R | Return to the den |
| Esc | Pause / resume; releases the mouse |

**First adventure:** charge a jump in the den and release while moving outward to escape. Your first outward charged jump from inside the den is free each day, even with empty energy. Find the hay outside the den and hold left-click nearby to try eating. Press **M** for the floor plan and seven little discoveries: sofa, library passage, upstairs, bed quilt, balcony, backyard, and hedge hideaway. Collect happiness from food, books, wires, cardboard and slippers. AI pursuit remains a later milestone.

## Energy, happiness and consumables (0.5.0)

Energy starts at **100.00%**, displayed to two decimal places. A full bar supports **30 seconds of continuous sprinting**, including passive recovery. Charged jumps cost **5–10 energy**, depending on charge time. Each new day grants one free outward charged jump from inside the den; stationary charged jumps still cost energy. Returning home or visiting the title preserves whether this allowance has been used, and the next day renews it. Ordinary movement and small hops (including charged inputs on slippery wood) are free. Standing still with Shift is free. Empty energy restores ordinary speed; release Shift before sprinting again. A charged jump without enough energy becomes a free small hop.

Passive recovery is **0.01 energy per second**, applied smoothly. Hold left-click near an item for the uninterrupted time shown in its prompt to consume it. Early release, leaving reach, jumping away, and menus cancel the hold. Walls and floors block eating through them. The item shrinks into golden particles and restores energy over **one second**, capped at 100. One press consumes one item. Eating at full energy still uses the item.

Consumption time in seconds is **`max(1, energy / 25 + happiness / 50)`**, rounded up to the next **0.1 second**. Use the item’s listed rewards rather than the energy currently missing from the bar. The special den hay uses 100 energy in this formula, so its full refill takes four seconds. Every item takes at least one second; larger combined rewards take longer.

Each round starts with **41 snacks, 10 cables at authored spots, 8 random boxes, 4 random pairs of slippers, and 1 permanent hay stack**. Happiness is awarded immediately, only after a full uninterrupted hold; energy rewards recover over one further second. The special hay instead refills energy instantly. Energy is capped at 100; happiness has no cap or target yet.

| Item | Initial | Min–max present | Regeneration | Hold | Energy | Happiness |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Special den hay | 1 | 1–1 | Permanent / reusable | 4 s | Refill to 100% | 0 |
| Carrot | 8 | 0–8 | Shared snack rule* | 1 s | +20 | +10 |
| Book | 12 | 0–12 | Shared snack rule* | 1 s | +10 | +20 |
| Hay stack | 6 | 0–6 | Shared snack rule* | 1 s | +25 | 0 |
| Apple | 4 | 0–4 | Shared snack rule* | 2 s | +25 | +50 |
| Rabbit food | 3 | 0–3 | Shared snack rule* | 2.4 s | +20 | +80 |
| Banana | 3 | 0–3 | Shared snack rule* | 1.6 s | +20 | +40 |
| Bread | 2 | 0–2 | Shared snack rule* | 1.6 s | +30 | +20 |
| Noodles | 2 | 0–2 | Shared snack rule* | 1.4 s | +30 | +10 |
| Cake | 1 | 0–1 | 120 s after consumption, original location | 5 s | +50 | +150 |
| Wire / cable | 10 | 0–10 | 30 s per consumed cable, original location | 3 s | 0 | +150 |
| Cardboard box | 8 | 0–8 | 60 s per consumed box, random location | 2.8 s | +20 | +100 |
| Slippers (one pair = one item) | 4 | 0–4 | 90 s per consumed pair, random location | 4 s | 0 | +200 |

*Eight regular snack types share a restock pool: below two regular snacks remaining, one random regular snack appears every 60 seconds, stopping at two. This pool starts with 40 items and excludes cake. This is not a separate cooldown for each regular snack; kind probabilities are weighted by inverse energy. Cake has its own 120-second cooldown and returns only to its original reserved location, even if it was pushed elsewhere before being eaten, with a maximum of one available. Wires likewise respawn at their original appliance or lamp locations. Cake, wires, boxes and slippers never enter or suppress the regular-snack restock pool. Min–max means currently available items, not total spawns over a round; a depleted type may temporarily have zero. Respawn delays count active play, not menus or inactive tabs, and begin after full consumption.

Cables begin beside the TV, oven, library desk, studio computer and six floor lamps. Random boxes and slippers begin at clear, reachable locations on both floors, the balcony, yards and passages, outside the den. Each random respawn chooses a free location, away from Shidan and other items. Every consumable can be nudged or pushed, including food, loose books, cables, boxes, slippers and permanent den hay. Contact slows Shidan by about **10%**, or **18% for boxes**, while the item yields instead of acting as a fixed wall. Items carry a little momentum, slow through friction, and fall under gravity if pushed off furniture. They collide with scenery, the den fence, lot boundaries, other loose items and poop balls.

Fully consuming a finite item removes its body along with the prop; respawning restores both. Permanent den hay keeps its body after use and can be nudged around inside the den, but its fence keeps this recovery point inside. Loose consumables move instead of becoming climbing platforms. The original structural crates, book steps and other furnishings remain solid climbing routes.

Inside the den, **special hay in a cream dish with a mint bow** is within reach of Shidan’s starting position. Hold left-click for **four uninterrupted seconds** to restore energy immediately to **100%**, even from zero. This stack is permanent and reusable; it stays visible after eating and is excluded from the snack count and random restocking. It can be nudged within the den while retaining the same refill interaction. It prevents running out of energy from trapping Shidan inside the fence.

The 41 finite snacks (40 regular snacks and one cake) start and respawn outside the den. The loose collectible books are separate from solid climbing steps. While fewer than **two regular snacks** remain, one appears every **60 seconds of active play**, stopping at two. The choice of kind is weighted by **1 / energy reward**, then placed in a vacant appropriate spot outside the reserved cake location. Cake returns independently **120 seconds** after full consumption, even while other snacks remain. Pause, map, house tour, title, and background tabs freeze resource timers. Home/title navigation preserves supplies, energy, and pending food recovery; reloading starts a fresh session.

## Noon to bedtime (0.4.0)

Each adventure lasts **10 minutes of active play**. The **Until bedtime** clock starts at **10:00**, with bright blue daylight. The sky and household lighting gradually move through afternoon and a peach-and-lavender dusk. By **2:00 remaining** (eight minutes elapsed), the sky is fully night: stars and a moon appear, and ceiling pendants and floor lamps cast warm light throughout the house.

Menus, the map, house view, the title screen, and inactive tabs pause the clock. Returning home or manually visiting the title preserves the remaining time. The timer uses real elapsed time independently of the physics frame cap. At **0:00**, the game returns to the main screen and resets the day, energy, snacks, discoveries and poop balls. Before resetting, the completed happiness score is saved under the player’s name. The next adventure starts fresh at noon with zero happiness.

The 18 fixtures have solid bases, stems and shades. Their glowing diffusers use two instanced batches; four reusable local lights illuminate the nearby rooms without casting extra shadow maps. The day cycle retains the existing cached sun direction and shadows.

## Local happiness leaderboard

Enter a name (up to 24 characters) before playing. The HUD shows the current player and happiness total. At exactly ten minutes, the score and name are recorded, the title displays the result, and **Happiness leaderboard** shows the top ten completed adventures. Every completed run is retained, including zero scores and repeated names; highest scores rank first, with earlier completion breaking ties. No online account or connection is needed.

Records and the last-used name live in this browser’s local storage on this address. Reloading preserves finished scores but abandons the in-progress round. Different browsers, devices, hostnames or ports have separate boards; clearing site data clears saved scores. If storage is blocked or full, play still works and the result clearly says it is kept only for the current page session. Manual title navigation resumes the same named run and never records a partial score.

## Included in milestone 1

- A rebuilt **48 × 40 m house**, an **8 m diameter den**, and a **52 × 18 m backyard**. Shidan remains her original size; the pen fence is 1.1 m high.
- A **52 × 12 m front yard** with a clear entrance path, benches and flower beds. An invisible boundary encloses the full **52 × 70 m lot**, including the side paths.
- Moderate indoor wood slip, firm outdoor grip, and faster sprinting. The den wires align, wall joins do not overlap, and cached shadows plus nearby collision lookup reduce frame work.
- Seven ground-floor areas, including the entrance and cross-hall, three upstairs rooms, a gallery, a full garden balcony, and two usable stairways.
- Interconnected door routes, eight jump-through windows, 32 see-through solid exterior windows, concealed library and linen passages, and a low hedge tunnel.
- Climbable sofa, coffee table, dining table, stacked crates, bed, and desk. Books, poufs, stools and trunks form reachable steps.
- Solid cushions, blankets, mattress, quilt, pillows and furniture layers. Rendered box surfaces and collision share the same dimensions.
- A complete pitched pastel roof and ceilings over the full house. They stay visible during ordinary play; **V** and house tours begin with them hidden for floor-plan inspection. **Show roof** closes the house in the tour; **Look inside** restores the cutaway. Upstairs walls are visible from outside, preserving the two-story exterior.
- Front-wing ceilings at **3.9 m** and rear upstairs / central stair-hall ceilings at **8.1 m**, leaving the full stair route clear. The shell uses five drawing submissions: two ceiling batches and three roof sections.
- Early upstairs reveal on stair approaches, floor cutaways, a floor-aware minimap, full map, garden tour angle, and seven optional discoveries.
- Original procedural Shidan model based on the three local reference photos, with black fur, white nose marking, white toes, ears, whiskers and a fluffy tail.
- Breathing, blinking, ear movement, running gait, crouch and airborne poses.
- Third-person orbit camera, running, tap jumps, charged jumps, furniture/ceiling collision, stair traversal and floor-dependent traction.
- Pause/resume, reset, exploration guidance, and optional synthesized sound effects.
- Right-click poop balls with gravity, rolling, bounce and collisions against the house, fence, stairs, Shidan and one another. Resting balls can be nudged awake by Shidan.
- Up to **10,000 balls** persist during the adventure, including through pause, return-home and manual title navigation. Each additional ball replaces only the oldest. Bedtime or reloading the page starts a fresh session.
- Local source control, automated physics checks, browser integration checks, and a static distribution build.

**Later milestones:** more interaction types; the mistress, her phone/laughter, noise and line-of-sight detection, pursuit and capture; the cotton cover; scoring balance and an optional happiness target.

## Develop and verify

```sh
node scripts/check.mjs
node --test
node scripts/build.mjs
node scripts/serve.mjs --dist
```

`node scripts/benchmark-level.mjs` compares indexed and full-scan character collision on identical movement traces. Read-only `data-performance` on the game canvas reports sampled frame/CPU timing and render counts for local profiling.

`npm run dev`, `npm test`, `npm run check`, and `npm run build` are aliases if npm is installed. The plain Node commands also work with the bundled runtime available on this computer.

For input integration checks, run the development server, open **http://localhost:4173/tests/browser.html**, and click **Run input and menu checks**. Keep that tab foreground while the checks run. The runner exercises actual input, mouse error recovery, poop, fast tap buffering, charged escape, pause/resume, maps, cutaways and title navigation. The separate **Walk the balcony–garden loop** button walks the real game through the entrance, both floors, balcony, garden stairs and back inside. Keep this tab active until it finishes. **Check stair visibility** walks to the middle of the indoor stairs, verifies the ceiling and upstairs reveal, and checks that sunlight shadows remain cached.

For rendering measurements, open **http://localhost:4173/tests/performance.html**, select a view size, and run the six-second camera orbit. Keep the test tab active. It reports frame intervals, CPU work, asynchronous GPU time where supported, and drawing submissions. `node scripts/benchmark-render.mjs` measures visible geometry across six locations; it is not an FPS test.

The build writes `dist/`, which can be served by any static HTTP host. It has no runtime CDN calls, analytics or backend. Double-clicking `index.html` directly is unsupported because browser ES modules require an HTTP origin.

The browser QA page also has **Run energy and eating checks**. It starts a fresh session, exercises sprint/jump costs, interrupted and completed holds, gradual recovery, and home/title persistence. **Check permanent den hay** tests cancelled holds, full refills and repeated use through the actual game controls. Unit tests simulate exhaustion, a refill followed by escape, 30-second sprinting and restocking without waiting in real time.

Open **http://localhost:4173/tests/day-cycle.html** to preview noon/dusk/night or run the countdown checks. This test entry supplies a manually advanced clock to the actual game, verifying menu pauses, night at 2:00, timeout, and a clean restart without waiting ten minutes. Normal play uses the real monotonic clock; preview controls are excluded from the distribution build.

## Project map

| Path | Purpose |
| --- | --- |
| `src/main.js` | Scene, input, orbit camera, game state and tutorial UI |
| `src/start.js` | Production entry point with the real-time clock |
| `src/day-cycle.js` | Ten-minute clock, phase progression and countdown formatting |
| `src/day-lighting.js` | Sky, stars, moon, daylight and fixed local-light pool |
| `src/house-lamps.js` | Ceiling/floor fixtures, collision and instanced glowing diffusers |
| `src/adventure-session.js` | Clean resource reset at bedtime |
| `src/physics.js` | Independent character controller, collision, stairs and traction |
| `src/layout.js` | Room, wall, opening, ramp, and discovery data |
| `src/level-map.js` | Shared minimap and full floor plan |
| `src/mouse.js` | Mouse actions and safe pointer-lock/drag fallback |
| `src/poop-physics.js` | Sphere collision, sleep/wake, spatial indexing and 10k pool |
| `src/poop.js` | Instanced poop-ball rendering |
| `src/model.js` | Procedural rabbit model, animation and geometry helpers |
| `src/energy.js` | Sprint/jump costs, passive recovery, timed food rewards |
| `src/consumable-data.js` | Nine finite item kinds, 41 authored locations, and special den hay |
| `src/consumable-system.js` | Reach/occlusion, reward-scaled holds, item bodies and restocking |
| `src/consumables.js` | Instanced snack models, selection ring, disappearance particles |
| `src/house.js` | House structure, true openings, den, stairs and static batching |
| `src/furnishings.js` | Climbing furniture, blankets, garden and cover |
| `src/audio.js` | Original Web Audio effects |
| `tests/` | Physics and browser integration checks |
| `docs/DESIGN.md` | Story, game design and implementation decisions |
| `docs/LEVEL.md` | Clover House routes, dimensions, climbing and future AI constraints |
| `docs/MACOS.md` | Mac setup, launcher and trackpad controls |
| `docs/ROADMAP.md` | Milestones and acceptance criteria |
| `docs/ASSETS.md` | Asset origins, licenses and future candidates |
| `docs/QA.md` | Verification and current limitations |
| `vendor/` | Pinned Three.js 0.180.0 with its MIT license |
| `pic/` | Local reference photos; excluded from Git, HTTP serving and builds |

## License

The repository’s original Apache-2.0 license is retained for project code and original assets. Three.js remains under its own MIT license in `vendor/THREE-LICENSE.txt`. Shidan’s personal reference photographs are not distributed. See `docs/ASSETS.md` for attribution and asset provenance.
