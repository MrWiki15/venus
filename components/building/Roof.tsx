'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Bx, Cyl, useMats } from '../ctx';
import { wallGeo, catenary } from '@/lib/geometry';
import { ROOF, HALF, STAIR, STAIR_BC, DEPTH, PATIO, ELEV } from '@/lib/building';

const CF = STAIR.zFront + 0.5; // cara del casetón
const PD = DEPTH - 0.6; // largo de los pretiles laterales
const PZ = -(DEPTH + 0.6) / 2;
const BZ = -DEPTH + 0.1; // pretil trasero
const CB = STAIR.zBack - 0.25; // fondo del casetón
const TZ = (CF + CB) / 2; // centro del casetón
import { Plant, Bush } from './Facade';

type V3 = [number, number, number];

const CH = 2.8; // altura del casetón

function Clothesline({ a, b }: { a: V3; b: V3 }) {
  const m = useMats().building;
  const curve = useMemo(() => catenary(new THREE.Vector3(...a), new THREE.Vector3(...b), 0.18, 24), [a, b]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 24, 0.006, 4, false), [curve]);
  const clothes = useMemo(() => {
    const res: { p: V3; s: [number, number]; rot: number; mi: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const t = 0.1 + i * 0.12;
      const p = curve.getPoint(t);
      res.push({ p: [p.x, p.y, p.z], s: [0.35 + (i % 3) * 0.12, 0.45 + (i % 2) * 0.3], rot: 0.05 * (i % 3), mi: i % 4 });
    }
    return res;
  }, [curve]);
  const dir = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const yaw = Math.atan2(-dir.z, dir.x);
  return (
    <group>
      <Cyl rt={0.025} rb={0.03} h={2.1} p={[a[0], a[1] - 1.05 + 0.05, a[2]]} m={m.iron} seg={6} />
      <Cyl rt={0.025} rb={0.03} h={2.1} p={[b[0], b[1] - 1.05 + 0.05, b[2]]} m={m.iron} seg={6} />
      <mesh geometry={tube} material={m.black} />
      {clothes.map((c, i) => (
        <mesh key={i} position={[c.p[0], c.p[1] - c.s[1] / 2, c.p[2]]} rotation={[c.rot, yaw, 0]} material={m.cloth[c.mi]} castShadow>
          <planeGeometry args={c.s} />
        </mesh>
      ))}
    </group>
  );
}

function Antenna({ p }: { p: V3 }) {
  const m = useMats().building;
  return (
    <group position={p}>
      <Cyl rt={0.02} rb={0.025} h={3.6} p={[0, 1.8, 0]} m={m.iron} seg={6} />
      {[2.6, 3.0, 3.35].map((y, i) => (
        <Bx key={y} s={[1.3 - i * 0.3, 0.02, 0.02]} p={[0, y, 0]} m={m.iron} />
      ))}
      <Bx s={[0.02, 0.02, 0.9]} p={[0, 3.35, 0]} m={m.iron} />
    </group>
  );
}

