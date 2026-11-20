'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Bx, Cyl, useMats } from '../ctx';
import { Wall } from './Interior';
import { LEVELS, SLAB, TRAFO_ROOM, TRAFOS } from '@/lib/building';

// Cartel amarillo de "PELIGRO · ALTA TENSIÓN" (textura pequeña dibujada en canvas)
function useWarningTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 320;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f1f0ea';
    ctx.fillRect(0, 0, 256, 320);
    // triángulo de peligro
    ctx.fillStyle = '#f2c230';
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(128, 22);
    ctx.lineTo(236, 206);
    ctx.lineTo(20, 206);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // rayo
    ctx.fillStyle = '#151515';
    ctx.beginPath();
    ctx.moveTo(140, 70);
    ctx.lineTo(100, 140);
    ctx.lineTo(128, 140);
    ctx.lineTo(112, 190);
    ctx.lineTo(160, 118);
    ctx.lineTo(132, 118);
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c0261d';
    ctx.fillText('PELIGRO', 128, 252);
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillStyle = '#151515';
    ctx.fillText('ALTA TENSIÓN', 128, 292);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
}

type V3 = [number, number, number];

function Transformer({ p, rot = 0 }: { p: V3; rot?: number }) {
  const m = useMats().building;
  const tankH = 1.55;
  const top = 0.18 + tankH;
  return (
    <group position={p} rotation={[0, rot, 0]}>
      {/* bancada de hormigón */}
      <Bx s={[1.9, 0.18, 1.6]} p={[0, 0.09, 0]} m={m.stone} />
      {/* cuba */}
      <Bx s={[1.25, tankH, 0.95]} p={[0, 0.18 + tankH / 2, 0]} m={m.trafoMetal} />
      <Bx s={[1.38, 0.08, 1.08]} p={[0, top + 0.04, 0]} m={m.trafoMetal} />
      {/* radiadores a ambos lados */}
      {[-1, 1].flatMap((sx) =>
        Array.from({ length: 6 }, (_, i) => (
          <Bx key={`${sx}${i}`} s={[0.22, 1.15, 0.035]} p={[sx * 0.74, 0.3 + 0.62, -0.35 + i * 0.14]} m={m.trafoMetal} />
        )),
      )}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Bx s={[0.05, 0.06, 0.8]} p={[sx * 0.66, 1.42, 0]} m={m.trafoMetal} />
          <Bx s={[0.05, 0.06, 0.8]} p={[sx * 0.66, 0.36, 0]} m={m.trafoMetal} />
        </group>
      ))}
      {/* aisladores de alta (3) y de baja (4) */}
      {[-0.4, 0, 0.4].map((x) => (
        <group key={`hv${x}`} position={[x, top + 0.08, 0.22]}>
          <Cyl rt={0.05} rb={0.08} h={0.6} p={[0, 0.3, 0]} m={m.porcelain} seg={10} />
          {[0.15, 0.3, 0.45].map((y) => (
            <Cyl key={y} rt={0.11} rb={0.11} h={0.03} p={[0, y, 0]} m={m.porcelain} seg={12} />
          ))}
          <Cyl rt={0.025} rb={0.025} h={0.12} p={[0, 0.66, 0]} m={m.iron} seg={6} />
        </group>
      ))}
      {[-0.45, -0.15, 0.15, 0.45].map((x) => (
        <Cyl key={`lv${x}`} rt={0.04} rb={0.05} h={0.28} p={[x, top + 0.22, -0.28]} m={m.porcelain} seg={8} />
      ))}
      {/* depósito de expansión */}
      <Cyl rt={0.17} rb={0.17} h={1.0} p={[0, top + 0.55, -0.42]} r={[0, 0, Math.PI / 2]} m={m.trafoMetal} seg={16} />
      <Bx s={[0.06, 0.4, 0.06]} p={[-0.3, top + 0.28, -0.42]} m={m.trafoMetal} />
      <Bx s={[0.06, 0.4, 0.06]} p={[0.3, top + 0.28, -0.42]} m={m.trafoMetal} />
      {/* placa de características */}
      <Bx s={[0.3, 0.2, 0.01]} p={[0.2, 1.2, 0.48]} m={m.stone} cast={false} />
      {/* cables de alta tensión subiendo por el muro */}
      {[-0.4, 0, 0.4].map((x) => (
        <Cyl
          key={`c${x}`}
          rt={0.035}
          rb={0.035}
          h={LEVELS[1] - SLAB - (top + 0.8)}
          p={[x, (LEVELS[1] - SLAB + top + 0.8) / 2, 0.22]}
          m={m.cableBlack}
          seg={8}
        />
      ))}
    </group>
  );
}

