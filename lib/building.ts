// Dimensiones del hotel (metros). Fachada mirando a +Z, cara exterior en z = 0.
// Composición simétrica respecto al eje x = 0, deducida de las fotografías.
// Todo lo demás (fachada, interiores, escalera, recorrido, vecinos) se deriva de aquí.

export const W = 24; // ancho de fachada (x de -12 a 12)
export const HALF = W / 2;
export const DEPTH = 25; // fondo (z de 0 a -25)
export const FACADE_T = 0.6; // grosor del muro de fachada
export const IN_FRONT = -FACADE_T; // cara interior de la fachada
export const IN_BACK = -(DEPTH - 0.2); // cara interior del muro trasero
export const SIDE_T = 0.4;
export const IN_X = HALF - SIDE_T; // cara interior de muros laterales
export const SLAB = 0.35;
export const EYE = 1.65;

// Cotas de cada nivel (parte superior del forjado)
export const LEVELS = [0.3, 5.5, 9.5, 13.5, 17.5, 21.5];
export const ROOF = LEVELS[5];
export const PARAPET_TOP = ROOF + 0.95;

export const FLOOR_NAMES = ['Planta baja', 'Primer piso', 'Segundo piso', 'Tercer piso', 'Cuarto piso', 'Azotea'];

// Escalera de ida y vuelta a la derecha, al final del zaguán (foto del portón derecho)
const SB_X1 = IN_X;
export const STAIR = {
  wallX: SB_X1 - 4.1, // muro de la caja de escalera
  aX0: SB_X1 - 3.9,
  aX1: SB_X1 - 2.1, // tramo A (sube hacia -z)
  bX0: SB_X1 - 1.7,
  bX1: SB_X1, // tramo B (sube hacia +z)
  zFront: -8.0, // arranque del tramo A / llegada del tramo B
  zLanding: -13.5, // inicio del descanso
  zBack: -16.3, // muro de fondo de la caja
};
export const STAIR_AC = (STAIR.aX0 + STAIR.aX1) / 2;
export const STAIR_BC = (STAIR.bX0 + STAIR.bX1) / 2;

// Ascensor antiguo: a la izquierda de la escalera, del zaguán hasta el cuarto piso (foto del zaguán)
export const ELEV = {
  x0: STAIR.aX0 - 1.78, // muro izquierdo del hueco
  x1: STAIR.aX0 - 0.03, // muro derecho, pegado al tramo A
  zFront: STAIR.zFront, // frente con las puertas (al zaguán / a la sala)
  zBack: STAIR.zFront - 1.9,
  t: 0.15, // grosor de los muros del hueco
  doorW: 0.95,
  doorH: 2.25,
  topFloor: 4,
};
export const ELEV_X = (ELEV.x0 + ELEV.x1) / 2;

// Patio central con claraboya, rodeado de galerías en todos los pisos (fotos interiores)
export const PATIO = { x0: -5, x1: 5, z0: -10.5, z1: -19.5 }; // z0 lado delantero, z1 lado trasero
export const GALLERY_W = 2.4;
export const GAL_X0 = PATIO.x0 - GALLERY_W; // muro exterior de la galería izquierda
export const GAL_Z1 = PATIO.z1 - 2.5; // muro exterior de la galería trasera
export const PATIO_BAYS_X = [-3.33, 0, 3.33];
export const PATIO_BAYS_Z = [-12.0, -15.0, -18.0];

// Planta baja: gran vestíbulo (techo artesonado) a la izquierda y zaguán a la derecha
export const LOBBY_BACK_Z = -8.5; // muro trasero del vestíbulo (arcos hacia la galería del patio)
export const ZAGUAN_END_Z = -6.6; // fin del muro entre vestíbulo y zaguán
export const LOBBY_COLUMNS: [number, number][] = [
  [-3, -6],
  [3, -6],
  [-3, -9],
  [3, -9],
];
export const COFFER = 3; // retícula del artesonado (m)

// Cuarto de transformadores de alta tensión: recinto de muro blanco en el vestíbulo,
// a la izquierda junto a la fachada (detrás del portón izquierdo, que está cerrado)
export const TRAFO_ROOM = { x0: -IN_X, x1: -6.3, zBack: -7.9, zFront: IN_FRONT, h: 3.1, gateZ: -4.3, gateW: 2.0, gateH: 2.4 };
export const TRAFOS: [number, number][] = [
  [-9.4, -2.5],
  [-9.4, -5.6],
];

// Pisos altos: sala delantera y galería frente al patio
export const SALA_Z = -8.0;

