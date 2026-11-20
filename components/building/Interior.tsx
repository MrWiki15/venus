'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bx, Cyl, useMats } from '../ctx';
import { wallGeo, boxGeo } from '@/lib/geometry';
import {
  LEVELS,
  ROOF,
  SLAB,
  IN_X,
  IN_FRONT,
  IN_BACK,
  HALF,
  DEPTH,
  STAIR,
  SALA_Z,
  ZAGUAN_X,
  ZAGUAN_END_Z,
  LOBBY_BACK_Z,
  LOBBY_COLUMNS,
  COFFER,
  PATIO,
  PATIO_BAYS_X,
  PATIO_BAYS_Z,
  GAL_X0,
  GAL_Z1,
  BAYS,
  ELEV,
  ELEV_X,
  TRAFO_ROOM,
  ATTIC_VENTS,
  groundOpenings,
  upperOpenings,
  type Opening,
} from '@/lib/building';

type V3 = [number, number, number];
type Rect = [number, number, number, number]; // x0, x1, z0, z1 (z0 < z1)

// Piezas de cada forjado: todo el rectángulo menos el patio y el hueco de escalera
const SLAB_RECTS: Rect[] = [
  [-IN_X, IN_X, STAIR.zFront, IN_FRONT],
  [-IN_X, PATIO.x0, IN_BACK, STAIR.zFront],
  [PATIO.x0, PATIO.x1, PATIO.z0, STAIR.zFront],
  [PATIO.x0, PATIO.x1, IN_BACK, PATIO.z1],
  // galería derecha, recortada por el hueco del ascensor
  [PATIO.x1, STAIR.wallX, IN_BACK, ELEV.zBack],
  [PATIO.x1, ELEV.x0, ELEV.zBack, STAIR.zFront],
  [STAIR.wallX, IN_X, IN_BACK, STAIR.zBack],
];

// Tabique con huecos. axis 'x': recorre x desde `from`; axis 'z': recorre z desde `from` (creciente).
export function Wall({
  axis,
  from,
  length,
  at,
  y,
  height,
  t = 0.25,
  holes = [],
  mat,
}: {
  axis: 'x' | 'z';
  from: number;
  length: number;
  at: number;
  y: number;
  height: number;
  t?: number;
  holes?: Opening[];
  mat: THREE.Material;
}) {
  const geo = useMemo(
    () => wallGeo(length, height, t, holes.map((h) => ({ ...h, x: h.x - from, y: h.y - y }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axis, from, length, at, y, height, t],
  );
  if (axis === 'x') {
    return <mesh geometry={geo} material={mat} position={[from, y, at - t / 2]} castShadow receiveShadow />;
  }
  return (
    <mesh geometry={geo} material={mat} position={[at + t / 2, y, from]} rotation={[0, -Math.PI / 2, 0]} castShadow receiveShadow />
  );
}

// Vigas de madera bajo cada forjado, recortadas a las piezas del forjado
function Beams({ n }: { n: number }) {
  const m = useMats().building;
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const y = LEVELS[n + 1] - SLAB - 0.11;
    const res: { p: V3; s: V3 }[] = [];
    for (let z = -1.0; z > IN_BACK + 0.3; z -= 0.75) {
      for (const [x0, x1, z0, z1] of SLAB_RECTS) {
        if (z <= z0 || z >= z1) continue;
        let a = x0;
        const b = x1;
        // en planta baja el vestíbulo tiene artesonado en lugar de vigas
        if (n === 0 && z > STAIR.zFront) continue;
        if (n === 0 && z > PATIO.z0 + 0.25 && a < ELEV.x0) a = ELEV.x0;
        if (b - a > 0.3) res.push({ p: [(a + b) / 2, y, z], s: [b - a, 0.22, 0.14] });
      }
    }
    return res;
  }, [n]);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.scale.set(...it.s);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  });
  return <instancedMesh ref={ref} args={[geo, m.woodDark, items.length]} castShadow receiveShadow />;
}

