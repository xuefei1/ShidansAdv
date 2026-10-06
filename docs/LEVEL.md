# Clover House — playable level design

Revision 0.2.3 improves rendering and increases ordinary walking speed while retaining the 0.2.2 layout: 32 solid glazed exterior windows, moderate wood slide, and a ceiling that stays visible while upstairs rooms appear before a stair climb. The layout prioritizes escape choices for a future pursuit game: broad circulation loops, corners that break sightlines, short rabbit-only alternatives, and elevated routes. Food, happiness, the mistress and noise/visibility AI are still future work.

## Scale and spaces

Coordinates are metres, X east/west, Z north/south, Y up. The garden is north (negative Z). Shidan is unchanged in size.

| Space | Extents | Design role |
| --- | --- | --- |
| Ground house | x −24…24, z −20…20 | 48 × 40 m footprint, roughly 3.8× the previous ground area |
| Den | (−16, 12), radius 4, fence 1.1 high | 50.3 m² of bedding, over 3× the previous den area; clear charge runway |
| Lounge | x −24…−5, z 2…20 | Spawn, future mistress couch, sofa and table climbing |
| Entrance | x −5…5, z 2…20 | Wide stair approach; two lounge and kitchen door choices |
| Kitchen / dining | x 5…24, z 2…20 | Island circling, table-underpass, chair/trunk climbing |
| Cross-hall | x −24…24, z −3…2 | East–west connection between all six adjacent areas |
| Library | x −24…−5, z −20…−3 | Table cover and concealed western passage |
| Garden room | x −5…8, z −20…−3 | Central backyard access with window alternatives |
| Craft / laundry | x 8…24, z −20…−3 | Crate staircase, appliance cover, second garden door |
| Upper floor | y 4.2; x −24…24, z −20…2 | Carpeted bedroom, reading room, studio and gallery |
| Balcony | y 4.2; x −20…24, z −25…−20 | Two doors and bedroom window; outdoor stairs at east end |
| Backyard | x −26…26, z −38…−20 | Grass, raised-bed loops, picnic cover, stepping logs, hedge passage |
| Front yard | x −26…26, z 20…32 | Clear entry path, two benches, flower beds and side-path connections |

The lot is 52 × 70 m, bounded by an invisible full-height fence at x ±26 and z −38/32. Both Shidan and poop balls collide with this boundary, including while airborne. The old visible perimeter walls have been removed.

The M map is generated from the same room and opening data as the level. V offers floor cutaways and a rear garden angle. The minimap follows the current floor. These are presentation features; hidden upper geometry retains its collision.

During normal play the upper-floor slab stays visible as the downstairs ceiling. Upstairs rooms appear one metre before either stair flight and stay visible through ascent and descent. A wider exit band avoids rapid toggling near the approach. The ground-floor house tour still removes the slab for inspection. The permanent slab is one draw / 12 triangles, and sunlight shadows refresh only when visibility actually changes.

All exterior elevations now have glazed windows: four broad front windows, six per downstairs side wall, three per upstairs side wall, and five extra rear windows per floor. These 32 panes are lightly tinted, transparent and solid to Shidan and poop balls. White crossbars identify closed windows; the eight existing blue-framed jump windows remain open. Closed panes are excluded from navigation portals and appear pale blue on the map. Glass uses one simple rendering batch per floor, with no refraction pass or shadow casting.

## Playable circuits

1. **Downstairs loop:** lounge → entrance → dining → cross-hall → lounge. The kitchen island and table interrupt a straight chase; wide doors keep the main route accessible to a standing adult.
2. **Rear loop:** cross-hall → library → garden room → craft room → cross-hall. Each dividing wall has two doorways plus a low jump window, so a pursuer cannot guard one exit to seal off a room.
3. **Vertical loop:** entrance stairs → upstairs gallery → reading room → balcony → outdoor stairs → backyard → garden door → cross-hall. Both flights are walkable in either direction.
4. **Upper room loop:** gallery → bedroom → reading room → studio → gallery. A second linen passage connects the studio's two rear-side openings.
5. **Outdoor loop:** garden doors / library window → raised beds and hedge → second garden door. The front porch and narrow paths on both sides connect around the exterior.

