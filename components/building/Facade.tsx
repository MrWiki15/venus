'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Bx, Cyl, useMats } from '../ctx';
import { wallGeo, archGeo, corbelGeo, balusterGeo, boxGeo } from '@/lib/geometry';
import {
  W,
  HALF,
  FACADE_T,
  LEVELS,
  ROOF,
  PARAPET_TOP,
  DOOR,
  DOOR_L,
  GROUND_CENTER,
  GROUND_NARROW,
  BAYS,
  NARROW,
  COLUMNS,
  PIERS,
  BRACKET_PAIRS,
  ATTIC_VENTS,
  PARAPET_HOLES,
  PILASTER_STRIPS,
  TRIPARTITE,
  BALCONY_W1,
  BALCONY_W,
  groundOpenings,
  upperOpenings,
  type Opening,
} from '@/lib/building';
import { mulberry32 } from '@/lib/noise';

type V3 = [number, number, number];
type Item = { p: V3; s?: V3; r?: V3 };

const PARAPET_HOLE = { y: ROOF + 0.2, h: 0.52, w: 1.0 };

// ---------------------------------------------------------------------------
// Instancias genéricas (balaustres) para ahorrar draw calls
function Instances({ geo, mat, items }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: Item[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current!;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(...(it.r ?? [0, 0, 0]));
      o.scale.set(...(it.s ?? [1, 1, 1]));
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  });
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow receiveShadow frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// Mascarón: cartela con rostro esculpido sobre las pilastras de planta baja
function Mascaron({ p, s = 1 }: { p: V3; s?: number }) {
  const m = useMats().building;
  const shield = useMemo(() => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.34, 0.42);
    sh.quadraticCurveTo(-0.5, 0.12, -0.34, -0.2);
    sh.quadraticCurveTo(-0.18, -0.5, 0, -0.6);
    sh.quadraticCurveTo(0.18, -0.5, 0.34, -0.2);
    sh.quadraticCurveTo(0.5, 0.12, 0.34, 0.42);
    sh.quadraticCurveTo(0, 0.56, -0.34, 0.42);
    return new THREE.ExtrudeGeometry(sh, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSize: 0.04,
      bevelThickness: 0.05,
      bevelSegments: 2,
      curveSegments: 10,
    });
  }, []);
  const mt = m.column;
  return (
    <group position={p} scale={s}>
      <mesh geometry={shield} material={mt} castShadow receiveShadow />
      {/* rostro */}
      <mesh position={[0, 0.02, 0.15]} scale={[0.19, 0.25, 0.13]} material={mt} castShadow>
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
      <mesh position={[0, 0.0, 0.28]} scale={[0.035, 0.07, 0.05]} material={mt}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
      <mesh position={[0, 0.1, 0.25]} scale={[0.15, 0.025, 0.04]} material={mt}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
      {/* cabellera / corona de hojas */}
      <mesh position={[0, 0.2, 0.12]} material={mt} castShadow>
        <torusGeometry args={[0.2, 0.06, 8, 16, Math.PI]} />
      </mesh>
      {/* volutas laterales */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.36, 0.38, 0.06]} rotation={[0, 0, sx * 0.5]} material={mt} castShadow>
          <torusGeometry args={[0.11, 0.045, 8, 16]} />
        </mesh>
      ))}
      {/* guirnaldas */}
      {[-1, 1].map((sx) =>
        [0, 1, 2].map((k) => (
          <mesh key={`${sx}${k}`} position={[sx * (0.28 - k * 0.04), -0.12 - k * 0.13, 0.1]} scale={[0.07, 0.07, 0.05]} material={mt}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        )),
      )}
      <mesh position={[0, -0.3, 0.13]} scale={[0.13, 0.12, 0.06]} material={mt}>
        <sphereGeometry args={[1, 10, 8]} />
      </mesh>
      <mesh position={[0, -0.72, 0.05]} rotation={[Math.PI, 0, 0]} material={mt}>
        <coneGeometry args={[0.07, 0.22, 8]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Hoja de puerta de cuarterones. hinge = posición de la bisagra, dir = 1 si la hoja crece hacia +x
function DoorLeaf({
  hinge,
  w,
  h,
  angle,
  dir,
  broken = false,
  patch = false,
}: {
  hinge: V3;
  w: number;
  h: number;
  angle: number;
  dir: 1 | -1;
  broken?: boolean;
  patch?: boolean;
}) {
  const m = useMats().building;
  const t = 0.08;
  const c = (x: number) => dir * x;
  const upH = h * 0.58 - 0.23;
  const upY = h * 0.42 + 0.08 + upH / 2;
  return (
    <group position={hinge} rotation={[0, angle, 0]}>
      <Bx s={[0.13, h, t]} p={[c(0.065), h / 2, 0]} m={m.woodDark} />
      <Bx s={[0.13, h, t]} p={[c(w - 0.065), h / 2, 0]} m={m.woodDark} />
      <Bx s={[w - 0.26, 0.18, t]} p={[c(w / 2), 0.09, 0]} m={m.woodDark} />
      <Bx s={[w - 0.26, 0.16, t]} p={[c(w / 2), h * 0.42, 0]} m={m.woodDark} />
      <Bx s={[w - 0.26, 0.14, t]} p={[c(w / 2), h - 0.07, 0]} m={m.woodDark} />
      <Bx s={[w - 0.26, upH, t * 0.6]} p={[c(w / 2), upY, 0]} m={m.woodDark} />
      <Bx s={[w - 0.46, upH - 0.22, 0.03]} p={[c(w / 2), upY, 0.05]} m={m.woodDark} />
      {/* placa naranja (como en la foto del portón) */}
      {patch && <Bx s={[w * 0.62, upH * 0.42, 0.012]} p={[c(w / 2), upY - upH * 0.12, 0.07]} m={m.orangePanel} />}
      {!broken ? (
        <Bx s={[w - 0.26, h * 0.42 - 0.26, t * 0.6]} p={[c(w / 2), 0.18 + (h * 0.42 - 0.26) / 2, 0]} m={m.woodDark} />
      ) : (
        <>
          <Bx s={[0.2, h * 0.28, t * 0.6]} p={[c(0.24), 0.18 + h * 0.14, 0]} r={[0, 0, 0.08]} m={m.woodDark} />
          <Bx s={[0.34, 0.26, t * 0.6]} p={[c(w - 0.36), h * 0.33, 0]} r={[0, 0, -0.2]} m={m.woodDark} />
        </>
      )}
      <mesh position={[c(w - 0.2), h * 0.45, 0.07]} material={m.iron}>
        <sphereGeometry args={[0.035, 10, 8]} />
      </mesh>
    </group>
  );
}

// Medio punto del portón: vitral en cuadrícula (o tapiado con tablas)
function FanlightGrid({ x, y, r, z, boarded = false }: { x: number; y: number; r: number; z: number; boarded?: boolean }) {
  const m = useMats().building;
  return (
    <group position={[x, y, z]}>
      <mesh material={boarded ? m.boards : m.glass}>
        <circleGeometry args={[r, 32, 0, Math.PI]} />
      </mesh>
      {!boarded &&
        [-0.5, 0, 0.5].map((k) => {
          const xx = k * r;
          const hh = Math.sqrt(r * r - xx * xx);
          return <Bx key={k} s={[0.05, hh, 0.07]} p={[xx, hh / 2, 0.01]} m={m.woodDark} />;
        })}
      {!boarded && <Bx s={[2 * Math.sqrt(r * r - 0.25 * r * r), 0.05, 0.07]} p={[0, 0.5 * r, 0.01]} m={m.woodDark} />}
      <mesh material={m.woodDark}>
        <torusGeometry args={[r - 0.03, 0.04, 6, 24, Math.PI]} />
      </mesh>
      <Bx s={[2 * r + 0.08, 0.14, 0.14]} p={[0, -0.02, 0]} m={m.woodDark} />
    </group>
  );
}

// Tablas clavadas sobre el portón izquierdo tapiado
function Boards({ x, y0, w, h, z }: { x: number; y0: number; w: number; h: number; z: number }) {
  const m = useMats().building;
  const rng = mulberry32(17);
  const n = 7;
  const bw = w / n;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const hh = h - rng() * 0.25;
        return <Bx key={i} s={[bw - 0.015, hh, 0.03]} p={[x - w / 2 + bw * (i + 0.5), y0 + hh / 2, z]} r={[0, 0, (rng() - 0.5) * 0.01]} m={m.boards} />;
      })}
      <Bx s={[w * 0.98, 0.12, 0.03]} p={[x, y0 + h * 0.3, z + 0.03]} m={m.boards} />
      <Bx s={[w * 0.98, 0.12, 0.03]} p={[x, y0 + h * 0.75, z + 0.03]} m={m.boards} />
    </group>
  );
}

