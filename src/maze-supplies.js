import {BASEMENT} from './layout.js';
import {CONSUMABLE_TYPES} from './consumable-data.js';

export const MIN_MAZE_SNACKS=10;
export const MAX_MAZE_SNACKS=20;
const kinds=Object.keys(CONSUMABLE_TYPES);
const sample=random=>Math.max(0,Math.min(1-Number.EPSILON,Number(random())||0));

export function mazeFountainPlacements(layout) {
  return (layout?.fountainPoints??[]).slice(0,4).map((p,index)=>({id:`fountain-maze-${index}`,room:'maze',floor:-1,
    name:'Water fountain',x:p.x,y:p.y??BASEMENT.y,z:p.z,mazeFixture:true}));
}

// These supplies belong to one magical scene, never to the household's
// regeneration pool. Rebuilding a round chooses new positions and kinds.
export class MazeSupplies {
  constructor(layout,random=Math.random) {this.source=layout;this.random=random;this.items=new Map();this.hay=null;}
  reset() {
    const layout=typeof this.source==='function'?this.source():this.source;
    this.items.clear();this.hay=null;this.initialCount=0;
    if(!layout)return;
    const places=[...(layout.spawnPoints??[])];
    for(let i=places.length-1;i>0;i--) {
      const j=Math.floor(sample(this.random)*(i+1));[places[i],places[j]]=[places[j],places[i]];
    }
    const count=Math.min(places.length,MIN_MAZE_SNACKS+Math.floor(sample(this.random)*(MAX_MAZE_SNACKS-MIN_MAZE_SNACKS+1)));
    for(let i=0;i<count;i++) {
      const p=places[i],item={id:`maze-snack-${i}`,type:kinds[Math.floor(sample(this.random)*kinds.length)],
        x:p.x,y:p.y??BASEMENT.y,z:p.z,mazeItem:true,oneShot:true};
      this.items.set(item.id,item);
    }
    this.initialCount=count;
    const heart=layout.heart??{x:0,y:BASEMENT.y,z:0},y=heart.y??BASEMENT.y;
    this.hay={id:'maze-heart-hay',type:'hay',x:heart.x-1.05,y,z:heart.z+.55,mazeItem:true,mazeHay:true,permanent:true,fixed:true};
  }
  get count() {return this.items.size;}
  has(item) {return item===this.hay||this.items.get(item?.id)===item;}
  remove(item) {return this.items.get(item?.id)===item&&this.items.delete(item.id);}
  *availableItems() {if(this.hay)yield this.hay;yield* this.items.values();}
}
