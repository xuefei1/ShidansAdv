// The flexible ears extend above the body collider. Duck the rendered pose
// under nearby static overhead surfaces without changing movement or jumps.
const VISUAL_RADIUS=.72;
const BODY_RADIUS=.22;
const CLEARANCE_MARGIN=.025;
export function visualHeadroom(world,player) {
  if(!player||!['x','y','z'].every(axis=>Number.isFinite(player[axis])))return Infinity;
  const {x,y,z}=player,bodyTop=y+(player.height??.68);
  const ramp=world.rampAt?.(x,z),landingY=(ramp?.baseY??0)+(ramp?.height??0);
  const inBasementFlight=ramp&&(ramp.baseY??0)<0&&y>=ramp.baseY-.05&&y<landingY+.05;
  const lipY=world.basement?.ceilingY??landingY-.3;
  let ceiling=Infinity;
  for(const box of world.query(x-VISUAL_RADIUS,z-VISUAL_RADIUS,x+VISUAL_RADIUS,z+VISUAL_RADIUS)) {
    if(box.pushable||box.minY<bodyTop-.025||box.maxX<=x-VISUAL_RADIUS||box.minX>=x+VISUAL_RADIUS||
      box.maxZ<=z-VISUAL_RADIUS||box.minZ>=z+VISUAL_RADIUS)continue;
    // The floor lip and guards beside the open basement flight are not a
    // ceiling over a rabbit standing on the stairs. The broad ear-neighbourhood
    // used for real roofs reached across that opening and briefly flattened
    // her torso. Require positive body-footprint overlap with these edges;
    // merely touching a side cannot reduce the available overhead clearance.
    if(box.id?.startsWith('ground-floor:')||box.id?.startsWith('basement-opening-side:')||
      inBasementFlight&&box.minY>=lipY) {
      const radius=Math.max(0,(Number.isFinite(player.radius)?player.radius:BODY_RADIUS)-.001);
      const dx=Math.max(box.minX-x,0,x-box.maxX),dz=Math.max(box.minZ-z,0,z-box.maxZ);
      if(dx*dx+dz*dz>=radius*radius)continue;
    }
    // A nearby window's upright pane is beside the rabbit, not above her.
    // Keep wall lintels relevant while actually crossing their footprint, but
    // do not turn the bottom of a pane into a ceiling along an adjacent path.
    if(box.verticalBarrier) {
      const radius=(Number.isFinite(player.radius)?player.radius:BODY_RADIUS)+CLEARANCE_MARGIN;
      const dx=Math.max(box.minX-x,0,x-box.maxX),dz=Math.max(box.minZ-z,0,z-box.maxZ);
      if(dx*dx+dz*dz>radius*radius)continue;
    }
    ceiling=Math.min(ceiling,box.minY);
  }
  return Number.isFinite(ceiling)?Math.max(.1,ceiling-y-CLEARANCE_MARGIN):Infinity;
}
