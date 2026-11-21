/* Guindaste articulado S293 — dados do diagrama s293.jpg
 * Cada arco do diagrama = uma configuração de extensões, com momento nominal próprio (kgf·m).
 * A carga em kgf da tabela vale na horizontal (0°): kgf = momento ÷ raio.
 * Em outros ângulos o raio diminui e a capacidade = momento ÷ raio real (limitada a 5300 kg).
 * Tabela de carga (2ª lança na horizontal):
 *   raio  4,0  5,9  7,8  9,8  11,8  14,0 m
 *   carga 5300 3500 2630 2090 1670 1350 kg
 *   mom.  21200 20650 20515 20500 19700 18900 kgf·m
 * Altura máxima de ponta: 17,3 m (a 81°)
 * Geometria da máquina estimada a partir do desenho.
 */
CraneModels.register({
  id: 's293',
  name: 'S293',
  description: 'Articulado · 2ª lança + 5 extensões hidráulicas · 21,2 t·m · alcance 14,0 m · altura 17,3 m',
  chartImage: 's293.jpg',
  defaultLoad: 1000,
  maxLoad: 7000,
  defaultPreset: 'Trabalho',
  stabilizerTime: 8,

  colors: { boom: '#f2b100', column: '#f2b100', base: '#2c3035' },

  vehicle: {
    frontX: -3.05, rearX: 6.5, frameTop: 1.05, width: 2.5,
    wheelRadius: 0.52, track: 2.05, chassisColor: '#24272b',
    cab: { x0: -3.05, x1: -0.8, top: 3.05, width: 2.45, color: '#eef1f3' },
    bed: { x0: 0.75, x1: 6.5, top: 1.32, color: '#3a3f45' },
    axles: [{ x: -1.7 }, { x: 2.85, dual: true }, { x: 4.2, dual: true }]
  },

  stabilizers: [
    { x: 0.62, y: 0.95, retracted: 2.45, extended: 6.2 },
    { x: 6.05, y: 0.95, retracted: 2.45, extended: 4.8 }
  ],

  column: {
    x: 0, baseHeight: 1.35, pivotHeight: 3.0, pivotOffset: 0.25,
    width: 0.56, depth: 0.5,
    slew: { min: -200, max: 200, speed: 12 }
  },

  booms: [
    {
      name: 'Lança principal',
      length: 2.7, rear: 0.3, section: [0.34, 0.44],
      angle: { min: -15, max: 82 }, speed: 7
    },
    {
      name: '2ª lança (articulada)',
      relative: true,
      length: 2.1, rear: 0.5, section: [0.3, 0.38],
      angle: { min: -165, max: 0 }, speed: 9,   // máx. 0° = alinhada (linha reta) com a lança principal
      extensions: [1.9, 1.9, 2.0, 2.0, 2.2], extSpeed: 0.4
    }
  ],

  cylinders: [
    { from: { boom: -1, x: 0.36, y: 1.55 }, to: { boom: 0, along: 0.95, perp: -0.3 }, r: 0.1, barrel: 1.2 },
    { from: { boom: 0, along: 0.55, perp: 0.32 }, to: { boom: 1, along: -0.42, perp: 0.28 }, r: 0.085, barrel: 1.5 }
  ],

  hook: { sheaveDrop: 0.22, blockHeight: 0.45, slingLength: 0.55 },
  winch: { maxCable: 22, speed: 0.7, mount: { boom: 1, along: 0.9 } },

  loadChart: {
    points: [
      { r: 4.0, kg: 5300, m: 21200 },
      { r: 5.9, kg: 3500, m: 20650 },
      { r: 7.8, kg: 2630, m: 20515 },
      { r: 9.8, kg: 2090, m: 20500 },
      { r: 11.8, kg: 1670, m: 19700 },
      { r: 14.0, kg: 1350, m: 18900 }
    ],
    // cada arco (base, +1 … +5 ext.) tem momento próprio; capacidade = momento ÷ raio real
    momentByExtension: { boom: 1 },
    maxCapacity: 5300,
    requiresStabilizers: true
  },

  presets: [
    { name: 'Transporte', slew: 0, angles: [80, -162], ext: [0, 0], cable: 0.4 },
    { name: 'Trabalho', slew: 25, angles: [60, -68], ext: [0, 4], cable: 2.0 },
    { name: 'Raio mínimo', slew: 0, angles: [78, -78], ext: [0, 0], cable: 2.0 },
    { name: 'Horizontal 0°', slew: 0, angles: [52, -52], ext: [0, 10], cable: 2.0 },
    { name: 'Altura máx. 81°', slew: 0, angles: [81, 0], ext: [0, 10], cable: 1.0 }
  ]
});
