import * as THREE from '../vendor/three.module.js';

const sourceMaterials = new WeakMap(), sharedMaterials = new Map();
function coloredMaterial(material) {
  if (sourceMaterials.has(material)) return sourceMaterials.get(material);
  // These authored materials differ mainly in colour. Preserve every other
  // render property, and leave textured/custom materials on their original path.
  if ((!material.isMeshStandardMaterial && !material.isMeshBasicMaterial) ||
      Object.values(material).some(value => value?.isTexture)) return null;
  const properties = material.toJSON();
  delete properties.uuid; delete properties.color; delete properties.metadata; delete properties.name;
  const key = JSON.stringify(properties);
  if (!sharedMaterials.has(key)) {
    const shared = material.clone(); shared.color.set(0xffffff); shared.vertexColors = true;
    sharedMaterials.set(key, shared);
  }
  const shared = sharedMaterials.get(key); sourceMaterials.set(material, shared); return shared;
}

// Spatial batches let the renderer reject unseen parts of the house. Vertex
// colours combine pastel materials without adding texture lookups or changing
// lighting. Indexed vertices remain shared instead of expanding every triangle.
// recursive:false merges only one rigid joint's meshes, preserving animation.
export function batchStaticGeometry(group, options = {}) {
  const { cellSize = 8, recursive = true } = options;
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert(), batches = new Map(), sources = [];
  const collect = object => {
    const original = object.material, source = object.geometry;
    if (!object.isMesh || object.isInstancedMesh || !object.visible || Array.isArray(original) ||
        (original.transparent && !object.userData.batchTransparent) ||
        Object.keys(source.attributes).some(name => !['position', 'normal', 'uv', 'color'].includes(name))) return;
    const material = original.transparent ? original : coloredMaterial(original);
    if (!material) return;
    const geometry = source.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    geometry.computeBoundingBox();
    const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
    // Uniform, unlit window tint is order independent; keep its two cheap draws.
    const cell = original.transparent || !Number.isFinite(cellSize) ? 'all' : `${Math.floor(centre.x / cellSize)},${Math.floor(centre.z / cellSize)}`;
    if (!original.transparent) {
      const count = geometry.attributes.position.count, colors = new Float32Array(count * 3), oldColors = original.vertexColors ? geometry.getAttribute('color') : null;
      for (let i = 0; i < count; i++) {
        colors[i * 3] = original.color.r * (oldColors ? oldColors.getX(i) : 1);
        colors[i * 3 + 1] = original.color.g * (oldColors ? oldColors.getY(i) : 1);
        colors[i * 3 + 2] = original.color.b * (oldColors ? oldColors.getZ(i) : 1);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const key = `${cell}:${material.uuid}:${object.castShadow}:${object.receiveShadow}:${object.renderOrder}:${object.layers.mask}`;
    if (!batches.has(key)) batches.set(key, { material, object, geometries: [] });
    batches.get(key).geometries.push(geometry); sources.push(object);
  };
  if (recursive) group.traverseVisible(collect); else group.children.forEach(collect);
  for (const { material, object, geometries } of batches.values()) {
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'color']) {
      const attributes = geometries.map(g => g.getAttribute(name));
      if (attributes.some(a => !a)) continue;
      const data = new Float32Array(attributes.reduce((n, a) => n + a.array.length, 0));
      let offset = 0;
      for (const a of attributes) { data.set(a.array, offset); offset += a.array.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(data, attributes[0].itemSize));
    }
    const indices = [], vertexCount = geometries.reduce((n, g) => n + g.attributes.position.count, 0);
    let vertexOffset = 0;
    for (const geometry of geometries) {
      const count = geometry.index?.count ?? geometry.attributes.position.count;
      for (let i = 0; i < count; i++) indices.push(vertexOffset + (geometry.index ? geometry.index.getX(i) : i));
      vertexOffset += geometry.attributes.position.count;
    }
    merged.setIndex(new THREE.BufferAttribute(vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), 1));
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = material.transparent ? 'Batched window glass' : 'Batched level';
    mesh.castShadow = object.castShadow; mesh.receiveShadow = object.receiveShadow;
    mesh.renderOrder = object.renderOrder; mesh.layers.mask = object.layers.mask;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix(); group.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  for (const source of sources) source.removeFromParent();
}
