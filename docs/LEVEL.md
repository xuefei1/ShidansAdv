# Clover House — playable level design

Clover House has two above-ground floors and a magical basement containing one of five blue frosted-glass maze designs, with 32 solid glazed exterior windows, moderate indoor wood slide, and ceilings that stay visible during play. The layout prioritizes escape choices for pursuit: broad circulation loops, corners that break sightlines, short rabbit-only alternatives, and elevated routes. Food, happiness, the mistress's routine and noise/visibility pursuit are implemented; the current balance is described below.

The library's basement stairwell begins behind a locked fence. Reaching 200 happiness opens the fence and announces the new route with a popup. Shidan can then use the stairs, and the mistress can follow during pursuit. Her normal routine stays above ground. Maze content uses blue paint on the floor and ceiling as well as the four surrounding walls. The unlock lasts through catches, home returns and pauses; starting a new game restores the fence. Tall stairwell fencing prevents jumping around the locked entrance.

## Scale and spaces

Coordinates are metres, X east/west, Z north/south, Y up. The garden is north (negative Z). Shidan is unchanged in size.

| Space | Extents | Design role |
| --- | --- | --- |
| Basement | y −4.2; x −24…24, z −20…20 | 48 × 40 m magical frosted-glass maze scene, perimeter circulation and central reward carpet |
| Ground house | x −24…24, z −20…20 | 48 × 40 m footprint, roughly 3.8× the previous ground area |
| Den | (−16, 12), radius 4, fence 1.1 high | 50.3 m² of bedding, over 3× the previous den area; clear charge runway |
| Lounge | x −24…−5, z 2…20 | Spawn, mistress couch, sofa and table climbing |
| Entrance | x −5…5, z 2…20 | Wide stair approach; two lounge and kitchen door choices |
| Kitchen / dining | x 5…24, z 2…20 | Island circling, table-underpass, chair/trunk climbing |
| Cross-hall | x −24…24, z −3…2 | East–west connection between all six adjacent areas |
| Library | x −24…−5, z −20…−3 | Table cover and single west-side basement staircase |
| Garden room | x −5…8, z −20…−3 | Central backyard access with window alternatives |
| Craft / laundry | x 8…24, z −20…−3 | Crate staircase, appliance cover, second garden door |
| Upper floor | y 4.2; x −24…24, z −20…2 | Carpeted bedroom, reading room, studio and gallery |
| Balcony | y 4.2; x −20…24, z −25…−20 | Two doors and bedroom window; outdoor stairs at east end |
| Backyard | x −26…26, z −38…−20 | Grass, raised-bed loops, picnic cover, stepping logs, hedge passage |
| Front yard | x −26…26, z 20…32 | Clear entry path, two benches, flower beds and side-path connections |

The lot is 52 × 70 m, bounded by an invisible full-height fence at x ±26 and z −38/32. Both Shidan and poop balls collide with this boundary, including while airborne. The old visible perimeter walls have been removed.

The M map is generated from the same room and opening data as the level. V offers floor cutaways and a rear garden angle. Both maps and the house tour support Basement (B1), ground floor and upstairs; the minimap follows the current floor. These are presentation features; hidden upper geometry retains its collision.

During normal play the upper-floor slab stays visible as the downstairs ceiling, and the ground-floor slab remains the basement ceiling around its single stair opening. Upstairs rooms appear one metre before either ground-to-upper stair flight and stay visible through ascent and descent. A wider exit band avoids rapid toggling near the approach. The ground-floor house tour still removes the slab for inspection. The permanent slab is one draw / 12 triangles, and sunlight shadows refresh only when visibility actually changes.

All exterior elevations now have glazed windows: four broad front windows, six per downstairs side wall, three per upstairs side wall, and five extra rear windows per floor. These 32 panes are lightly tinted, transparent and solid to Shidan and poop balls. White crossbars identify closed windows; the eight existing blue-framed jump windows remain open. Closed panes are excluded from navigation portals and appear pale blue on the map. Glass uses one simple rendering batch per floor, with no refraction pass or shadow casting.

