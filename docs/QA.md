# Milestone 1 verification

Verified on 2026-10-04 with Node.js 24.19.0 and the Codex in-app browser at 1280 × 720.

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
- The open front/right and missing roof are deliberate cutaway presentation choices; collision bounds still enclose the play space.
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
