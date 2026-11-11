import {generateMirrorMaze} from './mirror-maze-layout.js';

// Five fixed designs use distinct carving rules, not a new random wall plan
// on each load. Runtime randomness selects a design and its consumable stock.
export const MAZE_LAYOUTS=Object.freeze([
  {id:'willow-paths',name:'Willow Paths',profile:'tangle',seed:0x51da1001,description:'Branching paths, deceptive dead ends and small escape loops.'},
  {id:'ribbon-switchbacks',name:'Ribbon Switchbacks',profile:'ribbons',seed:0x51da2002,description:'Long parallel passages connected by winding switchbacks.'},
  {id:'clockwork-spiral',name:'Clockwork Spiral',profile:'spiral',seed:0x51da3003,description:'Circling routes with side branches around the central chamber.'},
  {id:'twin-courtyards',name:'Twin Courtyards',profile:'twin-courts',seed:0x51da4004,description:'Two circulating wings join through alternate central approaches.'},
  {id:'four-winds',name:'Four Winds',profile:'four-winds',seed:0x51da5005,description:'Four differently oriented sectors weave toward the heart.'},
].map(design=>Object.freeze(design)));

const templates=new Map();
function freezeTree(value) {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)) {
    Object.values(value).forEach(freezeTree);Object.freeze(value);
  }
  return value;
}

export function getMazeLayout(id) {
  const design=MAZE_LAYOUTS.find(layout=>layout.id===id||`maze:${layout.id}`===id);
  if(!design)throw new RangeError(`Unknown maze layout: ${id}`);
  if(!templates.has(design.id)) {
    const layout=generateMirrorMaze(design.seed,{profile:design.profile});
    Object.assign(layout,{id:`maze:${design.id}`,layoutId:design.id,layoutName:design.name,profileId:design.profile});
    templates.set(design.id,freezeTree(layout));
  }
  // Scene resources may hold or augment nested positions. Never let one round
  // mutate the cached authored map or another round's navigation metadata.
  return structuredClone(templates.get(design.id));
}

export function chooseMazeLayout(random=Math.random,{excludeId=null}={}) {
  const choices=MAZE_LAYOUTS.filter(layout=>layout.id!==excludeId&&`maze:${layout.id}`!==excludeId);
  const sampled=typeof random==='function'?random():Number(random);
  const value=Number.isFinite(sampled)?Math.max(0,Math.min(1-Number.EPSILON,sampled)):.5;
  return getMazeLayout(choices[Math.floor(value*choices.length)].id);
}
