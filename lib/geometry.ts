import * as THREE from 'three';
import type { Opening } from './building';

// Caja con UV en metros (para que las texturas mantengan escala real)
export function boxGeo(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // orden de caras: px, nx, py, ny, pz, nz (4 vértices cada una)
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  uv.needsUpdate = true;
  return g;
}

const cache = new Map<string, THREE.BufferGeometry>();
export function cachedBox(w: number, h: number, d: number) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = cache.get(k);
  if (!g) {
    g = boxGeo(w, h, d);
    cache.set(k, g);
  }
  return g;
}

// Cilindro con UV en metros
export function cylGeo(rt: number, rb: number, h: number, seg = 20) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const circ = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  return g;
}

// Muro con huecos (puertas/ventanas/arcos) extruido. Coordenadas locales:
// x de 0 a length, y de 0 a height; extrusión en +z de 0 a thickness.
// Los huecos se dan en coordenadas locales.
export function wallGeo(length: number, height: number, thickness: number, holes: Opening[]) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(length, 0);
  s.lineTo(length, height);
  s.lineTo(0, height);
  s.lineTo(0, 0);
  for (const o of holes) {
    const x0 = o.x - o.w / 2;
    const x1 = o.x + o.w / 2;
    const y0 = Math.max(o.y, 0.012);
    const p = new THREE.Path();
    p.moveTo(x0, y0);
    p.lineTo(x1, y0);
    p.lineTo(x1, o.y + o.h);
    if (o.arch) {
      p.absarc(o.x, o.y + o.h, o.w / 2, 0, Math.PI, false);
    } else {
      p.lineTo(x0, o.y + o.h);
    }
    p.lineTo(x0, y0);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 18 });
  g.computeVertexNormals();
  return g;
}

// Arco (archivolta) como sección de toro
export function archGeo(radius: number, tube: number) {
  return new THREE.TorusGeometry(radius, tube, 8, 28, Math.PI);
}

// Perfil de ménsula extruido (apoyo de balcón)
export function corbelGeo(depth: number, height: number, width: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(depth, 0);
  s.lineTo(depth, -height * 0.22);
  s.quadraticCurveTo(depth * 0.35, -height * 0.3, depth * 0.25, -height * 0.7);
  s.quadraticCurveTo(depth * 0.18, -height, 0, -height);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 10 });
  // eje: profundidad en x → la rotamos para que sobresalga en +z
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

// Balaustre torneado
export function balusterGeo(h: number) {
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [
    [0.06, 0],
    [0.06, 0.06],
    [0.045, 0.08],
    [0.05, 0.14],
    [0.075, 0.3],
    [0.07, 0.42],
    [0.035, 0.6],
    [0.03, 0.72],
    [0.045, 0.78],
    [0.055, 0.86],
    [0.055, 0.92],
    [0.065, 0.94],
    [0.065, 1.0],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y * h));
  return new THREE.LatheGeometry(pts, 12);
}

// Catenaria para cables eléctricos
export function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, segs = 40) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}