// Escalera de ida y vuelta del nivel n al n+1
function Stair({ n, openSide = false }: { n: number; openSide?: boolean }) {
  const m = useMats().building;
  const L = LEVELS[n];
  const h = LEVELS[n + 1] - L;
  const half = h / 2;
  const run = STAIR.zFront - STAIR.zLanding;
  const N = Math.round(half / 0.17);
  const r = half / N;
  const t = run / N;
  const wA = STAIR.aX1 - STAIR.aX0;
  const wB = STAIR.bX1 - STAIR.bX0;
  const cA = (STAIR.aX0 + STAIR.aX1) / 2;
  const cB = (STAIR.bX0 + STAIR.bX1) / 2;

  const { steps, rails } = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    const railGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < N; i++) {
      const gA = boxGeo(wA, r + 0.06, t + 0.02);
      gA.translate(cA, L + (i + 1) * r - (r + 0.06) / 2, STAIR.zFront - (i + 0.5) * t);
      geos.push(gA);
      const gB = boxGeo(wB, r + 0.06, t + 0.02);
      gB.translate(cB, L + half + (i + 1) * r - (r + 0.06) / 2, STAIR.zLanding + (i + 0.5) * t);
      geos.push(gB);
      const nA = boxGeo(wA, 0.035, 0.05);
      nA.translate(cA, L + (i + 1) * r - 0.017, STAIR.zFront - i * t + 0.02);
      geos.push(nA);
      const nB = boxGeo(wB, 0.035, 0.05);
      nB.translate(cB, L + half + (i + 1) * r - 0.017, STAIR.zLanding + i * t - 0.02);
      geos.push(nB);
      for (const [x, y, z] of [
        [STAIR.aX1 - 0.05, L + (i + 1) * r, STAIR.zFront - (i + 0.5) * t],
        [STAIR.bX0 + 0.05, L + half + (i + 1) * r, STAIR.zLanding + (i + 0.5) * t],
        ...(openSide ? [[STAIR.aX0 + 0.05, L + (i + 1) * r, STAIR.zFront - (i + 0.5) * t]] : []),
      ]) {
        const b = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6);
        b.translate(x, y + 0.45, z);
        railGeos.push(b);
      }
    }
    const landing = boxGeo(STAIR.bX1 - STAIR.aX0, 0.22, STAIR.zLanding - STAIR.zBack);
    landing.translate((STAIR.aX0 + STAIR.bX1) / 2, L + half - 0.11, (STAIR.zLanding + STAIR.zBack) / 2);
    geos.push(landing);
    return { steps: mergeGeometries(geos.map((g) => g.toNonIndexed()))!, rails: mergeGeometries(railGeos.map((g) => g.toNonIndexed()))! };
  }, [L, N, r, t, half, wA, wB, cA, cB, openSide]);

  const slope = Math.atan2(half, run);
  const len = Math.hypot(half, run);
  return (
    <group>
      <mesh geometry={steps} material={m.stone} castShadow receiveShadow />
      <mesh geometry={rails} material={m.iron} castShadow />
      <Bx s={[wA, 0.16, len]} p={[cA, L + half / 2 - 0.1, (STAIR.zFront + STAIR.zLanding) / 2]} r={[slope, 0, 0]} m={m.ceiling} />
      <Bx s={[wB, 0.16, len]} p={[cB, L + half + half / 2 - 0.1, (STAIR.zFront + STAIR.zLanding) / 2]} r={[-slope, 0, 0]} m={m.ceiling} />
      <Bx s={[0.07, 0.06, len]} p={[STAIR.aX1 - 0.05, L + half / 2 + 0.92, (STAIR.zFront + STAIR.zLanding) / 2]} r={[slope, 0, 0]} m={m.woodDark} />
      <Bx s={[0.07, 0.06, len]} p={[STAIR.bX0 + 0.05, L + half + half / 2 + 0.92, (STAIR.zFront + STAIR.zLanding) / 2]} r={[-slope, 0, 0]} m={m.woodDark} />
      <Bx s={[0.5, 0.06, 0.07]} p={[(STAIR.aX1 + STAIR.bX0) / 2, L + half + 0.92, STAIR.zLanding - 0.02]} m={m.woodDark} />
      {openSide && (
        <Bx s={[0.07, 0.06, len]} p={[STAIR.aX0 + 0.05, L + half / 2 + 0.92, (STAIR.zFront + STAIR.zLanding) / 2]} r={[slope, 0, 0]} m={m.woodDark} />
      )}
    </group>
  );
}

