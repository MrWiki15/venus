'use client';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { generateTextures, type TextureSet } from '@/lib/textures';
import { createMaterials, type Materials } from '@/lib/materials';
import { loadTextureSet, saveTextureSet } from '@/lib/texcache';
import { STEPS } from '@/lib/tour';
import { useTour } from '@/lib/store';
import { detectQuality, dprRange, QUALITY_SETTINGS, type Quality } from '@/lib/quality';
import { MatCtx } from './ctx';
import { Scene } from './Scene';
import { HUD } from './HUD';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export default function Viewer() {
  const [assets, setAssets] = useState<{ mats: Materials; tex: TextureSet } | null>(null);
  const [phase, setPhase] = useState('Preparando…');
  const [q, setQ] = useState<Quality | null>(null);
  const ready = useTour((s) => s.ready);
  const pointCount = useTour((s) => s.pointCount);
  const warm = useTour((s) => s.warm);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const quality = detectQuality();
      useTour.getState().setQuality(quality);
      setQ(quality);
      console.info(`[calidad] perfil ${quality}`);
      const s = QUALITY_SETTINGS[quality];
      setPhase('Cargando texturas guardadas…');
      await nextFrame();
      const t0 = performance.now();
      let tex = await loadTextureSet(s.texScale).catch(() => null);
      let fresh = false;
      if (tex) {
        console.info(`[texturas] desde caché en ${(performance.now() - t0).toFixed(0)} ms`);
      } else {
        setPhase('Generando texturas de estuco, piedra y madera (solo la primera vez)…');
        await nextFrame();
        tex = generateTextures(s.texScale);
        fresh = true;
      }
      if (cancelled) return;
      setAssets({ tex, mats: createMaterials(tex, s.cheapCity) });
      if (fresh) {
        // se guarda en segundo plano cuando el navegador esté libre
        const save = () => saveTextureSet(tex!, s.texScale).catch((e) => console.warn('[texturas] no se pudo guardar la caché', e));
        const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
        if (ric) ric(save, { timeout: 8000 });
        else setTimeout(save, 4000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadingPhase = !assets
    ? phase
    : !ready
      ? 'Construyendo geometría…'
      : !warm
        ? 'Preparando sombreadores y texturas en la GPU (evita tirones en el recorrido)…'
        : 'Muestreando nube de puntos…';
  const loading = !assets || !ready || !warm || pointCount === 0;
  const settings = q ? QUALITY_SETTINGS[q] : null;

  return (
    <main className="app">
      {assets && q && settings && (
        <Canvas
          className="canvas"
          shadows="percentage"
          dpr={(() => {
            const [a, b] = dprRange(q);
            return a + (b - a) * 0.6;
          })()}
          camera={{ fov: 52, near: 0.05, far: 6000, position: STEPS[0].pos }}
          gl={{ antialias: !settings.post, powerPreference: 'high-performance', stencil: false }}
          onCreated={({ gl }) => {
            // con post-procesado el tono lo aplica el EffectComposer; sin él, el propio renderer
            gl.toneMapping = settings.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
          }}
        >
          <MatCtx.Provider value={assets}>
            <Scene />
          </MatCtx.Provider>
        </Canvas>
      )}
      <HUD />
      <div className={`loader ${loading ? '' : 'hidden'}`} aria-hidden={!loading}>
        <div className="loader-box">
          <div className="loader-grid" />
          <div className="loader-title">Escáner 3D</div>
          <div className="loader-phase">{loadingPhase}</div>
          <div className="loader-bar">
            <div />
          </div>
        </div>
      </div>
    </main>
  );
}
