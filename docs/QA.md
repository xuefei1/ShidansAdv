# Milestone 1 verification

Verified on 2026-10-04 with Node.js 24.19.0 and the Codex in-app browser at 1280 × 720.

## Rendering and movement revision 0.2.3

The earlier physics benchmark did not measure rendering. This revision separately measures actual browser GPU work and camera-visible geometry, and leaves the collision layout intact.

- The full 78-test suite covers existing traversal, furniture, windows, slippery wood, outdoor grip and ball collisions, plus transformed vertex/normal/colour preservation, spatial culling, independent animated joints, pixel limits and partial instance-buffer uploads.
- The 30 browser input/menu checks and nine real stair checks pass. Ordinary walking is now 3 m/s on wood/carpet/outdoors and 2.8 m/s on bedding/stairs (roughly 30% faster). Sprint speeds are unchanged. Wood stops in about 0.65 m from the new walking speed; outdoor surfaces still stop immediately.
- Geometry is indexed and batched by compatible shading properties and 8 m spatial cells. RGB differences are stored in linear vertex colours. This keeps the original shapes and lets the renderer cull unseen chunks. Shidan's independently animated joints use 11 draws instead of 50.
- Shaders and room buffers warm up before Play. The 3D drawing buffer is limited to 2.07 million pixels and a maximum 1.5 pixel ratio, while the HTML interface retains native display resolution. Large displays therefore trade some 3D sharpness for lower GPU load. Live HUD blur and repeated unchanged text writes were removed. Pause/map/hidden scenes stop redrawing after their final frame, and only changed ball matrices upload.

Measured on the same Windows/RTX 5070 Laptop GPU, in the Codex browser, at a 1241 × 720 drawing buffer. Each run turns the real camera for six seconds and excludes the first 0.7 seconds. GPU queries are asynchronous; unsupported browsers report no GPU timing. These timings do not include browser compositing.

| Camera-orbit measurement | 0.2.2 | 0.2.3 |
| --- | ---: | ---: |
| Sampled frames | 398 | 397 |
| Median / p95 frame interval | 13.3 / 13.9 ms | 13.3 / 13.6 ms |
| Median / p95 game CPU | 1.2 / 1.5 ms | 0.8 / 1.1 ms |
| Median / p95 GPU render | 2.315 / 5.815 ms | 0.679 / 3.502 ms |
| Median drawing submissions | 132 | 51 |
| Median submitted triangles | 122,554 | 78,494 |
| Frames over 25 ms | 0 | 0 |

Both short runs were already refresh-limited near 75 Hz. The result is about 71% less median GPU rendering time and more headroom; it is **not** a 71% FPS increase, nor a claim to have reproduced every reported intermittent drop.

A second pair used a 3840 × 2160 CSS viewport at device pixel ratio 1. The old build rendered 3840 × 2160; the new budget rendered 1920 × 1080. Median draws fell from 127 to 48, GPU median/p95 from 2.797/4.883 ms to 2.405/4.635 ms, and CPU median from 1.1 to 0.8 ms. Both runs sampled 398 frames, with no interval above 25 ms. GPU clock/load variation means timing gains need not track pixel or triangle reductions. The idle checks observed **zero** draws while paused, **one** on paused resize, successful resume, and **zero** with the map open.

`node scripts/benchmark-render.mjs` sweeps 72 directions at each of six positions using Three's actual frustum/bounds tests (without camera-wall shortening). It measures geometry workload, not FPS. Unique position/normal/UV/colour/index buffer storage drops from **15.73 MiB to 8.46 MiB**; this excludes textures, render targets and other GPU memory.

| Location | Average draws before → after | Average triangles before → after |
| --- | ---: | ---: |
| Den | 142.9 → 63.4 | 133,051 → 79,050 |
| Entrance | 139.5 → 64.0 | 125,207 → 73,646 |
| Stairs | 176.0 → 89.3 | 153,217 → 81,363 |
| Bedroom | 198.4 → 94.3 | 159,833 → 98,139 |
| Balcony | 192.4 → 89.8 | 157,939 → 88,586 |
| Garden | 132.9 → 59.4 | 112,751 → 69,767 |

