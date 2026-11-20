import * as THREE from 'three';
import { makeNoise, mulberry32, smoothstep, clamp01 } from './noise';

// Todas las texturas se generan proceduralmente en el navegador (sin descargas).
// Las UV de la geometría están en metros; cada textura define cuántos metros cubre (size).

type RGB = [number, number, number];

export interface PixelData {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(
  canvas: HTMLCanvasElement,
  meters: number | [number, number],
  srgb = true,
): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const [mx, my] = Array.isArray(meters) ? meters : [meters, meters];
  t.repeat.set(1 / mx, 1 / my);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function attachPixels(t: THREE.Texture, img: ImageData) {
  (t.userData as { pixels?: PixelData }).pixels = { data: img.data, w: img.width, h: img.height };
}

// Campo escalar periódico precalculado a baja resolución y muestreado con
// interpolación bilineal: ~15x más rápido que evaluar fbm en cada píxel.
const FIELD_RES = 256;
function field(fn: (u: number, v: number) => number, res = FIELD_RES) {
  const f = new Float32Array(res * res);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) f[y * res + x] = fn(x / res, y / res);
  return (u: number, v: number) => {
    const fx = u * res - 0.5;
    const fy = v * res - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const xa = ((x0 % res) + res) % res;
    const ya = ((y0 % res) + res) % res;
    const xb = (xa + 1) % res;
    const yb = (ya + 1) % res;
    const a = f[ya * res + xa] + (f[ya * res + xb] - f[ya * res + xa]) * tx;
    const b = f[yb * res + xa] + (f[yb * res + xb] - f[yb * res + xa]) * tx;
    return a + (b - a) * ty;
  };
}

// Grano fino barato (hash por píxel, tileable por construcción)
function grainField(seed: number, size: number) {
  const rng = mulberry32(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  // suavizado ligero 3x3 para que no sea ruido blanco puro
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) s += g[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      out[y * size + x] = s / 9;
    }
  }
  // re-expandir el contraste
  for (let i = 0; i < out.length; i++) out[i] = clamp01((out[i] - 0.5) * 2.6 + 0.5);
  return out;
}

// ---------------------------------------------------------------------------
// Estuco envejecido (fachada, interiores, vecinos)
// ---------------------------------------------------------------------------
interface StuccoOpts {
  size: number;
  meters: number;
  base: RGB;
  under: RGB; // capa revelada al descascararse
  peel: number; // umbral (más bajo = más desconchado)
  streaks: number; // manchas de agua verticales 0..1
  grime: number; // suciedad general 0..1
  seed: number;
  rustic?: { course: number; block: number }; // juntas de sillería (en px)
  damp?: number; // manchas de humedad (interior)
}

