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
- The complete pitched pastel roof and ceilings remain visible during ordinary play. Front-wing ceilings sit at y=3.9 m; the rear upper rooms and central stair hall have ceilings at y=8.1 m so both floors and the stair route stay clear. The shell costs five drawing submissions: two ceiling batches and three roof sections. Upstairs rooms appear before reaching either staircase, and exterior play reveals the upper facade. V and house tours initially hide both roof and ceilings for floor-plan inspection, with floor selection and a garden angle. The Show roof / Look inside control switches between the complete shell and the open cutaway in these survey views. M opens the paused floor plan. Visibility changes preserve physical floors and ceilings.
- 32 glazed exterior windows provide views through all four elevations. White crossbars and pale glass distinguish them from the eight blue-framed open jump windows. The panes collide with Shidan and poop balls and are excluded from navigation portals.

### Shidan’s model

The three user photographs in `pic/` were inspected locally. Defining details are the compact black body, long upright ears, dark eyes, small white nose patch, white toes and dark tail. The original model uses procedural meshes and a simple part hierarchy, so it can be adjusted directly in code without Blender. Animation is procedural: breathing, blinking, small ear movements, synchronized paws, crouch and jump poses.

This is a stylized first-pass model, not a final skinned character mesh. Ear tips are excluded from the compact body collider to avoid snagging on every surface.

### Movement

WASD moves relative to the independently orbiting camera. Shift raises target speed; acceleration and stopping depend on the surface. Pressing Space starts a crouch, releasing it jumps. A very short press produces a hop; holding for roughly 0.65 seconds reaches full charge. A charged jump on bedding, carpet, grass or the balcony clears the fence. Each day grants one free charged-jump launch when Shidan starts inside the den and moves outward. Stationary charged jumps still cost the normal 5–10 energy, and small hops do not use the allowance. Home and manual title navigation preserve whether it has been spent; a new day renews it. On wood/stairs the same input produces only a small hop.

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

### Poop balls and carried supply

Right-click the game, or press P on a trackpad, to spend one carried ball and drop a 0.065 m radius brown ball behind Shidan. Each day starts with ten carried balls, with a maximum of fifty and a one-second active-play cooldown between drops. Empty supply and cooldown prevent a drop without spending anything. Balls collide with the room, furniture, ceilings, den fence, stairs, other balls and Shidan's heavier capsule; Shidan can push them. They remain through pause, return-home and title navigation. The map holds 1,000 dropped balls, replacing only the oldest when a new drop would exceed the cap. Bedtime or reloading starts a new session; disk persistence is not part of this prototype.

`poop-supply.js` separates carried supply from the sphere pool. Fully consumed carrots, books, apples, rabbit food, bananas and bread grant five balls; ordinary hay grants ten; noodles and cake grant fifteen. Other finite items grant none. All grants stop at fifty. Special den hay grants ten once per den visit, including the starting visit: actual travel outside the den followed by landing inside renews the allowance, while jumping vertically or repeated eating does not. The visit's reward is spent even when carried supply is already full. This gate affects only the ball reward; permanent hay's four-second full-energy refill remains repeatable.

Hold left-click near a dropped ball for one uninterrupted second to consume it. Completion removes that exact physical/rendered ball and grants five energy over the normal recovery period, with no happiness or carried-ball reward. Ball eating uses grounded reach and obstruction checks, cannot transfer progress between targets, and does not enter the regular-snack count or restock pool.

The balls use a fixed-capacity instance pool, spatial collision grids, and sleeping bodies that wake on contact. Sleeping preserves collision and rendering. They are rendered in one instanced draw instead of creating 1,000 independent meshes. The sphere solver is intentionally separate from the rabbit's kinematic controller. Removing an eaten ball preserves other live ball identities and permits later reuse of the freed capacity.

## Milestone 2 — energy and consumables (0.3.1)

The requested second milestone adds an energy loop to the exploration foundation. `energy.js` owns the 100-point meter, charge-based 5–10 point jump cost with a first-outward-den-jump allowance each day, passive recovery at 0.01 points/second, and food recovery spread over one second. Sprint drain includes passive recovery, giving exactly 30 seconds from full to empty while continuously sprinting. The controller charges only moving sprint input, not standing/blocked Shift or crouching. At exhaustion it returns to ordinary movement and requires Shift release before another sprint; unaffordable charged leaps become free small hops. Existing surface-specific jump restrictions remain.

