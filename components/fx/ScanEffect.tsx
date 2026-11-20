'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { scanUniforms } from '@/lib/materials';
import { useTour } from '@/lib/store';
import type { PixelData } from '@/lib/textures';
import { HALF, DEPTH } from '@/lib/building';

const SCAN_TOP = 27;
const SCAN_DURATION = 8.5;
const MESH_LAG = 1.6;

interface SamplerInternals {
  _sampleFaceIndex(): number;
  _sampleFace(i: number, p: THREE.Vector3, n?: THREE.Vector3, c?: THREE.Color, uv?: THREE.Vector2): void;
}

function worldArea(geo: THREE.BufferGeometry, mw: THREE.Matrix4) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const tri = idx ? idx.count / 3 : pos.count / 3;
  let area = 0;
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
    area += b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  return area;
}

function materialForFace(mesh: THREE.Mesh, face: number): THREE.Material {
  if (!Array.isArray(mesh.material)) return mesh.material;
  const el = face * 3;
  for (const g of mesh.geometry.groups) {
    if (el >= g.start && el < g.start + g.count) return mesh.material[g.materialIndex ?? 0];
  }
  return mesh.material[0];
}

const srgbToLin = (c: number) => Math.pow(c / 255, 2.2);

export function samplePointCloud(root: THREE.Object3D, budget = 380000) {
  root.updateMatrixWorld(true);
  const list: { mesh: THREE.Mesh; area: number; dens: number }[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
    let p: THREE.Object3D | null = o;
    let dens = 34;
    let found = false;
    while (p) {
      if (!p.visible) return;
      if (!found && p.userData.pointDensity) {
        dens = p.userData.pointDensity;
        found = true;
      }
      p = p.parent;
    }
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (mat.transparent) return;
    const area = worldArea(mesh.geometry, mesh.matrixWorld);
    if (area < 0.01) return;
    list.push({ mesh, area, dens });
  });
  const total = list.reduce((s, l) => s + l.area * l.dens, 0);
  const k = Math.min(1, budget / total);
  const positions = new Float32Array(budget * 3);
  const colors = new Float32Array(budget * 3);
  let n = 0;
  const pos = new THREE.Vector3();
  const nor = new THREE.Vector3();
  const uv = new THREE.Vector2();
  const nm = new THREE.Matrix3();
  for (const { mesh, area, dens } of list) {
    const count = Math.round(area * dens * k);
    if (count < 1) continue;
    const geo = mesh.geometry;
    if (!geo.attributes.uv) continue;
    const sampler = new MeshSurfaceSampler(mesh).build() as unknown as SamplerInternals;
    nm.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < count && n < budget; i++) {
      const f = sampler._sampleFaceIndex();
      sampler._sampleFace(f, pos, nor, undefined, uv);
      const mat = materialForFace(mesh, f) as THREE.MeshStandardMaterial;
      let r = mat.color?.r ?? 1;
      let g = mat.color?.g ?? 1;
      let b = mat.color?.b ?? 1;
      const map = mat.map;
      const px = map ? (map.userData as { pixels?: PixelData }).pixels : undefined;
      if (map && px) {
        let u = uv.x * map.repeat.x + map.offset.x;
        let v = uv.y * map.repeat.y + map.offset.y;
        u -= Math.floor(u);
        v -= Math.floor(v);
        const ix = Math.min(px.w - 1, Math.floor(u * px.w));
        const iy = Math.min(px.h - 1, Math.floor((1 - v) * px.h));
        const o = (iy * px.w + ix) * 4;
        if (mat.alphaTest > 0 && px.data[o + 3] < 128) continue;
        r *= srgbToLin(px.data[o]);
        g *= srgbToLin(px.data[o + 1]);
        b *= srgbToLin(px.data[o + 2]);
      }
      pos.applyMatrix4(mesh.matrixWorld);
      nor.applyMatrix3(nm).normalize();
      positions[n * 3] = pos.x + nor.x * 0.012;
      positions[n * 3 + 1] = pos.y + nor.y * 0.012;
      positions[n * 3 + 2] = pos.z + nor.z * 0.012;
      colors[n * 3] = r;
      colors[n * 3 + 1] = g;
      colors[n * 3 + 2] = b;
      n++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors.subarray(0, n * 3), 3));
  geo.computeBoundingSphere();
  return { geo, count: n };
}