// Ejes verticales de la fachada
export const BAYS = [-8.4, 0, 8.4]; // ejes con balcones
export const NARROW = [-4.16, 4.16]; // ejes de ventanas estrechas (entre pilastras)
export const COLUMNS = [-3.0, -2.2, 2.2, 3.0]; // columnas pareadas de planta baja
export const PILASTER_STRIPS = [-4.9, -3.42, 3.42, 4.9]; // franjas que enmarcan los ejes estrechos

// Planta baja
export const DOOR = { x: 8.4, w: 2.7, y0: LEVELS[0], rect: 3.25 }; // portón principal (derecha, abierto, con basura)
export const DOOR_L = { x: -8.4, w: 2.7, y0: LEVELS[0], rect: 3.25 }; // portón izquierdo (tapiado con madera)
export const GROUND_CENTER = { x: 0, w: 4.0, y0: 0.36, h: 4.34, rail: 0.95, lattice: 3.25 }; // balaustrada + celosía + rejas
export const GROUND_NARROW = { w: 0.85, y0: 0.36, h: 4.34, rail: 0.95 };
export const PIERS = [-10.85, -5.85, 5.85, 10.85]; // pilastras almohadilladas con mascarón

export type Opening = {
  x: number; // centro
  y: number; // base
  w: number;
  h: number; // altura de la parte rectangular
  arch?: boolean; // remate de medio punto (radio w/2)
  kind?: 'bay' | 'narrow' | 'side'; // tipo de hueco
};

export function groundOpenings(): Opening[] {
  return [
    { x: DOOR_L.x, y: DOOR_L.y0, w: DOOR_L.w, h: DOOR_L.rect, arch: true, kind: 'bay' },
    { x: NARROW[0], y: GROUND_NARROW.y0, w: GROUND_NARROW.w, h: GROUND_NARROW.h, kind: 'narrow' },
    { x: GROUND_CENTER.x, y: GROUND_CENTER.y0, w: GROUND_CENTER.w, h: GROUND_CENTER.h, kind: 'bay' },
    { x: NARROW[1], y: GROUND_NARROW.y0, w: GROUND_NARROW.w, h: GROUND_NARROW.h, kind: 'narrow' },
    { x: DOOR.x, y: DOOR.y0, w: DOOR.w, h: DOOR.rect, arch: true, kind: 'bay' },
  ];
}

// Ventana tripartita del primer piso
export const TRIPARTITE = { sideX: 1.36, sideW: 0.5, colonnettes: [-1.73, -0.99, 0.99, 1.73] };

// Huecos de un piso alto (n = 1..4) en coordenadas mundo
export function upperOpenings(n: number): Opening[] {
  const L = LEVELS[n];
  const res: Opening[] = [];
  if (n === 1) {
    // 1er piso: arcos; el central es una ventana tripartita (arco con dos arquillos)
    for (const bx of BAYS) res.push({ x: bx, y: L + 0.02, w: 1.7, h: 2.25, arch: true, kind: 'bay' });
    res.push({ x: -TRIPARTITE.sideX, y: L + 0.85, w: TRIPARTITE.sideW, h: 1.6, arch: true, kind: 'side' });
    res.push({ x: TRIPARTITE.sideX, y: L + 0.85, w: TRIPARTITE.sideW, h: 1.6, arch: true, kind: 'side' });
  } else {
    for (const bx of BAYS) res.push({ x: bx, y: L + 0.02, w: 1.6, h: 2.7, kind: 'bay' });
  }
  for (const nx of NARROW) res.push({ x: nx, y: L + 0.55, w: 0.8, h: 2.35, kind: 'narrow' });
  return res;
}

export function openingTop(o: Opening) {
  return o.y + o.h + (o.arch ? o.w / 2 : 0);
}

// Cornisa: ménsulas pareadas y respiraderos del ático entre ellas
export const BRACKET_PAIRS = Array.from({ length: 11 }, (_, i) => -11 + i * 2.2);
export const ATTIC_VENTS = Array.from({ length: 10 }, (_, i) => -9.9 + i * 2.2);
export const PARAPET_HOLES = Array.from({ length: 17 }, (_, i) => -10.4 + i * 1.3);

// Balcones (x, piso, ancho, vuelo)
export const BALCONY_W1 = { center: 4.4, side: 3.3 };
export const BALCONY_W = 3.0;

// Arcada del zaguán en planta baja: siempre a la izquierda del portón principal
export const ZAGUAN_X = DOOR.x - DOOR.w / 2 - 0.45;