## Playable circuits

1. **Downstairs loop:** lounge → entrance → dining → cross-hall → lounge. The kitchen island and table interrupt a straight chase; wide doors keep the main route accessible to a standing adult.
2. **Rear loop:** cross-hall → library → garden room → craft room → cross-hall. Each dividing wall has two doorways plus a low jump window, so a pursuer cannot guard one exit to seal off a room.
3. **Vertical loop:** entrance stairs → upstairs gallery → reading room → balcony → outdoor stairs → backyard → garden door → cross-hall. Both flights are walkable in either direction.
4. **Upper room loop:** gallery → bedroom → reading room → studio → gallery. The studio has an exposed two-level shelf and ramp for climbing and charged-jump escapes.
5. **Outdoor loop:** garden doors / library window → raised beds and hedge → second garden door. The front porch and narrow paths on both sides connect around the exterior.
6. **Frosted-glass maze detour:** library → west stair flight → perimeter loop → one of four maze gates → winding passages / central carpet → another gate → the same house stair flight. Full-height frosted privacy-glass walls use 8% transparency (92% opacity), break direct sight and remain solid without creating protected hiding places. Both pane faces use the same blue, unlit frosted finish so warm lighting cannot turn one side yellow. Their cloudy grain is nonreflective and needs no reflection captures. The four outer basement walls are sky blue. The maze has four entrances/exits within the basement; the house keeps its single basement staircase.

The basement scene changes only when starting a new game. Content type is selected first; it currently always selects a maze, leaving a separate selection step for future basement types. Maze selection then chooses one of five fixed designs: Willow Paths, Ribbon Switchbacks, Clockwork Spiral, Twin Courtyards and Four Winds. The previous round's design is excluded. Every design is a 192-cell frosted-glass maze: a 16 × 12 grid with 2.6 × 3.05 m cell spacing occupying x −19.3…22.3, z −18.3…18.3, inside the ground floor's 48 × 40 m footprint. The enlarged 41.6 × 36.6 m maze uses 26.9% more area than before. The outer walls sit 1.48 m from the north, east and south basement walls, with a 1.54 m walking lane beside the west stair cheek. This preserves all four gate approaches while using more of the basement. Narrower passages fit more walls, with meaningful dead ends and multiple escape routes between entrances and the center. A two-by-two-cell, 5.2 × 6.1 m chamber opens around (1.5, −4.2, 0), with four distinct doorways. Every maze entrance has at least two internally vertex-disjoint approaches to the central chamber. Four outer gate openings connect the maze to its surrounding route, allowing different approaches and exits during pursuit. The 200-happiness fence at the house stairs remains in place until unlocked; catches, home returns and menus preserve both the unlock and maze layout.

Ten to twenty randomly placed bonus consumables are separate from household counts and never respawn, including bonus copies of items that normally regenerate upstairs. The central 2.05 m-radius yellow rug has a large carrot drawing, with no dedicated edible carrot there. It also holds permanent special hay and an original small blue rabbit plush, approximately half Shidan’s height. Four additional fixed fountains have independent 100% reserves. Special hay refills energy completely and grants three carried poop balls once per carpet visit. Holding left-click beside the plush for five uninterrupted seconds emits a dense stream of floating hearts and grants 500 happiness once per game. Cancelling before completion allows another attempt. The interaction is globally audible unless the mistress is actively making masking noise; she can catch Shidan normally during it or on the carpet. New games choose another maze design, replenish supplies and reset the plush reward.

The mistress uses the wide doors and stairs, while Shidan can break sight through small passages and alternate exits. The paths are not intended as permanent invulnerability zones.

## Rabbit shortcuts

