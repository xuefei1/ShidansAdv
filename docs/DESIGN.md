# Shidan’s Adventure — design foundation

## Creative brief

Shidan is a beloved black pet rabbit with a small white nose marking and white feet. The player inhabits her world from a rabbit-height third-person perspective. She likes rabbit food, vegetables, fruit, clean water, and chewing cardboard, books and wires. The tone is playful and affectionate, with the readable silhouettes and light colors of a cozy cartoon/anime world. Eden Eternal is a visual mood reference; no assets from it are copied.

The full game is a score chase before the masters go to sleep. Shidan begins in her circular, open-topped daytime den. She must use a long jump to escape, find happiness in the house, and avoid being caught and returned to the den. At bedtime the cotton cover ends the round. The player enters a name and their final score appears on a leaderboard.

## Milestone 1 scope

Milestone 1 established the home, Shidan and movement before adding pressure or punishment. That release had no timer, enemy, feeding system or final score; decorative food and books indicated future interaction locations. Three initial prompts introduce escape, stairs and the balcony; seven optional discoveries encourage furniture climbing and route exploration without a timer. Milestone 2 now adds the energy and consumable system described below.

### House layout — Clover House (0.2.3)

The compact prototype has been replaced with a full connected level, authored directly in metres. See [LEVEL.md](LEVEL.md) for routes and future chase constraints.

- House: 48 × 40 m downstairs; the 48 × 22 m rear upper floor is at y=4.2. The double-height front rooms provide a clear view of the main stairs.
- Den: centre (-16, 0, 12), radius 4 m, white fence 1.1 m high. The greater floor area leaves room to run and charge; the fence remains jumpable.
- Ground rooms: lounge, entrance, kitchen/dining, cross-hall, library, garden room, and craft/laundry room. Multiple doorways and jump windows connect these spaces.
- Upper rooms: bedroom, reading room, studio, and gallery; a 44 × 5 m balcony overlooks the backyard.
- Two broad flights connect ground/upper floor: indoor hall stairs and outdoor garden stairs. Going upstairs opens a loop back through the yard.
- Backyard: 52 × 18 m, with grass grip, stepping stones, raised beds, picnic furniture, tree cover, and a two-ended hedge hideaway. Narrow side paths lead around the house to the front porch.
- Front yard: 52 × 12 m of open lawn, with a central entry path, benches and flower beds. The lot has an invisible boundary instead of enclosing walls.
- Furniture uses deliberately staged rises under 0.42 m. Solid mesh dimensions are also collision dimensions, including cushions, blankets and the quilt.
- Eight open windows have 0.42 m sills; doors are generally 3–3.5 m wide. Two low passages run behind the library shelves and studio linen cupboards. Openings are modeled as actual gaps in walls.
- The ceiling remains visible during play; upstairs rooms appear before reaching either staircase. V opens the house tour with floor selection and a garden angle, including a downstairs ceiling cutaway. M opens the paused floor plan. These change visibility only; physical floors and ceilings stay solid.
- 32 glazed exterior windows provide views through all four elevations. White crossbars and pale glass distinguish them from the eight blue-framed open jump windows. The panes collide with Shidan and poop balls and are excluded from navigation portals.

### Shidan’s model

The three user photographs in `pic/` were inspected locally. Defining details are the compact black body, long upright ears, dark eyes, small white nose patch, white toes and dark tail. The original model uses procedural meshes and a simple part hierarchy, so it can be adjusted directly in code without Blender. Animation is procedural: breathing, blinking, small ear movements, synchronized paws, crouch and jump poses.

This is a stylized first-pass model, not a final skinned character mesh. Ear tips are excluded from the compact body collider to avoid snagging on every surface.

### Movement

WASD moves relative to the independently orbiting camera. Shift raises target speed; acceleration and stopping depend on the surface. Pressing Space starts a crouch, releasing it jumps. A very short press produces a hop; holding for roughly 0.65 seconds reaches full charge. A charged jump on bedding, carpet, grass or the balcony clears the fence. On wood/stairs the same input produces only a small hop.

Current tuning, intended for playtesting:

| Surface | Walk m/s | Run m/s | Acceleration m/s² | Long jump |
| --- | ---: | ---: | ---: | --- |
| Bedding | 2.8 | 7.8 | 26 | Yes |
| Carpet | 3.0 | 8.5 | 28 | Yes |
| Indoor wood | 3.0 | 8.2 | 9 | No |
| Stairs | 2.8 | 7 | 24 | No |
| Grass / outdoor deck | 3.0 | 8.8 | Immediate grip | Yes |

