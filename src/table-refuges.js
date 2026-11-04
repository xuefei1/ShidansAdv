const EPSILON=1e-6;
const valid=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));

// Attach this only in the furniture table builder. The interaction controller
// can then reach across/beneath a real table without walking through its legs.
export function markTabletop(collider,baseY) {
  collider.tabletop=Object.freeze({baseY});return collider;
}

export const TABLE_EDGE_REACH=1;
export const TABLE_REACH_HEIGHT=2.4;

function onTableFootprint(point,table) {
  if(point.x>=table.minX-EPSILON&&point.x<=table.maxX+EPSILON&&
    point.z>=table.minZ-EPSILON&&point.z<=table.maxZ+EPSILON)return true;
  // The controller can stay supported with its centre just past an edge.
  // Match its positive circular foot overlap, including diagonal corners;
  // this allowance applies only to a grounded rabbit above the actual slab.
  if(point.grounded!==true||!Number.isFinite(point.radius)||point.y<table.maxY-EPSILON)return false;
  const radius=Math.max(0,Math.min(.22,point.radius)-.001);
  const dx=Math.max(table.minX-point.x,0,point.x-table.maxX),dz=Math.max(table.minZ-point.z,0,point.z-table.maxZ);
  return dx*dx+dz*dz<radius*radius;
}

export function tableAt(point,tabletops) {
  if(!valid(point))return null;
  for(const top of tabletops) {
    if(!top.tabletop||!onTableFootprint(point,top))continue;
    // Bound the underside to this table's floor: an upstairs desk must not
    // extend interaction reach in the ground-floor room below.
    if(point.y>=top.tabletop.baseY-.02&&point.y<=top.minY+EPSILON)return top;
    // Include supported books/computer props and jumps within arm height.
    // Higher airborne points remain outside this bounded interaction column.
    if(point.y>=top.minY-EPSILON&&point.y<=top.tabletop.baseY+TABLE_REACH_HEIGHT+EPSILON)return top;
  }
  return null;
}

export function tableInteraction(point,tabletops) {
  const table=tableAt(point,tabletops);
  return table?{table,under:point.y<table.minY,edgeReach:TABLE_EDGE_REACH,
    reach:Math.hypot(table.maxX-table.minX,table.maxZ-table.minZ)+TABLE_EDGE_REACH,height:TABLE_REACH_HEIGHT}:null;
}

export function withinInteractionReach(point,from,interaction,{reach=0,height=0}={}) {
  if(!valid(point)||!valid(from)||Math.abs(point.y-from.y)>(interaction?.height??height)+EPSILON)return false;
  if(Number.isFinite(interaction?.edgeReach)) {
    const table=interaction.table??interaction.support;if(!table)return false;
    const base=table.tabletop?.baseY??table.baseY;
    if(!Number.isFinite(base)||Math.abs(from.y-base)>.2+EPSILON||!onTableFootprint(point,table))return false;
    const x=Math.max(table.minX,Math.min(table.maxX,from.x)),z=Math.max(table.minZ,Math.min(table.maxZ,from.z));
    return Math.hypot(from.x-x,from.z-z)<=interaction.edgeReach+EPSILON;
  }
  return Math.hypot(point.x-from.x,point.z-from.z)<=(interaction?.reach??reach)+EPSILON;
}
