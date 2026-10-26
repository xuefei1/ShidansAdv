// Intentional paint, rugs and floor markings need a small, consistent depth
// bias at shallow viewing angles. Ordinary solid objects keep normal depth.
const overlays=new WeakMap();
export function applySurfaceOverlay(mesh) {
  const source=mesh.material;
  if(!overlays.has(source)) {
    const material=source.clone();
    // A bounded two-unit bias keeps paint stable without the large, angle-
    // dependent shift that could pull a distant rug in front of furniture.
    material.polygonOffset=true;material.polygonOffsetFactor=0;material.polygonOffsetUnits=-2;
    overlays.set(source,material);
  }
  mesh.material=overlays.get(source);mesh.userData.surfaceOverlay=true;
  return mesh;
}