- **Eight jump windows:** 0.42 m sills, 2.4–3 m widths. They are open apertures with blue trim, not glass decals. Normal hops can clear them; rear ground windows reach the garden, and the bedroom window reaches the balcony.
- **Library basement stairs:** the former low passage and its roof are removed. A single 2.6 m wide flight occupies x −23.7…−21.1, rising from (y −4.2, z −17) to (y 0, z −5). Its upper entrance faces south; guards enclose the other three sides of the opening. Both Shidan and the mistress can use this route.
- **Studio shelf:** the former upstairs linen passage wall and low roof are removed. A ramp reaches both exposed shelf levels; Shidan can launch charged jumps toward the desk or other parts of the room. The carpeted decks stand 0.9 m and 1.9 m above the upstairs floor, with two walkable access ramps. A clear west-edge takeoff reaches the studio desk. Both levels allow items and mistress catches; the surrounding floor remains accessible to the mistress.
- **Hedge hideaway:** x −20…−12, centred at z −33. Low entrances at both ends and a solid leafy roof form a garden shortcut.
- **Under tables:** individual legs and a raised top leave floor-level routes through the coffee, dining, library, craft and picnic furniture. These routes break sightlines but provide no capture or cleanup immunity; the mistress can approach an edge and reach underneath. Picnic benches leave human standing clearance along the long sides.

## Utility basement

The basement floor is at y=−4.2; its ceiling underside is y=−0.22, just under four metres above the floor. Six 0.52 m square pillars stand at x −12, 0 and 12, each at z −6 and 8. The furnace is near (16, −16), with the water heater beside it at (19.5, −16). The concrete floor stops promptly and supports charged jumps.

Six ceiling lamps are centered in grid columns 2, 7 and 13, at rows 2 and 9: x approximately −12.8, 0.2 and 15.8, each at z ±10.68. Their shades, mounts, stems, colliders and glowing diffusers all use those positions, safely clear of the full-height maze walls in all five designs. They start at 22% power in daylight and warm to full power through dusk, sharing the existing fixed four-point-light budget. The B1 house-tour view hides the floors above it for inspection; during play the slab ceiling stays in place.

The mistress has no basement routine, but can pursue, search and catch Shidan underground. The room contains no newly spawned food, chewables or water fountains.

## Climbing vocabulary

Climbable routes use books, stools, poufs, trunks, and stacked crates. Each successive rise is normally 0.23–0.41 m, below the ~0.54 m normal-hop apex. The silhouettes and heights repeat so players can recognize another route without a special interaction button.

| Route | Top heights above the local floor |
| --- | --- |
| Lounge sofa | books 0.27 → footstool 0.50 → cushion 0.84 → blanket 0.92 |
| Coffee table | books 0.28 → stool 0.66 → trunk 1.05 → table 1.44 |
| Dining table | book 0.32 → stool 0.72 → widened chest 1.12 → table 1.52; final step overlaps the table edge by 0.05 m |
| Craft stack | crates 0.32 → 0.69 → 1.08 → 1.48 → folded blanket 1.56 |
| Bedroom | pouf 0.30 → trunk 0.61 → mattress 0.88 → quilt 0.96 |
| Studio desk | books 0.29 → stool 0.65 → trunk 1.06 → desk 1.46 |
| Studio shelf | walking ramp → lower tier 0.90 → connecting ramp → upper tier 1.90; charged jump west onto desk |

Normal hops recover forward motion after an initial contact with a ledge. Indoor wood has moderate slip and still permits only short hops. The garden, front yard, side paths, balcony and basement concrete have firm grip, stop immediately on input release, and support long jumps. Shidan walks at 3.9 m/s on these surfaces and carpet, or 3.64 m/s in the den and on stairs. Sprint speed is 8.2 m/s on indoor wood and 8.8 m/s outdoors and on concrete; stairs use 7 m/s sprinting. Every long jump launched inside the den is free, including repeated, stationary and inward jumps at empty energy.

