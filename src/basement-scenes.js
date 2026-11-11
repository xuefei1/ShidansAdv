import {chooseMazeLayout} from './maze-layout-catalog.js';

// Pick the kind of basement before asking that kind for a layout. Other
// content types can supply their own selection function when implemented.
export const BASEMENT_CONTENT_TYPES=Object.freeze([
  Object.freeze({id:'maze',select:({random,previous})=>({layout:chooseMazeLayout(random,{excludeId:previous?.layout.layoutId})})}),
]);

export class BasementSceneDirector {
  constructor({random=Math.random,contents=BASEMENT_CONTENT_TYPES}={}) {
    if(!contents.length||contents.some(content=>!content.id||typeof content.select!=='function'))throw new TypeError('Basement content types need an id and selector');
    this.random=random;this.contents=contents;this.current=null;
  }
  next() {
    let index=0;
    if(this.contents.length>1) {
      const value=this.random();
      index=Math.floor((Number.isFinite(value)?Math.max(0,Math.min(1-Number.EPSILON,value)):.5)*this.contents.length);
    }
    const content=this.contents[index],previous=this.current?.type===content.id?this.current:null;
    this.current=Object.freeze({...content.select({random:this.random,previous}),type:content.id});
    return this.current;
  }
}
