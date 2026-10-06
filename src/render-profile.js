// Optional diagnostics (?profile=1). GPU queries are asynchronous and never wait
// for the GPU. The normal game does not create queries or emit per-frame events.
export function createRenderProfile(renderer, canvas) {
  if (!new URLSearchParams(location.search).has('profile')) return { begin() {}, end() {} };
  const gl = renderer.getContext(), extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const debug = gl.getExtension('WEBGL_debug_renderer_info'), pending = [];
  let current = null, gpuMs = null;
  canvas.dataset.graphics = JSON.stringify({ renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), gpuTimer: !!extension, dpr: devicePixelRatio, width: canvas.width, height: canvas.height });
  return {
    begin() {
      if (!extension) return;
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        for (const query of pending) gl.deleteQuery(query);
        pending.length = 0; gpuMs = null;
      }
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const query = pending.shift(); gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(query);
      }
      if (pending.length < 8) { current = gl.createQuery(); gl.beginQuery(extension.TIME_ELAPSED_EXT, current); }
    },
    end(frameMs, cpuMs) {
      if (current) { gl.endQuery(extension.TIME_ELAPSED_EXT); pending.push(current); current = null; }
      canvas.dispatchEvent(new CustomEvent('renderprofile', { detail: { frameMs, cpuMs, gpuMs, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, width: canvas.width, height: canvas.height } }));
    },
  };
}