function stucco(o: StuccoOpts) {
  const { size } = o;
  const N = makeNoise(o.seed);
  const cMap = makeCanvas(size, size);
  const cBump = makeCanvas(size, size);
  const img = cMap.getContext('2d')!.createImageData(size, size);
  const bimg = cBump.getContext('2d')!.createImageData(size, size);
  const d = img.data;
  const bd = bimg.data;
  const inv = 1 / size;
  const fBlot = field((u, v) => N.fbm(u, v, 3, 4));
  const fPeel = field((u, v) => N.fbm(u, v, 5, 5) * 0.8 + N.noise(u * 64, v * 64, 64) * 0.2, Math.min(512, size / 2));
  const fStreak = o.streaks > 0 ? field((u, v) => N.fbm2(u, v, 32, 2, 3)) : () => 0;
  const fDirt = field((u, v) => N.fbm(u, v, 2, 3));
  const fDamp = o.damp ? field((u, v) => N.fbm(u, v, 3, 4)) : () => 0;
  const gr = grainField(o.seed + 99, size);
  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const grain = gr[y * size + x];
      const blot = fBlot(u, v);
      const pe = fPeel(u, v) + (grain - 0.5) * 0.025;
      const peel = smoothstep(o.peel, o.peel + 0.02, pe);
      const rim = smoothstep(o.peel - 0.03, o.peel, pe) - peel;
      const streak = fStreak(u, v);
      const sDark = smoothstep(0.52, 0.78, streak) * o.streaks;
      const dirt = smoothstep(0.45, 0.85, fDirt(u, v)) * o.grime;
      const dv = fDamp(u, v);
      const dampN = o.damp ? smoothstep(0.63, 0.7, dv) : 0;
      const dampRing = o.damp ? smoothstep(0.61, 0.63, dv) - dampN : 0;

      let r = o.base[0] * (0.9 + 0.18 * blot);
      let g = o.base[1] * (0.9 + 0.18 * blot);
      let b = o.base[2] * (0.9 + 0.18 * blot);

      const ur = o.under[0] * (0.85 + 0.3 * grain);
      const ug = o.under[1] * (0.85 + 0.3 * grain);
      const ub = o.under[2] * (0.85 + 0.3 * grain);
      r = r + (ur - r) * peel;
      g = g + (ug - g) * peel;
      b = b + (ub - b) * peel;

      const shade = 1 - rim * 0.28 - sDark * 0.32 - dirt * 0.28 - dampRing * 0.14 * (o.damp ?? 0);
      const g2 = (grain - 0.5) * 14;
      r = r * shade + g2;
      g = g * shade + g2;
      b = b * shade + g2;
      if (dampN > 0 && o.damp) {
        const k = dampN * 0.08 * o.damp;
        r -= 30 * k * 3;
        g -= 34 * k * 3;
        b -= 40 * k * 3;
      }

      let height = 0.7 + 0.12 * blot + 0.08 * grain - 0.45 * peel + 0.1 * rim;

      if (o.rustic) {
        const { course, block } = o.rustic;
        const row = Math.floor(y / course);
        const yy = y % course;
        const off = (row % 2) * block * 0.5;
        const xx = (x + off) % block;
        const jw = Math.max(2, course * 0.047);
        const jv = Math.max(1.5, course * 0.031);
        const jointH = yy < jw ? 1 - yy / jw : 0;
        const jointV = xx < jv ? 1 - xx / jv : 0;
        const j = Math.max(jointH, jointV * 0.6);
        if (j > 0) {
          r *= 1 - 0.45 * j;
          g *= 1 - 0.45 * j;
          b *= 1 - 0.45 * j;
          height -= 0.55 * j;
        }
        // biselado suave del bloque
        const edge = smoothstep(jw, jw * 2.6, yy);
        height = height * (0.85 + 0.15 * edge);
      }

      const i = (y * size + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      const hv = clamp01(height) * 255;
      bd[i] = bd[i + 1] = bd[i + 2] = hv;
      bd[i + 3] = 255;
    }
  }
  cMap.getContext('2d')!.putImageData(img, 0, 0);
  cBump.getContext('2d')!.putImageData(bimg, 0, 0);
  const map = toTexture(cMap, o.meters, true);
  attachPixels(map, img);
  const bump = toTexture(cBump, o.meters, false);
  return { map, bump };
}

