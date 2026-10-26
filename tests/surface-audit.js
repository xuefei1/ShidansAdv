import * as THREE from '../vendor/three.module.js';

const cross2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const project=(p,drop)=>drop===0?[p[1],p[2]]:drop===1?[p[0],p[2]]:[p[0],p[1]];
const box2=points=>({minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))});

function polygonArea(points) {
  let twice=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];twice+=a[0]*b[1]-b[0]*a[1];}
  return Math.abs(twice)/2;
}
function intersection(a,b) {
  let polygon=a;
  const orientation=Math.sign(cross2(...b));
  for(let edge=0;edge<3 && polygon.length;edge++) {
    const p=b[edge],q=b[(edge+1)%3],input=polygon;polygon=[];
    for(let i=0;i<input.length;i++) {
      const start=input[i],end=input[(i+1)%input.length];
      const ds=cross2(p,q,start)*orientation,de=cross2(p,q,end)*orientation;
      const insideStart=ds>=-1e-12,insideEnd=de>=-1e-12;
      if(insideStart)polygon.push(start);
      if(insideStart!==insideEnd) {
        const t=ds/(ds-de);polygon.push([start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t]);
      }
    }
  }
  return polygon;
}
function colorAt(triangle,point) {
  const [a,b,c]=triangle.projected,total=cross2(a,b,c);
  const weights=[cross2(point,b,c)/total,cross2(a,point,c)/total,cross2(a,b,point)/total];
  return [0,1,2].map(channel=>weights.reduce((sum,w,i)=>sum+w*triangle.colors[i][channel],0));
}
function sameColor(a,b,polygon,tolerance) {
  if(a.texture!==b.texture)return false;
  const centroid=polygon.reduce((sum,p)=>[sum[0]+p[0]/polygon.length,sum[1]+p[1]/polygon.length],[0,0]);
  for(const p of [centroid,...polygon]) {
    const ac=colorAt(a,p),bc=colorAt(b,p);
    if(ac.some((v,i)=>Math.abs(v-bc[i])>tolerance))return false;
  }
  return true;
}
function materialAt(mesh,offset) {
  if(!Array.isArray(mesh.material))return mesh.material;
  const group=mesh.geometry.groups.find(group=>offset>=group.start&&offset<group.start+group.count);
  return group?mesh.material[group.materialIndex]:null;
}
function effectiveColor(material,geometry,index,instanceColor) {
  const color=material.color || {r:1,g:1,b:1},vertex=material.vertexColors?geometry.getAttribute('color'):null;
  return [color.r*(vertex?vertex.getX(index):1)*instanceColor[0],color.g*(vertex?vertex.getY(index):1)*instanceColor[1],color.b*(vertex?vertex.getZ(index):1)*instanceColor[2]];
}
function isVisible(object) {for(let parent=object;parent;parent=parent.parent)if(!parent.visible)return false;return true;}
function opaque(material) {return material&&material.visible!==false&&!material.transparent&&material.depthWrite!==false&&material.depthTest!==false&&material.opacity!==0;}