function Slab({ k }: { k: number }) {
  const m = useMats().building;
  const top = LEVELS[k];
  const wallM = m.walls[Math.max(0, k - 1)];
  const topM = k === 5 ? m.roof : m.floors[k];
  const mats = useMemo(() => [wallM, wallM, topM, m.ceiling, wallM, wallM], [wallM, topM, m.ceiling]);
  return (
    <group>
      {SLAB_RECTS.map(([x0, x1, z0, z1], i) => (
        <Bx key={i} s={[x1 - x0, SLAB, z1 - z0]} p={[(x0 + x1) / 2, top - SLAB / 2, (z0 + z1) / 2]} m={mats} />
      ))}
    </group>
  );
}

function backHoles(n: number): Opening[] {
  const L = LEVELS[n];
  const res: Opening[] = [];
  for (const x of [-9.5, -3.3, 3.3, 9.5]) res.push({ x, y: L + 1.0, w: 1.2, h: 1.7 });
  return res;
}

function frontHoles(n: number): Opening[] {
  if (n === 0) return groundOpenings();
  const res = upperOpenings(n);
  if (n === 4) for (const vx of ATTIC_VENTS) res.push({ x: vx, y: ROOF - 0.95, w: 1.3, h: 0.42 });
  return res;
}

// ---------------------------------------------------------------------------
// Patio central: arcada en planta baja y fachadas interiores con pilastras gigantes
// ---------------------------------------------------------------------------
type Side = { axis: 'x' | 'z'; at: number; from: number; len: number; bays: number[]; dir: number };
const PATIO_SIDES: Side[] = [
  { axis: 'x', at: PATIO.z0, from: PATIO.x0, len: PATIO.x1 - PATIO.x0, bays: PATIO_BAYS_X, dir: -1 }, // delantero, mira a -z
  { axis: 'x', at: PATIO.z1, from: PATIO.x0, len: PATIO.x1 - PATIO.x0, bays: PATIO_BAYS_X, dir: 1 }, // trasero, mira a +z
  { axis: 'z', at: PATIO.x0, from: PATIO.z1, len: PATIO.z0 - PATIO.z1, bays: PATIO_BAYS_Z, dir: 1 }, // izquierdo, mira a +x
  { axis: 'z', at: PATIO.x1, from: PATIO.z1, len: PATIO.z0 - PATIO.z1, bays: PATIO_BAYS_Z, dir: -1 }, // derecho, mira a -x
];
const PATIO_T = 0.5;

// Caja colocada sobre la cara de un lado del patio: u = posición a lo largo, size = [ancho, alto, vuelo]
function SideBox({ side, u, y, size, m }: { side: Side; u: number; y: number; size: V3; m: THREE.Material }) {
  const off = side.at + side.dir * (PATIO_T / 2 + size[2] / 2);
  if (side.axis === 'x') return <Bx s={[size[0], size[1], size[2]]} p={[u, y, off]} m={m} />;
  return <Bx s={[size[2], size[1], size[0]]} p={[off, y, u]} m={m} />;
}

function piersOf(side: Side) {
  const a = side.from;
  const b = side.from + side.len;
  const p = [a, b];
  for (let i = 0; i < side.bays.length - 1; i++) p.push((side.bays[i] + side.bays[i + 1]) / 2);
  return p;
}

