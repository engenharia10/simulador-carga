/* Aplicação: estado, controles gerados a partir do modelo, limitador de momento, HUD e loop. */
(function () {
  'use strict';
  const DEG = Math.PI / 180;
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const fmtKg = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('pt-BR') : '—');
  const clone = o => JSON.parse(JSON.stringify(o));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // [aumenta, diminui]
  const KEYMAP = {
    slew: ['Z', 'X'],
    angle: [['Q', 'A'], ['W', 'S'], ['E', 'D'], ['I', 'K']],
    ext: [['R', 'F'], ['T', 'G'], ['O', 'L']],
    cable: ['J', 'U']
  };

  let model, env, st, tgt, dofs = [], scene3d, diagram, ui = {};
  const keys = new Set();
  const settings = { limiter: true, speed: 3 };
  let blockedUntil = 0, blockedMsg = '';
  const pend = { ux: 0, uz: 0, vx: 0, vz: 0, prev: null, pvx: 0, pvz: 0 };
  let lastEv = null, lastHookW = new THREE.Vector3();

  /* ------------------------------------------------------------ avaliação */
  function evaluate(s) {
    const kin = Kin.solve(model, s);
    const cap = Kin.capacity(model, kin, s);
    const susp = kin.grounded ? 0 : s.load;
    const util = susp <= 0 ? 0 : cap.cap > 0 ? susp / cap.cap : 99;
    return { kin, cap, susp, util, moment: susp * kin.radius, col: Kin.collisions(model, kin, s) };
  }

  /** Motivo de bloqueio do movimento. Colisões físicas bloqueiam sempre; capacidade só com o limitador ligado. */
  function blockReason(cur, nxt, limiter) {
    if (nxt.col.count > cur.col.count) return 'Movimento bloqueado · colisão (' + nxt.col.what + ')';
    // carga/gancho sendo empurrado contra o caminhão (a superfície embaixo "subiu" com a carga encostada)
    if (nxt.kin.grounded && nxt.kin.floor > cur.kin.floor + 0.05) return 'Movimento bloqueado · colisão (carga × ' + nxt.kin.restOn + ')';
    if (!limiter) return null;
    if (nxt.util > 1 && (nxt.util > cur.util + 1e-6 || nxt.moment > cur.moment + 1e-3)) {
      // motivo real do bloqueio
      if (!nxt.cap.inChart) {
        const rMax = model.loadChart.points[model.loadChart.points.length - 1].r;
        return `Limitador atuou · raio máximo do diagrama (${rMax.toFixed(1).replace('.', ',')} m)`;
      }
      if (nxt.cap.reason) return 'Limitador atuou · ' + nxt.cap.reason.toLowerCase();
      return `Limitador atuou · sobrecarga (${Math.round(nxt.util * 100)}% da capacidade)`;
    }
    return null;
  }

  /* --------------------------------------------------------------- modelo */
  function loadModel(id) {
    model = CraneModels.get(id);
    $('#modelSelect').value = id;
    $('#modelDesc').textContent = model.description || '';
    env = Kin.envelope(model);

    st = {
      slew: 0,
      angles: model.booms.map(b => clamp(0, b.angle.min, b.angle.max)),
      ext: model.booms.map(() => 0),
      cable: 1.5, load: model.defaultLoad, outrigger: 1, extMode: 'seq'
    };
    const pr = model.presets.find(p => p.name === model.defaultPreset) || model.presets[0];
    if (pr) applyPreset(st, pr);
    tgt = clone(st);

    buildDofs();
    buildControls();
    scene3d.build(model);
    diagram.setModel(model, env);

    const img = $('#chartImg'), btn = $('#btnChartImg');
    img.hidden = true; btn.classList.remove('on');
    if (model.chartImage) { img.src = model.chartImage; btn.hidden = false; } else btn.hidden = true;

    // parâmetros de URL: ?preset=Transporte&carga=3000&giro=90&vista=lateral
    const q = new URLSearchParams(location.search);
    let view = '3d';
    if (!loadModel.used) {
      loadModel.used = true;
      const p = q.get('preset') && model.presets.find(x => x.name.toLowerCase() === q.get('preset').toLowerCase());
      if (p) applyPreset(st, p);
      if (q.has('carga')) st.load = clamp(+q.get('carga') || 0, 0, model.maxLoad);
      if (q.has('giro')) st.slew = clamp(+q.get('giro') || 0, model.column.slew.min, model.column.slew.max);
      if (q.get('patolas') === '0') st.outrigger = 0;
      if (q.has('vista')) view = q.get('vista');
      tgt = clone(st);
      buildControls();
    }

    Object.assign(pend, { ux: 0, uz: 0, vx: 0, vz: 0, prev: null, pvx: 0, pvz: 0 });
    lastEv = evaluate(st);
    lastHookW.set(model.column.x + lastEv.kin.hook.x * Math.cos(st.slew * DEG), lastEv.kin.hook.y, -lastEv.kin.hook.x * Math.sin(st.slew * DEG));
    setView(view, true);
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// */ }
  }

  function applyPreset(s, p) {
    if (p.slew != null) s.slew = clamp(p.slew, model.column.slew.min, model.column.slew.max);
    (p.angles || []).forEach((a, i) => { const b = model.booms[i]; if (b) s.angles[i] = clamp(a, b.angle.min, b.angle.max); });
    (p.ext || []).forEach((e, i) => { const b = model.booms[i]; if (b) s.ext[i] = clamp(e, 0, Kin.maxExt(b)); });
    if (p.cable != null) s.cable = clamp(p.cable, 0, model.winch.maxCable);
  }

  function buildDofs() {
    const c = model.column;
    dofs = [{
      id: 'slew', label: 'Giro', min: c.slew.min, max: c.slew.max, step: 0.5, unit: '°', dec: 1, speed: c.slew.speed,
      get: s => s.slew, set: (s, v) => { s.slew = v; }, keys: KEYMAP.slew
    }];
    let ek = 0;
    model.booms.forEach((b, i) => {
      dofs.push({
        id: 'a' + i, label: b.relative ? 'Ângulo relativo' : 'Ângulo', min: b.angle.min, max: b.angle.max, step: 0.5, unit: '°', dec: 1,
        speed: b.speed, get: s => s.angles[i], set: (s, v) => { s.angles[i] = v; }, keys: KEYMAP.angle[i], boom: i, rel: !!b.relative
      });
      const mx = Kin.maxExt(b);
      if (mx > 0) dofs.push({
        id: 'e' + i, label: 'Extensão', min: 0, max: mx, step: 0.01, unit: 'm', dec: 2,
        speed: b.extSpeed, get: s => s.ext[i], set: (s, v) => { s.ext[i] = v; }, keys: KEYMAP.ext[ek++], boom: i
      });
    });
    dofs.push({
      id: 'cable', label: 'Cabo (desce / sobe)', min: 0.2, max: model.winch.maxCable, step: 0.05, unit: 'm', dec: 2,
      speed: model.winch.speed, get: s => s.cable, set: (s, v) => { s.cable = v; }, keys: KEYMAP.cable
    });
    dofs.push({
      id: 'outrigger', hidden: true, min: 0, max: 1, speed: 1 / model.stabilizerTime,
      get: s => s.outrigger, set: (s, v) => { s.outrigger = v; }
    });
  }
  const dof = id => dofs.find(d => d.id === id);

  /* ------------------------------------------------------------ controles */
  function buildControls() {
    const host = $('#controls');
    host.innerHTML = '';
    ui = { sliders: [], secBars: [], abs: [] };
    let n = 1;
    const sec = (title, extra) => {
      const s = el('section', 'grp');
      s.style.setProperty('--d', (n * 60) + 'ms');
      s.appendChild(el('h3', null, `<span class="num">${String(n++).padStart(2, '0')}</span>${title}${extra ? `<em>${extra}</em>` : ''}`));
      host.appendChild(s);
      return s;
    };

    // giro, ângulos e extensões das lanças ficam no "Comando rápido" (buildQuick)

    const sw = sec('Carga');
    // guincho (cabo) fica no "Comando rápido"
    addLoad(sw);

    const so = sec('Operação');
    const outBtn = el('button', 'btn wide', '');
    outBtn.addEventListener('click', () => { tgt.outrigger = tgt.outrigger > 0.5 ? 0 : 1; });
    ui.outBtn = outBtn;
    so.appendChild(rowWith('Patolas', outBtn));

    const lim = el('button', 'btn switch', '');
    lim.addEventListener('click', () => { settings.limiter = !settings.limiter; });
    ui.limBtn = lim;
    so.appendChild(rowWith('Limitador de momento', lim));

    if (model.booms.some(b => b.extensions.length > 1)) {
      so.appendChild(rowWith('Extensões', segCtl([['seq', 'Sequencial'], ['sync', 'Sincronizado']], () => tgt.extMode, v => { st.extMode = tgt.extMode = v; })));
    }
    so.appendChild(rowWith('Velocidade', segCtl([[1, '1×'], [3, '3×'], [10, '10×']], () => settings.speed, v => { settings.speed = v; })));

    const sp = sec('Posições');
    const grid = el('div', 'presets');
    model.presets.forEach(p => {
      const b = el('button', 'btn', p.name);
      b.addEventListener('click', () => applyPreset(tgt, p));
      grid.appendChild(b);
    });
    sp.appendChild(grid);

    const sk = sec('Teclado');
    const list = el('div', 'keylist');
    dofs.filter(d => d.keys).forEach(d => {
      const name = d.boom != null ? `${model.booms[d.boom].name} · ${d.label}` : d.label;
      list.appendChild(el('div', null, `<span><kbd>${d.keys[0]}</kbd><kbd>${d.keys[1]}</kbd></span><span>${name}</span>`));
    });
    list.appendChild(el('div', null, `<span><kbd>←</kbd><kbd>→</kbd></span><span>Giro</span>`));
    list.appendChild(el('div', null, `<span><kbd>P</kbd></span><span>Patolas</span>`));
    sk.appendChild(list);

    buildQuick();
    requestAnimationFrame(quickApply);
  }

  /** Painel compacto sobre a cena: alavancas verticais de ângulo e extensão por lança. */
  function buildQuick() {
    const body = $('#quickBody');
    body.innerHTML = '';
    let lastGroup = null;
    dofs.filter(d => d.id === 'slew' || d.boom != null).forEach(d => {
      const isSlew = d.id === 'slew';
      const isExt = d.id[0] === 'e';
      const group = isSlew ? 'slew' : d.boom;
      const col = el('div', 'lever' + (lastGroup !== null && group !== lastGroup ? ' sep' : ''));
      lastGroup = group;
      const keys = d.keys ? `<span class="keys"><kbd>${d.keys[0]}</kbd><kbd>${d.keys[1]}</kbd></span>` : '';
      col.title = isSlew ? 'Giro da coluna' : `${model.booms[d.boom].name} · ${d.label}`;
      const tag = isSlew ? '<b>GIRO</b><small>COL</small>' : `<b>L${d.boom + 1}</b><small>${isExt ? 'EXT' : 'ÂNG'}</small>`;
      col.innerHTML = `${tag}
        <output class="ctl-val"></output>
        <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" aria-label="${col.title}">
        ${keys}`;
      const input = col.querySelector('input'), out = col.querySelector('output');
      input.value = d.get(tgt);
      input.addEventListener('input', () => d.set(tgt, parseFloat(input.value)));
      body.appendChild(col);
      ui.sliders.push({ d, input, out, row: col, sub: null });
    });

    // guincho: alavanca invertida (para cima = sobe a carga) + botões de segurar
    const dc = dof('cable');
    const wc = el('div', 'lever sep winch');
    wc.title = 'Guincho — sobe / desce a carga (teclas U / J)';
    wc.innerHTML = `<b>GUINCHO</b><small>CABO</small>
      <output class="ctl-val"></output>
      <input type="range" min="${dc.min}" max="${dc.max}" step="${dc.step}" aria-label="Guincho: comprimento do cabo">
      <span class="keys"><button class="step hold" data-k="${dc.keys[1]}" title="Subir carga (segure) — tecla ${dc.keys[1]}">▲</button><button class="step hold" data-k="${dc.keys[0]}" title="Descer carga (segure) — tecla ${dc.keys[0]}">▼</button></span>`;
    const win = wc.querySelector('input');
    win.value = dc.max + dc.min - dc.get(tgt);
    win.addEventListener('input', () => dc.set(tgt, dc.max + dc.min - parseFloat(win.value)));
    wc.querySelectorAll('.hold').forEach(b => {
      const k = b.dataset.k.toUpperCase();
      const on = e => { e.preventDefault(); keys.add(k); b.classList.add('on'); };
      const off = () => { keys.delete(k); b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, off));
    });
    body.appendChild(wc);
    ui.sliders.push({ d: dc, input: win, out: wc.querySelector('output'), row: wc, sub: null, inv: true });

    // carga (peso no gancho)
    const lc = el('div', 'lever sep load');
    lc.title = 'Carga no gancho (kg)';
    lc.innerHTML = `<b>CARGA</b><small>KG</small>
      <output class="ctl-val"></output>
      <input type="range" min="0" max="${model.maxLoad}" step="10" aria-label="Carga no gancho">
      <span class="keys"><button class="step" data-d="-50" title="−50 kg">−</button><button class="step" data-d="50" title="+50 kg">+</button></span>`;
    const lin = lc.querySelector('input');
    lin.addEventListener('input', () => setLoad(parseFloat(lin.value)));
    lc.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => setLoad(st.load + +b.dataset.d)));
    body.appendChild(lc);
    ui.quickLoad = { input: lin, out: lc.querySelector('output') };
  }

  /* ---------------------------------------------- comando rápido: mover / redimensionar */
  const QP_KEY = 'simuladorCarga.quickPanel.v2';
  const qp = { x: null, y: null, s: 1 };

  function quickApply() {
    const el = $('#quick'), wrap = el.parentElement;
    if (!el.offsetWidth) return;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (qp.x == null || qp.y == null) {           // posição padrão (definida no CSS)
      const r = el.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      qp.x = r.left - wr.left; qp.y = r.top - wr.top;
    }
    qp.s = clamp(qp.s, 0.6, Math.max(0.6, Math.min(2.5, W / el.offsetWidth, H / el.offsetHeight)));
    const w = el.offsetWidth * qp.s, h = el.offsetHeight * qp.s;
    qp.x = clamp(qp.x, 0, Math.max(0, W - w));
    qp.y = clamp(qp.y, 0, Math.max(0, H - h));
    Object.assign(el.style, { left: qp.x + 'px', top: qp.y + 'px', right: 'auto', bottom: 'auto', scale: String(qp.s), transformOrigin: '0 0' });
  }

  function quickSave() { try { localStorage.setItem(QP_KEY, JSON.stringify(qp)); } catch (e) { /* sem storage */ } }

  function initQuickPanel() {
    const el = $('#quick'), head = el.querySelector('header');
    try { const sv = JSON.parse(localStorage.getItem(QP_KEY) || 'null'); if (sv) Object.assign(qp, sv); } catch (e) { /* sem storage */ }
    head.title = 'Arraste para mover · duplo clique restaura posição e tamanho';
    ['tl', 'tr', 'bl', 'br'].forEach(c => {
      const h = el.appendChild(document.createElement('span'));
      h.className = 'qrs ' + c; h.dataset.c = c; h.title = 'Arraste para redimensionar';
    });
    let op = null;
    const start = (e, mode, c) => {
      e.preventDefault();
      op = { mode, c, px: e.clientX, py: e.clientY, x: qp.x, y: qp.y, s: qp.s, w0: el.offsetWidth, h0: el.offsetHeight };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro sintético */ }
      el.classList.add(mode === 'drag' ? 'dragging' : 'resizing');
    };
    head.addEventListener('pointerdown', e => { if (e.button === 0 && !e.target.closest('button')) start(e, 'drag'); });
    el.querySelectorAll('.qrs').forEach(h => h.addEventListener('pointerdown', e => { e.stopPropagation(); start(e, 'resize', h.dataset.c); }));
    el.addEventListener('pointermove', e => {
      if (!op) return;
      const dx = e.clientX - op.px, dy = e.clientY - op.py;
      if (op.mode === 'drag') { qp.x = op.x + dx; qp.y = op.y + dy; }
      else {
        const { c, w0, h0, s } = op, w = w0 * s, h = h0 * s;
        const left = c[1] === 'l', top = c[0] === 't';
        const ns = clamp(Math.max((w + (left ? -dx : dx)) / w0, (h + (top ? -dy : dy)) / h0), 0.6, 2.5);
        const ax = left ? op.x + w : op.x, ay = top ? op.y + h : op.y;   // canto oposto fica fixo
        qp.s = ns; qp.x = left ? ax - w0 * ns : ax; qp.y = top ? ay - h0 * ns : ay;
      }
      quickApply();
    });
    const end = () => { if (!op) return; op = null; el.classList.remove('dragging', 'resizing'); quickSave(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    head.addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      el.style.cssText = ''; qp.x = qp.y = null; qp.s = 1;
      quickApply(); quickSave();
    });
    window.addEventListener('resize', quickApply);
  }

  function setLoad(v) {
    v = clamp(Math.round(v) || 0, 0, model.maxLoad);
    st.load = tgt.load = v;
  }

  function rowWith(label, ctl) {
    const r = el('div', 'row');
    r.appendChild(el('span', 'ctl-label', label));
    r.appendChild(ctl);
    return r;
  }

  function segCtl(opts, get, set) {
    const w = el('div', 'seg-ctl');
    const btns = opts.map(([v, t]) => {
      const b = el('button', 'btn', t);
      b.addEventListener('click', () => { set(v); sync(); });
      w.appendChild(b);
      return [v, b];
    });
    const sync = () => btns.forEach(([v, b]) => b.classList.toggle('on', get() === v));
    sync();
    return w;
  }

  function addSlider(parent, d) {
    const row = el('div', 'ctl');
    const keys = d.keys ? `<span class="keys"><kbd>${d.keys[0]}</kbd><kbd>${d.keys[1]}</kbd></span>` : '';
    row.innerHTML = `<div class="ctl-head"><span class="ctl-label">${d.label}</span>${keys}<output class="ctl-val"></output></div>
      <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" aria-label="${d.label}">
      ${d.rel ? '<div class="ctl-sub"></div>' : ''}`;
    const input = row.querySelector('input'), out = row.querySelector('output'), sub = row.querySelector('.ctl-sub');
    input.value = d.get(tgt);
    input.addEventListener('input', () => d.set(tgt, parseFloat(input.value)));
    parent.appendChild(row);
    ui.sliders.push({ d, input, out, row, sub });
  }

  function addSecBar(parent, i, b) {
    const w = el('div', 'secbar');
    const cells = b.extensions.map((s, k) => {
      const c = el('div', 'cell', `<span></span><b>${k + 1}</b>`);
      c.style.flex = s;
      c.title = `Extensão ${k + 1}: ${s.toFixed(2)} m`;
      w.appendChild(c);
      return { fill: c.querySelector('span'), s, c };
    });
    parent.appendChild(w);
    ui.secBars.push({ i, cells });
  }

  function addLoad(parent) {
    const row = el('div', 'ctl');
    row.innerHTML = `<div class="ctl-head"><span class="ctl-label">Carga no gancho</span>
      <span class="num-in"><input type="number" min="0" max="${model.maxLoad}" step="10"><i>kg</i></span></div>
      <input type="range" min="0" max="${model.maxLoad}" step="10" aria-label="Carga">
      <div class="chips"></div>`;
    const num = row.querySelector('input[type=number]'), rng = row.querySelector('input[type=range]');
    const set = setLoad;
    num.addEventListener('change', () => set(parseFloat(num.value)));
    rng.addEventListener('input', () => set(parseFloat(rng.value)));
    const chips = row.querySelector('.chips');
    [0, ...model.loadChart.points.map(p => p.kg)].forEach(kg => {
      const b = el('button', 'chip', kg ? fmtKg(kg) : 'sem carga');
      b.title = kg ? 'Carga nominal do diagrama' : '';
      b.addEventListener('click', () => set(kg));
      chips.appendChild(b);
    });
    set(st.load);
    ui.loadRng = rng; ui.loadNum = num;
    parent.appendChild(row);
  }

  /* ------------------------------------------------------------- simulação */
  function applyKeys(dt) {
    dofs.forEach(d => {
      if (!d.keys) return;
      let up = keys.has(d.keys[0]), dn = keys.has(d.keys[1]);
      if (d.id === 'slew') { up = up || keys.has('ARROWLEFT'); dn = dn || keys.has('ARROWRIGHT'); }
      if (up === dn) return;
      const v = d.get(tgt) + (up ? 1 : -1) * d.speed * settings.speed * dt;
      d.set(tgt, clamp(v, d.min, d.max));
    });
  }

  function stepDofs(dt) {
    let cur = evaluate(st);
    for (const d of dofs) {
      const a = d.get(st), t = d.get(tgt);
      if (a === t) continue;
      const step = d.speed * settings.speed * dt;
      const v = Math.abs(t - a) <= step ? t : a + Math.sign(t - a) * step;
      d.set(st, v);
      const nxt = evaluate(st);
      // batente do raio de ação: não passa do raio máximo do diagrama (sem alarme, sempre ativo)
      const rMax = model.loadChart.points[model.loadChart.points.length - 1].r + 0.05;
      if (nxt.kin.radius > rMax && nxt.kin.radius > cur.kin.radius + 1e-9) {
        // olha à frente: se continuar o mesmo movimento reduz o raio (ex.: subir a lança 1 quando ela
        // está abaixo da horizontal empurra a ponta alguns mm para fora antes de recuar), deixa passar
        const look = clone(st);
        d.set(look, clamp(a + Math.sign(t - a) * d.speed * 0.5, d.min, d.max));
        const trendsIn = Kin.solve(model, look).radius < cur.kin.radius - 1e-6 && nxt.kin.radius < rMax + 0.05;
        if (!trendsIn) { d.set(st, a); d.set(tgt, a); continue; }
      }
      const why = blockReason(cur, nxt, settings.limiter);
      if (why) {
        d.set(st, a); d.set(tgt, a);
        blockedUntil = performance.now() + 2000;
        blockedMsg = why;
      } else cur = nxt;
    }
    return cur;
  }

  function pendulum(ev, dt) {
    const s = st.slew * DEG, cs = Math.cos(s), sn = Math.sin(s), cx = model.column.x;
    const t = ev.kin.tip;
    const tipW = new THREE.Vector3(cx + t.x * cs, t.y, -t.x * sn);
    const L = Math.max(0.4, ev.kin.cableEff + model.hook.blockHeight + (st.load > 0 ? model.hook.slingLength + ev.kin.loadH / 2 : 0));
    if (pend.prev && dt > 0) {
      const vx = (tipW.x - pend.prev.x) / dt, vz = (tipW.z - pend.prev.z) / dt;
      const ax = clamp((vx - pend.pvx) / dt, -6, 6), az = clamp((vz - pend.pvz) / dt, -6, 6);
      pend.pvx = vx; pend.pvz = vz;
      if (ev.kin.grounded) { pend.ux = pend.uz = pend.vx = pend.vz = 0; }
      else {
        const w2 = 9.81 / L, damp = 0.45;
        pend.vx += (-w2 * pend.ux - ax - damp * pend.vx) * dt; pend.ux += pend.vx * dt;
        pend.vz += (-w2 * pend.uz - az - damp * pend.vz) * dt; pend.uz += pend.vz * dt;
        const lim = 0.35 * L;
        pend.ux = clamp(pend.ux, -lim, lim); pend.uz = clamp(pend.uz, -lim, lim);
      }
    }
    pend.prev = tipW.clone();
    const f = ev.kin.cableEff / L;
    const hookW = new THREE.Vector3(tipW.x + pend.ux * f, ev.kin.hook.y, tipW.z + pend.uz * f);
    return { tipW, hookW };
  }

  /* ------------------------------------------------------------------- HUD */
  function refreshUI(ev, now) {
    const kin = ev.kin;
    ui.sliders.forEach(({ d, input, out, row, sub, inv }) => {
      const tv = d.get(tgt), av = d.get(st);
      const sv = inv ? d.max + d.min - tv : tv;
      if (Math.abs(parseFloat(input.value) - sv) > 1e-6) input.value = sv;
      input.style.setProperty('--p', ((sv - d.min) / (d.max - d.min) * 100) + '%');
      out.innerHTML = fmt(av, d.dec) + `<i>${d.unit}</i>`;
      row.classList.toggle('moving', Math.abs(tv - av) > 1e-3);
      if (sub) sub.textContent = `absoluto ${fmt(kin.booms[d.boom].abs, 1)}° · comprimento ${fmt(kin.booms[d.boom].len, 2)} m`;
    });
    ui.secBars.forEach(({ i, cells }) => cells.forEach((c, k) => {
      const o = kin.booms[i].outs[k] || 0;
      c.fill.style.width = (o / c.s * 100) + '%';
      c.c.classList.toggle('active', o > 0.02);
    }));
    // carga: mantém painel lateral e comando rápido sincronizados
    const lp = (st.load / model.maxLoad * 100) + '%';
    [ui.loadRng, ui.quickLoad && ui.quickLoad.input].forEach(r => {
      if (!r) return;
      if (+r.value !== st.load) r.value = st.load;
      r.style.setProperty('--p', lp);
    });
    if (ui.loadNum && document.activeElement !== ui.loadNum && +ui.loadNum.value !== st.load) ui.loadNum.value = st.load;
    if (ui.quickLoad) ui.quickLoad.out.innerHTML = fmtKg(st.load);

    const outState = st.outrigger >= 0.999 ? 'ext' : st.outrigger <= 0.001 ? 'ret' : 'mov';
    ui.outBtn.textContent = tgt.outrigger > 0.5 ? (outState === 'ext' ? 'Estendidas · recolher' : 'Estendendo…') : (outState === 'ret' ? 'Recolhidas · estender' : 'Recolhendo…');
    ui.outBtn.classList.toggle('on', outState === 'ext');
    ui.limBtn.textContent = settings.limiter ? 'Ligado' : 'Desligado';
    ui.limBtn.classList.toggle('on', settings.limiter);

    const lb = kin.booms[kin.booms.length - 1];
    $('#roRadius').textContent = fmt(kin.radius);
    $('#roHeight').textContent = fmt(kin.hook.y);
    $('#roTip').textContent = fmt(lb.ey);
    $('#roAngle').textContent = fmt(lb.abs, 1);
    const capShow = ev.cap.reason ? (ev.cap.inChart && ev.cap.chartCap ? ev.cap.chartCap : NaN) : ev.cap.cap;
    $('#roCap').textContent = fmtKg(capShow);
    $('#roCapNote').textContent = ev.cap.reason ? (ev.cap.inChart ? 'bloqueado' : 'fora') : ev.cap.maxed ? 'máx.' : '';
    $('#roLoad').textContent = fmtKg(st.load);
    $('#roLoadNote').textContent = st.load <= 0 ? '' : kin.grounded ? (kin.restOn === 'solo' ? 'apoiada' : (kin.restOn === 'chassi' ? 'no ' : 'na ') + kin.restOn) : 'suspensa';
    $('#roMoment').textContent = fmtKg(ev.moment);
    $('#roMomentRated').textContent = ev.cap.rated ? fmtKg(ev.cap.rated) : '—';

    const u = ev.util;
    const lvl = ev.col.count || u > 1 || (ev.susp > 0 && ev.cap.reason) ? 'danger' : u > 0.9 ? 'warn' : 'ok';
    $('#roUtil').textContent = u >= 99 ? '—' : Math.round(u * 100) + '%';
    const fill = $('#utilFill');
    fill.style.width = Math.min(100, u / 1.2 * 100) + '%';
    fill.className = lvl;
    $('#hud').dataset.level = lvl;

    const flags = [];
    flags.push(outState === 'ext' ? ['ok', 'PATOLAS OK'] : outState === 'ret' ? ['warn', 'PATOLAS RECOLHIDAS'] : ['warn', 'PATOLAS EM MOVIMENTO']);
    flags.push(settings.limiter ? ['ok', 'LIMITADOR ON'] : ['danger', 'LIMITADOR OFF']);
    const mbe = model.loadChart.momentByExtension;
    const eb = mbe ? kin.booms[mbe.boom] : kin.booms.find(b => b.outs.length);
    if (eb) flags.push(['', `EXT ${eb.outs.filter(o => o > 0.02).length}/${eb.outs.length}`]);
    flags.push(['', st.extMode === 'sync' ? 'SINCRONIZADO' : 'SEQUENCIAL']);
    const rLim = model.loadChart.points[model.loadChart.points.length - 1].r;
    if (kin.radius >= rLim - 0.03) flags.push(['', 'RAIO MÁX. ' + rLim.toFixed(1).replace('.', ',') + ' m']);
    const fh = flags.map(([c, t]) => `<span class="flag ${c}">${t}</span>`).join('');
    if (ui.flagsHtml !== fh) { $('#flags').innerHTML = fh; ui.flagsHtml = fh; }

    // alarme
    let al = null, msg = '';
    if (ev.col.count) { al = 'danger'; msg = 'Colisão · ' + ev.col.what; }
    else if (ev.susp > 0 && ev.cap.reason) { al = 'danger'; msg = ev.cap.reason; }
    else if (u > 1) { al = 'danger'; msg = `Sobrecarga · ${Math.round(u * 100)}% da capacidade`; }
    else if (now < blockedUntil) { al = 'warn'; msg = blockedMsg; }
    else if (u > 0.9) { al = 'warn'; msg = `Próximo ao limite · ${Math.round(u * 100)}%`; }
    const A = $('#alarm');
    A.hidden = !al;
    if (al) { A.className = 'alarm ' + al; $('#alarmText').textContent = msg; }
    document.body.classList.toggle('danger', al === 'danger');
  }

  /* ---------------------------------------------------------------- views */
  function viewInfo() {
    const v = model.vehicle;
    return {
      maxR: env.maxR, maxH: env.maxH, cx: model.column.x, width: v.width, hook: lastHookW.clone(),
      cab: v.cab, truckX: (v.frontX + v.rearX) / 2, truckY: ((v.cab ? v.cab.top : 2.5) + 0.3) / 2   // centro do caminhão
    };
  }
  function setView(name, instant) {
    document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
    scene3d.setView(name, viewInfo(), instant);
  }

  /* ----------------------------------------------------------------- loop */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    applyKeys(dt);
    const ev = stepDofs(dt);
    lastEv = ev;
    const { tipW, hookW } = pendulum(ev, dt);
    lastHookW.copy(hookW);
    scene3d.update(model, st, ev, tipW, hookW, now / 1000);
    diagram.draw(st, ev);
    refreshUI(ev, now);
    scene3d.tick(dt, hookW);
    requestAnimationFrame(loop);
  }

  function onKey(e, down) {
    const t = e.target;
    if (t && (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range'))) return;
    const k = e.key.toUpperCase();
    if (t && t.type === 'range' && k.startsWith('ARROW')) return;
    if (down && k === 'P' && !e.repeat) { tgt.outrigger = tgt.outrigger > 0.5 ? 0 : 1; return; }
    if (down) keys.add(k); else keys.delete(k);
    if (k.startsWith('ARROW')) e.preventDefault();
  }

  function init() {
    if (!window.THREE || !THREE.OrbitControls) {
      document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif;color:#fff">Não foi possível carregar o Three.js (verifique a conexão com a internet).</p>';
      return;
    }
    scene3d = new CraneScene($('#viewport'));
    diagram = new LoadDiagram($('#diagram'));

    const sel = $('#modelSelect');
    CraneModels.all().forEach(m => sel.appendChild(el('option', null, m.name)).value = m.id);
    sel.addEventListener('change', () => loadModel(sel.value));
    document.querySelectorAll('#views button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#btnChartImg').addEventListener('click', () => {
      const img = $('#chartImg'); img.hidden = !img.hidden;
      $('#btnChartImg').classList.toggle('on', !img.hidden);
      $('#btnChartImg').textContent = img.hidden ? 'ver original' : 'ver ao vivo';
    });
    $('#quickToggle').addEventListener('click', () => {
      const q = $('#quick');
      q.classList.toggle('min');
      $('#quickToggle').textContent = q.classList.contains('min') ? '+' : '–';
      quickApply();
    });
    // duplo clique na cena: recentraliza a vista atual no caminhão
    $('#viewport').addEventListener('dblclick', () => setView(scene3d.view === 'gancho' || scene3d.view === 'operador' ? '3d' : scene3d.view));
    window.addEventListener('keydown', e => onKey(e, true));
    window.addEventListener('keyup', e => onKey(e, false));
    window.addEventListener('blur', () => keys.clear());

    const hash = decodeURIComponent(location.hash.slice(1));
    initQuickPanel();
    loadModel(CraneModels.get(hash) ? hash : CraneModels.all()[0].id);
    requestAnimationFrame(t => { last = t; loop(t); });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
