// Bound the 3D pixel workload on Retina/4K displays. HTML text and the HUD keep
// the display's native resolution; MSAA still smooths the scene's silhouettes.
export function renderPixelRatio(width, height, dpr = 1) {
  return Math.min(Math.max(1, dpr), 1.5, Math.sqrt(1920 * 1080 / Math.max(1, width * height)));
}

// Most of the level does not need the extremely close near plane used when a
// wall squeezes the chase camera. Increase depth precision at normal distances
// and in house view, retaining the close setting only while it is needed.
export function cameraNearPlane(focusDistance, surveying=false) {
  if(surveying)return .75;
  if(!Number.isFinite(focusDistance))return .06;
  const t=Math.max(0,Math.min(1,(focusDistance-.55)/.8));
  return .06+t*.12;
}