`consumable-data.js` defines the original nine snack kinds and 41 authored starting placements outside the den, plus the later chewables and poop-ball rewards described below. The shared spawn pool excludes the den plus 0.4 m of clearance, keeping both initial items and restocks away from its fence. `consumable-system.js` keeps the simulation independent of rendering: reward-scaled uninterrupted holds, nearby grounded reach, wall/floor/den-fence occlusion, removal, and restock timers. Hold progress never transfers between items. Releasing, leaving reach, or opening a menu cancels it. One press consumes one item even at full energy.

Permanent special hay is a separate recovery point inside the den, reachable from the reset position. A four-second uninterrupted hold refills energy immediately to exactly 100 and clears pending food recovery. This follows the consumption formula using a 100-energy reward. Interrupted holds grant nothing. The hay requires grounded reach inside the den and obeys obstruction checks; it never disappears, never enters the finite snack count or random pool, and requires a fresh press for each use. An exhausted rabbit can therefore recover and perform a charged escape after returning home.

The current regular-snack pool contains eight kinds and starts with 40 items. While fewer than two regular snacks remain, each 60 seconds of active play adds one. The kind is sampled with weight `1 / energy`, before choosing a vacant place associated with that kind. At two regular snacks remaining the timer stops and resets. Cake is excluded from this count and pool: the single cake returns to its reserved original location 120 seconds after full consumption, including when it was pushed elsewhere before being eaten. Counts and exact rewards are listed in README.md. Pauses, maps, tours, title, and hidden tabs freeze resource time; home/title navigation retains energy, pending rewards and remaining items until bedtime or page reload.

`consumables.js` gives each kind original procedural geometry. Hay is a cylindrical sheaf of fine, bent grass blades with uneven tips and a thin twine tie. The larger special bundle has a cream dish and mint bow, merged into one extra drawing batch. Each finite kind/floor shares an instanced mesh, limiting all food objects to 19 drawing submissions plus a nearby-item ring and particle batch. Selected items wiggle during eating. Finite snacks then lift, shrink, and release golden particles, becoming unavailable immediately; their visual effect lasts 0.65 seconds. The permanent stack releases particles while staying visible. Neither consumables nor particles cast into the cached sunlight map. The upper collectible layer follows the house cutaway.

Happiness, cardboard/wire interactions and drinking are implemented in the extensions below. AI noise events remain future work.

## Daylight and bedtime (0.4.0)

`day-cycle.js` owns a 600-second active-play clock, independent of the capped physics step. It settles elapsed time whenever play is paused or resumed, preventing pause intervals from being charged on the next frame. Pause, title, map, house view and hidden-tab states stop it; returning to the den with R/Home does not restart it. Full night starts at 480 seconds elapsed, leaving 120 seconds of lamplit exploration. The upper-right HUD shows time until bedtime, the current phase and happiness. The original Clover House header banner and curiosity panel have been removed. Energy and bladder meters sit on the left, with carried poop supply below. Poop and pee cooldowns display decimal seconds, with a progress bar during the pee action. The map/discoveries button is attached to the minimap, remaining visible in compact form on narrower or shorter screens.

`day-lighting.js` smoothly blends blue noon, warm dusk and cool night sky/ambient/direct lighting, with stars and a moon fading in. The sun direction remains fixed to reuse the cached sunlight shadow map. Eighteen authored ceiling/floor fixtures have physical collision; two instanced diffuser meshes share one animated emissive material. Four constant, unshadowed point lights follow the nearest lamp locations by rabbit position, preserving shader variants and fading replacements rather than switching on camera turns. This approximates local lighting without adding per-lamp shadow passes. The sky is one low-detail gradient dome plus star and moon draws.

At expiry, the game clears held input, closes overlays and returns to the title. `adventure-session.js` resets energy/recovery, snacks/restock/visual effects, the ball pool/colliders, carried supply, den-reward eligibility, bladder, drinking cooldown and puddles; discoveries, camera and clock also reset. The house and renderer are reused. Manual title navigation continues to preserve the current round. `start.js` supplies normal real time; the development-only daylight preview injects a controlled clock to verify the same game code.

The Escape menu's **Restart game** command uses a complete fresh-round reset, rather than the old return-to-den action. It abandons the partial score without saving it, retains the same player name and completed leaderboard, and restores noon/600 seconds, zero happiness, full energy, ten carried balls, an empty bladder, full fountain reserves, authored items and unused first-den-jump allowance. Dropped balls, puddles, discoveries, pending recovery, interactions and cooldowns are cleared. The existing R/Home action still returns Shidan to her den while preserving the active round.

Happiness points and the local leaderboard are implemented below. A target score and cotton-cover animation remain future work.

## Happiness and chewables (0.5.0)

