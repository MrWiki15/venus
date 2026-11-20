import * as THREE from 'three';
import type { PixelData, TextureSet } from './textures';

// Caché persistente de las texturas procedurales (IndexedDB, PNG por textura).
// Cambia TEX_VERSION cuando se modifique cualquier generador en textures.ts.
export const TEX_VERSION = '2026-11-20g';

const DB_NAME = 'venus-escaner';
const STORE = 'texturas';

interface Entry {
  path: string;
  blob: Blob;
  repeat: [number, number];
  wrap: [number, number];
  srgb: boolean;
  pixels: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

function walk(obj: unknown, prefix = '', out: [string, THREE.Texture][] = []) {
  if (obj instanceof THREE.Texture) out.push([prefix, obj]);
  else if (obj && typeof obj === 'object')
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) walk(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function setPath(root: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let o = root;
  for (let i = 0; i < parts.length - 1; i++) {
    o[parts[i]] ??= {};
    o = o[parts[i]] as Record<string, unknown>;
  }
  o[parts[parts.length - 1]] = value;
}

const keyFor = (scale: number) => `${TEX_VERSION}@${scale}`;

export async function loadTextureSet(scale: number): Promise<TextureSet | null> {
  if (typeof indexedDB === 'undefined') return null;
  const rec = await idb<{ entries: Entry[] } | undefined>('readonly', (s) => s.get(keyFor(scale)));
  if (!rec?.entries?.length) return null;
  const out: Record<string, unknown> = {};
  await Promise.all(
    rec.entries.map(async (e) => {
      const bmp = await createImageBitmap(e.blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d', { willReadFrequently: e.pixels })!;
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const t = new THREE.CanvasTexture(c);
      t.repeat.set(...e.repeat);
      t.wrapS = e.wrap[0] as THREE.Wrapping;
      t.wrapT = e.wrap[1] as THREE.Wrapping;
      t.colorSpace = e.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      if (e.pixels) {
        const img = ctx.getImageData(0, 0, c.width, c.height);
        (t.userData as { pixels?: PixelData }).pixels = { data: img.data, w: img.width, h: img.height };
      }
      t.needsUpdate = true;
      setPath(out, e.path, t);
    }),
  );
  return out as unknown as TextureSet;
}

export async function saveTextureSet(set: TextureSet, scale: number) {
  if (typeof indexedDB === 'undefined') return;
  const entries: Entry[] = [];
  for (const [path, t] of walk(set)) {
    const canvas = t.image as HTMLCanvasElement;
    if (!(canvas instanceof HTMLCanvasElement)) continue;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) continue;
    entries.push({
      path,
      blob,
      repeat: [t.repeat.x, t.repeat.y],
      wrap: [t.wrapS, t.wrapT],
      srgb: t.colorSpace === THREE.SRGBColorSpace,
      pixels: !!(t.userData as { pixels?: PixelData }).pixels,
    });
  }
  // limpia versiones antiguas y guarda la actual
  await idb('readwrite', (s) => s.clear());
  await idb('readwrite', (s) => s.put({ entries }, keyFor(scale)));
}
