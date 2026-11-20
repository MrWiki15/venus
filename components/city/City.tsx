'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bx, Cyl, StaticGroup, useMats } from '../ctx';
import { boxGeo, wallGeo, catenary } from '@/lib/geometry';
import { HALF, DEPTH, type Opening } from '@/lib/building';

const POLE_X = HALF + 0.6; // poste de hormigón en la acera, en la junta con el vecino amarillo
import { mulberry32, range } from '@/lib/noise';

type V3 = [number, number, number];

interface BoxSpec {
  s: V3;
  p: V3;
  r?: V3;
}

function merged(list: BoxSpec[]) {
  if (!list.length) return null;
  const m4 = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const geos = list.map((b) => {
    const g = boxGeo(b.s[0], b.s[1], b.s[2]).toNonIndexed();
    e.set(...(b.r ?? [0, 0, 0]));
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m4);
    return g;
  });
  return mergeGeometries(geos);
}

// Plano con UV en metros
function planeGeoM(w: number, h: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return g;
}

// ---------------------------------------------------------------------------
// Edificio vecino con huecos reales, molduras y balcones
// ---------------------------------------------------------------------------
interface BlockProps {
  pos: V3;
  rotY?: number;
  w: number;
  depth?: number;
  ground: number;
  floors: number;
  fh: number;
  bays: number;
  wall: THREE.Material;
  trim: THREE.Material;
  shutter: THREE.Material;
  seed: number;
  pilasters?: boolean;
  balconies?: boolean;
  groundWall?: THREE.Material; // planta baja de otro color (vecino turquesa)
  groundArches?: boolean; // todos los huecos de planta baja en arco (vecino amarillo)
}

