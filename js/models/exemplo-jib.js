/* MODELO ILUSTRATIVO — dados FICTÍCIOS.
 * Serve só para demonstrar que o simulador aceita qualquer cadeia de lanças
 * (aqui: principal + articulada c/ 4 extensões + JIB c/ 2 extensões).
 * Substitua pelos dados reais do fabricante antes de usar.
 */
CraneModels.register({
  id: 'exemplo-jib',
  name: 'Exemplo JIB (fictício)',
  description: 'Modelo ilustrativo · 3 lanças (principal + articulada + JIB) · dados fictícios',
  defaultLoad: 800,
  maxLoad: 10000,
  defaultPreset: 'Trabalho',
  stabilizerTime: 9,

  colors: { boom: '#d4471f', column: '#d4471f', base: '#2a2d31' },

  vehicle: {
    frontX: -3.45, rearX: 7.6, frameTop: 1.08, width: 2.5,
    wheelRadius: 0.54, track: 2.05, chassisColor: '#202326',
    cab: { x0: -3.45, x1: -1.1, top: 3.2, width: 2.45, color: '#2d5d8a' },
    bed: { x0: 0.9, x1: 7.6, top: 1.36, color: '#383c41' },
    axles: [{ x: -2.55 }, { x: -1.25 }, { x: 3.7, dual: true }, { x: 5.05, dual: true }]
  },

  stabilizers: [
    { x: 0.72, y: 0.98, retracted: 2.45, extended: 7.0 },
    { x: 7.2, y: 0.98, retracted: 2.45, extended: 5.6 }
  ],

  column: {
    x: 0, baseHeight: 1.4, pivotHeight: 3.4, pivotOffset: 0.3,
    width: 0.64, depth: 0.58,
    slew: { min: -210, max: 210, speed: 10 }
  },

  booms: [
    { name: 'Lança principal', length: 3.2, rear: 0.35, section: [0.4, 0.52], angle: { min: -15, max: 82 }, speed: 6 },
    {
      name: '2ª lança', relative: true, length: 2.6, rear: 0.55, section: [0.34, 0.44],
      angle: { min: -165, max: 0 }, speed: 8, extensions: [2.0, 2.0, 2.0, 2.0], extSpeed: 0.4
    },
    {
      name: 'JIB', relative: true, length: 1.7, rear: 0.4, section: [0.26, 0.32],
      angle: { min: -120, max: 0 }, speed: 10, extensions: [1.6, 1.6], extSpeed: 0.35
    }
  ],

  cylinders: [
    { from: { boom: -1, x: 0.42, y: 1.8 }, to: { boom: 0, along: 1.05, perp: -0.36 }, r: 0.12, barrel: 1.35 },
    { from: { boom: 0, along: 0.65, perp: 0.38 }, to: { boom: 1, along: -0.47, perp: 0.32 }, r: 0.1, barrel: 1.7 },
    { from: { boom: 1, along: -1.4, perp: 0.27, fromEnd: true }, to: { boom: 2, along: -0.36, perp: 0.25 }, r: 0.075, barrel: 0.95 }
  ],

  hook: { sheaveDrop: 0.2, blockHeight: 0.45, slingLength: 0.55 },
  winch: { maxCable: 26, speed: 0.75, mount: { boom: 1, along: 1.0 } },

  loadChart: {
    points: [
      { r: 4.2, kg: 8000 },
      { r: 6.4, kg: 5400 },
      { r: 8.4, kg: 4050 },
      { r: 10.4, kg: 3200 },
      { r: 12.4, kg: 2600 },
      { r: 14.5, kg: 2050 },
      { r: 16.6, kg: 1650 },
      { r: 18.8, kg: 1250 }
    ],
    requiresStabilizers: true
  },

  presets: [
    { name: 'Transporte', slew: 0, angles: [80, -162, -110], ext: [0, 0, 0], cable: 0.4 },
    { name: 'Trabalho', slew: -30, angles: [55, -50, -20], ext: [0, 4, 0], cable: 3.0 },
    { name: 'Alcance máx.', slew: 0, angles: [45, -45, 0], ext: [0, 8, 3.2], cable: 2.0 },
    { name: 'Altura máx.', slew: 0, angles: [80, 0, 0], ext: [0, 8, 3.2], cable: 1.0 }
  ]
});