export function TransformerRoom() {
  const m = useMats().building;
  const sign = useWarningTexture();
  const signMat = useMemo(() => new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 }), [sign]);
  const { x0, x1, zBack, zFront, h, gateZ, gateW, gateH } = TRAFO_ROOM;
  const L = LEVELS[0];
  const y0 = L - 0.02;
  const gate = useMemo(() => {
    const bars: { s: V3; p: V3 }[] = [];
    for (let k = 0; k <= 16; k++) bars.push({ s: [0.02, gateH, 0.02], p: [x1, L + gateH / 2, gateZ - gateW / 2 + (k * gateW) / 16] });
    for (let k = 0; k <= 18; k++) bars.push({ s: [0.02, 0.02, gateW], p: [x1, L + (k * gateH) / 18, gateZ] });
    return bars;
  }, [x1, L, gateZ, gateW, gateH]);
  return (
    <group name="cuarto-transformadores">
      {/* muro blanco lateral (con la puerta de malla) y muro del fondo */}
      <Wall
        axis="z"
        from={zBack}
        length={zFront - zBack}
        at={x1}
        y={y0}
        height={h}
        t={0.2}
        holes={[{ x: gateZ, y: y0, w: gateW, h: gateH }]}
        mat={m.whiteWall}
      />
      <Wall axis="x" from={x0} length={x1 - x0 + 0.1} at={zBack} y={y0} height={h} t={0.2} mat={m.whiteWall} />
      {/* remate superior del muro */}
      <Bx s={[0.28, 0.08, zFront - zBack]} p={[x1, L + h, (zFront + zBack) / 2]} m={m.whiteWall} />
      <Bx s={[x1 - x0 + 0.1, 0.08, 0.28]} p={[(x0 + x1) / 2, L + h, zBack]} m={m.whiteWall} />
      {/* puerta de malla metálica con marco */}
      {gate.map((b, i) => (
        <Bx key={i} s={b.s} p={b.p} m={m.iron} />
      ))}
      <Bx s={[0.08, gateH + 0.08, 0.08]} p={[x1, L + gateH / 2, gateZ - gateW / 2]} m={m.iron} />
      <Bx s={[0.08, gateH + 0.08, 0.08]} p={[x1, L + gateH / 2, gateZ + gateW / 2]} m={m.iron} />
      <Bx s={[0.08, 0.08, gateW]} p={[x1, L + gateH, gateZ]} m={m.iron} />
      {/* cartel de peligro sobre el muro, mirando al vestíbulo */}
      <mesh position={[x1 + 0.105, L + 1.75, gateZ - gateW / 2 - 0.55]} rotation={[0, Math.PI / 2, 0]} material={signMat}>
        <planeGeometry args={[0.42, 0.52]} />
      </mesh>
      {/* suelo de cemento del cuarto */}
      <Bx s={[x1 - x0, 0.02, zFront - zBack]} p={[(x0 + x1) / 2, L + 0.014, (zFront + zBack) / 2]} m={m.stone} cast={false} />
      {TRAFOS.map(([x, z], i) => (
        <Transformer key={i} p={[x, L, z]} rot={Math.PI / 2} />
      ))}
    </group>
  );
}