function Column({ x, z }: { x: number; z: number }) {
  const m = useMats().building;
  return (
    <group position={[x, 0, z]}>
      <Bx s={[0.52, 0.55, 0.52]} p={[0, 0.455, 0]} m={m.column} />
      <Cyl rt={0.23} rb={0.25} h={0.1} p={[0, 0.78, 0]} m={m.column} />
      <mesh position={[0, 0.85, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.column} castShadow>
        <torusGeometry args={[0.2, 0.035, 8, 20]} />
      </mesh>
      <Cyl rt={0.17} rb={0.19} h={3.82} p={[0, 0.86 + 1.91, 0]} m={m.column} seg={24} />
      <mesh position={[0, 4.66, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.column} castShadow>
        <torusGeometry args={[0.18, 0.03, 8, 20]} />
      </mesh>
      <Cyl rt={0.27} rb={0.18} h={0.15} p={[0, 4.77, 0]} m={m.column} />
      <Bx s={[0.56, 0.1, 0.56]} p={[0, 4.9, 0]} m={m.column} />
    </group>
  );
}

// Ventana estrecha de planta baja: carpintería oscura acristalada
function NarrowGroundWindow({ x }: { x: number }) {
  const m = useMats().building;
  const y0 = GROUND_NARROW.rail;
  const y1 = GROUND_NARROW.y0 + GROUND_NARROW.h;
  const w = GROUND_NARROW.w;
  const h = y1 - y0;
  const z = -0.32;
  return (
    <group>
      <Bx s={[w - 0.04, h, 0.02]} p={[x, y0 + h / 2, z - 0.03]} m={m.darkGlass} cast={false} />
      <Bx s={[0.06, h, 0.07]} p={[x - w / 2 + 0.05, y0 + h / 2, z]} m={m.woodDark} />
      <Bx s={[0.06, h, 0.07]} p={[x + w / 2 - 0.05, y0 + h / 2, z]} m={m.woodDark} />
      <Bx s={[0.04, h, 0.06]} p={[x, y0 + h / 2, z]} m={m.woodDark} />
      {[0, 0.33, 0.66, 1].map((k) => (
        <Bx key={k} s={[w - 0.06, 0.06, 0.07]} p={[x, y0 + k * h, z]} m={m.woodDark} />
      ))}
      <Bx s={[w + 0.24, 0.1, 0.14]} p={[x, y1 + 0.05, 0.07]} m={m.trim} />
    </group>
  );
}

function OpeningSurround({ o, n }: { o: Opening; n: number }) {
  const m = useMats().building;
  const { x, y, w, h } = o;
  if (o.kind === 'narrow') {
    const glazed = (n + Math.round(x)) % 3 !== 0;
    return (
      <group>
        <Bx s={[0.12, h + 0.12, 0.08]} p={[x - w / 2 - 0.06, y + h / 2, 0.04]} m={m.trim} />
        <Bx s={[0.12, h + 0.12, 0.08]} p={[x + w / 2 + 0.06, y + h / 2, 0.04]} m={m.trim} />
        <Bx s={[w + 0.36, 0.14, 0.14]} p={[x, y + h + 0.07, 0.07]} m={m.trim} />
        <Bx s={[w + 0.3, 0.08, 0.22]} p={[x, y - 0.04, 0.11]} m={m.trim} />
        {glazed ? (
          <group>
            <Bx s={[w - 0.04, h - 0.04, 0.02]} p={[x, y + h / 2, -0.36]} m={m.darkGlass} cast={false} />
            <Bx s={[0.05, h, 0.06]} p={[x, y + h / 2, -0.33]} m={m.woodDark} />
            {[0.02, 0.5, 0.98].map((k) => (
              <Bx key={k} s={[w - 0.04, 0.05, 0.06]} p={[x, y + k * h, -0.33]} m={m.woodDark} />
            ))}
          </group>
        ) : (
          [-0.18, -0.06, 0.06, 0.18].map((bx) => <Cyl key={bx} rt={0.012} rb={0.012} h={h} p={[x + bx, y + h / 2, -0.14]} m={m.iron} seg={6} />)
        )}
      </group>
    );
  }
  if (o.kind === 'side') {
    // arquillos laterales de la ventana tripartita
    return (
      <group>
        <mesh geometry={archGeo(w / 2 + 0.04, 0.035)} position={[x, y + h, 0.03]} material={m.trim} castShadow />
        <Bx s={[w - 0.04, h + w / 2, 0.02]} p={[x, y + (h + w / 2) / 2, -0.36]} m={m.darkGlass} cast={false} />
        <Bx s={[w + 0.2, 0.08, 0.18]} p={[x, y - 0.04, 0.09]} m={m.trim} />
      </group>
    );
  }
  if (o.arch) {
    return (
      <group>
        <Bx s={[0.16, h, 0.1]} p={[x - w / 2 - 0.08, y + h / 2, 0.05]} m={m.trim} />
        <Bx s={[0.16, h, 0.1]} p={[x + w / 2 + 0.08, y + h / 2, 0.05]} m={m.trim} />
        <Bx s={[0.32, 0.12, 0.14]} p={[x - w / 2 - 0.08, y + h, 0.07]} m={m.trim} />
        <Bx s={[0.32, 0.12, 0.14]} p={[x + w / 2 + 0.08, y + h, 0.07]} m={m.trim} />
        <mesh geometry={archGeo(w / 2 + 0.08, 0.075)} position={[x, y + h, 0.03]} material={m.trim} castShadow receiveShadow />
        <Bx s={[0.26, 0.42, 0.16]} p={[x, y + h + w / 2 + 0.12, 0.08]} m={m.trim} />
      </group>
    );
  }
  return (
    <group>
      <Bx s={[0.18, h, 0.1]} p={[x - w / 2 - 0.09, y + h / 2, 0.05]} m={m.trim} />
      <Bx s={[0.18, h, 0.1]} p={[x + w / 2 + 0.09, y + h / 2, 0.05]} m={m.trim} />
      <Bx s={[w + 0.36, 0.28, 0.08]} p={[x, y + h + 0.14, 0.04]} m={m.trim} />
      <Bx s={[w + 0.7, 0.14, 0.34]} p={[x, y + h + 0.35, 0.17]} m={m.trim} />
      <Bx s={[0.14, 0.32, 0.22]} p={[x - w / 2 - 0.22, y + h + 0.12, 0.11]} m={m.trim} />
      <Bx s={[0.14, 0.32, 0.22]} p={[x + w / 2 + 0.22, y + h + 0.12, 0.11]} m={m.trim} />
    </group>
  );
}

// Columnillas de la ventana tripartita del primer piso
function TripartiteColonnettes() {
  const m = useMats().building;
  const L = LEVELS[1];
  return (
    <group>
      {TRIPARTITE.colonnettes.map((x) => (
        <group key={x}>
          <Cyl rt={0.055} rb={0.06} h={1.6} p={[x, L + 0.85 + 0.8, 0.05]} m={m.column} seg={10} />
          <Bx s={[0.16, 0.08, 0.16]} p={[x, L + 2.49, 0.05]} m={m.column} />
          <Bx s={[0.16, 0.06, 0.16]} p={[x, L + 0.82, 0.05]} m={m.column} />
        </group>
      ))}
    </group>
  );
}

// Contraventanas / puertas de balcón
function Shutters({ o, state, blue }: { o: Opening; state: 'open' | 'half' | 'none' | 'closed'; blue?: boolean }) {
  const m = useMats().building;
  if (state === 'none') return null;
  const lw = o.w / 2;
  const mat = blue ? m.shutterBlue : m.shutter;
  const leaf = (hx: number, dir: 1 | -1, ang: number, key: string) => (
    <group key={key} position={[hx, o.y + o.h / 2, -FACADE_T + 0.05]} rotation={[0, ang, 0]}>
      <Bx s={[lw, o.h, 0.045]} p={[(dir * lw) / 2, 0, 0]} m={mat} />
      {[-0.35, 0, 0.35].map((k) => (
        <Bx key={k} s={[lw - 0.08, 0.06, 0.06]} p={[(dir * lw) / 2, k * o.h, 0.01]} m={mat} />
      ))}
    </group>
  );
  const x0 = o.x - o.w / 2;
  const x1 = o.x + o.w / 2;
  const leaves = [];
  if (state === 'open') leaves.push(leaf(x0, 1, 1.55, 'l'), leaf(x1, -1, -1.45, 'r'));
  else if (state === 'half') leaves.push(leaf(x0, 1, 0, 'l'), leaf(x1, -1, -1.2, 'r'));
  else leaves.push(leaf(x0, 1, 0.05, 'l'), leaf(x1, -1, -0.05, 'r'));
  return (
    <group>
      {leaves}
      {o.arch && (
        <mesh position={[o.x, o.y + o.h, -FACADE_T + 0.06]} material={state === 'closed' ? mat : m.glass}>
          <circleGeometry args={[o.w / 2, 24, 0, Math.PI]} />
        </mesh>
      )}
    </group>
  );
}

interface BalconyDef {
  x: number;
  n: number;
  w: number;
  d: number;
  kind: 'solid' | 'balusters';
  broken?: boolean;
}

function Balcony({ x, n, w, d, kind, broken }: BalconyDef) {
  const m = useMats().building;
  const L = LEVELS[n];
  const big = n === 1;
  const cg = useMemo(() => corbelGeo(d - 0.08, big ? 0.75 : 0.55, big ? 0.24 : 0.2), [d, big]);
  const nb = w > 3 ? 4 : 3;
  const brackets = Array.from({ length: nb }, (_, i) => x - w / 2 + 0.3 + (i * (w - 0.6)) / (nb - 1));
  const slabT = big ? 0.28 : 0.2;
  return (
    <group>
      <Bx s={[w, slabT, d]} p={[x, L - slabT / 2, d / 2]} m={m.trim} />
      <Bx s={[w + 0.1, 0.07, d + 0.06]} p={[x, L - slabT - 0.035, d / 2 + 0.01]} m={m.trim} />
      {brackets.map((bx) => (
        <mesh key={bx} geometry={cg} position={[bx, L - slabT - 0.07, 0]} material={m.trim} castShadow receiveShadow />
      ))}
      {kind === 'solid' ? (
        <>
          <Bx s={[w, 0.95, 0.14]} p={[x, L + 0.475, d - 0.07]} m={m.trim} />
          <Bx s={[0.14, 0.95, d - 0.14]} p={[x - w / 2 + 0.07, L + 0.475, (d - 0.14) / 2]} m={m.trim} />
          <Bx s={[0.14, 0.95, d - 0.14]} p={[x + w / 2 - 0.07, L + 0.475, (d - 0.14) / 2]} m={m.trim} />
          <Bx s={[w * 0.72, 0.5, 0.04]} p={[x, L + 0.48, d + 0.02]} m={m.trim} />
          <Bx s={[w * 0.52, 0.26, 0.03]} p={[x, L + 0.48, d + 0.05]} m={m.trim} />
          {!broken ? (
            <Bx s={[w + 0.14, 0.08, 0.26]} p={[x, L + 0.99, d - 0.08]} m={m.trim} />
          ) : (
            <Bx s={[w * 0.45, 0.08, 0.26]} p={[x - w * 0.27, L + 0.99, d - 0.08]} r={[0, 0, -0.03]} m={m.trim} />
          )}
        </>
      ) : (
        <>
          <Bx s={[w, 0.12, 0.18]} p={[x, L + 0.06, d - 0.1]} m={m.trim} />
          <Bx s={[0.2, 0.95, 0.2]} p={[x - w / 2 + 0.1, L + 0.475, d - 0.1]} m={m.trim} />
          <Bx s={[0.2, 0.95, 0.2]} p={[x + w / 2 - 0.1, L + 0.475, d - 0.1]} m={m.trim} />
          {!broken ? (
            <Bx s={[w + 0.06, 0.1, 0.24]} p={[x, L + 0.96, d - 0.1]} m={m.trim} />
          ) : (
            <Bx s={[w * 0.42, 0.1, 0.24]} p={[x - w * 0.29, L + 0.96, d - 0.1]} r={[0, 0, -0.04]} m={m.trim} />
          )}
          <Bx s={[0.2, 0.1, d - 0.1]} p={[x - w / 2 + 0.1, L + 0.96, (d - 0.1) / 2]} m={m.trim} />
          <Bx s={[0.2, 0.1, d - 0.1]} p={[x + w / 2 - 0.1, L + 0.96, (d - 0.1) / 2]} m={m.trim} />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Vegetación
export function Plant({ p, s = 1, seed = 1, pot = true }: { p: V3; s?: number; seed?: number; pot?: boolean }) {
  const m = useMats().building;
  const leaves = useMemo(() => {
    const r = mulberry32(seed);
    return Array.from({ length: 16 }, () => ({
      rot: [r() * 0.9 - 0.2, r() * Math.PI * 2, r() * 0.6 - 0.3] as V3,
      len: 0.35 + r() * 0.45,
      dark: r() < 0.4,
    }));
  }, [seed]);
  return (
    <group position={p} scale={s}>
      {pot && <Cyl rt={0.16} rb={0.12} h={0.28} p={[0, 0.14, 0]} m={m.brick} />}
      {leaves.map((l, i) => (
        <group key={i} position={[0, pot ? 0.25 : 0, 0]} rotation={l.rot}>
          <mesh position={[0, l.len / 2, 0]} scale={[0.09, l.len / 2, 0.02]} material={l.dark ? m.plantDark : m.plant} castShadow>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Arbusto silvestre que crece en huecos y cornisas
export function Bush({ p, s = 1, seed = 1, spread = [1, 1, 0.6] }: { p: V3; s?: number; seed?: number; spread?: V3 }) {
  const m = useMats().building;
  const blobs = useMemo(() => {
    const r = mulberry32(seed);
    return Array.from({ length: 34 }, () => {
      const a = r() * Math.PI;
      const rad = Math.sqrt(r());
      return {
        pos: [Math.cos(a) * rad * 0.6 * spread[0], Math.sin(a) * rad * 0.8 * spread[1], (r() - 0.5) * 0.5 * spread[2]] as V3,
        rot: [r() * 3, r() * 3, r() * 3] as V3,
        sc: [0.08 + r() * 0.07, 0.03, 0.14 + r() * 0.12] as V3,
        dark: r() < 0.45,
      };
    });
  }, [seed, spread]);
  return (
    <group position={p} scale={s}>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.pos} rotation={b.rot} scale={b.sc} material={b.dark ? m.plantDark : m.plant} castShadow>
          <sphereGeometry args={[1, 7, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function Tree({ p }: { p: V3 }) {
  const m = useMats().building;
  return (
    <group position={p}>
      <Cyl rt={0.05} rb={0.09} h={1.6} p={[0, 0.8, 0]} r={[0.15, 0, -0.2]} m={m.woodDark} seg={8} />
      <Cyl rt={0.03} rb={0.05} h={0.9} p={[0.3, 1.5, 0]} r={[0, 0, -0.8]} m={m.woodDark} seg={6} />
      <Bush p={[0.25, 1.6, 0]} s={1.6} seed={71} spread={[1.2, 1, 1.2]} />
      <Bush p={[0.7, 1.9, 0.1]} s={1.2} seed={72} spread={[1, 1, 1]} />
      <Bush p={[-0.2, 2.0, -0.1]} s={1.3} seed={73} spread={[1, 1, 1]} />
    </group>
  );
}

// ---------------------------------------------------------------------------
export function Facade() {
  const m = useMats().building;

  const groundGeo = useMemo(
    () =>
      wallGeo(
        W,
        LEVELS[1],
        FACADE_T,
        groundOpenings().map((o) => ({ ...o, x: o.x + HALF })),
      ),
    [],
  );

  const upperGeo = useMemo(() => {
    const holes: Opening[] = [];
    for (let n = 1; n <= 4; n++) for (const o of upperOpenings(n)) holes.push({ ...o, x: o.x + HALF, y: o.y - LEVELS[1] });
    for (const vx of ATTIC_VENTS) holes.push({ x: vx + HALF, y: ROOF - 0.95 - LEVELS[1], w: 1.3, h: 0.42 });
    for (const px of PARAPET_HOLES) holes.push({ x: px + HALF, y: PARAPET_HOLE.y - LEVELS[1], w: PARAPET_HOLE.w, h: PARAPET_HOLE.h });
    return wallGeo(W, PARAPET_TOP - LEVELS[1], FACADE_T, holes);
  }, []);

  const balGeo = useMemo(() => balusterGeo(0.8), []);

  const { balconies, balusters, bars } = useMemo(() => {
    const bal: BalconyDef[] = [];
    // 1er piso: grandes, con balaustres; el central abarca la ventana tripartita
    bal.push({ x: 0, n: 1, w: BALCONY_W1.center, d: 1.15, kind: 'balusters' });
    bal.push({ x: BAYS[0], n: 1, w: BALCONY_W1.side, d: 1.05, kind: 'balusters' });
    bal.push({ x: BAYS[2], n: 1, w: BALCONY_W1.side, d: 1.05, kind: 'balusters', broken: true });
    for (let n = 2; n <= 4; n++) {
      for (const x of BAYS) {
        bal.push({
          x,
          n,
          w: BALCONY_W,
          d: 0.9,
          kind: n === 2 ? 'balusters' : 'solid',
          broken: (n === 4 && x === 0) || (n === 3 && x === BAYS[0]) || (n === 2 && x === BAYS[2]),
        });
      }
    }
    const bl: Item[] = [];
    // pretil de azotea
    for (const hx of PARAPET_HOLES) for (let k = 0; k < 4; k++) bl.push({ p: [hx - 0.375 + k * 0.25, PARAPET_HOLE.y, -0.3], s: [1, PARAPET_HOLE.h / 0.8, 1] });
    // balcones
    for (const b of bal) {
      if (b.kind !== 'balusters') continue;
      const L = LEVELS[b.n];
      const rng = mulberry32(b.n * 31 + Math.round(b.x * 7) + 100);
      const half = b.w / 2 - 0.26;
      const cnt = Math.round((half * 2) / 0.21);
      for (let i = 0; i <= cnt; i++) {
        if (b.broken && rng() < 0.45) continue;
        bl.push({ p: [b.x - half + (i * half * 2) / cnt, L + 0.12, b.d - 0.1], s: [1, 0.78, 1] });
      }
      for (const side of [-1, 1]) for (let bz = 0.18; bz < b.d - 0.25; bz += 0.21) bl.push({ p: [b.x + side * (b.w / 2 - 0.1), L + 0.12, bz], s: [1, 0.78, 1] });
    }
    // balaustradas de planta baja (bajo la celosía y bajo las ventanas estrechas)
    const gy = GROUND_CENTER.y0 + 0.08;
    const gs = (GROUND_CENTER.rail - GROUND_CENTER.y0 - 0.16) / 0.8;
    for (let x = -GROUND_CENTER.w / 2 + 0.15; x <= GROUND_CENTER.w / 2 - 0.14; x += 0.192) bl.push({ p: [x, gy, -0.3], s: [1, gs, 1] });
    for (const nx of NARROW) for (const dx of [-0.15, 0, 0.15]) bl.push({ p: [nx + dx, gy, -0.3], s: [1, gs, 1] });

    // rejas sobre la celosía
    const br: number[] = [];
    for (let x = -GROUND_CENTER.w / 2 + 0.1; x <= GROUND_CENTER.w / 2 - 0.09; x += 0.12) br.push(x);
    return { balconies: bal, balusters: bl, bars: br };
  }, []);

  const shutterStates: Record<string, 'open' | 'half' | 'none' | 'closed'> = {
    [`1:${BAYS[0]}`]: 'none',
    '1:0': 'none',
    [`1:${BAYS[2]}`]: 'none',
    [`2:${BAYS[0]}`]: 'none',
    '2:0': 'open',
    [`2:${BAYS[2]}`]: 'closed',
    [`3:${BAYS[0]}`]: 'half',
    '3:0': 'none',
    [`3:${BAYS[2]}`]: 'open',
    [`4:${BAYS[0]}`]: 'none',
    '4:0': 'half',
    [`4:${BAYS[2]}`]: 'none',
  };

  const latticeH = GROUND_CENTER.lattice - GROUND_CENTER.rail;
  const topY = GROUND_CENTER.y0 + GROUND_CENTER.h;

  return (
    <group name="facade">
      {/* muros */}
      <mesh geometry={groundGeo} material={m.rustic} position={[-HALF, 0, -FACADE_T]} castShadow receiveShadow />
      <mesh geometry={upperGeo} material={m.facade} position={[-HALF, LEVELS[1], -FACADE_T]} castShadow receiveShadow />

      {/* pilastras de esquina y franjas verticales de los ejes estrechos */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Bx s={[0.6, 4.95, 0.2]} p={[sx * (HALF - 0.3), 2.475, 0.1]} m={m.rustic} />
          <Bx s={[0.6, ROOF - 1.25 - LEVELS[1], 0.14]} p={[sx * (HALF - 0.3), (ROOF - 1.25 + LEVELS[1]) / 2, 0.07]} m={m.trim} />
        </group>
      ))}
      {PILASTER_STRIPS.map((x) => (
        <group key={x}>
          <Bx s={[0.24, ROOF - 1.25 - LEVELS[1], 0.1]} p={[x, (ROOF - 1.25 + LEVELS[1]) / 2, 0.05]} m={m.trim} />
          <Bx s={[0.36, 0.16, 0.16]} p={[x, ROOF - 1.3, 0.08]} m={m.trim} />
        </group>
      ))}

      {/* entablamento de planta baja e impostas de piso */}
      <Bx s={[W + 0.2, 0.28, 0.26]} p={[0, 5.09, 0.13]} m={m.trim} />
      <Bx s={[W + 0.3, 0.3, 0.5]} p={[0, 5.36, 0.25]} m={m.trim} />
      {[2, 3, 4].map((n) => (
        <Bx key={n} s={[W + 0.2, 0.26, 0.2]} p={[0, LEVELS[n] - 0.5, 0.1]} m={m.trim} />
      ))}

      {/* cornisa con ménsulas pareadas y respiraderos del ático */}
      <Bx s={[W + 0.2, 0.16, 0.18]} p={[0, ROOF - 1.2, 0.09]} m={m.trim} />
      {BRACKET_PAIRS.flatMap((bx) =>
        [-0.17, 0.17].map((dx) => (
          <mesh
            key={`${bx}${dx}`}
            geometry={CORNICE_BRACKET}
            position={[bx + dx, ROOF - 0.3, 0]}
            material={m.trim}
            castShadow
            receiveShadow
          />
        )),
      )}
      {ATTIC_VENTS.map((vx) => (
        <Bx key={vx} s={[1.3, 0.42, 0.02]} p={[vx, ROOF - 0.74, -0.5]} m={m.black} cast={false} />
      ))}
      <Bx s={[W + 0.7, 0.3, 0.86]} p={[0, ROOF - 0.15, 0.43]} m={m.trim} />
      <Bx s={[W + 0.5, 0.12, 0.7]} p={[0, ROOF + 0.06, 0.35]} m={m.trim} />
      <Bx s={[W + 0.3, 0.12, 0.8]} p={[0, PARAPET_TOP + 0.06, -0.26]} m={m.trim} />

      {/* columnas pareadas */}
      {COLUMNS.map((x) => (
        <Column key={x} x={x} z={0.3} />
      ))}

      {/* mascarones sobre las pilastras almohadilladas */}
      {PIERS.map((x) => (
        <Mascaron key={x} p={[x, 4.45, 0.02]} s={0.95} />
      ))}

      {/* portón principal (derecha): vitral en cuadrícula, hoja izq. con placa naranja y panel roto, hoja der. abierta */}
      <mesh geometry={archGeo(DOOR.w / 2 + 0.12, 0.1)} position={[DOOR.x, DOOR.y0 + DOOR.rect, 0.05]} material={m.trim} castShadow />
      <Bx s={[0.22, DOOR.rect, 0.1]} p={[DOOR.x - DOOR.w / 2 - 0.11, DOOR.y0 + DOOR.rect / 2, 0.05]} m={m.trim} />
      <Bx s={[0.22, DOOR.rect, 0.1]} p={[DOOR.x + DOOR.w / 2 + 0.11, DOOR.y0 + DOOR.rect / 2, 0.05]} m={m.trim} />
      <FanlightGrid x={DOOR.x} y={DOOR.y0 + DOOR.rect} r={DOOR.w / 2} z={-0.32} />
      <DoorLeaf hinge={[DOOR.x - DOOR.w / 2, DOOR.y0, -0.32]} w={DOOR.w / 2} h={DOOR.rect} angle={0} dir={1} broken patch />
      <DoorLeaf hinge={[DOOR.x + DOOR.w / 2, DOOR.y0, -0.36]} w={DOOR.w / 2} h={DOOR.rect} angle={-1.22} dir={-1} />
      <Bx s={[DOOR.w + 0.4, 0.13, 0.5]} p={[DOOR.x, 0.245, 0.25]} m={m.stone} />

      {/* portón izquierdo: cerrado, con medio punto de vidrio rojo */}
      <mesh geometry={archGeo(DOOR_L.w / 2 + 0.12, 0.1)} position={[DOOR_L.x, DOOR_L.y0 + DOOR_L.rect, 0.05]} material={m.trim} castShadow />
      <Bx s={[0.22, DOOR_L.rect, 0.1]} p={[DOOR_L.x - DOOR_L.w / 2 - 0.11, DOOR_L.y0 + DOOR_L.rect / 2, 0.05]} m={m.trim} />
      <Bx s={[0.22, DOOR_L.rect, 0.1]} p={[DOOR_L.x + DOOR_L.w / 2 + 0.11, DOOR_L.y0 + DOOR_L.rect / 2, 0.05]} m={m.trim} />
      <FanlightGrid x={DOOR_L.x} y={DOOR_L.y0 + DOOR_L.rect} r={DOOR_L.w / 2} z={-0.3} />
      <DoorLeaf hinge={[DOOR_L.x - DOOR_L.w / 2, DOOR_L.y0, -0.34]} w={DOOR_L.w / 2} h={DOOR_L.rect} angle={0} dir={1} />
      <DoorLeaf hinge={[DOOR_L.x + DOOR_L.w / 2, DOOR_L.y0, -0.34]} w={DOOR_L.w / 2} h={DOOR_L.rect} angle={0} dir={-1} />
      <Bx s={[DOOR_L.w + 0.4, 0.13, 0.5]} p={[DOOR_L.x, 0.245, 0.25]} m={m.stone} />

      {/* gran hueco central: balaustrada + celosía de ladrillo + rejas */}
      <Bx s={[GROUND_CENTER.w, 0.08, 0.3]} p={[0, GROUND_CENTER.y0 + 0.04, -0.3]} m={m.column} />
      <Bx s={[GROUND_CENTER.w, 0.08, 0.26]} p={[0, GROUND_CENTER.rail - 0.04, -0.3]} m={m.column} />
      <mesh position={[0, GROUND_CENTER.rail + latticeH / 2, -0.3]} material={m.lattice} castShadow receiveShadow>
        <planeGeometry args={[GROUND_CENTER.w, latticeH]} />
      </mesh>
      <Bx s={[GROUND_CENTER.w, 0.08, 0.14]} p={[0, GROUND_CENTER.lattice, -0.3]} m={m.iron} />
      <Bx s={[GROUND_CENTER.w, 0.05, 0.05]} p={[0, (GROUND_CENTER.lattice + topY) / 2, -0.3]} m={m.iron} />
      {bars.map((x) => (
        <Cyl key={x} rt={0.012} rb={0.012} h={topY - GROUND_CENTER.lattice} p={[x, (GROUND_CENTER.lattice + topY) / 2, -0.3]} m={m.iron} seg={6} />
      ))}

      {/* ventanas estrechas de planta baja con balaustrada */}
      {NARROW.map((x) => (
        <group key={x}>
          <Bx s={[GROUND_NARROW.w, 0.08, 0.3]} p={[x, GROUND_NARROW.y0 + 0.04, -0.3]} m={m.column} />
          <Bx s={[GROUND_NARROW.w, 0.08, 0.26]} p={[x, GROUND_NARROW.rail - 0.04, -0.3]} m={m.column} />
          <NarrowGroundWindow x={x} />
        </group>
      ))}

      {/* huecos de pisos altos */}
      {[1, 2, 3, 4].map((n) =>
        upperOpenings(n).map((o) => (
          <group key={`${n}-${o.x}`}>
            <OpeningSurround o={o} n={n} />
            {o.kind === 'bay' && <Shutters o={o} state={shutterStates[`${n}:${o.x}`] ?? 'none'} blue={n === 3} />}
          </group>
        )),
      )}
      <TripartiteColonnettes />

      {balconies.map((b) => (
        <Balcony key={`${b.n}-${b.x}`} {...b} />
      ))}
      <Instances geo={balGeo} mat={m.column} items={balusters} />

      {/* vegetación: arbusto en el arco derecho del 1er piso, macetas y árbol en la esquina */}
      <Bush p={[BAYS[2], LEVELS[1] + 0.2, -0.25]} s={1.5} seed={5} spread={[1.1, 1.4, 0.8]} />
      <Bush p={[BAYS[2] + 0.4, LEVELS[1] + 0.05, 0.6]} s={1.1} seed={6} spread={[1.2, 0.7, 0.8]} />
      <Plant p={[BAYS[2] - 1.0, LEVELS[1], 0.55]} s={1.0} seed={8} />
      <Plant p={[BAYS[0] + 0.8, LEVELS[2], 0.45]} s={0.8} seed={9} />
      <Bush p={[-0.9, ROOF + 0.1, 0.55]} s={0.6} seed={10} spread={[1, 0.6, 0.6]} />
      <Tree p={[HALF - 1.4, ROOF, -0.9]} />
    </group>
  );
}

// ménsula de cornisa (perfil en S)
const CORNICE_BRACKET = corbelGeo(0.66, 0.82, 0.16);
void boxGeo;