The future AI should use the wide doors and stairs, choose an alternate exit when Shidan enters a small passage, and search around the far end. The paths are not intended as permanent invulnerability zones.

## Rabbit shortcuts

- **Eight jump windows:** 0.42 m sills, 2.4–3 m widths. They are open apertures with blue trim, not glass decals. Normal hops can clear them; rear ground windows reach the garden, and the bedroom window reaches the balcony.
- **Library passage:** x −22.5, between z −17 and −6, behind shelves. Both entrances are 1.8 m wide and 1.6 m high. A low overhead panel preserves the enclosed feel.
- **Studio linen passage:** same two-ended arrangement at x 22.5, on the upper floor.
- **Hedge hideaway:** x −20…−12, centred at z −33. Low entrances at both ends and a solid leafy roof form a garden shortcut.
- **Under tables:** individual legs and a raised top leave floor-level routes through the coffee, dining, library, craft and picnic furniture.

## Climbing vocabulary

Climbable routes use books, stools, poufs, trunks, and stacked crates. Each successive rise is normally 0.23–0.41 m, below the ~0.54 m normal-hop apex. The silhouettes and heights repeat so players can recognize another route without a special interaction button.

| Route | Top heights above the local floor |
| --- | --- |
| Lounge sofa | books 0.27 → footstool 0.50 → cushion 0.84 → blanket 0.92 |
| Coffee table | books 0.28 → stool 0.66 → trunk 1.05 → table 1.44 |
| Dining table | book 0.32 → stool 0.72 → chest 1.12 → table 1.52 |
| Craft stack | crates 0.32 → 0.69 → 1.08 → 1.48 → folded blanket 1.56 |
| Bedroom | pouf 0.30 → trunk 0.61 → mattress 0.88 → quilt 0.96 |
| Studio desk | books 0.29 → stool 0.65 → trunk 1.06 → desk 1.46 |

Normal hops recover forward motion after an initial contact with a ledge. Indoor wood has moderate slip and still permits only short hops. The garden, front yard, side paths and balcony have firm grip, stop immediately on input release, and support long jumps. Sprint speed is 8.2 m/s on indoor wood and 8.8 m/s outdoors, versus 3 m/s walking; stairs use 7 m/s sprinting.

## Collision and future AI foundation

`src/layout.js` owns room bounds, `WALLS`, opening dimensions, `PORTALS`, `RAMPS`, and discovery markers. `house.js` builds wall segments around the openings. `furnishings.js` uses one solid helper to create each visible box and its exact collider, including every blanket, mattress, quilt, seat and pillow.

Perpendicular wall sections butt against one another and split at T-junctions, avoiding coplanar overlapping coloured tops. Den rings and posts use the same centre and radius as the fence collision. A cached 4 m spatial grid limits character and camera checks to nearby static solids while keeping their original collision order. Static sunlight shadows refresh when a floor cutaway changes; Shidan retains her animated contact shadow. Small poop balls receive sunlight shadows without casting into the static map.

The existing sphere solver uses both ramp directions, and all furnishings remain obstacles for poop balls. The persistent 10,000-ball limit is unchanged. Foliage and cylindrical props use conservative box colliders; thin seams, printed labels and floor decals are decorative. Step meshes approximate continuous ramps within 7 cm to avoid stair snagging.

Automated route tests drive the actual rabbit controller through the loops, both stairways, both hidden passages and the hedge. Separate tests check all window clearances, normal-hop window crossing, sofa/bed climbing, blanket landing, and exact mesh/box agreement. Wide door portals are checked for a 0.4 m radius, 1.9 m high adult planning capsule. This is a geometric clearance check, **not an implemented navigation mesh or AI**.

Next: use these routes to place happiness rewards and develop the mistress's navigation, hearing, search and chase behavior. Tune chase speed and shortcut advantage with an actual NPC before declaring the level balanced.
