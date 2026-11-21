/* ============================================================================
 * Registro de modelos de máquinas
 * ----------------------------------------------------------------------------
 * Para adicionar um modelo novo:
 *   1. Copie js/models/s293.js para js/models/<seu-modelo>.js
 *   2. Ajuste os parâmetros (unidades: metros, graus, kg, segundos)
 *   3. Inclua <script src="js/models/<seu-modelo>.js"></script> no index.html
 *      (depois de registry.js e antes de app.js)
 *
 * Esquema (campos marcados com * são obrigatórios):
 *
 * {
 *   id*: 'slug-unico',
 *   name*: 'Nome exibido',
 *   description: 'Texto curto',
 *   chartImage: 'arquivo.jpg',           // diagrama original (opcional)
 *   defaultLoad: 1000,                    // kg
 *   maxLoad: 7000,                        // limite do controle de carga (kg)
 *   defaultPreset: 'Trabalho',
 *   stabilizerTime: 8,                    // s para estender/recolher patolas
 *   colors: { boom, column, base, pin, cylinder, rod },
 *
 *   vehicle*: {                           // eixo X = longitudinal (frente = -X)
 *     frontX, rearX, frameTop, width, wheelRadius, track, chassisColor,
 *     cab:  { x0, x1, top, width, color },
 *     bed:  { x0, x1, top, color },
 *     axles: [ { x, dual } ]
 *   },
 *   stabilizers: [ { x, y, retracted, extended } ],   // vão total (m)
 *
 *   column*: {
 *     x,               // posição do eixo de giro no chassi
 *     baseHeight,      // topo da base (altura do solo)
 *     pivotHeight,     // articulação da lança principal (altura do solo)
 *     pivotOffset,     // distância horizontal do eixo de giro até a articulação
 *     width, depth,
 *     slew: { min, max, speed }          // graus, graus/s
 *   },
 *
 *   booms*: [                            // cadeia de lanças, da coluna p/ a ponta
 *     {
 *       name, length, rear,              // comprimento fixo (articulação→ponta) e cauda
 *       section: [largura, altura],
 *       relative: true|false,            // ângulo relativo à lança anterior
 *       angle: { min, max },             // graus
 *       speed,                           // graus/s
 *       extensions: [m, m, ...],         // curso de cada extensão telescópica
 *       extSpeed, overlap
 *     }
 *   ],
 *
 *   cylinders: [                         // cilindros hidráulicos (visual)
 *     { from: ref, to: ref, r, barrel }  // ref: {boom:-1, x, y} (coluna)
 *   ],                                   //  ou {boom:i, along, perp, fromEnd}
 *
 *   hook:  { sheaveDrop, blockHeight, slingLength },
 *   winch: { maxCable, speed,            // m, m/s
 *            mount: { boom, along },     // lança onde fica o tambor e posição ao longo dela
 *            drumRadius, drumWidth },
 *
 *   loadChart*: {
 *     points: [ { r, kg, m } ],          // raio (m), carga (kg), momento (kgf·m)
 *     momentByExtension: { boom: i },    // 1 ponto por arco/extensão da lança i:
 *                                        //   capacidade = momento do arco ÷ raio real
 *                                        // (omitido = momento interpolado pelo raio)
 *     maxCapacity: 5300,                 // limite absoluto (kg); padrão = kg do 1º ponto
 *     requiresStabilizers: true
 *   },
 *
 *   presets: [ { name, slew, angles:[], ext:[], cable } ]
 * }
 * ========================================================================== */
(function () {
  'use strict';
  const list = [];

  function check(def) {
    const req = ['id', 'name', 'vehicle', 'column', 'booms', 'loadChart'];
    const miss = req.filter(k => def[k] == null);
    if (miss.length) throw new Error(`Modelo "${def.id || '?'}" sem campos: ${miss.join(', ')}`);
    if (!def.booms.length) throw new Error(`Modelo "${def.id}" precisa de ao menos 1 lança`);
    if (!def.loadChart.points || def.loadChart.points.length < 1)
      throw new Error(`Modelo "${def.id}" sem pontos no diagrama de carga`);
  }

  function withDefaults(def) {
    def.colors = Object.assign(
      { boom: '#f2b100', column: '#f2b100', base: '#2c3035', pin: '#a7adb3', cylinder: '#c9ced3', rod: '#eef1f3' },
      def.colors || {}
    );
    def.hook = Object.assign({ sheaveDrop: 0.22, blockHeight: 0.45, slingLength: 0.55 }, def.hook || {});
    def.winch = Object.assign({ maxCable: 20, speed: 0.7, drumRadius: 0.13, drumWidth: 0.3 }, def.winch || {});
    if (!def.winch.mount) {
      // padrão: tambor sobre a última lança com extensões (ou a última lança)
      let bi = def.booms.length - 1;
      for (let i = def.booms.length - 1; i >= 0; i--) if ((def.booms[i].extensions || []).length) { bi = i; break; }
      def.winch.mount = { boom: bi, along: Math.min(0.9, def.booms[bi].length * 0.45) };
    }
    def.column.x = def.column.x || 0;
    def.column.slew = Object.assign({ min: -200, max: 200, speed: 12 }, def.column.slew || {});
    def.booms.forEach(b => {
      b.rear = b.rear ?? 0.3;
      b.section = b.section || [0.3, 0.4];
      b.speed = b.speed || 8;
      b.extensions = b.extensions || [];
      b.extSpeed = b.extSpeed || 0.4;
      b.overlap = b.overlap ?? 0.35;
    });
    def.stabilizers = def.stabilizers || [];
    def.cylinders = def.cylinders || [];
    def.presets = def.presets || [];
    def.maxLoad = def.maxLoad || Math.ceil(def.loadChart.points[0].kg * 1.3 / 100) * 100;
    def.defaultLoad = def.defaultLoad ?? 1000;
    def.stabilizerTime = def.stabilizerTime || 8;
    return def;
  }

  window.CraneModels = {
    register(def) {
      check(def);
      if (list.some(m => m.id === def.id)) throw new Error(`Modelo duplicado: ${def.id}`);
      list.push(withDefaults(def));
    },
    all() { return list.slice(); },
    get(id) { return list.find(m => m.id === id) || null; }
  };
})();
