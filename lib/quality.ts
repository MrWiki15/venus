// Detección simple del nivel de GPU para elegir un perfil de render.
export type Quality = 'high' | 'low';

export function detectQuality(): Quality {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('calidad');
    if (q === 'alta') return 'high';
    if (q === 'baja') return 'low';
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'low';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const weak = /(intel.*(hd|uhd)|mali|adreno|powervr|swiftshader|llvmpipe|software|apple gpu)/.test(r);
    const mobile = /android|iphone|ipad/i.test(navigator.userAgent);
    if (weak || mobile || (navigator.hardwareConcurrency ?? 8) <= 4) return 'low';
    return 'high';
  } catch {
    return 'low';
  }
}

// En GPUs integradas no se recorta la nitidez: se ahorra en lo que no se ve
// (post-procesado, sombras recalculadas cada frame, cielo procedural, PBR en la ciudad lejana)
// y la resolución se adapta sola a los FPS reales.
export const QUALITY_SETTINGS = {
  high: {
    dpr: [1, 2] as [number, number],
    shadowMap: 4096,
    post: true, // EffectComposer: AO + bloom + SMAA
    points: 380000,
    texScale: 1,
    sparkles: 220,
    cheapCity: false,
    proceduralSky: true,
    fillLights: 3,
  },
  low: {
    dpr: [0.85, 1.5] as [number, number],
    shadowMap: 4096, // las sombras se calculan una sola vez: el tamaño no cuesta por frame
    post: false, // tone mapping del renderer + MSAA nativo
    points: 220000,
    texScale: 1,
    sparkles: 110,
    cheapCity: true,
    proceduralSky: false,
    fillLights: 2,
  },
};

export function dprRange(q: Quality): [number, number] {
  const [a, b] = QUALITY_SETTINGS[q].dpr;
  const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const max = Math.max(a, Math.min(b, device));
  return [Math.min(a, max), max];
}