`happiness.js` owns named rounds and local completed-score persistence. Only completed consume events add points. A round keeps its name and score through pause, home and manual title navigation. At bedtime it saves exactly once before resource reset, including zero scores; new rounds start at zero. The board keeps all valid runs and displays the highest ten, with earlier finish times breaking ties. Names are normalized and limited to 24 characters, then rendered with textContent. Invalid saved rows are discarded; storage failures retain session results and show a clear message. Browser QA injects isolated storage to avoid test rows in real scores.

Food rewards (energy / happiness) are carrot 20 / 10, ordinary hay 25 / 0, apple 25 / 50, rabbit food 20 / 80, banana 20 / 40, bread 30 / 20, noodles 30 / 10 and cake 50 / 150. Books give 10 energy and 20 happiness. Cake takes five seconds to consume and has its own 120-second respawn at its original reserved location, with at most one available. The other eight regular snack kinds retain the shared below-two restocking rule; cake neither participates in nor suppresses that pool. Wire = 150 happiness / 0 energy / 30-second cooldown; cardboard = 100 happiness / 20 energy / 60-second cooldown; slippers = 200 happiness / 0 energy / 90-second cooldown. Consumption time is `max(1, E / 25 + H / 50)` seconds, rounded up to 0.1 second, using listed energy and happiness rewards. Carrot, ordinary hay and book take 1 second; apple 2; rabbit food 2.4; banana and bread 1.6; noodles 1.4; cake 5; wire 3; cardboard 2.8; and slippers 4. Permanent den hay uses E=100 and H=0, taking four seconds before its instant refill to 100%. It gives no happiness. Cooldowns start after full consumption, use the active-play clock and pause with menus. Each consumed item with a cooldown has an independent replacement deadline.

Ten wire coils begin beside authored appliance/lamp locations. Eight boxes and four pairs of slippers choose random collision-checked floor locations across the level, outside the den. Candidate places are cached once; replacement selection excludes occupied/reserved snack places and the player. All consumables are physical, movable bodies. Shidan pushes them with about 10% contact slowdown, increased to 18% for boxes, so they yield instead of acting as immovable walls. Momentum, friction and gravity carry or settle the props, including falling off tables. Bodies collide with scenery, den fencing, lot boundaries, other loose props and poop balls. Permanent hay can be nudged inside the den, with fence constraints keeping the reusable refill point there.

Finite items remove their bodies only on full consumption and restore them on respawn; permanent hay retains its body after use. Pushed cake and wires respawn at their original authored locations, not at their consumed coordinates. The rabbit and camera distinguish loose consumables from permanent scenery; loose props are not climbable support platforms, while structural furniture and book steps keep their existing climbing collision. Prop and poop interactions wake nearby sleeping bodies as needed. Reset replaces item bodies without rebuilding house geometry or the renderer.

Original procedural models are instanced by kind/floor, adding at most six drawing submissions to the prior food system (25 total possible collectible batches). New TV/oven/computer details are merged with static scenery. Dynamic collectibles never alter the cached sun shadow map.

## Water, bladder and pee

Fourteen fixed fountains cover every authored room/area: the seven ground-floor areas, four upper rooms, balcony, front yard and backyard. Fountains sit beside circulation routes, leaving doors, stair landings, jump routes and hiding passages clear. Their bases have fixed collision and cannot be pushed. Each independently holds 100 bladder percentage points of water at the start of a round. `water.js` owns authored positions, grounded reach, wall/floor/fence obstruction checks and remaining reserves. `fountains.js` supplies original procedural fountain models and puddle rendering.

Hold left-click near a fountain to drink continuously while Shidan performs a nibbling motion. Starting at zero, bladder value rises by exactly ten percentage points per second of drinking, so 0.1 second adds one point. Deduct exactly the accepted bladder gain from that fountain's reserve, limiting it by bladder headroom and available water. Partial drinking leaves the unused reserve available for later; this is capacity-based depletion, not a one-use interaction. The simulation retains fractional progress without rounding to display precision; the HUD displays two decimals. Filling stops at 100% or an empty reserve, and leaving reach, release or a menu stops drinking. The prompt shows remaining water or that the fountain is empty until the next round. Water gives no energy, happiness or carried balls. Food and fountain interactions share the eat/drink prompt while keeping their distinct hold behavior.

