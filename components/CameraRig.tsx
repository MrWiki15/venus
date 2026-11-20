'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { STEPS, type TourStep, type V3 } from '@/lib/tour';
import { useTour } from '@/lib/store';

const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4();

function lookQuat(eye: THREE.Vector3, target: THREE.Vector3) {
  tmpM.lookAt(eye, target, UP);
  return new THREE.Quaternion().setFromRotationMatrix(tmpM);
}
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep: arranque y frenado suaves
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const v = (a: V3) => new THREE.Vector3(...a);

interface Anim {
  curve: THREE.CatmullRomCurve3;
  len: number;
  dur: number;
  t: number;
  walk: boolean;
  qStart: THREE.Quaternion;
  qEnd: THREE.Quaternion;
  lookStart: THREE.Vector3;
  lookEnd: THREE.Vector3;
  lookPt: THREE.Vector3; // punto de mira suavizado (evita giros bruscos)
  endPos: THREE.Vector3;
  to: number;
}

function applyControls(c: OrbitControlsImpl, cam: THREE.Camera, s: TourStep) {
  if (s.mode === 'orbit') {
    c.target.set(...s.target);
    c.minDistance = 5;
    c.maxDistance = 38;
    c.enableZoom = true;
    c.rotateSpeed = 0.55;
    c.minPolarAngle = 0.25;
    c.maxPolarAngle = 1.92;
    c.minAzimuthAngle = -1.25;
    c.maxAzimuthAngle = 1.25;
  } else {
    const dir = v(s.target).sub(cam.position).normalize();
    c.target.copy(cam.position).addScaledVector(dir, 0.01);
    // sin esto OrbitControls aplica la distancia mínima de la órbita y saca la cámara
    c.minDistance = 0;
    c.maxDistance = Infinity;
    c.enableZoom = false;
    c.rotateSpeed = -0.32;
    c.minPolarAngle = 0.2;
    c.maxPolarAngle = Math.PI - 0.2;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
  }
  c.enablePan = false;
  c.update();
  c.enabled = true;
}

function buildPoints(from: number, to: number): { pts: V3[]; walk: boolean } {
  const pts: V3[] = [];
  let walk = false;
  if (to > from) {
    for (let s = from + 1; s <= to; s++) {
      pts.push(...(STEPS[s].via ?? []), STEPS[s].pos);
      walk ||= !!STEPS[s].walk;
    }
  } else {
    for (let s = from; s > to; s--) {
      pts.push(...[...(STEPS[s].via ?? [])].reverse(), STEPS[s - 1].pos);
      walk ||= !!STEPS[s].walk;
    }
  }
  return { pts, walk };
}

// Velocidades del recorrido (m/s): caminar despacio por dentro, volar despacio por fuera
const WALK_SPEED = 1.9;
const FLY_SPEED = 5;
const MIN_DUR = 2.8;
const MAX_DUR = 45;

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const step = useTour((s) => s.step);
  const last = useRef(step);
  const anim = useRef<Anim | null>(null);
  const queued = useRef<number | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    if (!controls || ready.current) return;
    ready.current = true;
    const s = STEPS[last.current];
    camera.position.set(...s.pos);
    camera.lookAt(...s.target);
    applyControls(controls, camera, s);
  }, [controls, camera]);

  const start = useRef((from: number, to: number) => {
    void from;
    void to;
  });
  start.current = (from: number, to: number) => {
    if (!controls) return;
    last.current = to;
    const startPos = camera.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const prevStep = STEPS[from];
    const lookStart = prevStep.mode === 'orbit' ? controls.target.clone() : startPos.clone().addScaledVector(fwd, 6);

    const { pts, walk } = buildPoints(from, to);
    const all: THREE.Vector3[] = [startPos];
    for (const p of pts) {
      const vp = v(p);
      if (vp.distanceTo(all[all.length - 1]) > 0.08) all.push(vp);
    }
    if (all.length === 1) all.push(startPos.clone().add(new THREE.Vector3(0, 0.001, 0)));
    const curve = new THREE.CatmullRomCurve3(all, false, 'centripetal', 0.5);
    const len = curve.getLength();
    const s = STEPS[to];
    const endPos = v(s.pos);
    const dur = THREE.MathUtils.clamp(len / (walk ? WALK_SPEED : FLY_SPEED), MIN_DUR, MAX_DUR);
    controls.enabled = false;
    controls.autoRotate = false;
    anim.current = {
      curve,
      len,
      dur,
      t: 0,
      walk: walk && len > 6,
      qStart: camera.quaternion.clone(),
      qEnd: lookQuat(endPos, v(s.target)),
      lookStart,
      lookEnd: v(s.target),
      lookPt: startPos.clone().addScaledVector(fwd, 6),
      endPos,
      to,
    };
    useTour.getState().setMoving(true);
  };

  useEffect(() => {
    if (!controls || !ready.current) return;
    if (last.current === step && !anim.current) return;
    // si hay un desplazamiento en curso no se salta: el nuevo destino espera su turno
    if (anim.current) {
      queued.current = step === anim.current.to ? null : step;
      return;
    }
    start.current(last.current, step);
  }, [step, controls, camera]);

  const tmp = useRef({ p: new THREE.Vector3(), a: new THREE.Vector3(), q: new THREE.Quaternion(), look: new THREE.Vector3() });

  useFrame((_, rawDt) => {
    // window.__rigFast (solo pruebas en desarrollo) acelera las transiciones
    const fast = process.env.NODE_ENV !== 'production' && (window as unknown as { __rigFast?: number }).__rigFast;
    const dt = Math.min(rawDt, 0.1) * (fast || 1);
    const a = anim.current;
    const st = useTour.getState();
    if (controls) {
      controls.autoRotate = !a && st.step === 0 && st.scanning;
      controls.autoRotateSpeed = 0.35;
    }
    if (!a) {
      // en modo órbita no dejar que la cámara atraviese el suelo
      if (STEPS[st.step].mode === 'orbit' && camera.position.y < 0.7) camera.position.y = 0.7;
      return;
    }
    a.t += dt / a.dur;
    const tt = Math.min(1, a.t);
    const u = ease(tt);
    const { p, a: ahead, look } = tmp.current;
    a.curve.getPointAt(u, p);
    camera.position.copy(p);

    if (a.walk) {
      // se mira a un punto 3,5 m por delante en el camino, suavizado como haría la cabeza
      const traveled = u * a.len;
      a.curve.getPointAt(Math.min(1, u + 3.5 / a.len), ahead);
      ahead.y = p.y + (ahead.y - p.y) * 0.5;
      if (ahead.distanceToSquared(p) < 0.25) ahead.copy(a.lookEnd);
      const w1 = sstep(0, 3.0, traveled);
      const w2 = sstep(a.len - 4.5, a.len, traveled);
      look.copy(a.lookStart).lerp(ahead, w1).lerp(a.lookEnd, w2);
      const k = Math.max(1 - Math.exp(-dt * 2.6), sstep(0.9, 1, tt));
      a.lookPt.lerp(look, k);
      camera.lookAt(a.lookPt);
    } else {
      look.copy(a.lookStart).lerp(a.lookEnd, u);
      camera.lookAt(look);
    }

    if (tt >= 1) {
      camera.position.copy(a.endPos);
      camera.quaternion.copy(a.qEnd);
      anim.current = null;
      if (controls) applyControls(controls, camera, STEPS[a.to]);
      const nextStep = queued.current;
      queued.current = null;
      if (nextStep !== null && nextStep !== a.to) {
        start.current(a.to, nextStep);
      } else {
        st.setMoving(false);
      }
    }
  });

  return null;
}
