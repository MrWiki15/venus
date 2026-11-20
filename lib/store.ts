import { create } from 'zustand';
import { STEPS } from './tour';
import type { Quality } from './quality';

interface State {
  quality: Quality;
  setQuality: (q: Quality) => void;
  step: number;
  moving: boolean;
  scanProgress: number; // 0..1
  scanning: boolean;
  scanRun: number; // incrementa para relanzar el escaneo
  pointCount: number;
  showPoints: boolean;
  cutaway: boolean;
  autoplay: boolean;
  ready: boolean;
  warm: boolean; // sombreadores compilados y texturas en GPU
  setWarm: (w: boolean) => void;
  goTo: (i: number) => void;
  next: () => void;
  prev: () => void;
  setMoving: (m: boolean) => void;
  setScan: (p: number, scanning: boolean) => void;
  rescan: () => void;
  setPointCount: (n: number) => void;
  togglePoints: () => void;
  toggleCutaway: () => void;
  toggleAutoplay: () => void;
  setReady: (r: boolean) => void;
}

export const useTour = create<State>((set, get) => ({
  quality: 'high',
  setQuality: (q) => set({ quality: q }),
  step: 0,
  moving: false,
  scanProgress: 0,
  scanning: true,
  scanRun: 0,
  pointCount: 0,
  showPoints: false,
  cutaway: false,
  autoplay: false,
  ready: false,
  warm: false,
  setWarm: (w) => set({ warm: w }),
  goTo: (i) => {
    const n = Math.max(0, Math.min(STEPS.length - 1, i));
    if (n === get().step) return;
    const patch: Partial<State> = { step: n };
    if (n !== 0 && get().scanning) patch.scanning = false;
    if (STEPS[n].floor >= 0 && get().cutaway) patch.cutaway = false;
    set(patch);
  },
  next: () => get().goTo(get().step + 1),
  prev: () => get().goTo(get().step - 1),
  setMoving: (m) => set({ moving: m }),
  setScan: (p, scanning) => set({ scanProgress: p, scanning }),
  rescan: () => set({ step: 0, scanning: true, scanProgress: 0, scanRun: get().scanRun + 1, cutaway: false }),
  setPointCount: (n) => set({ pointCount: n }),
  togglePoints: () => set({ showPoints: !get().showPoints }),
  toggleCutaway: () => {
    const c = !get().cutaway;
    set({ cutaway: c, step: c && STEPS[get().step].floor >= 0 ? 1 : get().step });
  },
  toggleAutoplay: () => set({ autoplay: !get().autoplay }),
  setReady: (r) => set({ ready: r }),
}));
