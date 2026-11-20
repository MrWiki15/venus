'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls, Sky, Lightformer, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping, Vignette, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Facade } from './building/Facade';
import { Interior } from './building/Interior';
import { Roof } from './building/Roof';
import { Props } from './building/Props';
import { City } from './city/City';
import { ScanEffect } from './fx/ScanEffect';
import { Atmosphere, SUN_DIR, OPPOSITE_LAYER } from './fx/Atmosphere';
import { CameraRig } from './CameraRig';
import { StaticGroup } from './ctx';
import { useTour } from '@/lib/store';
import { QUALITY_SETTINGS, dprRange } from '@/lib/quality';
import { DEPTH } from '@/lib/building';

const SUN_POS = SUN_DIR.clone().multiplyScalar(90);
const SUN_TARGET = new THREE.Vector3(0, 9, -DEPTH / 2 + 4);
const SKY = { turbidity: 6, rayleigh: 1.6, mieCoefficient: 0.005, mieDirectionalG: 0.82 };

function Sun({ mapSize }: { mapSize: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const l = light.current!;
    l.target.position.copy(SUN_TARGET);
    scene.add(l.target);
    // la cámara de sombras ve también la capa de la acera de enfrente
    l.shadow.camera.layers.enableAll();
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  return (
    <directionalLight
      ref={light}
      castShadow
      position={[SUN_POS.x + SUN_TARGET.x, SUN_POS.y + SUN_TARGET.y, SUN_POS.z + SUN_TARGET.z]}
      intensity={2.3}
      color="#fff0d8"
      shadow-mapSize={[mapSize, mapSize]}
      shadow-camera-left={-38}
      shadow-camera-right={38}
      shadow-camera-top={38}
      shadow-camera-bottom={-38}
      shadow-camera-near={10}
      shadow-camera-far={190}
      shadow-bias={-0.0004}
      shadow-normalBias={0.035}
    />
  );
}

// La escena es estática y el sol no se mueve: el mapa de sombras se calcula
// una sola vez (y cuando cambia lo visible), en vez de en cada frame.
function StaticShadows() {
  const gl = useThree((s) => s.gl);
  const ready = useTour((s) => s.ready);
  const cutaway = useTour((s) => s.cutaway);
  const showPoints = useTour((s) => s.showPoints);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [gl, ready, cutaway, showPoints]);
  return null;
}

// Ajusta la resolución de render a los FPS reales del equipo.
// Los cambios se aplican solo con la cámara quieta: redimensionar los buffers
// en mitad de un desplazamiento provoca un tirón visible.
function AdaptiveResolution({ range }: { range: [number, number] }) {
  const setDpr = useThree((s) => s.setDpr);
  const current = useThree((s) => s.viewport.dpr);
  const pending = useRef<number | null>(null);
  useFrame(() => {
    const p = pending.current;
    if (p === null) return;
    const st = useTour.getState();
    if (st.moving || st.scanning) return;
    pending.current = null;
    if (Math.abs(p - current) > 0.04) setDpr(p);
  });
  return (
    <PerformanceMonitor
      ms={400}
      iterations={12}
      bounds={() => [30, 58]}
      flipflops={2}
      factor={0.6}
      onChange={({ factor }) => {
        pending.current = Math.round((range[0] + (range[1] - range[0]) * factor) * 20) / 20;
      }}
    />
  );
}