Indoor wood retains a moderate slide; its drag is 4.5 s⁻¹, and acceleration is 9 m/s². Releasing movement slides about 0.65 m from walking speed or 1.8 m from full sprint, between the original and the very grippy revision. Outdoor ground and balcony surfaces stop immediately, including benches and stepping stones. Airborne steering preserves sprint speed through a normal hop.

Gravity is 16 m/s², normal jump impulse 4.2 m/s, fully charged impulse 8.25 m/s. Charged jumps recover forward momentum after brushing the fence, making escape work both from the center and beside the fence. These exaggerated arcade values prioritize reliable den escape. Small hops recover forward movement after brushing a ledge during takeoff, so the rabbit can clear a 0.42 m sill even from a stop. Their jump height remains unchanged; indoor wood keeps moderate sliding with much faster acceleration. No stamina limitation in milestone 1. A small step allowance makes the stair-to-landing transition reliable. Simulation substeps prevent tunnelling at low frame rates.

### Poop balls (milestone 1 revision)

Right-click the game, or press P on a trackpad, to drop one 0.065 m radius brown ball behind Shidan. There is no cooldown or timed disappearance. Balls collide with the room, furniture, ceilings, den fence, stairs, other balls and Shidan's heavier capsule; Shidan can push them. They remain through pause, return-home and title navigation. The current page session holds 10,000 balls, replacing only the oldest when a new ball would exceed the cap. Bedtime or reloading starts a new session; disk persistence is not part of this prototype.

The balls use a fixed-capacity instance pool, spatial collision grids, and sleeping bodies that wake on contact. Sleeping preserves collision and rendering. They are rendered in one instanced draw instead of creating 10,000 independent meshes. The sphere solver is intentionally separate from the rabbit's kinematic controller.

## Milestone 2 — energy and consumables (0.3.1)

The requested second milestone adds an energy loop to the exploration foundation. `energy.js` owns the 100-point meter, charge-based 5–10 point jump cost, passive recovery at 0.01 points/second, and food recovery spread over one second. Sprint drain includes passive recovery, giving exactly 30 seconds from full to empty while continuously sprinting. The controller charges only moving sprint input, not standing/blocked Shift or crouching. At exhaustion it returns to ordinary movement and requires Shift release before another sprint; unaffordable charged leaps become free small hops. Existing surface-specific jump restrictions remain.

`consumable-data.js` defines nine kinds and 41 fixed placements outside the den. The shared spawn pool excludes the den plus 0.4 m of clearance, keeping both initial items and restocks away from its fence. `consumable-system.js` keeps the simulation independent of rendering: one-second uninterrupted holds, nearby grounded reach, wall/floor/den-fence occlusion, removal, and restock timers. Hold progress never transfers between items. Releasing, leaving reach, or opening a menu cancels it. One press consumes one item even at full energy. There is no inventory or happiness score in this revision.

Permanent special hay is a separate recovery point inside the den, reachable from the reset position. The same one-second hold refills energy immediately to exactly 100 and clears pending food recovery. Interrupted holds grant nothing. The hay requires grounded reach inside the den and obeys obstruction checks; it never disappears, never enters the finite snack count or random pool, and requires a fresh press for each use. An exhausted rabbit can therefore recover and perform a charged escape after returning home.

While fewer than two finite items remain, each 60 seconds of active play adds one item. The kind is sampled with weight `1 / energy`, before choosing a vacant place associated with that kind. If the single cake spot is occupied, another vacant food spot is used. At two remaining the timer stops and resets. Counts and exact rewards are listed in README.md. Pauses, maps, tours, title, and hidden tabs freeze resource time; home/title navigation retains energy, pending rewards and remaining items until bedtime or page reload.

`consumables.js` gives each kind original procedural geometry. Hay is a cylindrical sheaf of fine, bent grass blades with uneven tips and a thin twine tie. The larger special bundle has a cream dish and mint bow, merged into one extra drawing batch. Each finite kind/floor shares an instanced mesh, limiting all food objects to 19 drawing submissions plus a nearby-item ring and particle batch. Selected items wiggle during eating. Finite snacks then lift, shrink, and release golden particles, becoming unavailable immediately; their visual effect lasts 0.65 seconds. The permanent stack releases particles while staying visible. Neither consumables nor particles cast into the cached sunlight map. The upper collectible layer follows the house cutaway.

