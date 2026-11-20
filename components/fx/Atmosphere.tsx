'use client';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { LEVELS, ROOF, HALF, DEPTH, STAIR, DOOR, upperOpenings } from '@/lib/building';

export const SUN_DIR = new THREE.Vector3(22, 26, 34).normalize();
export const OPPOSITE_LAYER = 1;

export function isInside(p: THREE.Vector3) {
  if (p.x > -HALF && p.x < HALF && p.z < -0.45 && p.z > -DEPTH && p.y < ROOF + 0.4 && p.y > 0) return true;
  // casetón de la azotea
  if (p.x > STAIR.wallX - 0.2 && p.x < HALF && p.z < STAIR.zFront + 0.6 && p.z > -DEPTH && p.y < ROOF + 2.9) return true;
  return false;
}

export function floorOf(y: number) {
  let n = 0;
  for (let k = 1; k < LEVELS.length; k++) if (y >= LEVELS[k] + 0.6) n = k;
  return n;
}

// ---------------------------------------------------------------------------
// Haces de luz volumétricos falsos que entran por los huecos de fachada
// ---------------------------------------------------------------------------
const shaftVert = /* glsl */ `
  attribute float aT;
  attribute float aS;
  varying float vT;
  varying float vS;
  varying vec3 vW;
  void main() {
    vT = aT; vS = aS;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const shaftFrag = /* glsl */ `
  uniform float uI;
  uniform float uTime;
  varying float vT;
  varying float vS;
  varying vec3 vW;
  void main() {
    float along = pow(1.0 - vT, 1.4) * smoothstep(0.0, 0.06, vT);
    float across = sin(3.14159 * vS);
    float flick = 0.85 + 0.15 * sin(uTime * 0.7 + vW.x * 1.3 + vW.y * 0.7);
    float a = uI * along * across * flick;
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a, 1.0);
  }
`;

function LightShafts() {
  const ref = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const geo = useMemo(() => {
    const d = SUN_DIR.clone().negate();
    const pos: number[] = [];
    const aT: number[] = [];
    const aS: number[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, len: number) => {
      const a2 = a.clone().addScaledVector(d, len);
      const b2 = b.clone().addScaledVector(d, len);
      const v = [a, b, b2, a, b2, a2];
      const t = [0, 0, 1, 0, 1, 1];
      const s = [0, 1, 1, 0, 1, 0];
      v.forEach((p, i) => {
        pos.push(p.x, p.y, p.z);
        aT.push(t[i]);
        aS.push(s[i]);
      });
    };
    for (let n = 1; n <= 4; n++) {
      for (const o of upperOpenings(n)) {
        const z = -0.62;
        const x0 = o.x - o.w / 2;
        const x1 = o.x + o.w / 2;
        const y0 = o.y + 0.05;
        const y1 = o.y + o.h + (o.arch ? o.w * 0.3 : 0);
        const len = ((y1 - LEVELS[n]) / -d.y) * 1.05;
        const A = new THREE.Vector3(x0, y0, z);
        const B = new THREE.Vector3(x1, y0, z);
        const C = new THREE.Vector3(x1, y1, z);
        const D = new THREE.Vector3(x0, y1, z);
        quad(A, B, len);
        quad(D, C, len);
        quad(A, D, len);
        quad(B, C, len);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: shaftVert,
        fragmentShader: shaftFrag,
        uniforms: { uI: { value: 0.07 }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useFrame((s) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime;
    if (ref.current) ref.current.visible = isInside(camera.position);
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}

// ---------------------------------------------------------------------------
export function Atmosphere({
  hemi,
  sparkles,
  fillLights,
}: {
  hemi: React.RefObject<THREE.HemisphereLight | null>;
  sparkles: number;
  fillLights: number; // 3 = dos de relleno + la que acompaña a la cámara; 2 = una de relleno centrada
}) {
  const two = fillLights >= 3;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const p1 = useRef<THREE.PointLight>(null);
  const p2 = useRef<THREE.PointLight>(null);
  const p3 = useRef<THREE.PointLight>(null);
  const dust = useRef<THREE.Group>(null);
  const insideK = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.2);
    const cp = camera.position;
    const inside = isInside(cp);
    insideK.current += ((inside ? 1 : 0) - insideK.current) * Math.min(1, dt * 2.2);
    const k = insideK.current;

    // adaptación de exposición (ojo entrando en un interior oscuro)
    gl.toneMappingExposure = THREE.MathUtils.lerp(0.95, 1.4, k);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.55, 0.3, k);
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.lerp(0.32, 0.16, k);

    // capa de la acera de enfrente: oculta si la cámara queda detrás de ella
    if (cp.z > 12.4) camera.layers.disable(OPPOSITE_LAYER);
    else camera.layers.enable(OPPOSITE_LAYER);

    // luces de rebote en el piso donde está la cámara
    const f = floorOf(cp.y);
    const L = LEVELS[Math.min(f, 4)];
    const on = inside && f <= 4 ? 1 : 0;
    if (p1.current && p3.current) {
      if (f === 0) {
        p1.current.position.set(two ? DOOR.x : 2.0, 2.9, -3.0);
        p2.current?.position.set(-2.4, 3.2, -3.0);
      } else {
        p1.current.position.set(two ? -4.8 : 0, L + 2.5, -2.0);
        p2.current?.position.set(4.8, L + 2.5, -2.0);
      }
      const target = on * (two ? 9 : 15);
      p1.current.intensity = THREE.MathUtils.lerp(p1.current.intensity, target, Math.min(1, dt * 3));
      if (p2.current) p2.current.intensity = THREE.MathUtils.lerp(p2.current.intensity, target, Math.min(1, dt * 3));
      // luz que acompaña a la cámara (rebote general)
      p3.current.position.set(cp.x, cp.y + 0.9, cp.z + 0.4);
      p3.current.intensity = THREE.MathUtils.lerp(p3.current.intensity, inside ? 2.2 : 0, Math.min(1, dt * 3));
    }
    if (dust.current) {
      dust.current.visible = inside;
      dust.current.position.set(cp.x * 0.5, Math.max(cp.y - 0.6, 0.8), cp.z);
    }
  });

  return (
    <group>
      <pointLight ref={p1} color="#ffe2bd" intensity={0} distance={two ? 14 : 18} decay={2} />
      {two && <pointLight ref={p2} color="#ffe8c8" intensity={0} distance={14} decay={2} />}
      <pointLight ref={p3} color="#e6ecff" intensity={0} distance={9} decay={2} />
      <group ref={dust}>
        <Sparkles count={sparkles} scale={[9, 3.2, 8]} size={1.6} speed={0.12} opacity={0.45} color="#fff2d8" noise={0.5} />
      </group>
      <LightShafts />
    </group>
  );
}
