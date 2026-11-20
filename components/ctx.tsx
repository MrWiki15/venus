'use client';
import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import type * as THREE from 'three';
import type { Materials } from '@/lib/materials';
import type { TextureSet } from '@/lib/textures';
import { cachedBox, cylGeo } from '@/lib/geometry';
import { mergeStatic } from '@/lib/merge';

// Agrupa contenido estático y lo fusiona por material al montarse
export function StaticGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    return mergeStatic(ref.current);
  }, []);
  return <group ref={ref}>{children}</group>;
}

export const MatCtx = createContext<{ mats: Materials; tex: TextureSet } | null>(null);
export const useMats = () => useContext(MatCtx)!.mats;
export const useTex = () => useContext(MatCtx)!.tex;

type V3 = [number, number, number];

// Caja con UV en metros
export function Bx({
  s,
  p,
  r,
  m,
  cast = true,
  receive = true,
}: {
  s: V3;
  p: V3;
  r?: V3;
  m: THREE.Material | THREE.Material[];
  cast?: boolean;
  receive?: boolean;
}) {
  return (
    <mesh
      geometry={cachedBox(s[0], s[1], s[2])}
      material={m}
      position={p}
      rotation={r}
      castShadow={cast}
      receiveShadow={receive}
    />
  );
}

export function Cyl({
  rt,
  rb,
  h,
  p,
  r,
  m,
  seg = 18,
}: {
  rt: number;
  rb: number;
  h: number;
  p: V3;
  r?: V3;
  m: THREE.Material;
  seg?: number;
}) {
  return <mesh geometry={cylGeo(rt, rb, h, seg)} material={m} position={p} rotation={r} castShadow receiveShadow />;
}
