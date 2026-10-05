# Milestone 1 verification

Verified on 2026-10-04 with Node.js 24.19.0 and the Codex in-app browser at 1280 × 720.

## Clover House revision 0.2.0

- **56 Node tests pass.** The actual furnished level is instantiated in tests. Coverage includes den escape, floor traction, both stairways in both directions, the main downstairs circuit, the rear-room loop, the full upstairs/garden loop, both hidden indoor passages, the hedge passage and front/side exterior access.
- All eight window clearances and standing-adult clearance at wide doors are checked. A normal-hop test crosses a real interior window. All six designed furniture routes (sofa, coffee table, dining table, craft crates, bed, studio desk) are reachable with normal hops.
- Ten explicit blanket/mattress landing regressions pass. Every solid-box render mesh is compared against its actual physics bounds. Floors and ceilings remain collidable when their art is hidden by the cutaway.
- **28 browser input/menu checks pass** for actual keyboard/mouse handlers, left-click failures, ball spawning/persistence, den escape, map pause, floor selection, seven discoveries and the garden tour.
- **20 browser route checks pass.** The route runner uses real held-key events and read-only DOM position telemetry, without teleports or an alternate controller. It walks from the den through the entrance, indoor stairs, reading room, balcony, garden stairs, backyard and back inside.
- The 10,000-ball benchmark retained every ball with finite positions/velocities after three simulated seconds. On this Windows machine the final-second physics median was **9.63 ms**, p95 **12.62 ms**, with 560 active bodies. Rendering is excluded; this is not a cross-device frame-rate guarantee.
- JavaScript parsing and local server asset/private-file smoke checks pass. The Unix launcher passes Bash syntax validation. GitHub Actions verifies Node tests and the static build on Windows/macOS/Linux, plus actual launcher/server startup on macOS/Linux.

The [Windows, macOS, and Linux jobs passed](https://github.com/xuefei1/ShidansAdv/actions/runs/37258968085) for the level release. The macOS runner successfully started the game through the executable `.command` launcher and served the required assets.

Browser review covers the den proportions, title, floor plan, cutaways, both floors and rear garden view. Floor plank overlaps and pen-mat z-fighting were corrected during visual review. The game has no runtime network asset dependencies.

A macOS CI pass covers startup, module serving, tests and build. macOS Safari/graphics/trackpad behavior has not been manually tested on this Windows development computer. Pointer-lock denial uses the tested drag fallback.

## Revision 0.1.1 — scale, mouse input and poop

Final verification: 37 automated tests, 20 browser integration checks, and the static distribution smoke test pass. The built game also received a real left click, eight right clicks (eight visible balls), and a camera drag without game errors.

The environment is 50% larger on each axis, with visual meshes, colliders, den, stairs, bounds, overview, shadows and minimap updated together. The rabbit remains unscaled. Charged escapes are tested from both the center of the den and its fence.

Mouse handling no longer calls `setPointerCapture`. Synchronous pointer-lock exceptions and rejected promises both fall back to dragging. Only the transition from an actual active lock to an unlocked state pauses the game. Left/right actions are separate; context menus do not duplicate poop spawns. Fatal UI is limited to errors from the game's own modules, preventing unrelated host/extension errors from replacing the game screen.

Additional automated coverage: throwing/rejecting/pending pointer-lock requests, right-click counts, inactive menus, lock-loss transitions, sphere gravity/sleep/persistence, upper and lower floors, walls, ceilings, den fence, sphere-sphere momentum transfer, rabbit push/wake, coincident spawns, stairs, and oldest-first eviction at exactly 10,000 balls. `node scripts/benchmark-poop.mjs` exercises 10,000 balls in the actual house and reports simulation cost and finite state.

The 10,000-ball run retained all balls with finite positions/velocities after three simulated seconds; the final-second physics median was 14.33 ms and p95 was 16.81 ms on this machine (rendering excluded). These are local measurements, not a cross-device frame-rate guarantee. A spawn sweep also prevents dropping through a fence or wall when Shidan stands right beside it.

## Automated physics tests

Run `node --test`. The tests instantiate the **actual furnished house's collision world**, without a renderer.

Coverage: den dimensions/spawn, continuous fence blocking, normal jump height, charged escape and wood landing, no long jump on wood, long jump on carpet, wood acceleration/friction, upstairs/downstairs traversal, ground-floor access under the upper floor, couch blocking, landing on the upper floor, ceiling collision, low-framerate fence collision, input cancellation on pause, comparable movement across frame rates, and a navigable route from the upper landing to the reading nook.

## Browser integration runner

Open `/tests/browser.html` on the development server. The runner uses DOM input events against the real main game inside an iframe, not a mock controller. Check its green PASS results. Keep the tab foreground during the short run; focus loss intentionally pauses the game.

Coverage: scene initialization, play flow, held WASD, reset, fast Space taps between render frames, full charge, clearing fence height, wood surface/objective update, pause freeze, resume, house overview, return from overview and back-to-title. It also checks that the fatal-error UI stays hidden.

Browser tooling in this environment does not grant pointer lock; drag-to-look is the exercised fallback. A native browser drag changed camera yaw/pitch from (-0.45, 0.39) to (-1.08, 0.55), independently of Shidan's position. Native pointer-lock mouse capture needs a playtest in a regular desktop browser. The fallback is always available when capture is refused.

## Visual verification

Inspect title screen, Shidan's nose/paws/ears, open-topped den, the house-tour overview and follow camera. Check that the house includes both levels, furniture, stairs and the balcony. Check that menus and control hints remain readable at 1280 × 720.

## Known boundaries

- Desktop keyboard/mouse prototype; no touch or gamepad support yet.
- Intended light cartoon style uses procedural geometry, not a final rigged character or detailed anime assets.
- Original short sound effects only; no background music.
- No enemy, happiness scoring, interaction system, player names, leaderboard, round timer or bedtime behavior in milestone 1.
- Clover House has real walls and open door/window apertures. The missing roof and automatic upper-floor cutaway are presentation choices; physical walls, floors and ceilings remain solid.
- Shidan can push dynamic poop spheres. Furniture is still static; there is no general-purpose rigid-body furniture simulation.
- Poop persistence is scoped to the loaded page session, not a saved game across browser reloads.
- Decorative food and books are not collectible yet; the UI describes this as exploration.

## Release checks

1. `node scripts/check.mjs`
2. `node --test`
3. Browser input runner and visual review.
4. `node scripts/build.mjs`, then smoke-test the `--dist` server.
5. Confirm `pic/`, `.env`, credentials and build output are absent from staged files.
6. Commit and push without rewriting existing history.
