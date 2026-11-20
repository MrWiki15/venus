// Utilidades deterministas: RNG con semilla y ruido de valor periódico (tileable).

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const range = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
export const pick = <T,>(rng: Rng, arr: T[]) => arr[Math.floor(rng() * arr.length)];

export function makeNoise(seed: number) {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = rng();

  // Ruido de valor periódico en [0,1]. period debe ser entero <= 256.
  function noise(x: number, y: number, period: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const v00 = val[perm[perm[x0] + y0]];
    const v10 = val[perm[perm[x1] + y0]];
    const v01 = val[perm[perm[x0] + y1]];
    const v11 = val[perm[perm[x1] + y1]];
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = v00 + (v10 - v00) * u;
    const b = v01 + (v11 - v01) * u;
    return a + (b - a) * v;
  }

  // fbm periódico: u,v en [0,1), base = frecuencia base (entera)
  function fbm(u: number, v: number, base: number, octaves = 4) {
    let amp = 0.5;
    let f = base;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const per = Math.min(256, f);
      sum += amp * noise(u * f, v * f, per);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }

  // fbm anisotrópico (frecuencias distintas en x e y)
  function fbm2(u: number, v: number, fx: number, fy: number, octaves = 3) {
    let amp = 0.5;
    let sum = 0;
    let norm = 0;
    let ax = fx;
    let ay = fy;
    for (let o = 0; o < octaves; o++) {
      // periodo distinto por eje: usamos el mayor y escalamos
      sum += amp * noise2(u * ax, v * ay, ax, ay);
      norm += amp;
      amp *= 0.5;
      ax *= 2;
      ay *= 2;
    }
    return sum / norm;
  }

  function noise2(x: number, y: number, px: number, py: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const PX = Math.max(1, Math.min(256, Math.round(px)));
    const PY = Math.max(1, Math.min(256, Math.round(py)));
    const x0 = ((xi % PX) + PX) % PX;
    const y0 = ((yi % PY) + PY) % PY;
    const x1 = (x0 + 1) % PX;
    const y1 = (y0 + 1) % PY;
    const v00 = val[perm[perm[x0] + y0]];
    const v10 = val[perm[perm[x1] + y0]];
    const v01 = val[perm[perm[x0] + y1]];
    const v11 = val[perm[perm[x1] + y1]];
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = v00 + (v10 - v00) * u;
    const b = v01 + (v11 - v01) * u;
    return a + (b - a) * v;
  }

  return { noise, fbm, fbm2 };
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
