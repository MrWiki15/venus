import * as THREE from 'three';
import type { TextureSet } from './textures';

// Uniforms compartidos del efecto de escaneo (barrido láser vertical).
export const scanUniforms = {
  uScanY: { value: 1000 },
  uScanActive: { value: 0 },
};

function injectScan<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uScanY = scanUniforms.uScanY;
    shader.uniforms.uScanActive = scanUniforms.uScanActive;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScanW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 scanW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          scanW = instanceMatrix * scanW;
        #endif
        vScanW = (modelMatrix * scanW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vScanW;
        uniform float uScanY;
        uniform float uScanActive;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uScanActive > 0.5 && vScanW.y > uScanY) discard;`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `if (uScanActive > 0.5) {
          float dd = uScanY - vScanW.y;
          float edge = 1.0 - smoothstep(0.0, 0.25, dd);
          float band = 1.0 - smoothstep(0.0, 3.5, dd);
          vec3 wn = abs(normalize(cross(dFdx(vScanW), dFdy(vScanW))));
          vec3 gp = abs(fract(vScanW * 2.0) - 0.5);
          vec3 ln = smoothstep(0.44, 0.49, gp) * (1.0 - wn);
          float grid = max(max(ln.x, ln.y), ln.z);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.2, 0.9, 1.0), band * grid * 0.75);
          gl_FragColor.rgb += vec3(0.35, 1.0, 1.0) * edge * 3.0;
        }
        #include <tonemapping_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'scan-v1';
  return m;
}

type StdParams = THREE.MeshStandardMaterialParameters;
const std = (p: StdParams) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...p });

// planta baja ocre como en las fotos del vestíbulo y del patio; pisos altos con colores de época
export const FLOOR_TINTS = ['#e8c483', '#bfd6c6', '#c3d3e0', '#e6cbc3', '#e8d8ab'];