export function Roof() {
  const m = useMats().building;
  const x0 = STAIR.wallX - 0.125;
  const frontGeo = useMemo(
    () => wallGeo(HALF - x0, CH, 0.25, [{ x: STAIR_BC - x0, y: 0, w: 1.5, h: 2.25 }]),
    [x0],
  );
  const sideGeo = useMemo(() => wallGeo(CF - CB, CH, 0.25, []), []);

  return (
    <group name="roof">
      {/* pretiles laterales y trasero */}
      <Bx s={[0.4, 1.05, PD]} p={[-HALF + 0.2, ROOF + 0.52, PZ]} m={m.facade} />
      <Bx s={[0.4, 1.05, PD]} p={[HALF - 0.2, ROOF + 0.52, PZ]} m={m.facade} />
      <Bx s={[HALF * 2, 1.05, 0.2]} p={[0, ROOF + 0.52, BZ]} m={m.facade} />
      <Bx s={[0.5, 0.08, PD]} p={[-HALF + 0.2, ROOF + 1.09, PZ]} m={m.trim} />
      <Bx s={[0.5, 0.08, PD]} p={[HALF - 0.2, ROOF + 1.09, PZ]} m={m.trim} />
      <Bx s={[HALF * 2, 0.08, 0.3]} p={[0, ROOF + 1.09, BZ]} m={m.trim} />

      {/* casetón de escalera */}
      <mesh geometry={frontGeo} material={m.facade} position={[x0, ROOF, CF - 0.125]} castShadow receiveShadow />
      <mesh
        geometry={sideGeo}
        material={m.facade}
        position={[x0 + 0.25, ROOF, CB]}
        rotation={[0, -Math.PI / 2, 0]}
        castShadow
        receiveShadow
      />
      <Bx s={[0.4, CH, CF - CB]} p={[HALF - 0.2, ROOF + CH / 2, TZ]} m={m.facade} />
      <Bx s={[HALF - x0, CH, 0.25]} p={[(HALF + x0) / 2, ROOF + CH / 2, CB + 0.125]} m={m.facade} />
      <Bx s={[HALF - x0 + 0.3, 0.22, CF - CB + 0.8]} p={[(HALF + x0) / 2, ROOF + CH + 0.11, (CF + CB) / 2]} m={[m.facade, m.facade, m.roof, m.ceiling, m.facade, m.facade]} />
      {/* puerta del casetón abierta */}
      <group position={[STAIR_BC - 0.75, ROOF, CF + 0.16]} rotation={[0, -2.3, 0]}>
        <Bx s={[1.45, 2.2, 0.05]} p={[0.72, 1.1, 0]} m={m.woodLight} />
      </group>

      {/* tanques de agua sobre el casetón */}
      <Bx s={[3.2, 0.25, 1.4]} p={[(HALF + x0) / 2, ROOF + CH + 0.34, TZ]} m={m.stone} />
      <Cyl rt={0.62} rb={0.62} h={1.25} p={[(HALF + x0) / 2 - 0.8, ROOF + CH + 1.09, TZ]} m={m.tank} seg={24} />
      <Cyl rt={0.62} rb={0.62} h={1.25} p={[(HALF + x0) / 2 + 0.8, ROOF + CH + 1.09, TZ]} m={m.tank} seg={24} />
      <Cyl rt={0.64} rb={0.64} h={0.06} p={[(HALF + x0) / 2 - 0.8, ROOF + CH + 1.74, TZ]} m={m.tank} seg={24} />
      <Cyl rt={0.03} rb={0.03} h={3.6} p={[x0 - 0.25, ROOF + 1.8, CF - 1.2]} m={m.rust} seg={6} />

      {/* tanque plástico azul */}
      <Bx s={[1.2, 0.4, 1.2]} p={[-7.4, ROOF + 0.2, -20.5]} m={m.brick} />
      <Cyl rt={0.5} rb={0.55} h={1.15} p={[-7.4, ROOF + 0.98, -20.5]} m={m.tankBlue} seg={24} />
      <Cyl rt={0.3} rb={0.3} h={0.1} p={[-7.4, ROOF + 1.6, -20.5]} m={m.tankBlue} seg={16} />

      <Antenna p={[-9.0, ROOF, -15.5]} />
      <Antenna p={[1.8, ROOF, -22.0]} />

      <Clothesline a={[-8.6, ROOF + 2.0, -3.2]} b={[-8.6, ROOF + 2.0, -12.5]} />
      <Clothesline a={[-10.4, ROOF + 2.0, -2.6]} b={[-7.2, ROOF + 2.0, -9.4]} />

      <Skylight />
      {/* cuarto de máquinas del ascensor */}
      <Bx s={[ELEV.x1 - ELEV.x0 + 0.1, 2.3, ELEV.zFront - ELEV.zBack + 0.1]} p={[(ELEV.x0 + ELEV.x1) / 2, ROOF + 1.15, (ELEV.zFront + ELEV.zBack) / 2]} m={m.facade} />
      <Bx s={[ELEV.x1 - ELEV.x0 + 0.3, 0.14, ELEV.zFront - ELEV.zBack + 0.3]} p={[(ELEV.x0 + ELEV.x1) / 2, ROOF + 2.37, (ELEV.zFront + ELEV.zBack) / 2]} m={m.trim} />
      <Bx s={[0.06, 1.9, 0.9]} p={[ELEV.x0 - 0.02, ROOF + 0.95, (ELEV.zFront + ELEV.zBack) / 2]} m={m.rust} />
      <Bx s={[0.5, 0.3, 0.04]} p={[(ELEV.x0 + ELEV.x1) / 2, ROOF + 1.9, ELEV.zFront + 0.07]} m={m.black} />
      <Plant p={[-8.8, ROOF, -23.8]} s={0.8} seed={51} />
      <Plant p={[2.4, ROOF, -24.0]} s={0.6} seed={52} />
      <Plant p={[-9.0, ROOF, -1.0]} s={0.7} seed={53} />
      {/* sillas de plástico olvidadas */}
      <Bx s={[0.45, 0.04, 0.45]} p={[-3.4, ROOF + 0.44, -2.6]} r={[0, 0.5, 0]} m={m.cloth[1]} />
      <Bx s={[0.45, 0.45, 0.04]} p={[-3.5, ROOF + 0.68, -2.82]} r={[-0.15, 0.5, 0]} m={m.cloth[1]} />
    </group>
  );
}