function Block(p: BlockProps) {
  const mats = useMats().city;
  const depth = p.depth ?? 24;
  const H = p.ground + p.floors * p.fh + 0.6;
  const built = useMemo(() => {
    const rng = mulberry32(p.seed);
    const holes: Opening[] = [];
    const trims: BoxSpec[] = [];
    const shutters: BoxSpec[] = [];
    const irons: BoxSpec[] = [];
    const bw = p.w / p.bays;
    const x0 = -p.w / 2;
    // planta baja
    for (let b = 0; b < p.bays; b++) {
      const cx = x0 + bw * (b + 0.5);
      const door = p.groundArches || b === Math.floor(p.bays / 2);
      const o: Opening = door
        ? { x: cx + p.w / 2, y: 0.25, w: Math.min(2.2, bw * 0.6), h: p.ground - 1.6, arch: true }
        : { x: cx + p.w / 2, y: 0.9, w: Math.min(1.8, bw * 0.55), h: p.ground - 2.2 };
      holes.push(o);
      trims.push({ s: [o.w + 0.3, 0.18, 0.16], p: [cx, o.y + o.h + (o.arch ? o.w / 2 : 0) + 0.12, 0.08] });
      if (rng() < 0.5) shutters.push({ s: [o.w, o.h, 0.06], p: [cx, o.y + o.h / 2, -0.25] });
    }
    // pisos
    for (let f = 0; f < p.floors; f++) {
      const y = p.ground + f * p.fh;
      trims.push({ s: [p.w, 0.16, 0.16], p: [0, y - 0.1, 0.08] });
      for (let b = 0; b < p.bays; b++) {
        const cx = x0 + bw * (b + 0.5);
        const ow = Math.min(1.3, bw * 0.5);
        const oh = Math.min(2.4, p.fh - 0.9);
        holes.push({ x: cx + p.w / 2, y: y + 0.05, w: ow, h: oh });
        trims.push({ s: [0.14, oh, 0.08], p: [cx - ow / 2 - 0.07, y + 0.05 + oh / 2, 0.04] });
        trims.push({ s: [0.14, oh, 0.08], p: [cx + ow / 2 + 0.07, y + 0.05 + oh / 2, 0.04] });
        trims.push({ s: [ow + 0.5, 0.14, 0.24], p: [cx, y + 0.05 + oh + 0.12, 0.12] });
        const st = rng();
        if (st < 0.35) shutters.push({ s: [ow, oh, 0.05], p: [cx, y + 0.05 + oh / 2, -0.22] });
        else if (st < 0.6) shutters.push({ s: [ow / 2, oh, 0.05], p: [cx - ow / 4, y + 0.05 + oh / 2, -0.22] });
        if (p.balconies && (f + b) % 2 === 0) {
          trims.push({ s: [ow + 0.9, 0.14, 0.75], p: [cx, y - 0.02, 0.37] });
          irons.push({ s: [ow + 0.9, 0.05, 0.05], p: [cx, y + 0.95, 0.72] });
          for (let k = -0.45 - ow / 2; k <= 0.45 + ow / 2 + 0.01; k += 0.13) irons.push({ s: [0.018, 0.95, 0.018], p: [cx + k, y + 0.47, 0.72] });
          irons.push({ s: [0.05, 0.05, 0.72], p: [cx - ow / 2 - 0.45, y + 0.95, 0.36] });
          irons.push({ s: [0.05, 0.05, 0.72], p: [cx + ow / 2 + 0.45, y + 0.95, 0.36] });
        }
      }
    }
    if (p.pilasters) {
      for (let b = 0; b <= p.bays; b++) trims.push({ s: [0.35, H - 0.8, 0.1], p: [x0 + bw * b + (b === 0 ? 0.17 : b === p.bays ? -0.17 : 0), (H - 0.8) / 2, 0.05] });
    }
    // cornisa
    trims.push({ s: [p.w + 0.1, 0.32, 0.55], p: [0, H - 0.45, 0.27] });
    trims.push({ s: [p.w + 0.1, 0.1, 0.4], p: [0, H - 0.25, 0.2] });
    return {
      wallGround: wallGeo(p.w, p.ground, 0.35, holes.filter((o) => o.y < p.ground)),
      wallUpper: wallGeo(p.w, H - p.ground, 0.35, holes.filter((o) => o.y >= p.ground).map((o) => ({ ...o, y: o.y - p.ground }))),
      trims: merged(trims),
      shutters: merged(shutters),
      irons: merged(irons),
    };
  }, [p.seed, p.w, p.bays, p.floors, p.fh, p.ground, p.balconies, p.pilasters, p.groundArches, H]);

  const bodyMats = useMemo(
    () => [p.wall, p.wall, mats.roof, mats.voidDark, mats.voidDark, p.wall],
    [p.wall, mats.roof, mats.voidDark],
  );

  return (
    <group position={p.pos} rotation={[0, p.rotY ?? 0, 0]}>
      <mesh geometry={built.wallGround} material={p.groundWall ?? p.wall} position={[-p.w / 2, 0, -0.35]} castShadow receiveShadow />
      <mesh geometry={built.wallUpper} material={p.wall} position={[-p.w / 2, p.ground, -0.35]} castShadow receiveShadow />
      <Bx s={[p.w - 0.04, H, depth - 0.35]} p={[0, H / 2, -0.35 - (depth - 0.35) / 2]} m={bodyMats} />
      {built.trims && <mesh geometry={built.trims} material={p.trim} castShadow receiveShadow />}
      {built.shutters && <mesh geometry={built.shutters} material={p.shutter} castShadow receiveShadow />}
      {built.irons && <mesh geometry={built.irons} material={mats.iron} castShadow />}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Skyline lejano (cajas fusionadas por material)
// ---------------------------------------------------------------------------
function Skyline() {
  const mats = useMats().city;
  const tankRef = useRef<THREE.InstancedMesh>(null);
  const { groups, roofs, tanks } = useMemo(() => {
    const rng = mulberry32(2024);
    const buckets: BoxSpec[][] = mats.skyline.map(() => []);
    const roofList: BoxSpec[] = [];
    const tankList: V3[] = [];
    const add = (x: number, z: number, w: number, d: number, h: number) => {
      const k = Math.floor(rng() * buckets.length);
      buckets[k].push({ s: [w, h, d], p: [x, h / 2, z] });
      roofList.push({ s: [w + 0.3, 0.3, d + 0.3], p: [x, h + 0.15, z] });
      if (rng() < 0.6) tankList.push([x + range(rng, -w / 3, w / 3), h + 0.3, z + range(rng, -d / 3, d / 3)]);
    };
    // manzanas detrás del edificio
    for (let bz = -(DEPTH + 3); bz > -140; bz -= range(rng, 10, 16)) {
      for (let bx = -130; bx < 130; bx += range(rng, 9, 15)) {
        if (Math.abs(bz + 50) < 4) continue; // calle transversal
        if (Math.abs(bx) < HALF + 3 && bz > -(DEPTH + 14)) continue;
        const w = range(rng, 8, 13);
        add(bx, bz, w, range(rng, 8, 12), range(rng, 7, 24));
      }
    }
    // manzanas al otro lado de la calle (detrás de la fila frontal)
    for (let bz = 40; bz < 150; bz += range(rng, 10, 16)) {
      for (let bx = -130; bx < 130; bx += range(rng, 9, 15)) {
        if (Math.abs(bz - 70) < 4) continue;
        add(bx, bz, range(rng, 8, 13), range(rng, 8, 12), range(rng, 7, 22));
      }
    }
    // continuación de la calle a ambos lados
    for (const side of [-1, 1]) {
      for (let bx = HALF + 57; bx < 140; bx += range(rng, 10, 14)) {
        add(side * bx, -9, range(rng, 9, 12), 18, range(rng, 9, 20));
        add(side * bx, 23, range(rng, 9, 12), 18, range(rng, 9, 20));
      }
    }
    return {
      groups: buckets.map((b) => merged(b)),
      roofs: merged(roofList),
      tanks: tankList,
    };
  }, [mats.skyline]);

  const tankGeo = useMemo(() => new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12), []);
  useLayoutEffect(() => {
    const im = tankRef.current;
    if (!im) return;
    const o = new THREE.Object3D();
    tanks.forEach((t, i) => {
      o.position.set(t[0], t[1] + 0.6, t[2]);
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [tanks]);

  return (
    <group>
      {groups.map((g, i) => g && <mesh key={i} geometry={g} material={mats.skyline[i]} receiveShadow castShadow />)}
      {roofs && <mesh geometry={roofs} material={mats.roof} receiveShadow />}
      <instancedMesh ref={tankRef} args={[tankGeo, mats.tank, tanks.length]} castShadow />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Cables eléctricos, poste y farola
// ---------------------------------------------------------------------------
function Cables() {
  const mats = useMats().city;
  const geo = useMemo(() => {
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const pole = P(POLE_X, 10.1, 2.1);
    const defs: [THREE.Vector3, THREE.Vector3, number, number][] = [
      [P(-70, 9.8, 1.7), pole, 1.6, 0.016],
      [pole, P(70, 9.4, 1.7), 1.4, 0.016],
      [P(POLE_X, 9.7, 2.1), P(-16, 8.6, 13.1), 1.0, 0.012],
      [P(POLE_X, 9.7, 2.1), P(-42, 7.8, 12.8), 1.8, 0.012],
      [P(-70, 8.3, 1.45), P(70, 8.1, 1.45), 2.2, 0.012],
      [P(POLE_X, 9.4, 2.1), P(4.2, 6.3, 0.15), 0.25, 0.01],
      [P(-HALF + 0.1, 6.85, 0.14), P(HALF - 0.1, 6.9, 0.14), 0.14, 0.009],
      [P(32, 11.2, 13), P(-26, 10.6, 1.2), 1.1, 0.012],
      [P(42, 13.6, 13.2), P(-42, 12.6, 1.0), 1.6, 0.012],
      [P(-30, 12.4, 13.1), P(26, 11.8, 1.1), 1.3, 0.011],
    ];
    const tubes = defs.map(([a, b, sag, r]) => new THREE.TubeGeometry(catenary(a, b, sag, 60), 120, r, 5, false));
    return mergeGeometries(tubes);
  }, []);
  return (
    <group>
      {geo && <mesh geometry={geo} material={mats.cable} castShadow />}
      {/* poste */}
      <Cyl rt={0.11} rb={0.15} h={10.5} p={[POLE_X, 0.18 + 5.25, 2.1]} m={mats.pole} seg={10} />
      <Bx s={[1.7, 0.1, 0.1]} p={[POLE_X, 10.1, 2.1]} m={mats.pole} />
      <Bx s={[1.3, 0.08, 0.08]} p={[POLE_X, 9.6, 2.1]} m={mats.pole} />
      {[-0.7, 0, 0.7].map((x) => (
        <Cyl key={x} rt={0.035} rb={0.035} h={0.12} p={[POLE_X + x, 10.2, 2.1]} m={mats.iron} seg={6} />
      ))}
      {/* farola */}
      <Bx s={[0.06, 0.06, 1.6]} p={[POLE_X, 7.2, 2.9]} r={[0.15, 0, 0]} m={mats.iron} />
      <Bx s={[0.3, 0.12, 0.5]} p={[POLE_X, 7.05, 3.65]} m={mats.iron} />
      {/* transformador */}
      <Cyl rt={0.32} rb={0.32} h={0.9} p={[POLE_X, 8.4, 1.75]} m={mats.tank} seg={14} />
    </group>
  );
}

// ---------------------------------------------------------------------------
function Street() {
  const mats = useMats().city;
  const L = 280;
  const asphalt = useMemo(() => planeGeoM(L, 7.8), []);
  const ground = useMemo(() => planeGeoM(600, 600), []);
  const puddle = useMemo(() => new THREE.CircleGeometry(1, 24), []);
  const puddleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }),
    [],
  );
  return (
    <group>
      <mesh geometry={ground} material={mats.asphalt} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow />
      <mesh geometry={asphalt} material={mats.asphalt} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, 6.5]} receiveShadow />
      <Bx s={[L, 0.18, 2.6]} p={[0, 0.09, 1.3]} m={mats.sidewalk} />
      <Bx s={[L, 0.18, 2.6]} p={[0, 0.09, 11.7]} m={mats.sidewalk} />
      <Bx s={[L, 0.2, 0.18]} p={[0, 0.1, 2.6]} m={mats.curb} />
      <Bx s={[L, 0.2, 0.18]} p={[0, 0.1, 10.4]} m={mats.curb} />
      <mesh geometry={puddle} material={puddleMat} rotation={[-Math.PI / 2, 0, 0]} position={[-3, 0.012, 4.2]} scale={[1.6, 0.8, 1]} receiveShadow />
      <mesh geometry={puddle} material={puddleMat} rotation={[-Math.PI / 2, 0, 0.4]} position={[6, 0.012, 8.6]} scale={[1.0, 0.6, 1]} receiveShadow />
      {/* registro */}
      <Cyl rt={0.35} rb={0.35} h={0.02} p={[1.5, 0.01, 6.0]} m={mats.iron} seg={20} />
    </group>
  );
}

function OppositeRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => o.layers.set(1));
  });
  return (
    <group ref={ref} userData={{ noMerge: true }}>
      <StaticGroup>{children}</StaticGroup>
    </group>
  );
}

