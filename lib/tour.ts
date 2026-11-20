import { LEVELS, EYE, STAIR, STAIR_AC, STAIR_BC, DOOR, ROOF, PATIO, SALA_Z } from './building';

export type V3 = [number, number, number];

export interface TourStep {
  id: string;
  title: string;
  kicker: string;
  text: string;
  floor: number; // -1 exterior, 0..4 pisos, 5 azotea
  mode: 'orbit' | 'look';
  pos: V3;
  target: V3; // orbit: centro de órbita · look: punto al que se mira
  via?: V3[]; // puntos de paso al llegar desde el paso anterior
  walk?: boolean; // la cámara camina mirando hacia delante
}

const e = (n: number) => LEVELS[n] + EYE;
const ZF = STAIR.zFront;
const ZL = STAIR.zLanding;
const MIDX = (STAIR.aX1 + STAIR.bX0) / 2;
const PZ = (PATIO.z0 + PATIO.z1) / 2;

// Tramos de escalera del nivel n al n+1 (desde el pie del tramo A hasta la llegada del tramo B)
function flights(n: number): V3[] {
  const a = e(n);
  const h = LEVELS[n + 1] - LEVELS[n];
  const mid = a + h / 2;
  const b = e(n + 1);
  return [
    [STAIR_AC, a, ZF + 0.7],
    [STAIR_AC, a + 0.05, ZF - 0.1],
    [STAIR_AC, mid - 0.05, ZL + 0.3],
    [STAIR_AC + 0.3, mid, ZL - 1.0],
    [MIDX, mid, ZL - 1.6],
    [STAIR_BC - 0.3, mid, ZL - 1.0],
    [STAIR_BC, mid + 0.05, ZL + 0.2],
    [STAIR_BC, b - 0.05, ZF - 0.2],
    [STAIR_BC - 0.1, b, ZF + 0.9],
  ];
}

// Desde la sala del piso n hasta la sala del piso n+1 (la escalera desemboca en la sala)
function climb(n: number): V3[] {
  const a = e(n);
  const b = e(n + 1);
  return [
    [0.4, a, -6.3],
    [4.0, a, -6.8],
    [STAIR_AC - 0.8, a, ZF + 1.2],
    ...flights(n),
    [STAIR_BC - 1.2, b, ZF + 2.2],
    [4.0, b, -6.0],
    [0.4, b, -6.0],
  ];
}

const salaText = (extra: string) =>
  `Sala delantera con los balcones a la calle; detrás, la galería que rodea el patio central. ${extra}`;