const pointsVert = /* glsl */ `
  uniform float uLaserY;
  uniform float uLimit;
  uniform float uSize;
  uniform float uViewH;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vVis;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float ps = uSize * projectionMatrix[1][1] * uViewH * 0.5 / max(0.2, -mv.z);
    gl_PointSize = clamp(ps, 1.4, 9.0);
    float vis = uLimit > 0.5 ? step(position.y, uLaserY) : 1.0;
    float fresh = uLimit > 0.5 ? 1.0 - smoothstep(0.0, 2.2, uLaserY - position.y) : 0.0;
    vColor = mix(color, vec3(0.35, 1.0, 1.0), 0.12 + fresh * 0.75) * (1.0 + fresh * 2.5);
    vVis = vis;
  }
`;
const pointsFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vVis;
  void main() {
    if (vVis < 0.5) discard;
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(vColor, uOpacity);
  }
`;

const laserVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const laserFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 d = abs(vUv - 0.5) * 2.0;
    float edge = max(d.x, d.y);
    float fall = 1.0 - smoothstep(0.55, 1.0, edge);
    float lines = smoothstep(0.92, 1.0, abs(sin((vUv.y * 60.0 - uTime * 4.0))));
    float a = (0.08 + lines * 0.12) * fall;
    gl_FragColor = vec4(vec3(0.3, 1.0, 1.0) * 2.0, a * uOpacity);
  }
`;

function Scanner({ laserY, visible }: { laserY: React.RefObject<number>; visible: boolean }) {
  const head = useRef<THREE.Group>(null);
  const lines = useRef<THREE.LineSegments>(null);
  const FAN = 28;
  const HEAD = useMemo(() => new THREE.Vector3(6.5, 1.75, 11.4), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FAN * 2 * 3), 3));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: new THREE.Color(0.5, 2.2, 2.4),
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useFrame((state) => {
    if (!visible) return;
    if (head.current) head.current.rotation.y = state.clock.elapsedTime * 2.5;
    const arr = geo.attributes.position.array as Float32Array;
    const y = laserY.current ?? 0;
    for (let i = 0; i < FAN; i++) {
      const x = -HALF - 0.1 + ((HALF * 2 + 0.2) * i) / (FAN - 1);
      arr.set([HEAD.x, HEAD.y, HEAD.z, x, y, 1.0 + Math.sin(i * 1.7) * 0.05], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <group visible={visible}>
      {/* trípode */}
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} position={[HEAD.x + Math.cos(a) * 0.28, 0.85, HEAD.z + Math.sin(a) * 0.28]} rotation={[Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32]}>
          <cylinderGeometry args={[0.015, 0.015, 1.4, 6]} />
          <meshStandardMaterial color="#222" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <group ref={head} position={[HEAD.x, HEAD.y - 0.1, HEAD.z]}>
        <mesh>
          <boxGeometry args={[0.2, 0.26, 0.16]} />
          <meshStandardMaterial color="#e8e8e8" metalness={0.3} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.03, 0.085]}>
          <circleGeometry args={[0.05, 16]} />
          <meshBasicMaterial color={new THREE.Color(0.5, 2.5, 2.8)} toneMapped={false} />
        </mesh>
      </group>
      <lineSegments ref={lines} geometry={geo} material={mat} frustumCulled={false} />
    </group>
  );
}