function PatioGround() {
  const m = useMats().building;
  const L = LEVELS[0];
  const H = LEVELS[1] - SLAB - L;
  return (
    <group name="patio-planta-baja">
      {PATIO_SIDES.map((s, i) => (
        <group key={i}>
          <Wall
            axis={s.axis}
            from={s.from}
            length={s.len}
            at={s.at}
            y={L - 0.02}
            height={H + 0.02}
            t={PATIO_T}
            holes={s.bays.map((u) => ({ x: u, y: L - 0.02, w: 2.3, h: 2.45, arch: true }))}
            mat={m.patioWall}
          />
          {/* pilastras almohadilladas de franjas blancas con zócalo marrón */}
          {piersOf(s).map((u) => (
            <group key={u}>
              <SideBox side={s} u={u} y={L + 0.55} size={[0.95, 1.1, 0.1]} m={m.dado} />
              <SideBox side={s} u={u} y={L + 1.1 + (4.3 - 1.1) / 2} size={[0.85, 4.3 - 1.1, 0.08]} m={m.pierBands} />
            </group>
          ))}
          {/* friso de ovas y cornisa rosada sobre la arcada */}
          <SideBox side={s} u={s.from + s.len / 2} y={4.62} size={[s.len + 0.3, 0.55, 0.12]} m={m.frieze} />
          <SideBox side={s} u={s.from + s.len / 2} y={5.0} size={[s.len + 0.6, 0.22, 0.35]} m={m.pinkCornice} />
          <SideBox side={s} u={s.from + s.len / 2} y={4.3} size={[s.len + 0.2, 0.1, 0.18]} m={m.patioUpper} />
        </group>
      ))}
      {/* suelo de cemento del patio */}
      <Bx s={[PATIO.x1 - PATIO.x0, 0.02, PATIO.z0 - PATIO.z1]} p={[0, L + 0.01, (PATIO.z0 + PATIO.z1) / 2]} m={m.patioFloor} cast={false} />
    </group>
  );
}

function PatioUpper({ n }: { n: number }) {
  const m = useMats().building;
  const L = LEVELS[n];
  const H = LEVELS[n + 1] - SLAB - L;
  const hole = (u: number): Opening =>
    n === 1
      ? { x: u, y: L + 0.02, w: 1.7, h: 3.0 }
      : n === 4
        ? { x: u, y: L + 0.75, w: 1.5, h: 2.0, arch: true }
        : { x: u, y: L + 0.75, w: 1.5, h: 2.5 };
  return (
    <group>
      {PATIO_SIDES.map((s, i) => (
        <group key={i}>
          <Wall axis={s.axis} from={s.from} length={s.len} at={s.at} y={L - 0.02} height={H + 0.02} t={PATIO_T} holes={s.bays.map(hole)} mat={m.patioUpper} />
          {/* antepecho de hierro en los huecos grandes del primer piso */}
          {n === 1 &&
            s.bays.map((u) => (
              <group key={u}>
                <SideBox side={s} u={u} y={L + 0.95} size={[1.7, 0.05, 0.05]} m={m.iron} />
                {Array.from({ length: 15 }, (_, k) => (
                  <SideBox key={k} side={s} u={u - 0.77 + k * 0.11} y={L + 0.5} size={[0.022, 0.9, 0.022]} m={m.iron} />
                ))}
                <SideBox side={s} u={u} y={L + 0.1} size={[1.7, 0.04, 0.04]} m={m.iron} />
              </group>
            ))}
          {/* impostas entre pisos */}
          <SideBox side={s} u={s.from + s.len / 2} y={L + 0.15} size={[s.len, 0.3, 0.06]} m={m.pinkCornice} />
        </group>
      ))}
    </group>
  );
}

// Pilastras gigantes de las fachadas del patio (de la cornisa de la arcada hasta la azotea)
function PatioPilasters() {
  const m = useMats().building;
  const y0 = LEVELS[1] - 0.2;
  const y1 = ROOF + 0.6;
  return (
    <group>
      {PATIO_SIDES.flatMap((s, i) =>
        piersOf(s).map((u) => (
          <group key={`${i}-${u}`}>
            <SideBox side={s} u={u} y={(y0 + y1) / 2} size={[0.6, y1 - y0, 0.14]} m={m.patioUpper} />
            <SideBox side={s} u={u} y={y1 - 0.15} size={[0.8, 0.3, 0.26]} m={m.patioUpper} />
          </group>
        )),
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Vestíbulo: techo artesonado, columnas, zócalo de azulejos, suelo mojado
// ---------------------------------------------------------------------------
function coffersGeo(x0: number, x1: number, z0: number, z1: number, y: number) {
  // plano del techo con UV en coordenadas de mundo (paneles alineados a la retícula)
  const g = new THREE.BufferGeometry();
  const pos = [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1];
  const uv = [x0, -z0, x1, -z0, x1, -z1, x0, -z1].map((v) => v);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0], 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

function LobbyColumn({ x, z, top }: { x: number; z: number; top: number }) {
  const m = useMats().building;
  const shaftH = top - 0.55 - 0.75;
  return (
    <group position={[x, LEVELS[0], z]}>
      <Bx s={[0.8, 0.45, 0.8]} p={[0, 0.225, 0]} m={m.stone} />
      <Cyl rt={0.36} rb={0.4} h={0.18} p={[0, 0.54, 0]} m={m.column} />
      <Cyl rt={0.3} rb={0.33} h={shaftH} p={[0, 0.63 + shaftH / 2, 0]} m={m.patioWall} seg={24} />
      {/* capitel jónico */}
      <Cyl rt={0.42} rb={0.3} h={0.22} p={[0, 0.63 + shaftH + 0.11, 0]} m={m.column} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.38, 0.63 + shaftH + 0.18, 0]} rotation={[0, Math.PI / 2, 0]} material={m.column} castShadow>
          <torusGeometry args={[0.1, 0.05, 8, 16]} />
        </mesh>
      ))}
      <Bx s={[0.95, 0.14, 0.95]} p={[0, 0.63 + shaftH + 0.3, 0]} m={m.column} />
    </group>
  );
}

