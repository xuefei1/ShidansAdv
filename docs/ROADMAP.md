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
