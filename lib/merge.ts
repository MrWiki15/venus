import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Fusiona toda la geometría estática de un subárbol en una malla por material.
// Reduce los draw calls de ~1000 a unas decenas (clave en GPUs integradas).

function hasNoMerge(o: THREE.Object3D, root: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p && p !== root) {
    if (p.userData.noMerge) return true;
    p = p.parent;
  }
  return false;
}

function normalize(g: THREE.BufferGeometry) {
  // se clonan los atributos: nunca modificar geometrías compartidas (caché)
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position.clone());
  if (g.attributes.normal) out.setAttribute('normal', g.attributes.normal.clone());
  else {
    out.computeVertexNormals();
  }
  if (g.attributes.uv) out.setAttribute('uv', g.attributes.uv.clone());
  else out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return out;
}

function slice(g: THREE.BufferGeometry, start: number, count: number) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name] as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const arr = (a.array as Float32Array).slice(start * a.itemSize, (start + count) * a.itemSize);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; layers: number }>();
  const sources: THREE.Mesh[] = [];
  const m = new THREE.Matrix4();

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || o.userData.merged) return;
    if (!mesh.visible || hasNoMerge(o, root)) return;
    // ancestros invisibles: no fusionar
    let p: THREE.Object3D | null = o.parent;
    while (p && p !== root) {
      if (!p.visible) return;
      p = p.parent;
    }
    const geo = mesh.geometry;
    if (!geo?.attributes?.position) return;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const flat = geo.index ? geo.toNonIndexed() : geo;
    const add = (mat: THREE.Material, g: THREE.BufferGeometry) => {
      const n = normalize(g);
      n.applyMatrix4(m);
      let b = buckets.get(mat);
      if (!b) {
        b = { geos: [], layers: mesh.layers.mask };
        buckets.set(mat, b);
      }
      b.geos.push(n);
    };
    if (Array.isArray(mesh.material)) {
      if (flat.groups.length === 0) add(mesh.material[0], flat);
      else for (const gr of flat.groups) add(mesh.material[gr.materialIndex ?? 0], slice(flat, gr.start, gr.count));
    } else {
      add(mesh.material, flat);
    }
    sources.push(mesh);
  });

  const created: THREE.Mesh[] = [];
  for (const [mat, b] of buckets) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.merged = true;
    mesh.layers.mask = b.layers;
    root.add(mesh);
    created.push(mesh);
    b.geos.forEach((g) => g.dispose());
  }
  for (const s of sources) s.visible = false;

  return () => {
    for (const c of created) {
      root.remove(c);
      c.geometry.dispose();
    }
    for (const s of sources) s.visible = true;
  };
}