// el zócalo de azulejos acaba donde empieza el cuarto de transformadores
const DADO_Z = TRAFO_ROOM.zBack - 0.12;

function Lobby() {
  const m = useMats().building;
  const L = LEVELS[0];
  const ceil = LEVELS[1] - SLAB;
  const beamH = 0.5;
  const panelY = ceil - 0.005;
  // A: todo el frente (vestíbulo + zaguán, sin tabique entre ellos)
  // B: el fondo del vestíbulo hasta la arcada del patio, a la izquierda del ascensor
  const A: Rect = [-IN_X, IN_X, STAIR.zFront, IN_FRONT];
  const B: Rect = [-IN_X, ELEV.x0, PATIO.z0 + 0.25, STAIR.zFront];
  const geoA = useMemo(() => coffersGeo(A[0], A[1], A[2], A[3], panelY), [panelY]); // eslint-disable-line react-hooks/exhaustive-deps
  const geoB = useMemo(() => coffersGeo(B[0], B[1], B[2], B[3], panelY), [panelY]); // eslint-disable-line react-hooks/exhaustive-deps
  const xs: number[] = [];
  for (let x = Math.ceil(-IN_X / COFFER) * COFFER; x < IN_X; x += COFFER) xs.push(x);
  const zs: number[] = [];
  for (let z = Math.ceil(B[2] / COFFER) * COFFER; z < IN_FRONT; z += COFFER) zs.push(z);
  const colTop = ceil - beamH;
  const box = (key: string, x0: number, x1: number, z0: number, z1: number, y: number, h: number, mt: THREE.Material) => (
    <Bx key={key} s={[x1 - x0, h, z1 - z0]} p={[(x0 + x1) / 2, y, (z0 + z1) / 2]} m={mt} />
  );
  return (
    <group name="vestibulo">
      <mesh geometry={geoA} material={m.coffer} receiveShadow />
      <mesh geometry={geoB} material={m.coffer} receiveShadow />
      {xs.map((x) => box('bx' + x, x - 0.21, x + 0.21, x < B[1] ? B[2] : A[2], A[3], ceil - beamH / 2, beamH, m.cofferBeam))}
      {zs.map((z) => box('bz' + z, -IN_X, z > A[2] ? A[1] : B[1], z - 0.21, z + 0.21, ceil - beamH / 2, beamH, m.cofferBeam))}
      {/* cornisa perimetral */}
      {box('cf', -IN_X, IN_X, A[3] - 0.32, A[3], ceil - 0.16, 0.32, m.cofferBeam)}
      {box('cl', -IN_X, -IN_X + 0.32, B[2], A[3], ceil - 0.16, 0.32, m.cofferBeam)}
      {box('cr', IN_X - 0.32, IN_X, A[2], A[3], ceil - 0.16, 0.32, m.cofferBeam)}
      {box('cb', -IN_X, B[1], B[2], B[2] + 0.32, ceil - 0.16, 0.32, m.cofferBeam)}
      {box('ce', B[1], IN_X, A[2], A[2] + 0.32, ceil - 0.16, 0.32, m.cofferBeam)}

      {LOBBY_COLUMNS.map(([x, z]) => (
        <LobbyColumn key={x + '_' + z} x={x} z={z} top={colTop} />
      ))}

      {/* suelo mojado con charcos (vestíbulo y zaguán) */}
      {box('fa', A[0], A[1], A[2], A[3], L + 0.012, 0.02, m.wetFloor)}
      {box('fb', B[0], B[1], B[2], B[3], L + 0.012, 0.02, m.wetFloor)}

      {/* zócalo de azulejos con banda azul en el muro izquierdo */}
      <Bx s={[0.03, 1.0, DADO_Z - B[2]]} p={[-IN_X + 0.015, L + 0.5, (DADO_Z + B[2]) / 2]} m={m.azulejo} cast={false} />
      <Bx s={[0.035, 0.24, DADO_Z - B[2]]} p={[-IN_X + 0.018, L + 1.12, (DADO_Z + B[2]) / 2]} m={m.blueBand} cast={false} />
    </group>
  );
}