// Precarga: compila todos los sombreadores y sube todas las texturas a la GPU
// antes de empezar, para que no haya parones la primera vez que se ve un interior.
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const ready = useTour((s) => s.ready);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const t0 = performance.now();
      const seen = new Set<THREE.Texture>();
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material;
        if (!mat) return;
        for (const m of Array.isArray(mat) ? mat : [mat]) {
          for (const v of Object.values(m)) {
            if (v && (v as THREE.Texture).isTexture && !seen.has(v as THREE.Texture)) {
              seen.add(v as THREE.Texture);
              gl.initTexture(v as THREE.Texture);
            }
          }
        }
      });
      // deja respirar al navegador entre la subida de texturas y la compilación
      await new Promise((r) => setTimeout(r, 0));
      try {
        await gl.compileAsync(scene, camera);
      } catch (e) {
        console.warn('[precarga] compileAsync no disponible, se compila en sincrono', e);
        gl.compile(scene, camera);
      }
      if (cancelled) return;
      console.info(`[precarga] ${seen.size} texturas y sombreadores listos en ${(performance.now() - t0).toFixed(0)} ms`);
      useTour.getState().setWarm(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, gl, scene, camera]);
  return null;
}

// En pantallas verticales (teléfonos) se abre el ángulo vertical para no perder lo que hay a los lados
function AdaptiveFov() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const fov = aspect >= 1 ? 52 : THREE.MathUtils.clamp(52 + (1 - aspect) * 46, 52, 78);
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height]);
  return null;
}

function ReadySignal() {
  const frames = useRef(0);
  const state = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      const w = window as unknown as { __venus: unknown; __tour: unknown };
      w.__venus = state;
      w.__tour = useTour;
    }
  }, [state]);
  useFrame(() => {
    if (frames.current < 3) {
      frames.current++;
      if (frames.current === 3) useTour.getState().setReady(true);
    }
  });
  return null;
}

export function Scene() {
  const building = useRef<THREE.Group>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const showPoints = useTour((s) => s.showPoints);
  const cutaway = useTour((s) => s.cutaway);
  const quality = useTour((s) => s.quality);
  const q = QUALITY_SETTINGS[quality];
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    camera.layers.enable(OPPOSITE_LAYER);
  }, [camera]);

  return (
    <>
      <color attach="background" args={['#b9cfe2']} />
      <fog attach="fog" args={['#c3d0db', 90, 340]} />
      {q.proceduralSky && <Sky distance={4000} sunPosition={SUN_POS} {...SKY} />}
      {/* el mapa de entorno se renderiza una sola vez; en GPUs débiles también hace de cielo */}
      <Environment resolution={q.proceduralSky ? 128 : 256} frames={1} background={!q.proceduralSky}>
        <Sky distance={500} sunPosition={SUN_POS} {...SKY} />
        <Lightformer form="rect" intensity={1.2} color="#e3d9c8" scale={[200, 30, 1]} position={[0, -12, 0]} rotation={[Math.PI / 2, 0, 0]} />
      </Environment>

      <hemisphereLight ref={hemi} args={['#dce8f5', '#8a7a66', 0.45]} />
      <Sun mapSize={q.shadowMap} />
      <StaticShadows />
      <AdaptiveResolution range={dprRange(quality)} />

      <group ref={building} visible={!showPoints} name="building">
        <group visible={!cutaway} userData={{ pointDensity: 110 }}>
          <StaticGroup>
            <Facade />
          </StaticGroup>
        </group>
        <StaticGroup>
          <Interior hideFront={cutaway} />
        </StaticGroup>
        <group userData={{ pointDensity: 60 }}>
          <StaticGroup>
            <Roof />
          </StaticGroup>
        </group>
        <StaticGroup>
          <Props />
        </StaticGroup>
      </group>

      <City />
      <ScanEffect target={building} budget={q.points} />
      <Atmosphere hemi={hemi} sparkles={q.sparkles} fillLights={q.fillLights} />
      <CameraRig />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <ReadySignal />
      <Warmup />
      <AdaptiveFov />

      {q.post && (
        <EffectComposer multisampling={0}>
          <N8AO halfRes aoRadius={1.4} intensity={2.2} distanceFalloff={0.7} quality="performance" />
          <Bloom mipmapBlur luminanceThreshold={1.6} luminanceSmoothing={0.3} intensity={0.45} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.28} darkness={0.5} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  );
}