Press Q with a positive bladder value and no cooldown to begin a one-second pee animation, gradually draining the bladder to zero and leaving a puddle on the static supporting surface beneath Shidan. The action locks movement, jumping, eating, drinking and pooping until complete. A sixty-second active-play cooldown starts at action onset, blocking another pee or drink; empty-bladder or cooldown Q presses do nothing and do not extend it. Action progress and larger, semibold decimal-seconds readiness appear beside the bladder meter, with a matching carried-poop timer. Actions and cooldowns pause with the round; R/Home and manual title navigation preserve bladder, fountain reserves and cooldown state. Bedtime or Restart game clears these states and refills all fountains to 100. Puddles are visual floor patches with depth separation, rather than obstacles or new movement penalties.

## Planned stealth and happiness systems

The mistress initially reclines on the couch using her phone. She occasionally laughs, masking action noise. Shidan’s jumps, sprinting, long jumps and chewing create noise events with configurable radius and intensity. Distance, cover and laugh timing become the core decisions. Direct line of sight can reveal Shidan even during laughter. After detection, the mistress pursues; capture returns Shidan to her den and costs time.

Future enemy states: distracted, laughing, suspicious, pursuing, searching, returning and capture. Navigation must understand furniture, floors and stairs. Sound effects and AI noise events must be separate so muting audio never changes difficulty.

Food and chewing award the configurable happiness points listed in README.md. Each interaction has a readable prompt, duration and depletion state. Clean water now supplies the bladder activity above. The current round lasts ten minutes; AI responses and further reward balancing remain future work.

Bedtime ends the round, places the cotton cover over the den and records the final score with the entered name. The local leaderboard below is implemented; an online leaderboard needs a separate backend and validation decision.

## Technical decisions

- Three.js 0.180.0, pinned locally: instant browser play, low setup overhead, no proprietary editor or asset pipeline.
- Plain ES modules and Node built-ins: no package-install step or runtime CDN dependence.
- Custom kinematic rabbit controller, a sphere solver for poop balls, and small movable consumable bodies with momentum, friction, gravity and contact slowdown. Structural furniture stays static and climbable; general-purpose dynamic furniture remains a later engine decision.
- Static geometry uses indexed, vertex-coloured batches in 8 m cells, separately for ground, upper and outdoor layers. The camera can reject off-screen cells; compatible pastel colours share materials. Rigid details within each rabbit joint are batched while the joints remain independently animated (11 draws including the contact shadow).
- Shaders and all room geometry buffers are prepared before enabling Play. The 3D drawing buffer is capped at 2.07 million pixels / 1.5× pixel ratio; the HTML interface remains native-resolution. HUD panels use a cream fill instead of live backdrop blur, and unchanged HUD text is not rewritten. Paused, hidden and map-covered scenes stop rendering after one final frame.
- Cached sunlight shadows, local collision queries and sleeping balls remain in place. Ball matrix uploads cover only changed slots, with adjacent ranges combined by Three.js.
- `/tests/performance.html` measures actual camera orbit frame, CPU and asynchronous GPU times. `node scripts/benchmark-render.mjs` compares draw/triangle workload across six locations without a GPU. Neither tool runs in normal play; per-frame GPU profiling requires `?profile=1`.
- A local Node server binds only to 127.0.0.1 and serves an explicit allowlist. Personal reference photos never enter the web build.
- Camera casts against collision boxes to shorten its orbit near furniture and floors. The wire den is excluded from camera collision so the rabbit remains visible from outside the fence.
- Optional original synthesized effects are muted by default. Background music is deferred until a suitable track is selected.

## Next feedback to collect

Playtest Shidan’s likeness, camera distance, slippery-floor feel, charge timing and the overall scale of the house. These do not block milestone 1. Refine this foundation before adding the mistress and a timed scoring loop.


## Surface stability

The house uses actual clearance or clean butt joins between different coloured solids: window/door frames, sills, wall trim, sofa bases/arms, chair backs, crate sides, balcony rails, roof/ceiling junctions, lamp beams and book binding ends. Intentional floor overlays use cached polygon-offset materials while retaining normal depth testing/writing. Normal materials are never globally offset. Thin upstairs floor colours have an 8 mm reveal; the camera near plane varies from 0.06 m only in a squeezed chase view to 0.18 m at normal distances and 0.75 m in the survey, improving depth precision without losing close camera clearance.

The test-only surface audit transforms real mesh triangles, including instances and vertex colours after batching, and clips their projected overlap. It flags positive-area, differently coloured coplanar patches with competing facing/depth state. It ignores shared edges and true crossing shapes. Exposure checks use actual opaque box meshes plus the legal camera envelope, so buried internal faces do not create false failures. Tests cover the full house before/after batching, all consumables, animated rabbit poses, and actual pushing of neighbouring books; reproductions of old defects ensure the checker can detect regressions. No geometric audit runs during gameplay.