export function createMaterials(t: TextureSet, cheapCity = false) {
  // Ciudad: en GPUs débiles se usa Lambert (sin especular ni IBL), mucho más barato por píxel
  const cs = (p: StdParams) => {
    if (!cheapCity) return std(p);
    const { roughness: _r, metalness: _m, ...rest } = p;
    void _r;
    void _m;
    return new THREE.MeshLambertMaterial(rest as THREE.MeshLambertMaterialParameters);
  };
  const b = (p: StdParams) => injectScan(std(p)); // material del edificio (escaneable)
  // interiores: el cielo no llega dentro, así que la luz ambiental (IBL) se atenúa mucho;
  // vistos desde la calle los huecos quedan oscuros como en las fotos
  const bi = (p: StdParams) => b({ envMapIntensity: 0.18, ...p });

  const building = {
    facade: b({ map: t.facade.map, bumpMap: t.facade.bump, bumpScale: 1.2, roughness: 0.93 }),
    rustic: b({ map: t.rustic.map, bumpMap: t.rustic.bump, bumpScale: 1.6, roughness: 0.95 }),
    trim: b({ map: t.trim.map, bumpMap: t.trim.bump, bumpScale: 0.8, roughness: 0.88 }),
    // columnas y balaustres: piedra/estuco blanquecino algo más liso
    column: b({ map: t.trim.map, bumpMap: t.trim.bump, bumpScale: 0.4, color: '#fbf8f0', roughness: 0.62 }),
    darkGlass: b({ color: '#2a3036', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false }),
    boards: b({ map: t.woodLight, color: '#a0704a', roughness: 0.9 }),
    orangePanel: b({ map: t.woodLight, color: '#ff9a52', roughness: 0.85 }),
    walls: FLOOR_TINTS.map((c) =>
      bi({ map: t.plaster.map, bumpMap: t.plaster.bump, bumpScale: 1.0, color: c, roughness: 0.95 }),
    ),
    ceiling: bi({ map: t.plaster.map, bumpMap: t.plaster.bump, bumpScale: 0.8, color: '#cfc9bd', roughness: 0.97 }),
    floors: [
      bi({ map: t.marble, roughness: 0.55 }),
      bi({ map: t.tilesA, roughness: 0.6 }),
      bi({ map: t.tilesB, roughness: 0.6 }),
      bi({ map: t.tilesC, roughness: 0.6 }),
      bi({ map: t.tilesA, roughness: 0.62, color: '#e8dccb' }),
    ],
    roof: b({ map: t.concreteRoof, roughness: 0.95 }),
    stone: bi({ map: t.concreteGray, color: '#e2ddd2', roughness: 0.7 }),
    woodDark: b({ map: t.woodDark, roughness: 0.85 }),
    woodLight: b({ map: t.woodLight, roughness: 0.8 }),
    shutter: b({ map: t.woodLight, color: '#86a796', roughness: 0.85 }),
    shutterBlue: b({ map: t.woodLight, color: '#7f98b0', roughness: 0.85 }),
    iron: b({ color: '#2b2724', metalness: 0.65, roughness: 0.55 }),
    rust: b({ color: '#5a3424', metalness: 0.4, roughness: 0.8 }),
    glass: b({
      map: t.glass,
      emissiveMap: t.glass,
      emissive: '#ffffff',
      emissiveIntensity: 0.28,
      roughness: 0.25,
      side: THREE.DoubleSide,
    }),
    lattice: b({ map: t.lattice, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }),
    rubble: bi({ map: t.concreteGray, roughness: 0.95 }),
    trash: bi({ roughness: 0.75 }),
    brick: bi({ color: '#9a5a40', roughness: 0.92 }),
    plant: b({ color: '#4d7a33', roughness: 0.8, side: THREE.DoubleSide }),
    plantDark: b({ color: '#35562a', roughness: 0.85, side: THREE.DoubleSide }),
    fabric: bi({ color: '#6e5b4c', roughness: 1 }),
    fabricBlue: bi({ color: '#4d5f73', roughness: 1 }),
    mattress: bi({ color: '#b9ab8f', roughness: 1 }),
    black: b({ color: '#101010', roughness: 0.9 }),
    bulb: b({ color: '#fff2c8', emissive: '#ffcf80', emissiveIntensity: 2.2 }),
    tank: b({ color: '#8d8d88', roughness: 0.8, map: t.concreteGray }),
    tankBlue: b({ color: '#3f6f9a', roughness: 0.6 }),
    // --- interiores del hotel (fotos) ---
    patioWall: b({ map: t.facade.map, bumpMap: t.facade.bump, bumpScale: 1.0, color: '#f6e1b3', roughness: 0.92 }),
    patioUpper: b({ map: t.trim.map, bumpMap: t.trim.bump, bumpScale: 0.8, color: '#f4ece0', roughness: 0.9 }),
    pierBands: b({ map: t.rustic.map, bumpMap: t.rustic.bump, bumpScale: 1.4, color: '#f7f3ea', roughness: 0.85 }),
    dado: bi({ map: t.plaster.map, bumpMap: t.plaster.bump, bumpScale: 1.2, color: '#5c4636', roughness: 0.95 }),
    coffer: bi({ map: t.coffer, roughness: 0.95 }),
    cofferBeam: bi({ map: t.plaster.map, color: '#e7a993', roughness: 0.9 }),
    azulejo: bi({ map: t.tilesWall, roughness: 0.35 }),
    blueBand: bi({ map: t.plaster.map, color: '#6d8fb6', roughness: 0.9 }),
    wetFloor: b({ map: t.wet.map, roughnessMap: t.wet.rough, roughness: 1, envMapIntensity: 0.55 }),
    frieze: b({ map: t.frieze.map, bumpMap: t.frieze.bump, bumpScale: 3, roughness: 0.9 }),
    pinkCornice: b({ map: t.trim.map, bumpMap: t.trim.bump, bumpScale: 0.8, color: '#f6c9b8', roughness: 0.9 }),
    skyGlass: b({ color: '#c3dbe8', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    patioFloor: bi({ map: t.concreteGray, color: '#a8a296', roughness: 0.92, envMapIntensity: 0.5 }),
    whiteWall: bi({ map: t.plaster.map, bumpMap: t.plaster.bump, bumpScale: 0.8, color: '#f7f5ef', roughness: 0.92 }),
    trafoMetal: bi({ color: '#5f6e64', metalness: 0.45, roughness: 0.55 }),
    porcelain: bi({ color: '#7d4a33', roughness: 0.25 }),
    cableBlack: bi({ color: '#151515', roughness: 0.7 }),
    cardboard: bi({ map: t.woodLight, color: '#d8b07a', roughness: 1 }),
    cloth: [
      b({ color: '#c9473f', roughness: 1, side: THREE.DoubleSide }),
      b({ color: '#e6e1d4', roughness: 1, side: THREE.DoubleSide }),
      b({ color: '#3f6aa8', roughness: 1, side: THREE.DoubleSide }),
      b({ color: '#e0b84a', roughness: 1, side: THREE.DoubleSide }),
    ],
  };

  const city = {
    asphalt: cs({ map: t.asphalt, roughness: 0.92 }),
    sidewalk: cs({ map: t.concreteGray, color: '#d6d2c8', roughness: 0.9 }),
    curb: cs({ map: t.concreteGray, color: '#bdb8ad', roughness: 0.9 }),
    yellow: cs({ map: t.paint.map, bumpMap: t.paint.bump, bumpScale: 1, color: '#efbc45', roughness: 0.92 }),
    white: cs({ map: t.paint.map, bumpMap: t.paint.bump, bumpScale: 0.8, color: '#f1ece0', roughness: 0.9 }),
    green: cs({ map: t.paint.map, bumpMap: t.paint.bump, bumpScale: 1, color: '#c3e3d4', roughness: 0.92 }),
    turquoise: cs({ map: t.paint.map, bumpMap: t.paint.bump, bumpScale: 0.8, color: '#3ccfb8', roughness: 0.85 }),
    shutterRed: cs({ map: t.woodLight, color: '#9a3b2c', roughness: 0.85 }),
    blue: cs({ map: t.paint.map, bumpMap: t.paint.bump, bumpScale: 1, color: '#a8c2d8', roughness: 0.92 }),
    pink: cs({ map: t.paint.map, bumpMap: t.paint.bump, bumpScale: 1, color: '#dba49e', roughness: 0.92 }),
    ochre: cs({ map: t.paint.map, bumpMap: t.paint.bump, bumpScale: 1, color: '#d4ad74', roughness: 0.92 }),
    gray: cs({ map: t.paint.map, bumpMap: t.paint.bump, bumpScale: 1, color: '#bdb6a8', roughness: 0.92 }),
    voidDark: cs({ color: '#141210', roughness: 1 }),
    shutterGreen: cs({ map: t.woodLight, color: '#6f9a84', roughness: 0.85 }),
    shutterBrown: cs({ map: t.woodDark, roughness: 0.85 }),
    iron: cs({ color: '#262321', metalness: 0.6, roughness: 0.6 }),
    cable: cs({ color: '#141414', roughness: 0.6 }),
    pole: cs({ map: t.concreteGray, color: '#c4c0b6', roughness: 0.9 }),
    roof: cs({ map: t.concreteRoof, roughness: 0.95 }),
    skyline: ['#e3d7bd', '#c9d8cf', '#d9c2b6', '#c7d2dc', '#e0cfa0', '#d6d0c6'].map((c) =>
      cs({ map: t.windows, color: c, roughness: 0.92 }),
    ),
    tank: cs({ color: '#8f8f8a', roughness: 0.85 }),
  };

  return { building, city };
}

export type Materials = ReturnType<typeof createMaterials>;
