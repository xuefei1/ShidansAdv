# Shidan’s Adventure — design foundation

## Creative brief

Shidan is a beloved black pet rabbit with a small white nose marking and white feet. The player inhabits her world from a rabbit-height third-person perspective. She likes rabbit food, vegetables, fruit, clean water, and chewing cardboard, books and wires. The tone is playful and affectionate, with the readable silhouettes and light colors of a cozy cartoon/anime world. Eden Eternal is a visual mood reference; no assets from it are copied.

The full game is a score chase before the masters go to sleep. Shidan begins in her circular, open-topped daytime den. She must use a long jump to escape, find happiness in the house, and avoid being caught and returned to the den. At bedtime the cotton cover ends the round. The player enters a name and their final score appears on a leaderboard.

## Milestone 1 scope

Establish the home, Shidan and movement before adding pressure or punishment. There is no timer, enemy, feeding system or final score yet. Decorative food and books communicate future interaction locations. The three exploration tasks teach den escape, stairs and safe carpet.

### House layout

- Footprint: approximately 24 × 21 m, Y-up and metre-based coordinates. The entire environment is 1.5× the original authored layout after the user's scale feedback; Shidan remains unchanged.
- Ground floor: wood throughout except the den bedding; living room in front, kitchen and dining underneath the rear upper floor.
- Den: center (-6.75, 0, 4.65), 2.25 m radius, 1.65 m white fence. No daytime lid. A folded cotton cover is nearby as a future bedtime cue.
- Stairs: right-hand side, approximately 3.45 m wide, from z=7.05 to z=-4.05, reaching y=5.1. Individually modeled steps use a continuous collision ramp for smooth movement.
- Upstairs: carpeted bedroom, study and reading nook, open balcony, connected landing. The double-height front room keeps the space readable and offers later stealth sightlines.
- Open front/right cutaway and no roof make the house tour legible. Invisible outer bounds prevent falling out of the house. Interior furniture remains solid.
- Tabletop and leg colliders permit under-table routes. Couch, bed, cabinets, plants and railings provide future visual cover. Noise/visibility occlusion is not implemented yet.

### Shidan’s model

The three user photographs in `pic/` were inspected locally. Defining details are the compact black body, long upright ears, dark eyes, small white nose patch, white toes and dark tail. The original model uses procedural meshes and a simple part hierarchy, so it can be adjusted directly in code without Blender. Animation is procedural: breathing, blinking, small ear movements, synchronized paws, crouch and jump poses.

This is a stylized first-pass model, not a final skinned character mesh. Ear tips are excluded from the compact body collider to avoid snagging on every surface.

### Movement

WASD moves relative to the independently orbiting camera. Shift raises target speed; acceleration and stopping depend on the surface. Pressing Space starts a crouch, releasing it jumps. A very short press produces a hop; holding for roughly 0.65 seconds reaches full charge. A charged jump on bedding/carpet clears the fence. On wood/stairs the same input produces only a small hop.

Current tuning, intended for playtesting:

| Surface | Walk m/s | Run m/s | Acceleration m/s² | Long jump |
| --- | ---: | ---: | ---: | --- |
| Bedding | 2.1 | 4.3 | 19 | Yes |
| Carpet | 2.35 | 4.8 | 18 | Yes |
| Wood | 2.1 | 4.5 | 3.2 | No |
| Stairs | 2.2 | 3.5 | 13 | No |

Gravity is 16 m/s², normal jump impulse 4.2 m/s, fully charged impulse 8.25 m/s. Charged jumps recover forward momentum after brushing the fence, making escape work both from the center and beside the taller fence. These exaggerated arcade values prioritize reliable den escape. No stamina limitation in milestone 1. A small step allowance makes the stair-to-landing transition reliable. Simulation substeps prevent tunnelling at low frame rates.

### Poop balls (milestone 1 revision)

Right-click the game to drop one 0.065 m radius brown ball behind Shidan. There is no cooldown or timed disappearance. Balls collide with the room, furniture, ceilings, den fence, stairs, other balls and Shidan's heavier capsule; Shidan can push them. They remain through pause, return-home and title navigation. The current page session holds 10,000 balls, replacing only the oldest when a new ball would exceed the cap. Reloading starts a new session; disk persistence is not part of this prototype.

The balls use a fixed-capacity instance pool, spatial collision grids, and sleeping bodies that wake on contact. Sleeping preserves collision and rendering. They are rendered in one instanced draw instead of creating 10,000 independent meshes. The sphere solver is intentionally separate from the rabbit's kinematic controller.

## Planned stealth and happiness systems

The mistress initially reclines on the couch using her phone. She occasionally laughs, masking action noise. Shidan’s jumps, sprinting, long jumps and chewing create noise events with configurable radius and intensity. Distance, cover and laugh timing become the core decisions. Direct line of sight can reveal Shidan even during laughter. After detection, the mistress pursues; capture returns Shidan to her den and costs time.

Future enemy states: distracted, laughing, suspicious, pursuing, searching, returning and capture. Navigation must understand furniture, floors and stairs. Sound effects and AI noise events must be separate so muting audio never changes difficulty.

Food and chewing award configurable happiness points. Each interaction should have a readable prompt, duration, sound profile and depletion state. Clean water may become a small safe activity. Values and round duration are intentionally undecided until traversal and capture are fun.

Bedtime ends the round, places the cotton cover over the den and records the final score with the entered name. Start with a local leaderboard with clear persistence behavior; an online leaderboard needs a separate backend and validation decision.

## Technical decisions

- Three.js 0.180.0, pinned locally: instant browser play, low setup overhead, no proprietary editor or asset pipeline.
- Plain ES modules and Node built-ins: no package-install step or runtime CDN dependence.
- Custom kinematic rabbit controller plus a sphere-only dynamic solver for poop balls. General-purpose dynamic furniture remains a later engine decision.
- Static mesh batching groups house geometry by material, reducing draw calls. Rabbit parts stay separate for animation.
- A local Node server binds only to 127.0.0.1 and serves an explicit allowlist. Personal reference photos never enter the web build.
- Camera casts against collision boxes to shorten its orbit near furniture and floors. The wire den is excluded from camera collision so the rabbit remains visible from outside the fence.
- Optional original synthesized effects are muted by default. Background music is deferred until a suitable track is selected.

## Next feedback to collect

Playtest Shidan’s likeness, camera distance, slippery-floor feel, charge timing and the overall scale of the house. These do not block milestone 1. Refine this foundation before adding the mistress and a timed scoring loop.