The bedroom trunk now extends beneath the bed edge, closing its former 15 cm slit. The lounge book/footstool/sofa and reading-room pouf/sofa handoffs also overlap, with matching visible and physical bounds. Grounded support can retain a ledge while Shidan's circular foot area overlaps it; leaving that area still causes a normal fall. This prevents narrow seams from alternating between falling and landing, which previously repeated the landing sound.

## Recovery and pursuit balance

Ordinary hay starts with twelve stacks, up from six. The six added recovery points are below; H is the upper-floor height, 4.2 m. Each still grants 40 energy, no happiness and three carried poop balls after a 1.6-second hold.

| Added hay location | X | Y | Z |
| --- | ---: | ---: | ---: |
| Bedroom | −9.5 | H | −18 |
| Reading room | −0.7 | H | −17.1 |
| Study | 16.8 | H | −17.2 |
| Balcony | 3.7 | H | −22.6 |
| Front yard | −11 | 0 | 23 |
| Backyard | 14 | 0 | −30 |

There are 47 authored house snack placements and 46 available at the start of play: 45 regular snacks plus one cake. The old library book slot lies in the basement stair opening and is excluded. The maze adds its independent 10–20 random one-use supplies; these do not affect household counts or restock timers. The carrot printed on the central rug is decorative. Four maze fountains supplement the fourteen above ground. Permanent den hay and central maze hay remain separate recovery points. Passive energy recovery is continuous at 0.01 per half second (0.02 per second), with no recovery during pauses; simultaneous sprint drain still gives a full bar 30 seconds of uninterrupted sprinting.

Shidan walks silently for both audio and AI hearing. Only moving sprints generate footstep effects and local movement noise; actual long jumps and happiness-granting chewing retain their existing noise rules. The mistress starts chasing at 60% of the current terrain sprint speed, increasing to 65%, 70%, 75% and 80% after 2, 4, 6 and 8 minutes. Puddle rage still adds its existing movement bonus.

During the full one-second pee action Shidan stays visible but cannot be caught. A completed, visible and reachable puddle has cleanup priority and requires 15 active seconds of mopping after arrival. The pee action never contributes time to that timer. Pauses freeze the action and cleanup.

Fountains provide water without becoming safe spots. Beside a fountain, the mistress chooses the closest clear standing approach and can reach Shidan within 1.2 m on the same floor. Actual walls and closed panes still block her hand path; drinking stops immediately when a catch begins.

## Collision and pursuit foundation

`src/layout.js` owns room bounds, `WALLS`, opening dimensions, `PORTALS`, `RAMPS`, and discovery markers. `house.js` builds wall segments around the openings. `furnishings.js` uses one solid helper to create each visible box and its exact collider, including every blanket, mattress, quilt, seat and pillow.

Perpendicular wall sections butt against one another and split at T-junctions, avoiding coplanar overlapping coloured tops. Den rings and posts use the same centre and radius as the fence collision. A cached 4 m spatial grid limits character and camera checks to nearby static solids while keeping their original collision order. Static sunlight shadows refresh when a floor cutaway changes; Shidan retains her animated contact shadow. Small poop balls receive sunlight shadows without casting into the static map.

The existing sphere solver uses both ramp directions, and all furnishings remain obstacles for poop balls. The persistent pool remains capped at 1,000 balls. Foliage and cylindrical props use conservative box colliders; thin seams, printed labels and floor decals are decorative. Step meshes approximate continuous ramps within 7 cm to avoid stair snagging.

Automated route tests drive the actual rabbit controller through the loops, all three stairways, the basement, studio shelf and hedge. Separate tests check all window clearances, normal-hop window crossing, sofa/bed climbing, blanket landing, and exact mesh/box agreement. The mistress uses a cached human navigation graph with a 0.5 m radius and 2.72 m clearance height; its routes cover the house, all three stairs, basement, balcony and yards.

Continue playtesting chase speed, recovery placement and shortcut advantage against the implemented mistress before declaring the level balanced.