Happiness points, drinking, cardboard/wire interactions, and AI noise events from the earlier milestone sketch remain future work.

## Daylight and bedtime (0.4.0)

`day-cycle.js` owns a 600-second active-play clock, independent of the capped physics step. It settles elapsed time whenever play is paused or resumed, preventing pause intervals from being charged on the next frame. Pause, title, map, house view and hidden-tab states stop it; returning to the den does not restart it. Full night starts at 480 seconds elapsed, leaving 120 seconds of lamplit exploration. The HUD shows time until bedtime and the current phase.

`day-lighting.js` smoothly blends blue noon, warm dusk and cool night sky/ambient/direct lighting, with stars and a moon fading in. The sun direction remains fixed to reuse the cached sunlight shadow map. Eighteen authored ceiling/floor fixtures have physical collision; two instanced diffuser meshes share one animated emissive material. Four constant, unshadowed point lights follow the nearest lamp locations by rabbit position, preserving shader variants and fading replacements rather than switching on camera turns. This approximates local lighting without adding per-lamp shadow passes. The sky is one low-detail gradient dome plus star and moon draws.

At expiry, the game clears held input, closes overlays and returns to the title. `adventure-session.js` resets energy/recovery, snacks/restock/visual effects, and the ball pool/colliders; discoveries, camera and clock also reset. The house and renderer are reused. Manual title navigation continues to preserve the current round. `start.js` supplies normal real time; the development-only daylight preview injects a controlled clock to verify the same game code.

Happiness points, a target score, leaderboard and cotton-cover animation are still future work.

## Planned stealth and happiness systems

The mistress initially reclines on the couch using her phone. She occasionally laughs, masking action noise. Shidan’s jumps, sprinting, long jumps and chewing create noise events with configurable radius and intensity. Distance, cover and laugh timing become the core decisions. Direct line of sight can reveal Shidan even during laughter. After detection, the mistress pursues; capture returns Shidan to her den and costs time.

Future enemy states: distracted, laughing, suspicious, pursuing, searching, returning and capture. Navigation must understand furniture, floors and stairs. Sound effects and AI noise events must be separate so muting audio never changes difficulty.

Food and chewing will award configurable happiness points. Each interaction should have a readable prompt, duration, sound profile and depletion state. Clean water may become a small safe activity. Happiness values remain undecided; the current round lasts ten minutes.

Bedtime ends the round, places the cotton cover over the den and records the final score with the entered name. Start with a local leaderboard with clear persistence behavior; an online leaderboard needs a separate backend and validation decision.

## Technical decisions

- Three.js 0.180.0, pinned locally: instant browser play, low setup overhead, no proprietary editor or asset pipeline.
- Plain ES modules and Node built-ins: no package-install step or runtime CDN dependence.
- Custom kinematic rabbit controller plus a sphere-only dynamic solver for poop balls. General-purpose dynamic furniture remains a later engine decision.
- Static geometry uses indexed, vertex-coloured batches in 8 m cells, separately for ground, upper and outdoor layers. The camera can reject off-screen cells; compatible pastel colours share materials. Rigid details within each rabbit joint are batched while the joints remain independently animated (11 draws including the contact shadow).
- Shaders and all room geometry buffers are prepared before enabling Play. The 3D drawing buffer is capped at 2.07 million pixels / 1.5× pixel ratio; the HTML interface remains native-resolution. HUD panels use a cream fill instead of live backdrop blur, and unchanged HUD text is not rewritten. Paused, hidden and map-covered scenes stop rendering after one final frame.
- Cached sunlight shadows, local collision queries and sleeping balls remain in place. Ball matrix uploads cover only changed slots, with adjacent ranges combined by Three.js.
- `/tests/performance.html` measures actual camera orbit frame, CPU and asynchronous GPU times. `node scripts/benchmark-render.mjs` compares draw/triangle workload across six locations without a GPU. Neither tool runs in normal play; per-frame GPU profiling requires `?profile=1`.
- A local Node server binds only to 127.0.0.1 and serves an explicit allowlist. Personal reference photos never enter the web build.
- Camera casts against collision boxes to shorten its orbit near furniture and floors. The wire den is excluded from camera collision so the rabbit remains visible from outside the fence.
- Optional original synthesized effects are muted by default. Background music is deferred until a suitable track is selected.

## Next feedback to collect

Playtest Shidan’s likeness, camera distance, slippery-floor feel, charge timing and the overall scale of the house. These do not block milestone 1. Refine this foundation before adding the mistress and a timed scoring loop.