// Capture before batching to retain the proof that a volume really is a closed
// rendered box. Broad collision boxes around foliage/curved props are not safe
// occluders and are intentionally never inferred from physics bounds.
export function collectOpaqueBoxOccluders(root,{includeInvisible=false}={}) {
  root.updateWorldMatrix(true,true);const records=[],matrix=new THREE.Matrix4(),instance=new THREE.Matrix4();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.geometry.type!=='BoxGeometry'||(!includeInvisible&&!isVisible(mesh)))return;
    if(!(Array.isArray(mesh.material)?mesh.material.every(opaque):opaque(mesh.material)))return;
    mesh.geometry.computeBoundingBox();const local=mesh.geometry.boundingBox.clone();
    if(['x','y','z'].some(axis=>local.max[axis]-local.min[axis]<1e-7))return;
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++) {
      if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);matrix.multiplyMatrices(mesh.matrixWorld,instance);}else matrix.copy(mesh.matrixWorld);
      records.push({mesh:mesh.uuid,bounds:local.clone().applyMatrix4(matrix),local:local.clone(),inverse:matrix.clone().invert()});
    }
  });
  return records;
}
function occluderIndex(records,cellSize=4) {
  const cells=new Map(),vector=new THREE.Vector3();
  for(const source of records) {
    const record=source.bounds?source:{bounds:source.isBox3?source:new THREE.Box3(new THREE.Vector3(source.minX,source.minY,source.minZ),new THREE.Vector3(source.maxX,source.maxY,source.maxZ))};
    const {min,max}=record.bounds;
    for(let x=Math.floor(min.x/cellSize);x<=Math.floor(max.x/cellSize);x++)for(let y=Math.floor(min.y/cellSize);y<=Math.floor(max.y/cellSize);y++)for(let z=Math.floor(min.z/cellSize);z<=Math.floor(max.z/cellSize);z++) {
      const key=`${x},${y},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(record);
    }
  }
  const contains=(record,p)=>{
    vector.fromArray(p);if(record.inverse)vector.applyMatrix4(record.inverse);
    const b=record.local||record.bounds;
    return ['x','y','z'].every(axis=>vector[axis]>b.min[axis]+1e-8&&vector[axis]<b.max[axis]-1e-8);
  };
  return points=>{
    const p=points[0],key=p.map(v=>Math.floor(v/cellSize)).join(',');
    return (cells.get(key)||[]).some(record=>points.every(point=>contains(record,point)));
  };
}
function competitionDirections(a,b) {
  return a.doubleSided&&b.doubleSided?[a.facing,a.facing.map(v=>-v)]:[a.doubleSided?b.facing:a.facing];
}
function legalView(direction,triangle,bounds) {
  if(!bounds)return true;
  const corner=['X','Y','Z'].map((axis,i)=>bounds[(direction[i]>=0?'max':'min')+axis]??(direction[i]>=0?Infinity:-Infinity));
  return direction.reduce((sum,v,i)=>sum+(v? v*(corner[i]-triangle.vertices[0][i]):0),0)>1e-7;
}
function polygonInWorld(polygon,triangle,drop) {
  return polygon.map(p=>{
    const result=drop===0?[0,p[0],p[1]]:drop===1?[p[0],0,p[1]]:[p[0],p[1],0];
    result[drop]=(triangle.plane-dot(triangle.normal,result))/triangle.normal[drop];return result;
  });
}
function *triangles(root,includeInvisible) {
  root.updateWorldMatrix(true,true);
  const meshes=[];root.traverse(object=>{if(object.isMesh)meshes.push(object);});
  const position=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3(),instance=new THREE.Matrix4(),matrix=new THREE.Matrix4();
  for(const mesh of meshes) {
    if(!includeInvisible&&!isVisible(mesh))continue;
    const geometry=mesh.geometry,attribute=geometry?.getAttribute('position');if(!attribute)continue;
    const index=geometry.index,count=index?.count ?? attribute.count;
    const start=geometry.drawRange.start,end=Math.min(count,Number.isFinite(geometry.drawRange.count)?start+geometry.drawRange.count:count);
    for(let instanceIndex=0;instanceIndex<(mesh.isInstancedMesh?mesh.count:1);instanceIndex++) {
      const instanceColor=mesh.instanceColor?[mesh.instanceColor.getX(instanceIndex),mesh.instanceColor.getY(instanceIndex),mesh.instanceColor.getZ(instanceIndex)]:[1,1,1];
      if(mesh.isInstancedMesh){mesh.getMatrixAt(instanceIndex,instance);matrix.multiplyMatrices(mesh.matrixWorld,instance);}else matrix.copy(mesh.matrixWorld);
      for(let offset=start;offset+2<end;offset+=3) {
        const material=materialAt(mesh,offset);
        if(!material || material.visible===false || material.transparent || material.depthWrite===false || material.depthTest===false || material.opacity===0)continue;
        const indices=[0,1,2].map(i=>index?index.getX(offset+i):offset+i);
        const vertices=indices.map(i=>position.fromBufferAttribute(attribute,i).applyMatrix4(matrix).toArray());
        ab.fromArray(vertices[1]).sub(position.fromArray(vertices[0]));ac.fromArray(vertices[2]).sub(position.fromArray(vertices[0]));normal.crossVectors(ab,ac);
        if(normal.lengthSq()<1e-20)continue;normal.normalize();
        const facing=normal.toArray().map(v=>v*(material.side===THREE.BackSide?-1:1));
        const canonical=normal.toArray(),drop=canonical.reduce((best,v,i)=>Math.abs(v)>Math.abs(canonical[best])?i:best,0);
        if(canonical[drop]<0)for(let i=0;i<3;i++)canonical[i]*=-1;
        yield {mesh,meshName:mesh.name||mesh.type,uuid:mesh.uuid,triangle:offset/3,instance:mesh.isInstancedMesh?instanceIndex:null,
          vertices,normal:canonical,facing,doubleSided:material.side===THREE.DoubleSide,plane:dot(canonical,vertices[0]),drop,
          colors:indices.map(i=>effectiveColor(material,geometry,i,instanceColor)),materialColor:material.color?.getHexString()||'shader',texture:material.map?.uuid||null,
          polygonOffset:material.polygonOffset,polygonOffsetFactor:material.polygonOffsetFactor,polygonOffsetUnits:material.polygonOffsetUnits};
      }
    }
  }
}

/** Test-only geometry audit. Surface intersections and shared edges are valid;
 * positive-area, same-facing, differently coloured coplanar patches are not.
 * This deliberately reports geometric risk, rather than pretending to prove
 * visibility from every camera or reproduce a GPU's depth precision.
 */
export function findCoplanarColorOverlaps(root,options={}) {
  const {planeTolerance=2e-5,normalTolerance=1e-4,areaTolerance=1e-7,colorTolerance=1e-4,cellSize=2,maxFindings=Infinity,includeInvisible=false,exposedOnly=false,exposureOffset=.0002,viewerBounds=null}=options;
  const hidden=exposedOnly?occluderIndex(options.occluders||collectOpaqueBoxOccluders(root,{includeInvisible})):()=>false;
  const directionBuckets=new Map(),findings=[];
  const normalStep=normalTolerance*2,normalKey=values=>values.join(',');
  let serial=0;
  for(const triangle of triangles(root,includeInvisible)) {
    triangle.serial=serial++;
    const bin=triangle.normal.map(v=>Math.round(v/normalStep));let direction=null;
    search:for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++) {
      const bucket=directionBuckets.get(normalKey([bin[0]+x,bin[1]+y,bin[2]+z]));
      for(const candidate of bucket||[])if(candidate.normal.every((v,i)=>Math.abs(v-triangle.normal[i])<=normalTolerance)||candidate.normal.every((v,i)=>Math.abs(v+triangle.normal[i])<=normalTolerance)) {direction=candidate;break search;}
    }
    if(!direction) {
      direction={normal:triangle.normal,drop:triangle.drop,planes:new Map()};
      const key=normalKey(bin);if(!directionBuckets.has(key))directionBuckets.set(key,[]);directionBuckets.get(key).push(direction);
      // Near a tied dominant axis, floating-point noise may choose the reverse
      // canonical direction. An alias retains the same unoriented plane group.
      const reverse=normalKey(bin.map(v=>-v));if(!directionBuckets.has(reverse))directionBuckets.set(reverse,[]);directionBuckets.get(reverse).push(direction);
    }
    triangle.projected=triangle.vertices.map(p=>project(p,direction.drop));triangle.bounds=box2(triangle.projected);
    const plane=dot(direction.normal,triangle.vertices[0]),planeBin=Math.floor(plane/planeTolerance),seen=new Set();
    const x0=Math.floor(triangle.bounds.minX/cellSize),x1=Math.floor(triangle.bounds.maxX/cellSize);
    const y0=Math.floor(triangle.bounds.minY/cellSize),y1=Math.floor(triangle.bounds.maxY/cellSize);
    for(let binOffset=-1;binOffset<=1;binOffset++) {
      const cells=direction.planes.get(planeBin+binOffset);if(!cells)continue;
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const other of cells.get(`${x},${y}`)||[]) {
        if(seen.has(other.serial))continue;seen.add(other.serial);
        if(!triangle.doubleSided&&!other.doubleSided&&dot(triangle.facing,other.facing)<0)continue;
        const a=triangle.bounds,b=other.bounds;
        if(Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)<=1e-7 || Math.min(a.maxY,b.maxY)-Math.max(a.minY,b.minY)<=1e-7)continue;
        if(triangle.vertices.some(v=>Math.abs(dot(other.normal,v)-other.plane)>planeTolerance) || other.vertices.some(v=>Math.abs(dot(triangle.normal,v)-triangle.plane)>planeTolerance))continue;
        const polygon=intersection(triangle.projected,other.projected);if(polygon.length<3)continue;
        const projectedArea=polygonArea(polygon),area=projectedArea/Math.abs(direction.normal[direction.drop]);
        if(area<=areaTolerance || sameColor(triangle,other,polygon,colorTolerance))continue;
        if(exposedOnly) {
          const points=polygonInWorld(polygon,triangle,direction.drop);
          const visible=competitionDirections(triangle,other).some(normal=>legalView(normal,triangle,viewerBounds)&&!hidden(points.map(p=>p.map((v,i)=>v+normal[i]*exposureOffset))));
          if(!visible)continue;
        }
        // A deliberately offset decal is not a competing depth surface.
        const bias=t=>t.polygonOffset?[t.polygonOffsetFactor,t.polygonOffsetUnits]:[0,0];
        if(bias(triangle).some((v,i)=>v!==bias(other)[i]))continue;
        const describe=t=>({mesh:t.meshName,uuid:t.uuid,triangle:t.triangle,instance:t.instance,color:t.materialColor,vertices:t.vertices,colors:t.colors});
        const overlapBounds=box2(polygon);
        findings.push({a:describe(other),b:describe(triangle),normal:direction.normal,plane,area,projectedBounds:overlapBounds,projectionAxis:direction.drop});
        if(findings.length>=maxFindings)return findings;
      }
    }
    if(!direction.planes.has(planeBin))direction.planes.set(planeBin,new Map());const cells=direction.planes.get(planeBin);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=`${x},${y}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(triangle);}
  }
  return findings;
}
