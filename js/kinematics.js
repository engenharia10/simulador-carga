/* Cinemática genérica da cadeia de lanças + diagrama de carga + colisões.
 * Coordenadas no "plano da lança": x = radial a partir do eixo de giro, y = altura do solo.
 */
(function () {
  'use strict';
  const DEG = Math.PI / 180;

  const maxExt = b => (b.extensions || []).reduce((a, c) => a + c, 0);

  /** Distribui a extensão total entre as seções (sequencial ou sincronizada). */
  function sectionOuts(boom, total, mode) {
    const ex = boom.extensions || [];
    if (!ex.length) return [];
    const sum = maxExt(boom);
    total = Math.max(0, Math.min(total, sum));
    if (mode === 'sync') return ex.map(s => total * s / sum);
    let rem = total;
    return ex.map(s => { const v = Math.min(s, rem); rem -= v; return v; });
  }

  const loadSize = kg => (kg > 0 ? 0.35 + Math.cbrt(kg) * 0.06 : 0);

  /** Volumes do caminhão (caixas alinhadas ao eixo X, simétricas em Z) para apoio/colisão da carga. */
  function truckBoxes(model, st) {
    const v = model.vehicle, c = model.column, out = [];
    if (v.cab) {
      out.push({ x0: v.cab.x0 - 0.1, x1: v.cab.x1, hw: v.cab.width / 2, top: v.cab.top + 0.08, name: 'cabine' });
      out.push({ x0: v.cab.x0 + 0.85, x1: v.cab.x1, hw: (v.cab.width - 0.5) / 2, top: v.cab.top + 0.5, name: 'cabine' });
      if (v.bed) out.push({ x0: v.cab.x1, x1: v.bed.x0, hw: 0.5, top: v.frameTop, name: 'chassi' });
    }
    if (v.bed) out.push({ x0: v.bed.x0, x1: v.bed.x1, hw: v.width / 2, top: v.bed.top, name: 'carroceria' });
    out.push({ x0: c.x - 0.58, x1: c.x + 0.58, hw: v.width / 2, top: c.baseHeight, name: 'base do guindaste' });
    out.push({ x0: c.x - 0.45, x1: c.x + 0.45, hw: 0.45, top: c.pivotHeight + 0.35, name: 'coluna' });
    const p1 = Math.max(0, Math.min(1, (st.outrigger ?? 1) / 0.6));
    (model.stabilizers || []).forEach(sd => {
      const half = sd.retracted / 2 + (sd.extended / 2 - sd.retracted / 2) * p1;
      out.push({ x0: sd.x - 0.18, x1: sd.x + 0.18, hw: half + 0.3, top: (sd.y ?? 0.95) + 0.16, name: 'patola' });
    });
    return out;
  }

  /** Superfície mais alta sob a área (wx, wz) ± half. */
  function floorAt(model, st, wx, wz, half) {
    let f = 0, name = 'solo';
    for (const o of truckBoxes(model, st)) {
      if (wx + half > o.x0 && wx - half < o.x1 && Math.abs(wz) - half < o.hw && o.top > f) { f = o.top; name = o.name; }
    }
    return { f, name };
  }

  function solve(model, st) {
    const c = model.column;
    let x = c.pivotOffset, y = c.pivotHeight, abs = 0;
    const booms = [];
    model.booms.forEach((b, i) => {
      abs = (i === 0 || !b.relative) ? st.angles[i] : abs + st.angles[i];
      const outs = sectionOuts(b, st.ext[i] || 0, st.extMode);
      const len = b.length + outs.reduce((a, v) => a + v, 0);
      const a = abs * DEG, dx = Math.cos(a), dy = Math.sin(a);
      booms.push({ x, y, abs, len, outs, dx, dy, ex: x + dx * len, ey: y + dy * len });
      x += dx * len; y += dy * len;
    });
    const tip = { x, y: y - model.hook.sheaveDrop };
    const loadH = loadSize(st.load);
    // a carga/gancho apoia na superfície mais alta embaixo dela (solo, carroceria, cabine…)
    const sl = (st.slew || 0) * DEG;
    const wx = model.column.x + tip.x * Math.cos(sl), wz = -tip.x * Math.sin(sl);
    const fl = floorAt(model, st, wx, wz, st.load > 0 ? loadH / 2 : 0.15);
    const minY = fl.f + model.hook.blockHeight + (st.load > 0 ? model.hook.slingLength + loadH : 0) + 0.02;
    let hookY = tip.y - Math.max(0, st.cable);
    let grounded = false;
    if (hookY < minY) { hookY = minY; grounded = true; }
    return {
      booms, tip,
      hook: { x: tip.x, y: hookY },
      radius: Math.abs(tip.x),
      grounded, loadH,
      floor: fl.f, restOn: fl.name,
      cableEff: Math.max(0, tip.y - hookY)
    };
  }

  /** Posição contínua na sequência de extensões: 0 = base, 1 = 1ª ext. toda aberta, 2.5 = 3ª ext. pela metade… */
  function extensionPosition(model, kin, boomIdx) {
    const def = model.booms[boomIdx], kb = kin.booms[boomIdx];
    if (!def || !kb) return 0;
    let rem = kb.outs.reduce((a, v) => a + v, 0), pos = 0;
    for (const s of def.extensions) {
      if (rem <= 1e-9) break;
      const f = Math.min(1, rem / s);
      pos += f; rem -= s;
    }
    return pos;
  }

  /**
   * Capacidade de carga. Dois modos:
   *  - momentByExtension: cada arco do diagrama (base, +1 ext … +n ext) tem um MOMENTO nominal
   *    (kgf·m). Capacidade = momento ÷ raio real — sobe quando a lança sobe (raio menor) e
   *    cai quando o ângulo diminui. Limitada a maxCapacity. Ex.: S293.
   *  - por raio (padrão): momento interpolado pelo raio, capacidade = M(r) ÷ r.
   */
  function capacity(model, kin, st) {
    const ch = model.loadChart, pts = ch.points, r = kin.radius;
    const res = { r, cap: 0, rated: 0, reason: null, inChart: true, idx: -1, maxed: false };
    const M = pts.map(p => p.m ?? p.kg * p.r);
    const last = pts.length - 1;
    const maxCap = ch.maxCapacity ?? pts[0].kg;

    if (ch.requiresStabilizers && st.outrigger < 0.999) res.reason = 'PATOLAS NÃO ESTENDIDAS';
    if (r > pts[last].r + 0.1) { res.inChart = false; res.reason = res.reason || 'FORA DO DIAGRAMA DE CARGA'; return res; }

    let cap, mr;
    if (ch.momentByExtension) {
      const pos = Math.min(extensionPosition(model, kin, ch.momentByExtension.boom), last);
      const i = Math.floor(pos), f = pos - i;
      mr = i >= last ? M[last] : M[i] + (M[i + 1] - M[i]) * f;
      res.idx = Math.ceil(pos - 0.02);
      res.extPos = pos;
    } else {
      if (r <= pts[0].r) { mr = M[0]; res.idx = 0; }
      else if (r >= pts[last].r) { mr = M[last]; res.idx = last; }
      else {
        let i = 0; while (r > pts[i + 1].r) i++;
        const t = (r - pts[i].r) / (pts[i + 1].r - pts[i].r);
        mr = M[i] + (M[i + 1] - M[i]) * t;
        res.idx = i + 1;
      }
    }
    cap = mr / Math.max(r, 0.01);
    if (cap >= maxCap) { cap = maxCap; res.maxed = true; }

    res.rated = mr;
    res.cap = res.reason ? 0 : cap;
    res.chartCap = cap;
    return res;
  }

  /** Verifica colisão das lanças com solo, cabine e carroceria. */
  function collisions(model, kin, st) {
    const v = model.vehicle, s = (st.slew || 0) * DEG, cs = Math.cos(s), sn = Math.sin(s), cx = model.column.x;
    const boxes = [];
    if (v.cab) boxes.push({ x0: v.cab.x0, x1: v.cab.x1, hw: v.cab.width / 2, top: v.cab.top, name: 'cabine' });
    if (v.bed) boxes.push({ x0: v.bed.x0, x1: v.bed.x1, hw: v.width / 2, top: v.bed.top, name: 'carroceria' });

    // volumes pendurados no gancho (no plano da lança): moitão, cintas e carga
    const hk = model.hook, hx = kin.hook.x, hy = kin.hook.y, ls = kin.loadH;
    const hang = [{ hw: 0.16, y0: hy - hk.blockHeight, y1: hy, name: 'gancho' }];
    if (st.load > 0) {
      const top = hy - hk.blockHeight - hk.slingLength;
      hang.push({ hw: ls * 0.25, y0: top, y1: hy - hk.blockHeight, name: 'carga' });   // cintas
      hang.push({ hw: ls / 2, y0: top - ls, y1: top, name: 'carga' });                  // caixa
    }
    const hwx = cx + hx * cs, hwz = -hx * sn;

    let count = 0, what = '';
    kin.booms.forEach((b, i) => {
      const hh = model.booms[i].section[1] / 2;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12 * b.len;
        const px = b.x + b.dx * t, py = b.y + b.dy * t;
        if (py - hh < 0.05) { count++; what = what || 'lança × solo'; continue; }
        const wx = cx + px * cs, wz = -px * sn;
        for (const o of boxes) {
          if (wx > o.x0 - hh && wx < o.x1 + hh && Math.abs(wz) < o.hw + hh && py - hh < o.top) {
            count++; what = 'lança × ' + o.name;
          }
        }
        // lança atravessando a carga / gancho (caixa alinhada ao mundo, centrada sob o gancho).
        // A última lança é a que sustenta o cabo (a carga pende da roldana da ponta) — fica fora desta checagem.
        if (i === kin.booms.length - 1) continue;
        for (const o of hang) {
          if (Math.abs(wx - hwx) < o.hw + hh && Math.abs(wz - hwz) < o.hw + hh && py + hh > o.y0 && py - hh < o.y1) {
            count++; what = 'lança × ' + o.name;
          }
        }
      }
    });
    return { count, what };
  }


  /** Envelope de alcance da ponta (todas as extensões abertas). */
  function envelope(model) {
    const n = model.booms.length;
    const steps = n === 1 ? 240 : n === 2 ? 90 : n === 3 ? 30 : 14;
    const c = model.column, cx = c.pivotOffset, cy = c.pivotHeight;
    const st = { angles: new Array(n).fill(0), ext: model.booms.map(maxExt), extMode: 'seq', cable: 0, load: 0 };
    const bins = {};
    let maxR = 0, maxH = 0;
    const rec = i => {
      if (i === n) {
        const k = solve(model, st), e = k.booms[n - 1];
        if (e.ey < 0) return;
        maxR = Math.max(maxR, Math.abs(e.ex)); maxH = Math.max(maxH, e.ey);
        const a = Math.round(Math.atan2(e.ey - cy, e.ex - cx) / DEG);
        const d = Math.hypot(e.ex - cx, e.ey - cy);
        if (!bins[a] || bins[a].d < d) bins[a] = { a, d, x: e.ex, y: e.ey };
        return;
      }
      const b = model.booms[i];
      for (let k = 0; k <= steps; k++) {
        st.angles[i] = b.angle.min + (b.angle.max - b.angle.min) * k / steps;
        rec(i + 1);
      }
    };
    rec(0);
    const pts = Object.keys(bins).map(Number).sort((a, b) => a - b).map(a => bins[a]);
    return { pts, bins, maxR, maxH, cx, cy };
  }

  window.Kin = { DEG, maxExt, sectionOuts, loadSize, solve, capacity, collisions, envelope };
})();