export function City() {
  return (
    <StaticGroup>
      <CityContent />
    </StaticGroup>
  );
}

function CityContent() {
  const c = useMats().city;
  return (
    <group name="city">
      <Street />
      <Cables />
      {/* misma acera: a la izquierda el verde agua, a la derecha el amarillo con pilastras blancas (según fotos) */}
      <Block pos={[-(HALF + 6.02), 0, 0]} w={12} ground={4.4} floors={2} fh={3.4} bays={4} wall={c.green} groundWall={c.turquoise} trim={c.white} shutter={c.shutterRed} seed={1} />
      <Block pos={[HALF + 5.52, 0, 0]} w={11} ground={5.2} floors={2} fh={4.3} bays={3} wall={c.yellow} trim={c.white} shutter={c.shutterRed} seed={2} pilasters balconies groundArches />
      <Block pos={[-(HALF + 18.29), 0, 0]} w={12.5} ground={4.5} floors={2} fh={4} bays={4} wall={c.pink} trim={c.white} shutter={c.shutterGreen} seed={3} pilasters />
      <Block pos={[HALF + 17.29, 0, 0]} w={12.5} ground={4.8} floors={3} fh={3.3} bays={4} wall={c.blue} trim={c.white} shutter={c.shutterBrown} seed={4} balconies />
      <Block pos={[-(HALF + 31.46), 0, 0]} w={13.8} ground={4.5} floors={1} fh={4.5} bays={4} wall={c.ochre} trim={c.white} shutter={c.shutterGreen} seed={5} />
      <Block pos={[HALF + 30.46, 0, 0]} w={13.8} ground={5} floors={3} fh={3.6} bays={4} wall={c.gray} trim={c.white} shutter={c.shutterGreen} seed={6} balconies />
      <Block pos={[-(HALF + 44.38), 0, 0]} w={12} ground={4.6} floors={3} fh={3.4} bays={3} wall={c.green} trim={c.white} shutter={c.shutterBrown} seed={7} pilasters />
      <Block pos={[HALF + 43.38, 0, 0]} w={12} ground={4.6} floors={2} fh={3.6} bays={3} wall={c.pink} trim={c.white} shutter={c.shutterGreen} seed={8} />

      {/* acera de enfrente (mirando a -z) — capa 1 */}
      <OppositeRow>
      {[
        { x: -32, w: 12, fl: 3, fh: 3.4, wall: c.blue, s: 11, pil: false },
        { x: -19.5, w: 12.8, fl: 4, fh: 3.3, wall: c.ochre, s: 12, pil: true },
        { x: -6.2, w: 13.6, fl: 2, fh: 3.8, wall: c.pink, s: 13, pil: false },
        { x: 7.3, w: 13.2, fl: 3, fh: 3.7, wall: c.green, s: 14, pil: true },
        { x: 20.4, w: 12.8, fl: 2, fh: 3.4, wall: c.yellow, s: 15, pil: false },
        { x: 33.4, w: 13, fl: 3, fh: 3.5, wall: c.gray, s: 16, pil: true },
        { x: 46.5, w: 13, fl: 2, fh: 3.6, wall: c.blue, s: 17, pil: false },
        { x: -45, w: 13, fl: 3, fh: 3.3, wall: c.yellow, s: 18, pil: true },
      ].map((b) => (
        <Block
          key={b.s}
          pos={[b.x, 0, 13]}
          rotY={Math.PI}
          w={b.w}
          ground={4.6}
          floors={b.fl}
          fh={b.fh}
          bays={4}
          wall={b.wall}
          trim={c.white}
          shutter={b.s % 2 ? c.shutterGreen : c.shutterBrown}
          seed={b.s}
          pilasters={b.pil}
          balconies
        />
      ))}
      </OppositeRow>
      <Skyline />
    </group>
  );
}
