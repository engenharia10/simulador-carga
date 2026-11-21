/* Diagrama de carga 2D ao vivo (plano da lança) — desenhado em <canvas>. */
(function () {
  'use strict';
  const DEG = Math.PI / 180;
  const COL = {
    bg: '#0e1114', gridMin: '#171c21', gridMaj: '#242c34', label: '#5d6873',
    env: '#46c7d8', ray: 'rgba(70,199,216,.22)', ground: '#6b7680',
    boom: '#f2b100', ext: '#ffd66b', truck: '#232a31', truckLine: '#36414b',
    ok: '#39d98a', warn: '#ffb020', danger: '#ff3b30', text: '#d8dde2'
  };

  class LoadDiagram {
    constructor(canvas) { this.c = canvas; this.ctx = canvas.getContext('2d'); }

    setModel(model, env) {
      this.model = model; this.env = env;
      const pts = model.loadChart.points;
      const v = model.vehicle;
      this.xMin = Math.min(-2.5, v.frontX - model.column.x - 0.3);
      this.xMax = Math.max(env.maxR, pts[pts.length - 1].r) + 1.0;
      this.yMin = -2.2;
      this.yMax = env.maxH + 0.9;
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
      this.W = r.width; this.H = r.height; this.dpr = dpr;
    }

    draw(st, ev) {
      if (!this.model) return;
      this.resize();
      const { ctx, W, H, model: m, env } = this;
      if (W < 10 || H < 10) return;
      const kin = ev.kin, pts = m.loadChart.points, c = m.column, v = m.vehicle;
      const { xMin, xMax, yMin, yMax } = this;
      const k = Math.min((W - 16) / (xMax - xMin), (H - 16) / (yMax - yMin));
      const left = (W - (xMax - xMin) * k) / 2, bottom = (H + (yMax - yMin) * k) / 2;
      const X = x => left + (x - xMin) * k, Y = y => bottom - (y - yMin) * k;
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      const stateCol = ev.col.count || ev.util > 1 || (ev.susp > 0 && ev.cap.reason) ? COL.danger : ev.util > 0.9 ? COL.warn : COL.ok;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);

      // grade 1 m
      ctx.lineWidth = 1;
      for (let x = Math.ceil(xMin); x <= xMax; x++) { ctx.strokeStyle = x % 5 === 0 ? COL.gridMaj : COL.gridMin; line(X(x) + .5, Y(0), X(x) + .5, Y(yMax)); }
      for (let y = 0; y <= yMax; y++) { ctx.strokeStyle = y % 5 === 0 ? COL.gridMaj : COL.gridMin; line(X(xMin), Y(y) + .5, X(xMax), Y(y) + .5); }
      ctx.fillStyle = COL.label; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      for (let y = 2; y <= yMax; y += 2) ctx.fillText(y, X(xMin) + 3, Y(y) - 2);

      // faixa do intervalo ativo
      const r = kin.radius;
      const ai = ev.cap.idx;
      if (ai >= 0) {
        const x0 = ai === 0 ? c.pivotOffset : pts[ai - 1].r;
        ctx.fillStyle = 'rgba(242,177,0,.07)';
        ctx.fillRect(X(x0), Y(yMax), (pts[ai].r - x0) * k, (yMax) * k);
      }

      // raios angulares e envelope
      const cx = env.cx, cy = env.cy;
      ctx.strokeStyle = COL.ray; ctx.fillStyle = 'rgba(70,199,216,.55)'; ctx.font = '9px "JetBrains Mono", monospace';
      for (let a = 0; a <= 80; a += 10) {
        const b = env.bins[a]; if (!b) continue;
        line(X(cx), Y(cy), X(b.x), Y(b.y));
        ctx.fillText(a + '°', X(b.x) + 3, Y(b.y) - 2);
      }
      ctx.setLineDash([4, 3]); ctx.strokeStyle = COL.env; ctx.lineWidth = 1.2;
      ctx.beginPath(); env.pts.forEach((p, j) => j ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))); ctx.stroke();
      ctx.setLineDash([]);

      // linhas de raio nominal + tabela
      let minGap = Infinity;
      for (let j = 1; j < pts.length; j++) minGap = Math.min(minGap, (pts[j].r - pts[j - 1].r) * k);
      const stagger = minGap < 34;
      pts.forEach((p, j) => {
        const on = j === ai;
        const ly = stagger && j % 2 ? -0.95 : -0.25;
        ctx.strokeStyle = on ? COL.boom : '#34404a'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        line(X(p.r) + .5, Y(0), X(p.r) + .5, Y(yMax - 0.4)); ctx.setLineDash([]);
        const label = p.kg >= 10000 ? (p.kg / 1000).toFixed(1) + 't' : String(p.kg);
        ctx.font = '600 9px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        const tw = ctx.measureText(label).width + 6;
        ctx.fillStyle = on ? COL.boom : '#1c232a'; ctx.fillRect(X(p.r) - tw / 2, Y(ly) - 1, tw, 12);
        ctx.fillStyle = on ? '#111' : COL.text; ctx.fillText(label, X(p.r), Y(ly) + 8);
        ctx.fillStyle = COL.label; ctx.font = '9px "JetBrains Mono", monospace';
        if (!stagger || j % 2 === 0 || on) ctx.fillText(p.r.toFixed(1), X(p.r), Y(stagger ? -1.75 : -1.25) + 6);
      });
      ctx.textAlign = 'left';

      // solo
      ctx.strokeStyle = COL.ground; ctx.lineWidth = 1.5; line(X(xMin), Y(0), X(xMax), Y(0));

      // caminhão projetado no plano da lança
      const s = st.slew * DEG, cs = Math.cos(s), sn = Math.sin(s), ccx = c.x;
      const proj = (x0, x1, w) => {
        const a = [x0, x1].flatMap(x => [-w / 2, w / 2].map(z => (x - ccx) * cs - z * sn));
        return [Math.min(...a), Math.max(...a)];
      };
      const rect = (a, b, y0, y1) => { ctx.fillRect(X(a), Y(y1), (b - a) * k, (y1 - y0) * k); ctx.strokeRect(X(a) + .5, Y(y1) + .5, (b - a) * k, (y1 - y0) * k); };
      ctx.fillStyle = COL.truck; ctx.strokeStyle = COL.truckLine; ctx.lineWidth = 1;
      if (v.bed) { const [a, b] = proj(v.bed.x0, v.bed.x1, v.width); rect(a, b, v.frameTop - 0.3, v.bed.top); }
      if (v.cab) { const [a, b] = proj(v.cab.x0, v.cab.x1, v.cab.width); rect(a, b, 0.7, v.cab.top); }
      v.axles.forEach(ax => [-1, 1].forEach(sd => {
        const px = (ax.x - ccx) * cs - sd * (v.track / 2) * sn;
        ctx.beginPath(); ctx.arc(X(px), Y(v.wheelRadius), v.wheelRadius * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }));
      ctx.fillStyle = '#7a5d00'; ctx.fillRect(X(-c.width / 2), Y(c.pivotHeight + 0.2), c.width * k, (c.pivotHeight + 0.2 - c.baseHeight) * k);

      // lanças
      ctx.lineCap = 'butt';
      kin.booms.forEach((b, i) => {
        const def = m.booms[i];
        const lw = Math.max(3, def.section[1] * k * 0.75);
        ctx.strokeStyle = COL.boom; ctx.lineWidth = lw;
        line(X(b.x - b.dx * def.rear), Y(b.y - b.dy * def.rear), X(b.x + b.dx * def.length), Y(b.y + b.dy * def.length));
        if (b.len > def.length + 1e-3) {
          ctx.strokeStyle = COL.ext; ctx.lineWidth = lw * 0.62;
          line(X(b.x + b.dx * def.length), Y(b.y + b.dy * def.length), X(b.ex), Y(b.ey));
          // marcas das seções
          let acc = def.length;
          b.outs.forEach(o => { acc += o; if (o > 0.02) { ctx.fillStyle = '#0e1114'; ctx.beginPath(); ctx.arc(X(b.x + b.dx * acc), Y(b.y + b.dy * acc), 1.6, 0, Math.PI * 2); ctx.fill(); } });
        }
        ctx.fillStyle = COL.bg; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });

      // cabo, gancho, carga
      const hx = X(kin.hook.x), hy = Y(kin.hook.y);
      ctx.strokeStyle = '#cfd5da'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
      line(X(kin.tip.x), Y(kin.tip.y), hx, hy); ctx.setLineDash([]);
      ctx.fillStyle = '#f2c200'; ctx.fillRect(hx - 3, hy, 6, m.hook.blockHeight * k);
      if (st.load > 0) {
        const sz = kin.loadH * k, top = Y(kin.hook.y - m.hook.blockHeight - m.hook.slingLength);
        ctx.strokeStyle = '#2a62b8'; line(hx, hy + m.hook.blockHeight * k, hx - sz * 0.45, top); line(hx, hy + m.hook.blockHeight * k, hx + sz * 0.45, top);
        ctx.fillStyle = '#b8681f'; ctx.fillRect(hx - sz / 2, top, sz, sz);
      }

      // marcador de raio
      ctx.strokeStyle = stateCol; ctx.lineWidth = 1.5;
      line(hx, Y(0), hx, Y(0) - 6);
      ctx.setLineDash([1, 3]); line(X(0), Y(0) - 3, hx, Y(0) - 3); ctx.setLineDash([]);
      const rl = 'R ' + r.toFixed(2) + ' m';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const rw = ctx.measureText(rl).width + 8;
      const lx = Math.min(Math.max(hx - rw / 2, 4), W - rw - 4);
      ctx.fillStyle = stateCol; ctx.fillRect(lx, Y(0) - 22, rw, 14);
      ctx.fillStyle = '#111'; ctx.fillText(rl, lx + 4, Y(0) - 11);

      // ângulo da ponta
      const lb = kin.booms[kin.booms.length - 1];
      ctx.fillStyle = COL.text; ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillText(lb.abs.toFixed(1) + '°', X(lb.x) + 6, Y(lb.y) - 6);

      // cabeçalho
      ctx.fillStyle = COL.label; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
      ctx.fillText('PLANO DA LANÇA · GIRO ' + st.slew.toFixed(0) + '°', W - 6, 12);
      ctx.textAlign = 'left';
    }
  }

  window.LoadDiagram = LoadDiagram;
})();