export function ScanEffect({ target, budget }: { target: React.RefObject<THREE.Group | null>; budget: number }) {
  const scanning = useTour((s) => s.scanning);
  const scanRun = useTour((s) => s.scanRun);
  const showPoints = useTour((s) => s.showPoints);
  const ready = useTour((s) => s.ready);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const [cloud, setCloud] = useState<{ geo: THREE.BufferGeometry; count: number } | null>(null);
  const progress = useRef(0);
  const laserY = useRef(-1);
  const fade = useRef(1);
  const doneAt = useRef<number | null>(null);
  const laser = useRef<THREE.Mesh>(null);
  const outline = useRef<THREE.LineLoop>(null);
  const pointsRef = useRef<THREE.Points>(null);
  void showPoints;

  const pointsMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: pointsVert,
        fragmentShader: pointsFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uLaserY: { value: -1 },
          uLimit: { value: 1 },
          uSize: { value: 0.028 },
          uViewH: { value: 800 },
          uOpacity: { value: 1 },
        },
      }),
    [],
  );
  const laserMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: laserVert,
        fragmentShader: laserFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      }),
    [],
  );
  const outlineGeo = useMemo(() => {
    const pts = [
      new THREE.Vector3(-HALF - 0.2, 0, 1.15),
      new THREE.Vector3(HALF + 0.2, 0, 1.15),
      new THREE.Vector3(HALF + 0.2, 0, -DEPTH - 0.15),
      new THREE.Vector3(-HALF - 0.2, 0, -DEPTH - 0.15),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  // muestreo de la nube de puntos tras montar el edificio
  useEffect(() => {
    if (!ready || cloud || !target.current) return;
    const id = setTimeout(() => {
      const t0 = performance.now();
      const res = samplePointCloud(target.current!, budget);
      console.info(`[escaneo] ${res.count} puntos en ${(performance.now() - t0).toFixed(0)} ms`);
      setCloud(res);
      useTour.getState().setPointCount(res.count);
    }, 30);
    return () => clearTimeout(id);
  }, [ready, cloud, target, budget]);

  // reinicio del escaneo
  useEffect(() => {
    progress.current = 0;
    fade.current = 1;
    doneAt.current = null;
  }, [scanRun]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.2);
    pointsMat.uniforms.uViewH.value = size.height * dpr;
    laserMat.uniforms.uTime.value = state.clock.elapsedTime;
    const st = useTour.getState();

    if (st.scanning && st.ready && st.warm && cloud) {
      progress.current = Math.min(1, progress.current + dt / SCAN_DURATION);
      const p = progress.current;
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      laserY.current = -0.5 + eased * (SCAN_TOP + 0.5);
      scanUniforms.uScanActive.value = 1;
      scanUniforms.uScanY.value = laserY.current - MESH_LAG;
      pointsMat.uniforms.uLaserY.value = laserY.current;
      pointsMat.uniforms.uLimit.value = 1;
      fade.current = 1;
      if (Math.floor(p * 100) !== Math.floor(st.scanProgress * 100)) st.setScan(p, true);
      if (p >= 1) {
        st.setScan(1, false);
        doneAt.current = state.clock.elapsedTime;
      }
    } else if (st.scanning) {
      // esperando a que la nube esté lista
      scanUniforms.uScanActive.value = 1;
      scanUniforms.uScanY.value = -5;
      pointsMat.uniforms.uLaserY.value = -5;
    } else {
      scanUniforms.uScanActive.value = 0;
      scanUniforms.uScanY.value = 1000;
      pointsMat.uniforms.uLimit.value = 0;
      const targetFade = st.showPoints ? 1 : 0;
      fade.current += (targetFade - fade.current) * Math.min(1, dt * 1.6);
      if (doneAt.current !== null && state.clock.elapsedTime - doneAt.current > 1.4) {
        doneAt.current = null;
        if (st.step === 0) st.goTo(1);
      }
    }
    pointsMat.uniforms.uOpacity.value = fade.current;
    if (pointsRef.current) pointsRef.current.visible = st.scanning || fade.current > 0.01;
    if (laser.current) laser.current.position.y = laserY.current;
    if (outline.current) outline.current.position.y = laserY.current;
  });

  const scanVisible = scanning && !!cloud;
  return (
    <group>
      {cloud && <points ref={pointsRef} geometry={cloud.geo} material={pointsMat} frustumCulled={false} />}
      <mesh ref={laser} material={laserMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, -DEPTH / 2 + 0.5]} visible={scanVisible}>
        <planeGeometry args={[HALF * 2 + 11, DEPTH + 10]} />
      </mesh>
      <lineLoop ref={outline} geometry={outlineGeo} visible={scanVisible}>
        <lineBasicMaterial color={new THREE.Color(0.6, 2.6, 2.8)} toneMapped={false} />
      </lineLoop>
      <Scanner laserY={laserY} visible={scanVisible} />
    </group>
  );
}
