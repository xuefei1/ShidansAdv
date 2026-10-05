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

## Milestone 2 — little joys

- Context-sensitive eating, drinking and chewing prompts.
- Food, vegetables, fruit, cardboard, books and wires as data-driven interaction types.
- Happiness points, visible feedback, depletion and respawn policy.
- Action-noise events separate from audible sound effects.
- Improve Shidan’s animations and tune movement after playtesting.

Acceptance: the player can earn and understand happiness, see which actions make noise, and find rewards on both floors. No fake leaderboard or inaccessible interaction props.

## Milestone 3 — the mistress

- Character model reclining on the couch, phone and random laughter.
- Line of sight, view cone, action-noise hearing and laughter masking.
- Pursuit, searching, loss of target, and return-to-couch behavior.
- Floor-aware navigation and stairs for the pursuer.
- Capture, return to den and a clear recovery delay.

Acceptance: cover, distance and laughter timing create predictable stealth choices. Captures and escapes work upstairs and downstairs without trapping either character.

## Milestone 4 — before bedtime

- Round clock and an understandable bedtime warning.
- Cotton cover and end-of-round sequence.
- Player name entry, final score and persistent local leaderboard.
- Restart flow, score ordering, ties and invalid-input handling.
- Decide separately whether scores should be shared online.

Acceptance: a full timed round can be played, ended, saved and restarted; scores persist through reload and remain associated with the right name.

## Milestone 5 — polish and release

- Final character art, additional animation and visual effects.
- Licensed background music and richer sound, with volume controls.
- Difficulty and scoring balance; accessibility/control settings.
- Performance pass on target hardware and browser compatibility.
- Packaged desktop build or hosted browser release, chosen with the user.

Each milestone should be a tested Git commit or release, with screenshots, updated documentation and a short playtest before increasing scope.