// Claraboya del patio: pretil, marco metálico con diagonales a cuatro aguas y vidrios (algunos rotos)
function Skylight() {
  const m = useMats().building;
  const { x0, x1, z0, z1 } = PATIO;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z0 - z1;
  const y = ROOF + 0.9; // apoyo sobre el pretil
  const rise = 1.1;
  const apex = new THREE.Vector3(cx, y + rise, cz);
  const corners = [
    new THREE.Vector3(x0, y, z0),
    new THREE.Vector3(x1, y, z0),
    new THREE.Vector3(x1, y, z1),
    new THREE.Vector3(x0, y, z1),
  ];
  const bar = (a: THREE.Vector3, b: THREE.Vector3, key: string, r = 0.035) => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    return <Cyl key={key} rt={r} rb={r} h={len} p={[mid.x, mid.y, mid.z]} r={[e.x, e.y, e.z]} m={m.iron} seg={6} />;
  };
  // paños de vidrio: 4 triángulos, con huecos de vidrios rotos
  const glass = useMemo(() => {
    const pos: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const seg = 6;
    for (let s = 0; s < 4; s++) {
      const A = corners[s];
      const B = corners[(s + 1) % 4];
      for (let i = 0; i < seg; i++) {
        if ((s === 1 && (i === 4 || i === 5)) || (s === 2 && i === 1)) continue; // rotos (foto)
        const p0 = A.clone().lerp(B, i / seg);
        const p1 = A.clone().lerp(B, (i + 1) / seg);
        tri(p0, p1, apex);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const bars = [];
  for (let s = 0; s < 4; s++) {
    const A = corners[s];
    const B = corners[(s + 1) % 4];
    bars.push(bar(A, B, 'e' + s, 0.05));
    bars.push(bar(A, apex, 'd' + s, 0.05));
    for (const t of [1 / 3, 2 / 3]) bars.push(bar(A.clone().lerp(B, t), apex, 'r' + s + t));
    // anillo interior a media altura (como en la foto)
    bars.push(bar(A.clone().lerp(apex, 0.5), B.clone().lerp(apex, 0.5), 'i' + s, 0.04));
  }
  return (
    <group name="claraboya">
      {/* pretil alrededor del hueco del patio */}
      <Bx s={[w + 0.6, 0.9, 0.3]} p={[cx, ROOF + 0.45, z0 + 0.15]} m={m.facade} />
      <Bx s={[w + 0.6, 0.9, 0.3]} p={[cx, ROOF + 0.45, z1 - 0.15]} m={m.facade} />
      <Bx s={[0.3, 0.9, d]} p={[x0 - 0.15, ROOF + 0.45, cz]} m={m.facade} />
      <Bx s={[0.3, 0.9, d]} p={[x1 + 0.15, ROOF + 0.45, cz]} m={m.facade} />
      <mesh geometry={glass} material={m.skyGlass} />
      {bars}
      {/* vegetación que crece en el borde (foto) */}
      <Bush p={[x1 - 0.4, ROOF + 0.9, z0 - 0.6]} s={1.1} seed={61} spread={[1, 0.9, 1]} />
    </group>
  );
}