// ---------------------------------------------------------------------------
function FloorShell({ n, hideFront }: { n: number; hideFront: boolean }) {
  const m = useMats().building;
  const L = LEVELS[n];
  const H = LEVELS[n + 1] - SLAB - L;
  const wm = m.walls[n];
  const y0 = L - 0.02;
  const hh = H + 0.02;
  const ground = n === 0;
  const door = (u: number, w = 1.0, h = 2.4): Opening => ({ x: u, y: y0, w, h });
  return (
    <group>
      {/* revestimiento interior de fachada y fondo */}
      <group visible={!hideFront} userData={{ noMerge: true }}>
        <Wall axis="x" from={-IN_X} length={IN_X * 2} at={IN_FRONT - 0.01} y={y0} height={hh} t={0.02} holes={frontHoles(n)} mat={wm} />
      </group>
      <Wall axis="x" from={-IN_X} length={IN_X * 2} at={IN_BACK + 0.01} y={y0} height={hh} t={0.02} holes={backHoles(n)} mat={wm} />
      <Bx s={[0.02, hh, IN_FRONT - IN_BACK]} p={[-IN_X + 0.01, y0 + hh / 2, (IN_FRONT + IN_BACK) / 2]} m={wm} />
      <Bx s={[0.02, hh, IN_FRONT - IN_BACK]} p={[IN_X - 0.01, y0 + hh / 2, (IN_FRONT + IN_BACK) / 2]} m={wm} />

      {ground ? (
        <>
          {/* habitaciones izquierdas: se cierran hacia el vestíbulo (el vestíbulo no tiene muro de fondo) */}
          <Wall axis="x" from={-IN_X} length={GAL_X0 + IN_X} at={PATIO.z0} y={y0} height={hh} holes={[door(-9.5)]} mat={wm} />
          <Lobby />
          <PatioGround />
        </>
      ) : (
        <>
          {/* tabique sala / galería delantera */}
          <Wall
            axis="x"
            from={-IN_X}
            length={STAIR.wallX + IN_X}
            at={SALA_Z}
            y={y0}
            height={hh}
            holes={[{ x: 0, y: y0, w: 2.4, h: 2.2, arch: true }, door(BAYS[0]), door(-3.33), door(3.33), door(ELEV_X, ELEV.doorW, ELEV.doorH)]}
            mat={wm}
          />
          <PatioUpper n={n} />
        </>
      )}

      {/* galerías alrededor del patio */}
      <Wall
        axis="z"
        from={GAL_Z1}
        length={(ground ? PATIO.z0 : SALA_Z) - GAL_Z1}
        at={GAL_X0}
        y={y0}
        height={hh}
        holes={[door(-12), door(-18)]}
        mat={wm}
      />
      <Wall axis="x" from={GAL_X0} length={STAIR.wallX - GAL_X0} at={GAL_Z1} y={y0} height={hh} holes={[door(-3.33), door(3.33)]} mat={wm} />
      <Wall axis="z" from={GAL_Z1} length={STAIR.zBack - GAL_Z1} at={STAIR.wallX} y={y0} height={hh} holes={[door(-19)]} mat={wm} />
      {/* caja de escalera */}
      {/* muro entre la escalera y la galería del patio (del ascensor al fondo de la caja) */}
      <Wall axis="z" from={STAIR.zBack} length={ELEV.zBack - STAIR.zBack} at={STAIR.wallX} y={y0} height={hh} holes={ground ? [] : [door(-12.0)]} mat={wm} />
      <Wall axis="x" from={STAIR.wallX} length={IN_X - STAIR.wallX} at={STAIR.zBack - 0.125} y={y0} height={hh} mat={wm} />
      {/* habitaciones laterales */}
      <Wall axis="x" from={-IN_X} length={GAL_X0 + IN_X} at={-16} y={y0} height={hh} holes={[door(-9.5)]} mat={wm} />

      <Beams n={n} />
      <Stair n={n} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Ascensor antiguo junto a la escalera (del zaguán al cuarto piso)
// ---------------------------------------------------------------------------
function ElevatorDoor({ n, state }: { n: number; state: 'none' | 'closed' | 'half' | 'open' }) {
  const m = useMats().building;
  const L = LEVELS[n];
  const face = n === 0 ? ELEV.zFront : SALA_Z + 0.125; // cara hacia el zaguán / la sala
  const { doorW: w, doorH: h } = ELEV;
  const x0 = ELEV_X - w / 2;
  return (
    <group>
      {/* marco de madera oscura */}
      <Bx s={[0.12, h + 0.12, 0.08]} p={[x0 - 0.06, L + (h + 0.12) / 2, face + 0.04]} m={m.woodDark} />
      <Bx s={[0.12, h + 0.12, 0.08]} p={[x0 + w + 0.06, L + (h + 0.12) / 2, face + 0.04]} m={m.woodDark} />
      <Bx s={[w + 0.36, 0.14, 0.1]} p={[ELEV_X, L + h + 0.07, face + 0.05]} m={m.woodDark} />
      <Bx s={[w * 0.7, 0.18, 0.03]} p={[ELEV_X, L + h + 0.3, face + 0.02]} m={m.iron} />
      {state !== 'none' && (
        <group position={[x0, L, face - 0.06]} rotation={[0, state === 'closed' ? 0 : state === 'half' ? -0.85 : -1.5, 0]}>
          <Bx s={[w, h, 0.05]} p={[w / 2, h / 2, 0]} m={m.woodDark} />
          <Bx s={[w - 0.2, h * 0.45, 0.02]} p={[w / 2, h * 0.7, 0.035]} m={m.woodLight} />
          <Bx s={[w - 0.2, h * 0.35, 0.02]} p={[w / 2, h * 0.25, 0.035]} m={m.woodLight} />
        </group>
      )}
    </group>
  );
}

function Elevator() {
  const m = useMats().building;
  const { x0, x1, zFront, zBack, t } = ELEV;
  const H = ROOF;
  const w = x1 - x0;
  const d = zFront - zBack;
  const zc = (zFront + zBack) / 2;
  const outer = m.walls[0];
  const inner = m.black;
  const left = useMemo(() => [inner, outer, outer, outer, outer, outer], [inner, outer]);
  const right = useMemo(() => [outer, inner, outer, outer, outer, outer], [inner, outer]);
  const back = useMemo(() => [outer, outer, outer, outer, inner, outer], [inner, outer]);
  const L = LEVELS;
  const carY = L[2] + 2.9; // cabina atascada entre el 2º y el 3º
  const carW = w - 0.45;
  const carD = d - 0.45;
  return (
    <group name="ascensor">
      <Bx s={[t, H, d]} p={[x0 + t / 2, H / 2, zc]} m={left} />
      <Bx s={[t, H, d]} p={[x1 - t / 2, H / 2, zc]} m={right} />
      <Bx s={[w, H, t]} p={[(x0 + x1) / 2, H / 2, zBack + t / 2]} m={back} />
      {/* frente de planta baja con la puerta abierta hacia el zaguán */}
      <Wall
        axis="x"
        from={x0}
        length={w}
        at={zFront - 0.1}
        y={L[0] - 0.02}
        height={L[1] - SLAB - L[0] + 0.02}
        t={0.2}
        holes={[{ x: ELEV_X, y: L[0] - 0.02, w: ELEV.doorW, h: ELEV.doorH }]}
        mat={outer}
      />
      {/* foso oscuro */}
      <Bx s={[w - 2 * t, 0.02, d - t]} p={[(x0 + x1) / 2, L[0] + 0.012, zc - t / 2]} m={inner} cast={false} />
      <ElevatorDoor n={0} state="none" />
      <ElevatorDoor n={1} state="closed" />
      <ElevatorDoor n={2} state="half" />
      <ElevatorDoor n={3} state="closed" />
      <ElevatorDoor n={4} state="open" />
      {/* cabina de madera con reja de hierro */}
      <group position={[(x0 + x1) / 2, carY, zc - 0.05]}>
        <Bx s={[carW, 0.12, carD]} p={[0, -1.15, 0]} m={m.woodDark} />
        <Bx s={[carW, 0.12, carD]} p={[0, 1.15, 0]} m={m.woodDark} />
        <Bx s={[0.06, 2.3, carD]} p={[-carW / 2 + 0.03, 0, 0]} m={m.woodLight} />
        <Bx s={[0.06, 2.3, carD]} p={[carW / 2 - 0.03, 0, 0]} m={m.woodLight} />
        <Bx s={[carW, 2.3, 0.06]} p={[0, 0, -carD / 2 + 0.03]} m={m.woodLight} />
        {Array.from({ length: 9 }, (_, i) => (
          <Bx key={i} s={[0.02, 2.2, 0.02]} p={[-carW / 2 + 0.1 + (i * (carW - 0.2)) / 8, 0, carD / 2 - 0.02]} m={m.iron} />
        ))}
        <Bx s={[carW, 0.04, 0.03]} p={[0, 0.3, carD / 2 - 0.02]} m={m.iron} />
      </group>
      {/* cables hasta el cuarto de máquinas */}
      {[-0.18, 0.18].map((dx) => (
        <Cyl key={dx} rt={0.012} rb={0.012} h={H - carY - 1.2} p={[(x0 + x1) / 2 + dx, (H + carY + 1.2) / 2, zc - 0.05]} m={m.iron} seg={5} />
      ))}
      {/* guías */}
      {[-1, 1].map((sdx) => (
        <Bx key={sdx} s={[0.05, H, 0.08]} p={[(x0 + x1) / 2 + sdx * (carW / 2 + 0.1), H / 2, zc]} m={m.rust} />
      ))}
    </group>
  );
}

function OuterShell() {
  const m = useMats().building;
  const backGeo = useMemo(() => {
    const holes: Opening[] = [];
    for (let n = 0; n < 5; n++) for (const o of backHoles(n)) holes.push({ ...o, x: o.x + HALF });
    return wallGeo(HALF * 2, ROOF, 0.2, holes);
  }, []);
  return (
    <group>
      <mesh geometry={backGeo} material={m.facade} position={[-HALF, 0, -DEPTH]} castShadow receiveShadow />
      <Bx s={[0.4, ROOF, DEPTH - 0.6]} p={[-HALF + 0.2, ROOF / 2, -(DEPTH + 0.6) / 2]} m={m.facade} />
      <Bx s={[0.4, ROOF, DEPTH - 0.6]} p={[HALF - 0.2, ROOF / 2, -(DEPTH + 0.6) / 2]} m={m.facade} />
      {/* losa de planta baja */}
      <Bx s={[IN_X * 2, LEVELS[0], IN_FRONT - IN_BACK]} p={[0, LEVELS[0] / 2, (IN_FRONT + IN_BACK) / 2]} m={[m.stone, m.stone, m.floors[0], m.stone, m.stone, m.stone]} />
    </group>
  );
}

export function Interior({ hideFront = false }: { hideFront?: boolean }) {
  return (
    <group name="interior">
      <OuterShell />
      {[1, 2, 3, 4, 5].map((k) => (
        <Slab key={k} k={k} />
      ))}
      {[0, 1, 2, 3, 4].map((n) => (
        <FloorShell key={n} n={n} hideFront={hideFront} />
      ))}
      <PatioPilasters />
      <Elevator />
    </group>
  );
}
