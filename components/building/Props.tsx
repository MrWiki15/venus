'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Bx, Cyl, useMats } from '../ctx';
import { LEVELS, SLAB, IN_X, DOOR, PATIO } from '@/lib/building';
import { mulberry32, range, pick } from '@/lib/noise';
import { Plant } from './Facade';
import { TransformerRoom } from './Transformers';

type V3 = [number, number, number];

interface Cluster {
  c: [number, number]; // centro x,z
  r: [number, number]; // radios
  n: number;
  pile?: number; // altura del montón
  trash?: number; // proporción de basura (resto escombro)
  brick?: number;
  boxes?: number; // cajas de cartón (como en el vestíbulo)
  y?: number; // cota base (por defecto la del piso)
}

const TRASH_COLORS = ['#e2ded3', '#d6d0c2', '#c9c4b8', '#a8875c', '#8d8a84', '#2f4f78', '#1e1e1e', '#3a3a3a', '#efede6', '#7a6a55', '#9b3a30', '#bdb7a8'];
const RUBBLE_COLORS = ['#cfc6b4', '#b8ae9b', '#a49a88', '#d9d0bd', '#8f877a', '#c2b59a'];
const BRICK_COLORS = ['#9a5a40', '#a8634a', '#874c36', '#b07258'];

function InstGroup({
  geo,
  mat,
  data,
}: {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  data: { m: THREE.Matrix4; c: THREE.Color }[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    data.forEach((d, i) => {
      im.setMatrixAt(i, d.m);
      im.setColorAt(i, d.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  });
  if (!data.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, data.length]} castShadow receiveShadow />;
}

export function Debris({ floor, clusters, seed }: { floor: number; clusters: Cluster[]; seed: number }) {
  const m = useMats().building;
  const geos = useMemo(
    () => ({
      rubble: new THREE.IcosahedronGeometry(1, 0),
      trash: new THREE.BoxGeometry(1, 1, 1),
      bag: new THREE.IcosahedronGeometry(1, 1),
      brick: new THREE.BoxGeometry(0.24, 0.07, 0.115),
      box: new THREE.BoxGeometry(1, 1, 1),
      mound: new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    }),
    [],
  );
  const data = useMemo(() => {
    const rng = mulberry32(seed);
    const rubble: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const trash: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const bags: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const bricks: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const boxes: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const mounds: { p: V3; s: V3; trash: boolean }[] = [];
    const o = new THREE.Object3D();
    for (const cl of clusters) {
      const base = cl.y ?? LEVELS[floor];
      const pile = cl.pile ?? 0;
      if (pile > 0) mounds.push({ p: [cl.c[0], base - 0.02, cl.c[1]], s: [cl.r[0] * 0.85, pile, cl.r[1] * 0.85], trash: (cl.trash ?? 0.2) > 0.5 });
      for (let i = 0; i < cl.n; i++) {
        // distribución gaussiana aproximada
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(-2 * Math.log(Math.max(1e-4, rng()))) * 0.45;
        const dx = Math.cos(a) * d;
        const dz = Math.sin(a) * d;
        const x = cl.c[0] + dx * cl.r[0];
        const z = cl.c[1] + dz * cl.r[1];
        if (Math.abs(x) > IN_X - 0.1 && floor >= 0 && (cl.y === undefined)) continue;
        const rr = Math.min(1, Math.hypot(dx, dz));
        const h = pile > 0 ? Math.max(0, 1 - rr * rr) * pile * (0.75 + 0.25 * rng()) : 0;
        const kind = rng();
        const xP = cl.boxes ?? 0;
        if (rng() < xP) {
          // caja de cartón: tirada, aplastada o abierta
          const sx = range(rng, 0.3, 0.65);
          const sy = rng() < 0.4 ? range(rng, 0.02, 0.06) : range(rng, 0.2, 0.45);
          const sz = range(rng, 0.25, 0.5);
          o.position.set(x, base + h * 0.6 + sy / 2, z);
          o.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
          o.scale.set(sx, sy, sz);
          o.updateMatrix();
          const tone = 0.75 + rng() * 0.35;
          boxes.push({ m: o.matrix.clone(), c: new THREE.Color(tone, tone * 0.93, tone * 0.85) });
          continue;
        }
        const tP = cl.trash ?? 0.2;
        const bP = cl.brick ?? 0.1;
        if (kind < tP) {
          if (rng() < 0.35) {
            const s = range(rng, 0.08, 0.22);
            o.position.set(x, base + h + s * 0.5, z);
            o.rotation.set(rng() * 3, rng() * 3, rng() * 3);
            o.scale.set(s * range(rng, 0.8, 1.3), s * range(rng, 0.3, 0.55), s);
            o.updateMatrix();
            bags.push({ m: o.matrix.clone(), c: new THREE.Color(pick(rng, TRASH_COLORS)) });
          } else {
            const sx = range(rng, 0.08, 0.38);
            const sy = range(rng, 0.004, 0.05);
            const sz = range(rng, 0.06, 0.3);
            o.position.set(x, base + h + sy * 0.5 + 0.002, z);
            o.rotation.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
            o.scale.set(sx, sy, sz);
            o.updateMatrix();
            trash.push({ m: o.matrix.clone(), c: new THREE.Color(pick(rng, TRASH_COLORS)) });
          }
        } else if (kind < tP + bP) {
          o.position.set(x, base + h + 0.035, z);
          o.rotation.set((rng() - 0.5) * 0.6, rng() * Math.PI * 2, (rng() - 0.5) * 0.6);
          const sc = rng() < 0.4 ? 0.55 : 1;
          o.scale.set(sc, 1, 1);
          o.updateMatrix();
          bricks.push({ m: o.matrix.clone(), c: new THREE.Color(pick(rng, BRICK_COLORS)) });
        } else {
          const s = Math.pow(rng(), 2.2) * 0.22 + 0.025;
          const flat = rng() < 0.4;
          o.position.set(x, base + h + s * (flat ? 0.15 : 0.4), z);
          o.rotation.set(rng() * 3, rng() * 3, rng() * 3);
          o.scale.set(s * range(rng, 0.8, 1.6), s * (flat ? 0.25 : range(rng, 0.5, 1)), s * range(rng, 0.8, 1.4));
          o.updateMatrix();
          rubble.push({ m: o.matrix.clone(), c: new THREE.Color(pick(rng, RUBBLE_COLORS)) });
        }
      }
    }
    return { rubble, trash, bags, bricks, boxes, mounds };
  }, [clusters, floor, seed]);

  return (
    <group>
      <InstGroup geo={geos.rubble} mat={m.rubble} data={data.rubble} />
      <InstGroup geo={geos.trash} mat={m.trash} data={data.trash} />
      <InstGroup geo={geos.bag} mat={m.trash} data={data.bags} />
      <InstGroup geo={geos.brick} mat={m.brick} data={data.bricks} />
      <InstGroup geo={geos.box} mat={m.cardboard} data={data.boxes} />
      {data.mounds.map((md, i) => (
        <mesh key={i} geometry={geos.mound} position={md.p} scale={md.s} material={md.trash ? m.fabric : m.rubble} receiveShadow castShadow />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Mobiliario
// ---------------------------------------------------------------------------
export function Chair({ p, rot = 0, fallen = false }: { p: V3; rot?: number; fallen?: boolean }) {
  const m = useMats().building;
  return (
    <group position={p} rotation={fallen ? [0, rot, Math.PI / 2 - 0.15] : [0, rot, 0]}>
      <group position={fallen ? [0.42, 0, 0] : [0, 0, 0]}>
        <Bx s={[0.45, 0.05, 0.45]} p={[0, 0.46, 0]} m={m.woodLight} />
        {[
          [-0.19, -0.19],
          [0.19, -0.19],
          [-0.19, 0.19],
          [0.19, 0.19],
        ].map(([x, z], i) => (
          <Bx key={i} s={[0.04, 0.46, 0.04]} p={[x, 0.23, z]} m={m.woodLight} />
        ))}
        <Bx s={[0.04, 0.5, 0.04]} p={[-0.19, 0.73, -0.19]} m={m.woodLight} />
        <Bx s={[0.04, 0.5, 0.04]} p={[0.19, 0.73, -0.19]} m={m.woodLight} />
        <Bx s={[0.42, 0.12, 0.03]} p={[0, 0.9, -0.19]} m={m.woodLight} />
        <Bx s={[0.42, 0.06, 0.03]} p={[0, 0.66, -0.19]} m={m.woodLight} />
      </group>
    </group>
  );
}

export function Table({ p, rot = 0, tilt = 0 }: { p: V3; rot?: number; tilt?: number }) {
  const m = useMats().building;
  return (
    <group position={p} rotation={[tilt, rot, 0]}>
      <Bx s={[1.3, 0.05, 0.8]} p={[0, 0.76, 0]} m={m.woodDark} />
      <Bx s={[1.2, 0.1, 0.7]} p={[0, 0.69, 0]} m={m.woodDark} />
      {[
        [-0.58, -0.33],
        [0.58, -0.33],
        [-0.58, 0.33],
        [0.58, 0.33],
      ].map(([x, z], i) => (
        <Bx key={i} s={[0.06, 0.7, 0.06]} p={[x, 0.35, z]} m={m.woodDark} />
      ))}
    </group>
  );
}

export function Sofa({ p, rot = 0 }: { p: V3; rot?: number }) {
  const m = useMats().building;
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <Bx s={[1.9, 0.38, 0.8]} p={[0, 0.3, 0]} m={m.fabric} />
      <Bx s={[1.9, 0.5, 0.22]} p={[0, 0.7, -0.3]} r={[-0.12, 0, 0]} m={m.fabric} />
      <Bx s={[0.2, 0.3, 0.8]} p={[-0.85, 0.6, 0]} m={m.fabric} />
      <Bx s={[0.2, 0.3, 0.8]} p={[0.85, 0.6, 0]} m={m.fabric} />
      <Bx s={[0.85, 0.1, 0.6]} p={[-0.43, 0.52, 0.05]} r={[0.05, 0.1, 0.03]} m={m.fabricBlue} />
      {[
        [-0.85, -0.3],
        [0.85, -0.3],
        [-0.85, 0.3],
        [0.85, 0.3],
      ].map(([x, z], i) => (
        <Bx key={i} s={[0.07, 0.12, 0.07]} p={[x, 0.06, z]} m={m.woodDark} />
      ))}
    </group>
  );
}

export function Wardrobe({ p, rot = 0, fallen = false }: { p: V3; rot?: number; fallen?: boolean }) {
  const m = useMats().building;
  return (
    <group position={p} rotation={fallen ? [-Math.PI / 2 + 0.05, rot, 0] : [0, rot, 0]}>
      <group position={fallen ? [0, 0.3, 0] : [0, 0, 0]}>
        <Bx s={[1.2, 2.1, 0.55]} p={[0, 1.05, 0]} m={m.woodDark} />
        <Bx s={[0.56, 1.7, 0.03]} p={[-0.29, 1.15, 0.29]} m={m.woodLight} />
        <Bx s={[0.56, 1.7, 0.03]} p={[0.29, 1.15, 0.29]} r={[0, -0.5, 0]} m={m.woodLight} />
        <Bx s={[1.3, 0.1, 0.62]} p={[0, 2.12, 0]} m={m.woodDark} />
      </group>
    </group>
  );
}

export function Mattress({ p, rot = 0, lean = false }: { p: V3; rot?: number; lean?: boolean }) {
  const m = useMats().building;
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <Bx
        s={[1.4, 0.18, 1.9]}
        p={lean ? [0, 0.95, 0.2] : [0, 0.09, 0]}
        r={lean ? [-1.35, 0, 0] : [0, 0, 0.02]}
        m={m.mattress}
      />
    </group>
  );
}

export function Bulb({ p, len }: { p: V3; len: number }) {
  const m = useMats().building;
  return (
    <group position={p}>
      <Cyl rt={0.006} rb={0.006} h={len} p={[0, -len / 2, 0]} m={m.black} seg={5} />
      <Cyl rt={0.03} rb={0.03} h={0.06} p={[0, -len, 0]} m={m.black} seg={8} />
      <mesh position={[0, -len - 0.07, 0]} material={m.bulb}>
        <sphereGeometry args={[0.05, 12, 10]} />
      </mesh>
    </group>
  );
}

function Mailboxes({ p }: { p: V3 }) {
  const m = useMats().building;
  const items: V3[] = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) items.push([0, r * 0.34, c * 0.3]);
  return (
    <group position={p}>
      {items.map((it, i) => (
        <Bx key={i} s={[0.12, 0.3, 0.26]} p={it} m={i % 3 === 0 ? m.iron : m.rust} />
      ))}
    </group>
  );
}

// Marca clara de un cuadro retirado
function Ghost({ p, s, r = 0 }: { p: V3; s: [number, number]; r?: number }) {
  const m = useMats().building;
  return <Bx s={[s[0], s[1], 0.006]} p={p} r={[0, r, 0]} m={m.trim} cast={false} />;
}

function FallenShutter({ p, rot = 0, blue }: { p: V3; rot?: number; blue?: boolean }) {
  const m = useMats().building;
  return (
    <group position={p} rotation={[-Math.PI / 2 + 0.06, 0, rot]}>
      <Bx s={[0.75, 2.4, 0.045]} p={[0, 0, 0.02]} m={blue ? m.shutterBlue : m.shutter} />
      {[-0.8, 0, 0.8].map((k) => (
        <Bx key={k} s={[0.68, 0.06, 0.06]} p={[0, k, 0.05]} m={blue ? m.shutterBlue : m.shutter} />
      ))}
    </group>
  );
}

function Bucket({ p }: { p: V3 }) {
  const m = useMats().building;
  return <Cyl rt={0.16} rb={0.13} h={0.3} p={[p[0], p[1] + 0.15, p[2]]} m={m.tankBlue} seg={14} />;
}

function FallenBeam({ a, b }: { a: V3; b: V3 }) {
  const m = useMats().building;
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const len = va.distanceTo(vb);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), vb.clone().sub(va).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return <Bx s={[0.14, 0.22, len]} p={[mid.x, mid.y, mid.z]} r={[e.x, e.y, e.z]} m={m.woodDark} />;
}

function Vines({ p, seed, spread = 1 }: { p: V3; seed: number; spread?: number }) {
  const m = useMats().building;
  const leaves = useMemo(() => {
    const r = mulberry32(seed);
    return Array.from({ length: 26 }, () => ({
      pos: [(r() - 0.5) * 1.6 * spread, r() * 0.05, (r() - 0.5) * 1.2 * spread] as V3,
      rot: [r() * 0.6 - 0.3, r() * 6.28, r() * 0.6 - 0.3] as V3,
      s: 0.12 + r() * 0.2,
      dark: r() < 0.5,
    }));
  }, [seed, spread]);
  return (
    <group position={p}>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.pos} rotation={l.rot} scale={[l.s, 0.02, l.s * 0.6]} material={l.dark ? m.plantDark : m.plant} castShadow receiveShadow>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
export function Props() {
  const ceil = (n: number) => LEVELS[n + 1] - SLAB;
  const L = LEVELS;
  const DX = DOOR.x; // portón principal (zaguán)
  const PZ = (PATIO.z0 + PATIO.z1) / 2;

  const debris = useMemo(
    () => ({
      0: [
        // basura acumulada tras el portón principal (zaguán)
        { c: [DX + 1.8, -1.9], r: [0.8, 1.2], n: 380, pile: 0.55, trash: 0.8, brick: 0.05, boxes: 0.06 },
        { c: [DX + 0.3, -1.3], r: [1.6, 0.9], n: 220, trash: 0.85, brick: 0.03 },
        { c: [DX + 0.5, -0.35], r: [1.1, 0.3], n: 80, trash: 0.9, y: LEVELS[0] },
        { c: [DX + 0.3, 0.82], r: [1.7, 0.28], n: 100, trash: 0.9, y: 0.185 },
        // cartones junto al pie de la escalera (foto del zaguán)
        { c: [10.4, -6.4], r: [0.9, 1.0], n: 90, trash: 0.6, boxes: 0.35 },
        // vestíbulo: ropa, cajas y basura sobre el suelo mojado
        { c: [-0.8, -4.6], r: [6.2, 3.2], n: 520, trash: 0.65, brick: 0.04, boxes: 0.06 },
        { c: [-9.6, -9.3], r: [1.3, 0.55], n: 260, pile: 0.4, trash: 0.75, boxes: 0.12 },
        { c: [-5.0, -8.4], r: [1.2, 0.8], n: 160, pile: 0.3, trash: 0.7, boxes: 0.2 },
        // patio y galerías
        { c: [0, PZ], r: [4.2, 4.0], n: 300, trash: 0.6, brick: 0.06 },
        { c: [6.2, -17.5], r: [0.9, 1.4], n: 260, pile: 0.95, trash: 0.12, brick: 0.3 },
        { c: [-6.2, -14.0], r: [0.8, 3.0], n: 140, trash: 0.3, brick: 0.15 },
        { c: [0, -20.8], r: [4.5, 0.8], n: 160, trash: 0.35, brick: 0.12 },
      ],
      1: [
        { c: [0, -4.0], r: [9.6, 2.8], n: 360, trash: 0.2, brick: 0.06 },
        { c: [9.8, -2.2], r: [1.0, 1.0], n: 150, pile: 0.4, trash: 0.1, brick: 0.2 },
        { c: [0, -9.3], r: [5.0, 0.6], n: 120, trash: 0.2 },
        { c: [-6.2, -15.0], r: [0.7, 3.5], n: 90, trash: 0.2 },
      ],
      2: [
        { c: [0, -4.0], r: [9.6, 2.8], n: 400, trash: 0.25, brick: 0.08 },
        { c: [-9.8, -1.8], r: [1.0, 0.9], n: 150, pile: 0.45, trash: 0.15, brick: 0.2 },
        { c: [0, -9.3], r: [5.0, 0.6], n: 130, trash: 0.2 },
        { c: [6.2, -15.0], r: [0.7, 3.5], n: 90, trash: 0.2 },
      ],
      3: [
        { c: [0, -4.0], r: [9.6, 2.8], n: 460, trash: 0.15, brick: 0.12 },
        { c: [-4.8, -4.4], r: [2.0, 1.4], n: 280, pile: 0.55, trash: 0.05, brick: 0.25 },
        { c: [0, -9.3], r: [5.0, 0.6], n: 150, trash: 0.15 },
        { c: [0, -20.8], r: [4.5, 0.8], n: 120, trash: 0.2 },
      ],
      4: [
        { c: [0, -4.0], r: [9.6, 2.8], n: 520, trash: 0.15, brick: 0.15 },
        { c: [7.7, -4.2], r: [2.0, 1.5], n: 320, pile: 0.7, trash: 0.05, brick: 0.3 },
        { c: [-8.9, -2.2], r: [1.2, 1.0], n: 170, pile: 0.45, trash: 0.1, brick: 0.2 },
        { c: [0, -9.3], r: [5.0, 0.6], n: 170, trash: 0.15 },
      ],
      5: [
        { c: [-6.5, -6], r: [4, 3], n: 160, trash: 0.3, brick: 0.2 },
        { c: [3.0, -22], r: [3, 1.5], n: 100, pile: 0.3, trash: 0.1, brick: 0.3 },
      ],
    }) as Record<number, Cluster[]>,
    [DX, PZ],
  );

  return (
    <group name="props">
      {Object.entries(debris).map(([f, cl]) => (
        <Debris key={f} floor={Number(f)} clusters={cl} seed={Number(f) * 97 + 5} />
      ))}

      {/* Planta baja: zaguán */}
      <Mailboxes p={[IN_X - 0.07, 1.45, -4.2]} />
      <Bulb p={[DX + 0.6, ceil(0) - 0.22, -4.0]} len={0.9} />
      {/* vestíbulo */}
      <Chair p={[-2.6, L[0], -2.4]} rot={-0.6} fallen />
      <Chair p={[-5.4, L[0], -7.6]} rot={0.4} />
      <Table p={[-4.6, L[0], -9.6]} rot={0.3} />
      <FallenShutter p={[1.6, L[0] + 0.03, -2.6]} rot={-0.4} />
      <Wardrobe p={[-8.0, L[0], -9.1]} rot={Math.PI / 2} fallen />
      {/* cuarto de transformadores de alta tensión tras muro blanco */}
      <TransformerRoom />
      {/* patio: cubo de basura como en la foto */}
      <Cyl rt={0.3} rb={0.27} h={0.75} p={[2.6, L[0] + 0.375, PZ - 1.6]} m={useMats().building.cardboard} seg={16} />
      <Bucket p={[-2.8, L[0], PZ + 2.4]} />

      {/* Primer piso */}
      <Sofa p={[-9.8, L[1], -4.6]} rot={Math.PI / 2 - 0.15} />
      <Table p={[-6.7, L[1], -2.6]} rot={0.2} />
      <Chair p={[-5.5, L[1], -3.4]} rot={2.4} />
      <FallenShutter p={[2.6, L[1] + 0.03, -2.6]} rot={-0.6} />
      <Bulb p={[0, ceil(1) - 0.22, -3.6]} len={0.75} />
      <Ghost p={[-IN_X + 0.03, L[1] + 1.9, -3.2]} s={[0.9, 0.65]} r={Math.PI / 2} />
      <Ghost p={[-IN_X + 0.03, L[1] + 1.7, -5.3]} s={[0.5, 0.7]} r={Math.PI / 2} />
      <Plant p={[9.1, L[1], -1.4]} s={0.9} seed={21} />

      {/* Segundo piso */}
      <Table p={[-7.2, L[2], -3.6]} rot={-0.1} />
      <Chair p={[-8.3, L[2], -3.3]} rot={1.6} />
      <Chair p={[-6.0, L[2], -4.4]} rot={0.3} fallen />
      <Wardrobe p={[8.4, L[2], -4.6]} rot={0.3} fallen />
      <Chair p={[5.5, L[2], -1.8]} rot={-2.6} />
      <Bulb p={[0, ceil(2) - 0.22, -3.6]} len={0.6} />
      <Ghost p={[IN_X - 0.03, L[2] + 1.8, -3.5]} s={[1.1, 0.75]} r={-Math.PI / 2} />
      <FallenShutter p={[-2.2, L[2] + 0.03, -1.6]} rot={0.9} blue />

      {/* Tercer piso */}
      <Mattress p={[7.9, L[3], -3.0]} rot={0.25} />
      <Bucket p={[5.8, L[3], -1.6]} />
      <FallenBeam a={[-7.4, ceil(3) - 0.15, -1.6]} b={[-4.1, L[3] + 0.12, -4.6]} />
      <Vines p={[8.2, L[3] + 0.01, -1.2]} seed={31} />
      <Vines p={[-8.2, L[3] + 0.01, -1.0]} seed={32} spread={0.8} />
      <Chair p={[3.4, L[3], -4.8]} rot={1.2} fallen />
      <Ghost p={[-IN_X + 0.03, L[3] + 1.9, -2.6]} s={[0.7, 0.9]} r={Math.PI / 2} />

      {/* Cuarto piso */}
      <Mattress p={[-IN_X + 0.5, L[4], -4.6]} rot={Math.PI / 2} lean />
      <Wardrobe p={[-6.0, L[4], -7.2]} rot={0.05} />
      <Vines p={[0, L[4] + 0.01, -1.3]} seed={41} spread={1.3} />
      <Vines p={[-8.2, L[4] + 0.01, -1.1]} seed={42} />
      <Plant p={[8.4, L[4], -1.5]} s={1.2} seed={43} />
      <Chair p={[3.1, L[4], -3.4]} rot={-0.8} fallen />
      <FallenBeam a={[3.8, ceil(4) - 0.15, -1.5]} b={[5.5, L[4] + 0.1, -3.4]} />
      <Bulb p={[0, ceil(4) - 0.22, -3.6]} len={0.5} />
    </group>
  );
}
