// Bound the 3D pixel workload on Retina/4K displays. HTML text and the HUD keep
// the display's native resolution; MSAA still smooths the scene's silhouettes.
export function renderPixelRatio(width, height, dpr = 1) {
  return Math.min(Math.max(1, dpr), 1.5, Math.sqrt(1920 * 1080 / Math.max(1, width * height)));
}