// ---------------------------------------------------------------------------
// Losas hidráulicas cubanas (suelo de pisos altos)
// ---------------------------------------------------------------------------
function hydraulicTiles(seed: number, variant: 'A' | 'B' | 'C', size = 1024) {
  const tiles = 8;
  const ts = size / tiles; // 128 px por losa (20 cm)
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const rng = mulberry32(seed);

  const pal = {
    A: { bg: '#d8cdb2', c1: '#a4523a', c2: '#56656e', c3: '#c79a3d', line: '#7c3b2b' },
    B: { bg: '#d6d0c2', c1: '#2f3a3a', c2: '#5d7a5a', c3: '#b9a26c', line: '#3a3a36' },
    C: { bg: '#cbbfa6', c1: '#8b3a3a', c2: '#2d4a63', c3: '#d6b46a', line: '#4a2b22' },
  }[variant];

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = tx * ts;
      const y0 = ty * ts;
      ctx.save();
      ctx.translate(x0, y0);
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, ts, ts);
      if (variant === 'A' || variant === 'C') {
        // cuartos de círculo en esquinas (forman círculos al juntarse)
        ctx.fillStyle = pal.c1;
        for (const [cx, cy] of [
          [0, 0],
          [ts, 0],
          [0, ts],
          [ts, ts],
        ]) {
          ctx.beginPath();
          ctx.arc(cx, cy, ts * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = pal.bg;
        for (const [cx, cy] of [
          [0, 0],
          [ts, 0],
          [0, ts],
          [ts, ts],
        ]) {
          ctx.beginPath();
          ctx.arc(cx, cy, ts * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        // estrella central de 8 puntas
        ctx.fillStyle = pal.c2;
        ctx.beginPath();
        const R = ts * 0.36;
        const r = ts * 0.16;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const rr = k % 2 === 0 ? R : r;
          const px = ts / 2 + Math.cos(a) * rr;
          const py = ts / 2 + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = pal.c3;
        ctx.beginPath();
        ctx.arc(ts / 2, ts / 2, ts * 0.09, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = pal.line;
        ctx.lineWidth = 3;
        ctx.strokeRect(ts * 0.06, ts * 0.06, ts * 0.88, ts * 0.88);
      } else {
        // B: triángulos + rombo central
        ctx.fillStyle = pal.c1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ts / 2, 0);
        ctx.lineTo(0, ts / 2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ts, ts);
        ctx.lineTo(ts / 2, ts);
        ctx.lineTo(ts, ts / 2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ts, 0);
        ctx.lineTo(ts, ts / 2);
        ctx.lineTo(ts / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, ts);
        ctx.lineTo(0, ts / 2);
        ctx.lineTo(ts / 2, ts);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = pal.c2;
        ctx.beginPath();
        ctx.moveTo(ts / 2, ts * 0.18);
        ctx.lineTo(ts * 0.82, ts / 2);
        ctx.lineTo(ts / 2, ts * 0.82);
        ctx.lineTo(ts * 0.18, ts / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = pal.c3;
        ctx.beginPath();
        ctx.arc(ts / 2, ts / 2, ts * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      // losas rotas / reemplazadas con cemento
      const dmg = rng();
      if (dmg < 0.05) {
        ctx.fillStyle = '#77736b';
        ctx.fillRect(0, 0, ts, ts);
      } else if (dmg < 0.14) {
        ctx.strokeStyle = 'rgba(40,30,25,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let px = rng() * ts;
        let py = 0;
        ctx.moveTo(px, py);
        while (py < ts) {
          px += (rng() - 0.5) * 30;
          py += 10 + rng() * 20;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      // junta
      ctx.strokeStyle = 'rgba(60,55,48,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, ts, ts);
      ctx.restore();
    }
  }
  // suciedad, desgaste y polvo
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const N = makeNoise(seed + 11);
  const inv = 1 / size;
  const fDirt = field((u, v) => N.fbm(u, v, 3, 4));
  const fDust = field((u, v) => N.fbm(u + 0.5, v + 0.2, 2, 3));
  const gr = grainField(seed + 5, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const v = y * inv;
      const dirt = fDirt(u, v);
      const dust = smoothstep(0.42, 0.75, fDust(u, v));
      const grain = gr[y * size + x];
      const i = (y * size + x) * 4;
      const k = 0.72 + 0.32 * dirt + (grain - 0.5) * 0.08;
      // mezcla con color de polvo
      d[i] = (d[i] * k) * (1 - dust * 0.55) + 128 * dust * 0.55;
      d[i + 1] = (d[i + 1] * k) * (1 - dust * 0.55) + 118 * dust * 0.55;
      d[i + 2] = (d[i + 2] * k) * (1 - dust * 0.55) + 102 * dust * 0.55;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = toTexture(c, 1.6, true);
  attachPixels(map, img);
  return map;
}

// Mármol ajedrezado (vestíbulo)
function marbleChecker(seed: number, size = 1024) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const N = makeNoise(seed);
  const inv = 1 / size;
  const t = size / 4;
  const fWarp = field((u, v) => N.fbm(u, v, 4, 5), Math.min(512, size / 2));
  const fDirt = field((u, v) => N.fbm(u + 0.3, v + 0.6, 3, 4));
  const fDust = field((u, v) => N.fbm(u + 0.9, v + 0.1, 2, 3));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const v = y * inv;
      const white = (Math.floor(x / t) + Math.floor(y / t)) % 2 === 0;
      const warp = fWarp(u, v);
      const vein = Math.pow(Math.abs(Math.sin((u + v) * 18 + warp * 14)), 18);
      const dirt = fDirt(u, v);
      const dust = smoothstep(0.4, 0.8, fDust(u, v));
      let r, g, b;
      if (white) {
        r = 226 - vein * 70;
        g = 222 - vein * 70;
        b = 212 - vein * 66;
      } else {
        r = 44 + vein * 60;
        g = 44 + vein * 58;
        b = 46 + vein * 56;
      }
      const k = 0.55 + 0.35 * dirt;
      r = r * k * (1 - dust * 0.78) + 120 * dust * 0.78;
      g = g * k * (1 - dust * 0.78) + 112 * dust * 0.78;
      b = b * k * (1 - dust * 0.78) + 98 * dust * 0.78;
      const jx = x % t;
      const jy = y % t;
      if (jx < 2 || jy < 2) {
        r *= 0.55;
        g *= 0.55;
        b *= 0.55;
      }
      const i = (y * size + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = toTexture(c, 1.6, true);
  attachPixels(map, img);
  return map;
}

// Madera vieja (vigas, puertas, pasamanos)
function wood(seed: number, base: RGB, meters = 2) {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const N = makeNoise(seed);
  const inv = 1 / size;
  const fW = field((u, v) => N.fbm2(u, v, 2, 24, 3), 256);
  const fWeather = field((u, v) => N.fbm(u + 0.4, v, 4, 4));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const v = y * inv;
      const w = fW(u, v);
      const rings = 0.5 + 0.5 * Math.sin(w * 40 + v * 90);
      const plank = Math.floor(v * 4);
      const pv = N.noise(plank * 7.3, 3.1, 256);
      const gap = (y % (size / 4)) < 2 ? 0.45 : 1;
      const weather = fWeather(u, v);
      const k = (0.65 + 0.25 * rings + 0.2 * pv) * gap * (0.8 + 0.3 * weather);
      const gray = smoothstep(0.55, 0.8, weather) * 0.35; // madera agrisada
      const i = (y * size + x) * 4;
      d[i] = base[0] * k * (1 - gray) + 120 * gray;
      d[i + 1] = base[1] * k * (1 - gray) + 115 * gray;
      d[i + 2] = base[2] * k * (1 - gray) + 108 * gray;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = toTexture(c, meters, true);
  attachPixels(map, img);
  return map;
}

function concrete(seed: number, base: RGB, meters: number, cracks = true) {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const N = makeNoise(seed);
  const inv = 1 / size;
  const fN = field((u, v) => N.fbm(u, v, 4, 5));
  const fStain = field((u, v) => N.fbm(u + 0.5, v + 0.5, 2, 4));
  const gr = grainField(seed + 7, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      const v = y * inv;
      const n = fN(u, v);
      const grain = gr[y * size + x];
      const stain = smoothstep(0.55, 0.8, fStain(u, v));
      const k = (0.8 + 0.3 * n) * (1 - stain * 0.3) + (grain - 0.5) * 0.12;
      const i = (y * size + x) * 4;
      d[i] = base[0] * k;
      d[i + 1] = base[1] * k;
      d[i + 2] = base[2] * k;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (cracks) {
    const rng = mulberry32(seed + 3);
    ctx.strokeStyle = 'rgba(30,28,25,0.55)';
    for (let k = 0; k < 7; k++) {
      ctx.lineWidth = 0.8 + rng() * 1.2;
      ctx.beginPath();
      let x = rng() * size;
      let y = rng() * size;
      ctx.moveTo(x, y);
      const ang = rng() * Math.PI * 2;
      for (let s = 0; s < 14; s++) {
        x += Math.cos(ang + (rng() - 0.5) * 1.6) * 14;
        y += Math.sin(ang + (rng() - 0.5) * 1.6) * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const out = ctx.getImageData(0, 0, size, size);
  const map = toTexture(c, meters, true);
  attachPixels(map, out);
  return map;
}

// Celosía de ladrillo (alpha): ladrillos naranjas en hiladas trabadas con huecos
function lattice() {
  // Pantalla de ladrillo naranja con huecos cuadrados en hiladas alternas (foto del vestíbulo)
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const rng = mulberry32(19);
  const rows = 6; // la textura cubre 1,2 m → 20 cm por hilada
  const cols = 6;
  const rh = size / rows;
  const cw = size / cols;
  // fondo de ladrillo con variación por pieza
  for (let r = 0; r < rows * 2; r++) {
    for (let k = -1; k <= cols * 2; k++) {
      const shade = 0.8 + rng() * 0.35;
      ctx.fillStyle = `rgb(${Math.round(182 * shade)},${Math.round(86 * shade)},${Math.round(50 * shade)})`;
      const off = (r % 2) * (cw / 4);
      ctx.fillRect(k * (cw / 2) + off, r * (rh / 2), cw / 2 - 2, rh / 2 - 2);
    }
  }
  // huecos cuadrados al tresbolillo
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * (cw / 2);
    for (let k = -1; k <= cols; k++) {
      const hw = cw * 0.5;
      const hh = rh * 0.52;
      const x = k * cw + off + (cw - hw) / 2;
      const y = r * rh + (rh - hh) / 2;
      ctx.clearRect(x, y, hw, hh);
    }
  }
  const img = ctx.getImageData(0, 0, size, size);
  const N = makeNoise(77);
  const fL = field((u, v) => N.fbm(u, v, 8, 3), 128);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (img.data[i + 3] > 0) {
        const k = 0.72 + 0.45 * fL(x / size, y / size);
        img.data[i] *= k;
        img.data[i + 1] *= k;
        img.data[i + 2] *= k;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = toTexture(c, 1.2, true);
  attachPixels(map, img);
  return map;
}


// Vitral del medio punto: cuadrícula de vidrios rojos, naranjas y oscuros
function stainedGlass() {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1a120d';
  ctx.fillRect(0, 0, size, size);
  const cols = ['#d4544b', '#e2735f', '#c4443d', '#ef8f78', '#b33b35', '#e86a5c'];
  const rng = mulberry32(9);
  const nx = 6;
  const ny = 4;
  const cw = size / nx;
  const ch = size / ny;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const broken = rng() < 0.06;
      ctx.fillStyle = broken ? '#0c0907' : cols[Math.floor(rng() * cols.length)];
      ctx.fillRect(i * cw + 7, j * ch + 7, cw - 14, ch - 14);
    }
  }
  // polvo
  const img = ctx.getImageData(0, 0, size, size);
  const N = makeNoise(5);
  const fG = field((u, v) => N.fbm(u, v, 4, 3), 128);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const k = 0.55 + 0.45 * fG(x / size, y / size);
      img.data[i] *= k;
      img.data[i + 1] *= k;
      img.data[i + 2] *= k;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  attachPixels(t, img);
  return t;
}


// ---------------------------------------------------------------------------
// Texturas del interior del hotel (según las fotos)
// ---------------------------------------------------------------------------

// Panel del techo artesonado: fondo blanco con cenefa de yesería, rosetón y moho
function cofferPanel(seed: number, size = 512) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e9e6de';
  ctx.fillRect(0, 0, size, size);
  const b = size * 0.08;
  ctx.strokeStyle = '#b9b3a6';
  ctx.lineWidth = 3;
  ctx.strokeRect(b, b, size - 2 * b, size - 2 * b);
  ctx.strokeRect(b * 1.9, b * 1.9, size - 3.8 * b, size - 3.8 * b);
  ctx.fillStyle = '#c9c2b4';
  const n = 16;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const pts: [number, number][] = [
      [b + t * (size - 2 * b), b * 1.45],
      [b + t * (size - 2 * b), size - b * 1.45],
      [b * 1.45, b + t * (size - 2 * b)],
      [size - b * 1.45, b + t * (size - 2 * b)],
    ];
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.ellipse(x, y, size * 0.012, size * 0.018, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // rosetón central
  ctx.strokeStyle = '#bdb6a8';
  ctx.lineWidth = 2;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(size / 2 + Math.cos(a) * size * 0.06, size / 2 + Math.sin(a) * size * 0.06, size * 0.05, size * 0.02, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#4a4540';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.012, 0, Math.PI * 2);
  ctx.fill();
  // moho y humedad (manchas negras/grises como en la foto)
  const img = ctx.getImageData(0, 0, size, size);
  const N = makeNoise(seed);
  const fM = field((u, v) => N.fbm(u, v, 6, 5), 256);
  const fS = field((u, v) => N.fbm(u + 0.3, v + 0.7, 2, 3), 128);
  const gr = grainField(seed + 3, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      const mold =
        smoothstep(0.55, 0.7, fM(u, v) + (gr[y * size + x] - 0.5) * 0.25) * (0.5 + 0.9 * smoothstep(0.35, 0.7, fS(u, v)));
      const k = 1 - Math.min(0.75, mold * 0.8);
      img.data[i] = img.data[i] * k + 20 * (1 - k);
      img.data[i + 1] = img.data[i + 1] * k + 22 * (1 - k);
      img.data[i + 2] = img.data[i + 2] * k + 20 * (1 - k);
    }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c, 3, true);
  attachPixels(t, img);
  return t;
}

// Friso del patio: ovas y dardos sobre una franja de hojas (relieve con bump)
function frieze(seed: number) {
  const w = 1024;
  const h = 256; // 4 m x 1 m
  const cm = makeCanvas(w, h);
  const cb = makeCanvas(w, h);
  const ctx = cm.getContext('2d')!;
  const bctx = cb.getContext('2d')!;
  ctx.fillStyle = '#d9cfb8';
  ctx.fillRect(0, 0, w, h);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, w, h);
  const ovals = 26;
  const ow = w / ovals;
  for (let i = 0; i < ovals; i++) {
    const x = (i + 0.5) * ow;
    ctx.fillStyle = '#e2d8c2';
    ctx.beginPath();
    ctx.ellipse(x, h * 0.3, ow * 0.33, h * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9d927c';
    ctx.lineWidth = 3;
    ctx.stroke();
    bctx.fillStyle = '#e0e0e0';
    bctx.beginPath();
    bctx.ellipse(x, h * 0.3, ow * 0.33, h * 0.17, 0, 0, Math.PI * 2);
    bctx.fill();
    bctx.strokeStyle = '#303030';
    bctx.lineWidth = 4;
    bctx.stroke();
    // dardo
    ctx.fillStyle = '#a69b84';
    ctx.beginPath();
    ctx.moveTo(x + ow / 2, h * 0.12);
    ctx.lineTo(x + ow / 2 + 4, h * 0.42);
    ctx.lineTo(x + ow / 2 - 4, h * 0.42);
    ctx.fill();
  }
  // franja inferior de hojas
  for (let i = 0; i < ovals * 1.5; i++) {
    const x = (i + 0.5) * (w / (ovals * 1.5));
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#cfc4ab';
      ctx.beginPath();
      ctx.ellipse(x + s * 8, h * 0.72, 9, 26, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      bctx.fillStyle = '#c8c8c8';
      bctx.beginPath();
      bctx.ellipse(x + s * 8, h * 0.72, 9, 26, s * 0.5, 0, Math.PI * 2);
      bctx.fill();
    }
  }
  // listeles
  const bands: [number, number][] = [
    [0, 10],
    [h * 0.52, 8],
    [h - 12, 12],
  ];
  for (const [y, hh] of bands) {
    ctx.fillStyle = '#e6dcc6';
    ctx.fillRect(0, y, w, hh);
    bctx.fillStyle = '#f0f0f0';
    bctx.fillRect(0, y, w, hh);
  }
  // suciedad y manchas rosadas (como la cornisa del patio)
  const img = ctx.getImageData(0, 0, w, h);
  const N = makeNoise(seed);
  const fD = field((u, v) => N.fbm(u, v, 4, 4), 256);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = fD(x / w, y / h);
      const k = 0.62 + 0.45 * d;
      const pink = smoothstep(0.6, 0.8, d) * 0.25;
      img.data[i] = img.data[i] * k + 60 * pink;
      img.data[i + 1] = img.data[i + 1] * k - 10 * pink;
      img.data[i + 2] = img.data[i + 2] * k;
    }
  ctx.putImageData(img, 0, 0);
  const map = toTexture(cm, [4, 1], true);
  map.wrapT = THREE.ClampToEdgeWrapping;
  attachPixels(map, img);
  const bump = toTexture(cb, [4, 1], false);
  bump.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bump };
}

// Zócalo de azulejos blancos con cruz roja (vestíbulo)
function azulejos(seed: number) {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const tiles = 4; // 4x4 azulejos de 15 cm → textura de 0,6 m
  const ts = size / tiles;
  const rng = mulberry32(seed);
  for (let j = 0; j < tiles; j++)
    for (let i = 0; i < tiles; i++) {
      ctx.save();
      ctx.translate(i * ts, j * ts);
      ctx.fillStyle = '#ece6da';
      ctx.fillRect(0, 0, ts, ts);
      ctx.fillStyle = '#b5352b';
      const a = ts * 0.12;
      ctx.fillRect(ts / 2 - a / 2, ts * 0.18, a, ts * 0.64);
      ctx.fillRect(ts * 0.18, ts / 2 - a / 2, ts * 0.64, a);
      ctx.beginPath();
      ctx.arc(ts / 2, ts / 2, ts * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ece6da';
      ctx.beginPath();
      ctx.arc(ts / 2, ts / 2, ts * 0.06, 0, Math.PI * 2);
      ctx.fill();
      if (rng() < 0.12) {
        ctx.fillStyle = '#8b8378';
        ctx.fillRect(0, 0, ts, ts);
      }
      ctx.strokeStyle = '#9d968a';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, ts, ts);
      ctx.restore();
    }
  const img = ctx.getImageData(0, 0, size, size);
  const N = makeNoise(seed + 1);
  const fD = field((u, v) => N.fbm(u, v, 3, 4), 128);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const k = 0.62 + 0.4 * fD(x / size, y / size);
      img.data[i] *= k;
      img.data[i + 1] *= k;
      img.data[i + 2] *= k;
    }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c, 0.6, true);
  attachPixels(t, img);
  return t;
}

// Suelo mojado: terrazo oscuro con charcos (mapa de rugosidad: charco = liso y brillante)
function wetFloor(seed: number, size = 512) {
  const cm = makeCanvas(size, size);
  const cr = makeCanvas(size, size);
  const img = cm.getContext('2d')!.createImageData(size, size);
  const rimg = cr.getContext('2d')!.createImageData(size, size);
  const N = makeNoise(seed);
  const fP = field((u, v) => N.fbm(u, v, 3, 5), 256);
  const fD = field((u, v) => N.fbm(u + 0.4, v + 0.1, 5, 4), 256);
  const gr = grainField(seed + 2, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      const g = gr[y * size + x];
      const puddle = smoothstep(0.52, 0.56, fP(u, v));
      const base = 68 + 40 * fD(u, v) + (g - 0.5) * 26;
      const speck = g > 0.86 ? 40 : 0;
      const val = (base + speck) * (1 - puddle * 0.45);
      img.data[i] = val * 0.98;
      img.data[i + 1] = val;
      img.data[i + 2] = val * 1.04;
      img.data[i + 3] = 255;
      const rough = 0.85 - puddle * 0.8;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough * 255;
      rimg.data[i + 3] = 255;
    }
  cm.getContext('2d')!.putImageData(img, 0, 0);
  cr.getContext('2d')!.putImageData(rimg, 0, 0);
  const map = toTexture(cm, 6, true);
  attachPixels(map, img);
  const rough = toTexture(cr, 6, false);
  return { map, rough };
}

// Fachada genérica con ventanas para el skyline lejano (se tiñe con color)
function windowsFacade(seed: number) {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const rng = mulberry32(seed);
  ctx.fillStyle = '#eeeeee';
  ctx.fillRect(0, 0, size, size);
  const bays = 4;
  const floors = 4;
  const bw = size / bays;
  const fh = size / floors;
  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      const x = b * bw + bw * 0.28;
      const y = f * fh + fh * 0.2;
      const w = bw * 0.44;
      const h = fh * 0.62;
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
      const r = rng();
      ctx.fillStyle = r < 0.55 ? '#1d1b1a' : r < 0.8 ? '#3c4c46' : '#5b3b2a';
      ctx.fillRect(x, y, w, h);
      // balcón
      ctx.fillStyle = '#cfcfcf';
      ctx.fillRect(x - 10, y + h - 4, w + 20, 10);
    }
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(0, f * fh, size, 5);
  }
  const img = ctx.getImageData(0, 0, size, size);
  const N = makeNoise(seed + 1);
  const fW = field((u, v) => N.fbm(u, v, 3, 4), 128);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const k = 0.72 + 0.3 * fW(x / size, y / size);
      img.data[i] *= k;
      img.data[i + 1] *= k;
      img.data[i + 2] *= k;
    }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, [12, 14], true);
}

export type TextureSet = ReturnType<typeof generateTextures>;

export function generateTextures(scale = 1) {
  const t0 = performance.now();
  const S = (n: number) => Math.max(256, Math.round(n * scale));
  const big = S(1024);
  const facade = stucco({
    size: big,
    meters: 4,
    base: [204, 176, 120],
    under: [160, 146, 122],
    peel: 0.645,
    streaks: 1.15,
    grime: 0.75,
    seed: 1,
  });
  const trim = stucco({
    size: S(512),
    meters: 2.5,
    base: [184, 174, 152],
    under: [150, 142, 128],
    peel: 0.66,
    streaks: 0.95,
    grime: 0.75,
    seed: 2,
  });
  const rustic = stucco({
    size: big,
    meters: 3.6,
    base: [196, 168, 112],
    under: [150, 136, 114],
    peel: 0.65,
    streaks: 0.7,
    grime: 0.85,
    seed: 3,
    rustic: { course: big / 8, block: big / 3 },
  });
  const plaster = stucco({
    size: big,
    meters: 3,
    base: [240, 236, 226],
    under: [196, 184, 164],
    peel: 0.72,
    streaks: 0.5,
    grime: 0.7,
    seed: 4,
    damp: 1,
  });
  const paint = stucco({
    size: S(512),
    meters: 4,
    base: [238, 236, 230],
    under: [170, 165, 155],
    peel: 0.66,
    streaks: 0.8,
    grime: 0.5,
    seed: 5,
  });

  const tilesA = hydraulicTiles(21, 'A', big);
  const tilesB = hydraulicTiles(22, 'B', big);
  const tilesC = hydraulicTiles(23, 'C', big);
  const marble = marbleChecker(31, big);
  const woodDark = wood(41, [96, 62, 38]);
  const woodLight = wood(42, [140, 100, 64], 1.5);
  const concreteRoof = concrete(51, [150, 112, 92], 3); // rasilla rojiza
  const concreteGray = concrete(52, [158, 155, 148], 3);
  const asphalt = concrete(53, [70, 70, 72], 5, true);
  const latticeTex = lattice();
  const glass = stainedGlass();
  const windows = windowsFacade(61);
  const coffer = cofferPanel(71);
  const friezeTex = frieze(72);
  const tilesWall = azulejos(73);
  const wet = wetFloor(74, S(512));
  const ms = performance.now() - t0;
  if (typeof console !== 'undefined') console.info(`[texturas] generadas en ${ms.toFixed(0)} ms`);

  return {
    facade,
    trim,
    rustic,
    plaster,
    paint,
    tilesA,
    tilesB,
    tilesC,
    marble,
    woodDark,
    woodLight,
    concreteRoof,
    concreteGray,
    asphalt,
    lattice: latticeTex,
    glass,
    windows,
    coffer,
    frieze: friezeTex,
    tilesWall,
    wet,
  };
}