Repeat the browser comparison with `/tests/performance.html`; it offers preview, 1080p and 4K view sizes and also checks paused rendering, resize repaint, resume and the open map. Keep the test tab active and examine frame counts/long frames before interpreting a run. No runtime profiling queries run without `?profile=1`.

## Clover House revision 0.2.2

- **72 Node tests pass.** New checks cover all 32 transparent glass panes blocking an airborne rabbit and poop from both sides, preservation of the eight open jump windows, glass batching, the independent ceiling slab, both stair reveals and visibility stability near their boundaries.
- Wood acceleration is 9 m/s² and release drag is 4.5 s⁻¹. Measured slide is approximately 0.5 m from walking or 1.8 m from sprinting, between the original tuning and revision 0.2.1. All existing traversal, climbing and outdoor grip regressions still pass.
- **30 browser input/menu checks pass**, including an always-visible ceiling during downstairs play and the optional ceiling cutaway in the house tour.
- **Nine live stair checks pass.** Actual held-key events drive Shidan out of the den, through the entrance and halfway up the indoor stairs. The upper rooms are visible before the first step, both slab and rooms remain visible on the flight, and the shadow revision stays unchanged throughout the climb. The runner stops halfway up for visual inspection.
- The ceiling costs one draw / 12 triangles. All 32 glass boxes merge into two floor-specific batches / 384 triangles total; white frames share existing opaque material batches. Glass uses an unlit tint with no refraction render pass or shadow casting. This retains the existing static-shadow and spatial-index optimizations without rendering all upper furnishings from distant ground rooms.
- The same 3,600-update character benchmark measured **4.72 ms indexed vs 83.07 ms full scan**, with an average of 6.5 candidate solids out of 652. This is a CPU simulation comparison, not an FPS guarantee. Browser background throttling makes its idle frame interval unsuitable for comparing performance.

## Clover House revision 0.2.1

- Den rings now include their missing Z coordinate. Geometry checks compare all eight rings and 112 posts with the collision fence centre/radius. Static batching retains their bounds.
- Perpendicular wall segments meet at faces and split around T-junctions. Every pair of structural wall solids is checked for overlapping volume, preventing the alternating wall-colour artifact.
- Indoor wood accelerates five times faster and sheds momentum much sooner. Outdoor floors and furniture have zero release drift. Sprinting reaches its target within one second and travels at over three times walking speed; low-frame-rate collision and den containment still pass.
- The front lawn extends the lot to 52 × 70 m. The entrance-to-lawn route is open. The invisible boundary retains both an airborne sprinting rabbit and fast balls on all four sides.
- **66 Node checks** cover those fixes plus all previous movement, furniture, mouse and poop regressions. Spatially indexed character motion, floor support and camera rays are compared with full scans across the actual level.
- **28 browser input/menu checks passed**, with visual review of the aligned den, open front yard and wall junctions. The extended live route could not be completed because the preview was throttled in the background and then lost its tab when made visible. Complete controller-level indoor, upstairs, balcony, backyard, hidden-passage and exterior routes pass; the browser runner now also includes the front lawn.
- `node scripts/benchmark-level.mjs`: for 3,600 identical movement updates, median **4.68 ms indexed vs 67.94 ms full scan** over nine samples (about **14.5×** for character physics alone). Queries returned an average of **5.2 nearby solids out of 524**. This is not a whole-game FPS multiplier.
- The same 1280 × 720 den view submitted **132,820 triangles vs 212,620** before the changes (about **38% fewer**). The ground-floor tour measured 156,950 vs 260,928 before the final camera reframing. Sun shadows are cached until the floor cutaway changes; the animated rabbit keeps her contact shadow, and poop balls receive shadows without casting into the static map. No cross-device frame-rate guarantee is implied.
- Parsing, distribution build and HTTP asset/private-file smoke checks pass. Windows/macOS/Linux startup and build verification continue in GitHub Actions. Manual macOS graphics testing remains unavailable on this Windows host.

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
