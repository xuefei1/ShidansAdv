# Asset provenance and credits

## Included

| Asset | Source | License / treatment |
| --- | --- | --- |
| Three.js 0.180.0 | Official npm package `https://registry.npmjs.org/three/-/three-0.180.0.tgz` | MIT; full notice retained in `vendor/THREE-LICENSE.txt` |
| Shidan model and procedural animation | Original project geometry in `src/model.js`, informed by the user's photographs | Project Apache-2.0 license |
| House, furniture, den, props, plants and wall art | Original project geometry in `src/house.js` | Project Apache-2.0 license |
| Interface, rabbit icon and canvas-generated labels | Original project code | Project Apache-2.0 license |
| Hop, landing, footstep and discovery sounds | Original Web Audio synthesis in `src/audio.js` | Project Apache-2.0 license |
| Reference photos in `pic/` | User's three photographs | Local reference only; ignored by Git, server and builds |
| Typography | System fonts: Segoe UI/Arial and Georgia/Times New Roman | No font files distributed |

No external models, music, textures or sprites are used in milestone 1. No paid assets were purchased. Background music is not included yet. All game assets load locally without external requests.

## Free assets researched for later milestones

- [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit): the official page lists 140 3D files and CC0. A candidate if we expand furniture beyond the original set.
- [Kenney Building Kit](https://www.kenney.nl/assets/building-kit): official CC0 building assets. A candidate for exterior levels.

These packs were researched but **not imported**. Record exact versions, download origins and license files here before importing any later asset. Eden Eternal supplies a mood reference only; none of its copyrighted game assets are included.

## Engine documentation

- [Three.js installation](https://threejs.org/manual/pages/installation.html)
- [WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html)

The engine is pinned at 0.180.0 for a reproducible first milestone; upgrading it is an explicit maintenance task, not a runtime download.