export const STEPS: TourStep[] = [
  {
    id: 'scan',
    title: 'Escaneo 3D',
    kicker: 'Captura',
    text: 'Barrido láser del hotel: la nube de puntos se reconstruye en una malla con texturas de estuco, piedra y madera.',
    floor: -1,
    mode: 'orbit',
    pos: [24, 9, 37],
    target: [0, 10.5, -7],
  },
  {
    id: 'facade',
    title: 'Fachada',
    kicker: 'Exterior',
    text: 'Fachada ecléctica: dos portones de medio punto con vitral rojo, columnas pareadas, celosía de ladrillo sobre balaustrada, mascarones, ventana tripartita y cornisa con ménsulas pareadas.',
    floor: -1,
    mode: 'orbit',
    pos: [4, 4.4, 32],
    target: [0, 10.8, -1],
  },
  {
    id: 'entrance',
    title: 'Entrada',
    kicker: 'Exterior · Portón',
    text: 'El portón derecho, con su medio punto de vidrios rojos. La hoja derecha está abierta y la basura se desborda hacia la acera.',
    floor: -1,
    mode: 'look',
    pos: [DOOR.x - 0.6, 1.78, 5.0],
    target: [DOOR.x, 2.3, -4],
    via: [[2.2, 2.2, 13.5]],
    walk: true,
  },
  {
    id: 'zaguan',
    title: 'Zaguán y escalera',
    kicker: 'Planta baja · Zaguán',
    text: 'Tras el portón, el zaguán con cartones y basura. A la izquierda se abre el gran vestíbulo, sin tabique de por medio; al fondo, la escalera principal y, junto a ella, el ascensor antiguo que sube hasta el cuarto piso.',
    floor: 0,
    mode: 'look',
    pos: [DOOR.x - 0.2, e(0), -2.6],
    target: [STAIR_AC, 3.2, -12],
    via: [
      [DOOR.x + 0.2, 1.85, 1.4],
      [DOOR.x, e(0), -0.4],
    ],
    walk: true,
  },
  {
    id: 'lobby',
    title: 'Vestíbulo principal',
    kicker: 'Planta baja · Gran salón',
    text: 'Gran salón tras la celosía, abierto al fondo hacia la arcada del patio: techo artesonado con vigas rosadas y paneles con moho, columnas jónicas, zócalo de azulejos con banda azul, el suelo mojado cubierto de ropa y cajas y, a la izquierda junto a la fachada, el cuarto de los dos transformadores de alta tensión tras un muro blanco.',
    floor: 0,
    mode: 'look',
    pos: [1.2, e(0), -7.4],
    target: [0.0, 2.3, 1.0],
    via: [
      [7.9, e(0), -3.6],
      [6.6, e(0), -3.6],
      [5.0, e(0), -4.0],
      [4.4, e(0), -6.9],
    ],
    walk: true,
  },
  {
    id: 'patio',
    title: 'Patio central',
    kicker: 'Planta baja · Patio',
    text: 'El corazón del hotel: arcada con pilastras de franjas blancas, friso de ovas y cornisa rosada; encima, cuatro pisos de galerías entre pilastras gigantes bajo la claraboya de hierro y vidrio.',
    floor: 0,
    mode: 'look',
    pos: [0.4, e(0), PZ + 1.6],
    target: [0.2, 17.5, PZ - 4],
    via: [
      [0.6, e(0), -8.0],
      [0, e(0), -8.5],
      [0, e(0), PATIO.z0 + 0.6],
      [0, e(0), PATIO.z0 - 0.6],
    ],
    walk: true,
  },
  {
    id: 'floor1',
    title: 'Primer piso',
    kicker: 'Interior · Sala',
    text: salaText('Ventana tripartita, losas hidráulicas, vigas de madera y repello desprendido.'),
    floor: 1,
    mode: 'look',
    pos: [0, e(1), -6.0],
    target: [0, e(1) - 0.3, 3],
    via: [
      [0.2, e(0), PATIO.z0 + 0.2],
      [1.6, e(0), -9.95],
      [5.2, e(0), -9.7],
      [5.3, e(0), -7.4],
      [7.2, e(0), -7.4],
      [STAIR_AC - 0.4, e(0), ZF + 0.9],
      ...flights(0),
      [STAIR_BC - 1.2, e(1), ZF + 2.2],
      [4.0, e(1), -6.0],
    ],
    walk: true,
  },
  {
    id: 'floor2',
    title: 'Segundo piso',
    kicker: 'Interior · Sala',
    text: salaText('Muebles abandonados, persianas caídas y manchas de humedad.'),
    floor: 2,
    mode: 'look',
    pos: [0, e(2), -6.0],
    target: [0, e(2) - 0.3, 3],
    via: climb(1),
    walk: true,
  },
  {
    id: 'floor3',
    title: 'Tercer piso',
    kicker: 'Interior · Sala',
    text: salaText('Más escombro del cielo raso y vegetación que entra desde los balcones.'),
    floor: 3,
    mode: 'look',
    pos: [0, e(3), -6.0],
    target: [0, e(3) - 0.3, 3],
    via: climb(2),
    walk: true,
  },
  {
    id: 'floor4',
    title: 'Cuarto piso',
    kicker: 'Interior · Sala',
    text: salaText('Último nivel, bajo la cornisa y los respiraderos del ático.'),
    floor: 4,
    mode: 'look',
    pos: [0, e(4), -6.0],
    target: [0, e(4) - 0.3, 3],
    via: climb(3),
    walk: true,
  },
  {
    id: 'mirador',
    title: 'Asomado al patio',
    kicker: 'Cuarto piso · Galería',
    text: 'Desde la galería del cuarto piso, asomado a uno de los huecos sobre el patio: abajo, la arcada, el friso y el suelo cubierto de basura; alrededor, las cuatro plantas de galerías.',
    floor: 4,
    mode: 'look',
    pos: [0, e(4), PATIO.z0 - 0.05],
    target: [0.3, LEVELS[0] + 0.3, PZ - 1.5],
    via: [
      [0.2, e(4), -7.0],
      [0, e(4), SALA_Z],
      [0, e(4), -9.3],
      [0, e(4), PATIO.z0 + 0.35],
    ],
    walk: true,
  },
  {
    id: 'roof',
    title: 'Azotea',
    kicker: 'Exterior · Cubierta',
    text: 'Azotea con la claraboya del patio (marco de hierro a cuatro aguas con vidrios rotos), tanques de agua, antenas, tendederas y el árbol que crece en la esquina.',
    floor: 5,
    mode: 'look',
    pos: [-1.6, e(5), -5.6],
    target: [0.4, ROOF + 0.6, PZ],
    via: [
      // vuelve de la galería a la sala y sube por la escalera
      [0, e(4), -9.3],
      [0, e(4), SALA_Z],
      [0.3, e(4), -6.8],
      ...climb(4).slice(1, 12),
      [STAIR_BC - 0.4, e(5), ZF + 2.4],
      [3.0, e(5), -5.0],
    ],
    walk: true,
  },
];
