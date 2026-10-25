# Development roadmap

## Milestone 1 — a home to explore (complete)

- [x] Repository, local launcher, static build, tests and project documentation.
- [x] Original Shidan model based on local photos.
- [x] Pastel furnished two-story house with continuous stair access.
- [x] 3 m den with 1.1 m open-topped white wire fence.
- [x] Third-person camera, WASD, Shift run, tap/charged Space jumps.
- [x] Slippery wood, grippy bedding and carpet.
- [x] Collision, animation, pause/reset and exploration guidance.
- [x] Physics and browser integration verification.

Acceptance: a player can start in the den, long-jump out, explore the ground floor, climb the stairs, visit the reading nook, and return. Reference photos and secrets are excluded from source-control publication.

### Milestone 1 revision (0.1.1)

- [x] Enlarge house, furniture and den by 50%, keeping Shidan's size unchanged.
- [x] Remove unsafe mouse capture and recover cleanly from denied pointer lock.
- [x] One collidable poop ball per right click, with bounce, rolling and rabbit nudging.
- [x] Persistent 10,000-ball pool with oldest-first replacement and no timeout.
- [x] Regression tests for revised traversal, mouse errors, ball collisions and capacity.

### Milestone 1 level revision (0.2.0)

- [x] Replace the compact floor plan with Clover House: 48 × 40 m, connected rooms, 8 m den, balcony and backyard.
- [x] Two stairways form an upstairs–garden–ground loop.
- [x] Open jump windows, two indoor hidden passages and a hedge tunnel.
- [x] Furniture routes with reachable risers; solid blankets, cushions, mattress and quilt.
- [x] Floor plan, minimap, automatic cutaways, garden tour and seven discoveries.
- [x] Actual-controller traversal tests for chase loops, passages, windows and climbing.
- [x] macOS launcher, Mac guide, trackpad P shortcut and Windows/macOS/Linux CI.

This remains milestone 1: the expanded level is ready for the interaction and AI work to follow. Adult-sized door clearance is checked, but NPC navigation and chase balance still need to be implemented and playtested.

## Milestone 2 — energy and little joys (implemented, ready for playtest)

Scope updated on 2026-10-15 to the requested energy/consumable loop.

- [x] 100.00% meter; 30-second sprint capacity; charged jumps cost 5–10.
- [x] Free ordinary movement/tap hops, low-energy fallback, and passive recovery.
- [x] Nine consumable kinds, the requested rewards, and 41 authored starting items on both floors.
- [x] Reward-scaled left-click holds with progress, a one-second minimum, reach and obstruction checks.
- [x] Disappearance particles and one-second energy recovery, capped at 100.
- [x] One new item per minute below two remaining, with inverse-energy probabilities.
- [x] Menus/background freeze resource timers; home/title preserve the session.
- [x] Permanent special den hay restores full energy, allowing exhausted rabbits to escape again.
- [x] Unit coverage and an actual-game browser energy/eating runner.

Acceptance: sprint and charged leaps use the displayed energy; all nine items can be found, consumed and depleted; cancelled holds grant nothing; low supplies replenish at the specified rate. User playtesting remains the final tuning step.

At the energy release, drinking, cardboard/wire interactions, happiness scoring and AI noise events were deferred. Cardboard/wires and happiness are now implemented in the 0.5.0 expansion below; drinking and AI noise remain future work.

## Milestone 3 — the mistress

### Daylight foundation (0.4.0, delivered ahead of pursuit)

- [x] Ten-minute active-play countdown, with full night at two minutes remaining.
- [x] Smooth noon/afternoon/dusk/night sky and room lighting, stars and moon.
- [x] Ceiling and floor lamps on both floors, with bounded rendering cost and collisions.
- [x] Pause-aware clock and automatic bedtime return to title with a clean next run.
- [x] Simulation coverage and an actual-game browser preview/check runner.

Happiness accumulation and end-of-round scoring are implemented in 0.5.0. A required target score remains a later balancing decision.

### Pursuit (planned)

- Character model reclining on the couch, phone and random laughter.
- Line of sight, view cone, action-noise hearing and laughter masking.
- Pursuit, searching, loss of target, and return-to-couch behavior.
- Floor-aware navigation and stairs for the pursuer.
- Capture, return to den and a clear recovery delay.

Acceptance: cover, distance and laughter timing create predictable stealth choices. Captures and escapes work upstairs and downstairs without trapping either character.

## Milestone 4 — before bedtime

- [x] Round clock and day-to-night progression (implemented in 0.4.0).
- Cotton cover and end-of-round sequence.
- [x] Player name entry, final happiness score and persistent local leaderboard (0.5.0).
- [x] Restart flow, score ordering, ties and invalid-input handling (0.5.0).
- Decide separately whether scores should be shared online.

Acceptance: a full timed round can be played, ended, saved and restarted; scores persist through reload and remain associated with the right name.

## Milestone 5 — polish and release

- Final character art, additional animation and visual effects.
- Licensed background music and richer sound, with volume controls.
- Difficulty and scoring balance; accessibility/control settings.
- Performance pass on target hardware and browser compatibility.
- Packaged desktop build or hosted browser release, chosen with the user.

Each milestone should be a tested Git commit or release, with screenshots, updated documentation and a short playtest before increasing scope.

## Happiness expansion (0.5.0)

- [x] Carrot/book happiness, revised book energy, and live happiness HUD.
- [x] Ten authored wire starts, eight random boxes, four random slipper pairs, independent cooldowns and reward-scaled chewing times.
- [x] Movable consumables with mild contact slowdown, momentum, friction, gravity, and collisions with the house, fence, boundaries, other loose props and poop balls.
- [x] Named completed runs, local persistence, top-ten display and graceful storage failure.
- [x] Item population/reward table and regression checks.
- [x] Approved for GitHub publication after local playtesting.


## Consumable physics and complete house shell

- [x] First outward charged den jump each day uses no energy; home/title navigation preserves the used allowance.
- [x] Consumption time follows `max(1, energy / 25 + happiness / 50)`, rounded upward to 0.1 second, with a one-second minimum.
- [x] All consumables can be pushed with about 10% slowdown, or 18% for boxes, while contact lasts. Props yield instead of becoming fixed walls.
- [x] Pushed items retain momentum, settle with friction, fall from tables, and collide with scenery, den fencing, lot bounds, loose props and poop balls.
- [x] Permanent refill hay can be nudged inside the den; pushed cake and wires respawn at their original authored locations.
- [x] Loose consumables are movable bodies rather than climbing platforms; structural furnishings keep their climbable routes.
- [x] Complete pitched pastel roof and ceilings across the house, using two ceiling batches and three exterior drawing batches.
- [x] Front-wing ceilings at 3.9 m; upper rear and central stair-hall ceilings at 8.1 m leave stairs clear.
- [x] Roof/ceilings stay visible in ordinary play; V and house tours initially hide both for inspection, with Show roof / Look inside switching the survey shell; exterior play reveals the upper facade.
