// Physical silhouettes enclosing the original models. Cosmetic details share
// one collider per item; its physical pose follows motion, not the chewing wiggle.
const bounds = {
  hay: [-.303,.282,-.296,.295,.52], carrot: [-.238,.413,-.12,.12,.407],
  rabbitFood: [-.301,.301,-.301,.301,.331], bread: [-.301,.301,-.19,.19,.321],
  apple: [-.246,.246,-.19,.19,.474], banana: [-.335,.336,-.065,.065,.339],
  book: [-.228,.226,-.25,.25,.207], cake: [-.35,.35,-.35,.35,.496],
  noodles: [-.304,.301,-.301,.301,.324], wire: [-.277,.478,-.244,.244,.106],
  cardboard: [-.401,.401,-.331,.342,.51], slippers: [-.295,.295,-.29,.29,.321],
};
export const consumableRotation = item => item.rotation ?? (item.type==='cardboard' ? 0 : Math.sin(item.x*3+item.z)*.5);
export function consumableCollider(item) {
  const shape=item.permanent ? [-.398,.398,-.398,.398,.52] : bounds[item.type];
  const [left,right,back,front,top]=shape, scale=item.permanent ? 1.35 : 1;
  const angle=consumableRotation(item),c=Math.cos(angle),s=Math.sin(angle);
  const points=[[left,back],[left,front],[right,back],[right,front]].map(([x,z])=>[(x*c+z*s)*scale,(-x*s+z*c)*scale]);
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));
  return [item.x+(minX+maxX)/2,item.y+top*scale/2,item.z+(minZ+maxZ)/2,maxX-minX,top*scale,maxZ-minZ,item.permanent?'bedding':'wood'];
}
