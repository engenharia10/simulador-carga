/* Cena 3D (Three.js r128) — monta caminhão, patolas, coluna, lanças, cilindros, gancho e carga
 * a partir da definição do modelo. Nenhum dado específico de máquina aqui.
 * Visual: céu em gradiente + reflexo de ambiente (PMREM), cores em espaço linear, texturas
 * procedurais (concreto, madeira, faixas zebradas), lanças com perfil octogonal.
 */
(function () {
  'use strict';
  const DEG = Math.PI / 180;
  const UP = new THREE.Vector3(0, 1, 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ------------------------------------------------------------ materiais */
  const lin = c => new THREE.Color(c).convertSRGBToLinear();
  const M = (color, o) => {
    const opts = Object.assign({ roughness: 0.6, metalness: 0.2 }, o || {});
    if (opts.emissive) opts.emissive = lin(opts.emissive);
    return new THREE.MeshStandardMaterial(Object.assign(opts, { color: lin(color) }));
  };
  const paint = (color, o) => new THREE.MeshPhysicalMaterial(Object.assign(
    { roughness: 0.36, metalness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.25 }, o || {}, { color: lin(color) }));

  function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
  const box = (w, h, d, mat) => mesh(new THREE.BoxGeometry(w, h, d), mat);
  const cylY = (r, h, mat, seg = 18) => mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  function cylZ(r, h, mat, seg = 18) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.rotateX(Math.PI / 2); return mesh(g, mat); }
  function cylX(r, h, mat, seg = 18) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.rotateZ(Math.PI / 2); return mesh(g, mat); }

  /** Estica um objeto unitário (eixo Y) entre a e b. */
  function stretch(obj, a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const L = d.length();
    if (L < 1e-4) { obj.visible = false; return; }
    obj.visible = true;
    obj.position.copy(a).addScaledVector(d, 0.5);
    obj.scale.set(1, L, 1);
    obj.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L));
  }

  /** Perfil octogonal (lança) extrudado ao longo de +X, de 0 a len. */
  function octGeo(len, w, h, c) {
    c = c ?? Math.min(w, h) * 0.24;
    const a = w / 2, b = h / 2, s = new THREE.Shape();
    s.moveTo(-a + c, -b); s.lineTo(a - c, -b); s.lineTo(a, -b + c); s.lineTo(a, b - c);
    s.lineTo(a - c, b); s.lineTo(-a + c, b); s.lineTo(-a, b - c); s.lineTo(-a, -b + c); s.lineTo(-a + c, -b);
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    return g;
  }

  /* ------------------------------------------------------------- texturas */
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  const concreteTex = () => canvasTex(512, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = 128 + (Math.random() - 0.5) * 22 + (Math.random() < 0.02 ? -25 : 0);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.97; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 26; i++) {
      const x = rnd(0, w), y = rnd(0, h), r = rnd(20, 90);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.6;
      gr.addColorStop(0, dark ? 'rgba(60,58,52,.09)' : 'rgba(255,255,250,.06)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.fillStyle = 'rgba(40,40,40,.55)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  }, [60, 60]);

  const woodTex = (rep, dark) => canvasTex(512, 512, (g, w, h) => {
    const n = 8, ph = h / n;
    for (let i = 0; i < n; i++) {
      const base = dark ? [92, 66, 44] : [168, 118, 70];
      const k = rnd(0.85, 1.12);
      g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
      g.fillRect(0, i * ph, w, ph);
      for (let j = 0; j < 40; j++) {
        g.strokeStyle = `rgba(60,35,15,${rnd(0.05, 0.18)})`; g.lineWidth = rnd(0.5, 2);
        const y = i * ph + rnd(2, ph - 2);
        g.beginPath(); g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + rnd(-4, 4), w * 0.6, y + rnd(-4, 4), w, y + rnd(-3, 3)); g.stroke();
      }
      g.fillStyle = 'rgba(20,12,5,.55)'; g.fillRect(0, i * ph, w, 3);
    }
  }, rep);

  const stripeTex = (c1, c2, rep) => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    g.fillStyle = c2;
    for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 32, 0); g.lineTo(i * 64 + 32 + 128, h); g.lineTo(i * 64 + 128, h); g.fill(); }
  }, rep || [1, 1]);

  const blobTex = () => canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  const treadTex = () => {
    const t = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#202020';
      for (let i = 0; i < 16; i++) { const x = i * 16; g.fillRect(x, h * 0.3, 6, h * 0.4); g.fillRect(x + 8, 0, 4, h * 0.28); g.fillRect(x + 8, h * 0.72, 4, h * 0.28); }
    }, [3, 1]);
    t.encoding = THREE.LinearEncoding;
    return t;
  };

  const decalTex = text => canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#121212'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 92px "Saira Condensed", Arial Narrow, sans-serif';
    g.fillText(text, w / 2, h / 2 + 4);
  });

  function crateTexture(kg) {
    const t = canvasTex(256, 256, (g) => {
      for (let i = 0; i < 6; i++) { const k = rnd(0.9, 1.1); g.fillStyle = `rgb(${178 * k | 0},${110 * k | 0},${52 * k | 0})`; g.fillRect(0, i * 43, 256, 43); }
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 1; i < 6; i++) g.fillRect(0, i * 43 - 1, 256, 2);
      g.strokeStyle = '#6e3a0e'; g.lineWidth = 18; g.strokeRect(9, 9, 238, 238);
      g.lineWidth = 12; g.beginPath(); g.moveTo(18, 238); g.lineTo(238, 18); g.stroke();
      g.fillStyle = '#f4e9d8'; g.fillRect(40, 92, 176, 86);
      g.fillStyle = '#141414'; g.textAlign = 'center';
      g.font = '700 58px "Saira Condensed", Arial Narrow, sans-serif';
      g.fillText(Math.round(kg).toLocaleString('pt-BR'), 128, 148);
      g.font = '600 22px "JetBrains Mono", monospace'; g.fillText('KG', 128, 172);
    });
    return t;
  }

  /* ---------------------------------------------------------------- céu */
  const SKY = { top: '#5f93c9', horizon: '#dde5ea', bottom: '#a7aaa3' };
  function skyMaterial(boost) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(SKY.top).multiplyScalar(boost) },
        horizon: { value: new THREE.Color(SKY.horizon).multiplyScalar(boost) },
        bottom: { value: new THREE.Color(SKY.bottom).multiplyScalar(boost) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.35));
        gl_FragColor = vec4(c, 1.0); }`
    });
  }

  /* ============================================================== cena */
  class CraneScene {
    constructor(el) {
      this.el = el;
      const R = this.renderer = new THREE.WebGLRenderer({ antialias: true });
      R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
      R.outputEncoding = THREE.sRGBEncoding;
      R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
      R.physicallyCorrectLights = false;
      el.appendChild(R.domElement);

      const S = this.scene = new THREE.Scene();
      S.add(new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMaterial(1)));
      S.fog = new THREE.Fog(lin(SKY.horizon), 80, 260);

      // reflexo de ambiente
      try {
        const envTex = canvasTex(512, 256, (g, w, h) => {
          const gr = g.createLinearGradient(0, 0, 0, h);
          gr.addColorStop(0, '#3d5f86'); gr.addColorStop(0.47, '#8c959b'); gr.addColorStop(0.53, '#6a6c66'); gr.addColorStop(1, '#3e403b');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
          const sx = w * 0.62, sy = h * 0.2, sg = g.createRadialGradient(sx, sy, 0, sx, sy, 40);
          sg.addColorStop(0, 'rgba(255,250,235,1)'); sg.addColorStop(1, 'rgba(255,250,235,0)');
          g.fillStyle = sg; g.fillRect(sx - 40, sy - 40, 80, 80);
        });
        envTex.mapping = THREE.EquirectangularReflectionMapping;
        const pm = new THREE.PMREMGenerator(R);
        S.environment = pm.fromEquirectangular(envTex).texture;
        pm.dispose(); envTex.dispose();
      } catch (e) { console.warn('Sem mapa de ambiente:', e); }

      const C = this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 900);
      C.position.set(-12, 9, 18);
      const ctl = this.controls = new THREE.OrbitControls(C, R.domElement);
      ctl.enableDamping = true; ctl.dampingFactor = 0.08;
      ctl.maxPolarAngle = Math.PI * 0.495; ctl.minDistance = 1.5; ctl.maxDistance = 160;
      ctl.target.set(4, 5, 0);

      S.add(new THREE.HemisphereLight(lin('#cfe0f0'), lin('#6b6256'), 0.35));
      const sun = this.sun = new THREE.DirectionalLight(lin('#fff1dc'), 2.3);
      sun.position.set(8, 28, 10); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025;
      sun.target.position.set(3, 0, 0);
      S.add(sun, sun.target);

      // piso de concreto
      const gm = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.95, metalness: 0, color: lin('#c9c9c4'), envMapIntensity: 0.55 });
      const ground = mesh(new THREE.PlaneGeometry(360, 360), gm, false);
      ground.rotation.x = -Math.PI / 2; S.add(ground);
      const grid = new THREE.GridHelper(60, 60, 0x55595b, 0x6a6e70);
      grid.position.y = 0.004; grid.material.transparent = true; grid.material.opacity = 0.16; grid.material.depthWrite = false; S.add(grid);

      const circ = [];
      for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; circ.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
      const cg = new THREE.BufferGeometry().setFromPoints(circ);
      this.workRing = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: '#39d98a' }));
      this.workRing.position.y = 0.025; S.add(this.workRing);
      this.maxRing = new THREE.Line(cg.clone(), new THREE.LineDashedMaterial({ color: '#2f3a42', dashSize: 0.03, gapSize: 0.025 }));
      this.maxRing.computeLineDistances(); this.maxRing.position.y = 0.02; S.add(this.maxRing);
      this.hookMark = mesh(new THREE.RingGeometry(0.18, 0.26, 32), new THREE.MeshBasicMaterial({ color: '#39d98a', side: THREE.DoubleSide }), false);
      this.hookMark.rotation.x = -Math.PI / 2; this.hookMark.position.y = 0.03; S.add(this.hookMark);

      this.rig = null;
      this.view = '3d';
      this.camAnim = null;
      new ResizeObserver(() => this.resize()).observe(el);
      this.resize();
    }

    resize() {
      const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }

    /* ---------------------------------------------------------------- build */
    build(model) {
      if (this.rig) {
        this.scene.remove(this.rig);
        this.rig.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) { ['map', 'bumpMap'].forEach(k => o.material[k] && o.material[k].dispose()); o.material.dispose(); }
        });
      }
      const rig = this.rig = new THREE.Group();
      this.scene.add(rig);
      this.model = model;
      this.alarmMats = [];
      const col = model.colors, c = model.column;

      this.mat = {
        column: paint(col.column),
        base: M(col.base, { metalness: 0.5, roughness: 0.45 }),
        pin: M('#b9bfc5', { metalness: 0.9, roughness: 0.25 }),
        rod: M('#eef2f5', { metalness: 1.0, roughness: 0.06 }),
        dark: M('#1c1f23', { metalness: 0.3, roughness: 0.6 }),
        black: M('#0f1012', { metalness: 0.1, roughness: 0.75 }),
        rubber: M('#151617', { roughness: 0.9, metalness: 0 }),
        hose: M('#141516', { roughness: 0.55, metalness: 0.1 }),
        redWhite: M('#ffffff', { map: stripeTex('#f4f4f4', '#d0221b', [1, 1]), roughness: 0.5 }),
        yellowBlack: M('#ffffff', { map: stripeTex('#f2c200', '#141414', [2, 1]), roughness: 0.5 }),
        wood: M('#ffffff', { map: woodTex([1, 1], true), roughness: 0.85, metalness: 0 })
      };
      this.alarmMats.push(this.mat.column);

      this.buildTruck(model, rig);
      this.buildStabilizers(model, rig);

      // ---- coluna (gira)
      const slew = this.slew = new THREE.Group();
      slew.position.set(c.x, 0, 0); rig.add(slew);
      const ring = cylY(0.52, 0.12, this.mat.base, 40); ring.position.y = c.baseHeight + 0.06; slew.add(ring);
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2;
        const bolt = cylY(0.025, 0.05, this.mat.pin, 6); bolt.position.set(Math.cos(a) * 0.46, c.baseHeight + 0.14, Math.sin(a) * 0.46); slew.add(bolt);
      }
      const h0 = c.baseHeight + 0.12, ch = c.pivotHeight + 0.05 - h0;
      const cr = c.width * 0.55;
      const colGeo = new THREE.CylinderGeometry(cr * 0.92, cr * 1.05, ch, 8); colGeo.rotateY(Math.PI / 8);
      const colm = mesh(colGeo, this.mat.column); colm.position.set(0, h0 + ch / 2, 0); slew.add(colm);
      const flange = cylY(cr * 1.25, 0.08, this.mat.column, 8); flange.rotation.y = Math.PI / 8; flange.position.y = h0 + 0.04; slew.add(flange);
      // suporte da articulação (2 chapas)
      const pl = c.pivotOffset + 0.45;
      [-1, 1].forEach(s => {
        const plate = box(pl, 0.62, 0.04, this.mat.column);
        plate.position.set(c.pivotOffset - pl / 2 + 0.2, c.pivotHeight - 0.05, s * (c.width / 2 + 0.03)); slew.add(plate);
        const boss = cylZ(0.13, 0.06, this.mat.column, 20); boss.position.set(c.pivotOffset, c.pivotHeight, s * (c.width / 2 + 0.07)); slew.add(boss);
      });
      const pin0 = cylZ(0.06, c.width + 0.26, this.mat.pin); pin0.position.set(c.pivotOffset, c.pivotHeight, 0); slew.add(pin0);
      const cap = box(0.34, 0.06, c.width * 0.9, this.mat.column); cap.position.set(-0.05, c.pivotHeight + 0.08, 0); slew.add(cap);

      // ---- lanças
      this.booms = [];
      let parent = slew;
      const collarMat = M('#2a2d31', { metalness: 0.4, roughness: 0.5 });
      model.booms.forEach((b, i) => {
        const g = new THREE.Group(); parent.add(g);
        const [w, h] = b.section;
        const bm = paint(b.color || col.boom);
        this.alarmMats.push(bm);
        const isLast = i === model.booms.length - 1;

        g.add(mesh(octGeo(b.length + b.rear, w, h).translate(-b.rear, 0, 0), bm));
        // chapas e bucha na articulação traseira
        [-1, 1].forEach(s => {
          const lp = box(b.rear + 0.32, h * 1.3, 0.03, bm); lp.position.set((-b.rear + 0.32) / 2, 0, s * (w / 2 + 0.015)); g.add(lp);
          const boss = cylZ(h * 0.33, 0.05, bm, 20); boss.position.set(0, 0, s * (w / 2 + 0.05)); g.add(boss);
        });
        g.add(cylZ(0.055, w + 0.2, this.mat.pin));
        // mangueiras hidráulicas no topo
        [-1, 1].forEach(s => {
          const hose = cylX(0.017, b.length * 0.85, this.mat.hose, 8); hose.position.set(b.length * 0.47, h / 2 + 0.03, s * w * 0.2); g.add(hose);
        });
        // colar na ponta da base
        if (b.extensions.length) {
          const cl = mesh(octGeo(0.16, w + 0.04, h + 0.04).translate(b.length - 0.16, 0, 0), collarMat); g.add(cl);
        }
        // adesivo com o nome do modelo na lança principal
        if (i === 0) {
          const dm = new THREE.MeshStandardMaterial({ map: decalTex(model.decal || model.name.split(' ')[0]), transparent: true, roughness: 0.5, depthWrite: false });
          [-1, 1].forEach(s => {
            const d = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(1.1, b.length * 0.42), h * 0.62), dm);
            d.position.set(b.length * 0.52, 0, s * (w / 2 + 0.004)); if (s < 0) d.rotation.y = Math.PI; g.add(d);
          });
        }

        const secs = [];
        let sw = w, sh = h;
        b.extensions.forEach((s, k) => {
          sw *= 0.86; sh *= 0.86;
          const len = s + b.overlap;
          const sm = paint(new THREE.Color(b.color || col.boom).offsetHSL(0, -0.03 * (k + 1), 0.025 * (k + 1)));
          this.alarmMats.push(sm);
          const sg = new THREE.Group();
          sg.add(mesh(octGeo(len, sw, sh).translate(-len / 2, 0, 0), sm));
          const lastSec = k === b.extensions.length - 1;
          if (!lastSec) sg.add(mesh(octGeo(0.13, sw + 0.03, sh + 0.03).translate(len / 2 - 0.13, 0, 0), collarMat));
          else if (isLast) { const hz = box(0.3, sh + 0.012, sw + 0.012, this.mat.yellowBlack); hz.position.x = len / 2 - 0.5; sg.add(hz); }
          g.add(sg);
          secs.push({ mesh: sg, len });
        });

        // cabeça da ponta
        const tipHead = new THREE.Group();
        if (isLast) {
          [-1, 1].forEach(s => {
            const p = box(0.44, sh * 1.55, 0.025, this.mat.dark); p.position.set(0.02, -sh * 0.2, s * (sw / 2 + 0.02)); tipHead.add(p);
          });
          const sheave = cylZ(Math.min(0.16, sh * 0.55), sw * 0.85, this.mat.pin, 24); sheave.position.set(0.08, -sh * 0.25, 0); tipHead.add(sheave);
          const capH = mesh(octGeo(0.1, sw * 1.05, sh * 1.05).translate(-0.12, 0, 0), this.mat.dark); tipHead.add(capH);
        } else {
          [-1, 1].forEach(s => {
            const p = box(0.62, sh * 1.45, 0.03, bm); p.position.set(-0.12, 0, s * (sw / 2 + 0.02)); tipHead.add(p);
            const boss = cylZ(sh * 0.36, 0.05, bm, 20); boss.position.set(0, 0, s * (sw / 2 + 0.055)); tipHead.add(boss);
          });
          tipHead.add(cylZ(0.055, sw + 0.22, this.mat.pin));
        }
        g.add(tipHead);
        this.booms.push({ g, secs, tipHead, def: b });
        parent = g;
      });

      // ---- guincho: tambor sobre a lança + cabo passando pelas lanças até a ponta
      this.buildWinch(model, slew);

      // ---- cilindros hidráulicos
      this.cyls = model.cylinders.map(cd => {
        const g = new THREE.Group();
        const barrel = cylY(cd.r, 1, this.mat.column, 20);
        const capE = cylY(cd.r * 1.12, 0.07, this.mat.dark, 20);
        const rod = cylY(cd.r * 0.55, 1, this.mat.rod, 16);
        const eyeA = cylZ(cd.r * 1.1, cd.r * 2.4, this.mat.dark, 14);
        const eyeB = cylZ(cd.r * 0.8, cd.r * 2.2, this.mat.dark, 14);
        const hose = cylY(0.014, 1, this.mat.hose, 6); hose.position.set(cd.r * 1.15, 0, 0);
        g.add(barrel, capE, rod, eyeA, eyeB, hose); slew.add(g);
        return { cd, g, barrel, capE, rod, eyeB, hose };
      });

      // ---- gancho / cabo / carga (coordenadas de mundo)
      const yellow = paint('#f2c200');
      this.cable = cylY(0.014, 1, M('#2a2c2e', { metalness: 0.85, roughness: 0.35 }), 8);
      rig.add(this.cable);
      const hk = this.hookG = new THREE.Group();
      [-1, 1].forEach(s => { const p = box(0.3, 0.34, 0.025, yellow); p.position.set(0, -0.17, s * 0.07); hk.add(p); });
      const sh = cylZ(0.11, 0.1, this.mat.dark, 24); sh.position.y = -0.14; hk.add(sh);
      const shp = cylZ(0.03, 0.2, this.mat.pin, 10); shp.position.y = -0.14; hk.add(shp);
      const sw = cylY(0.04, 0.09, this.mat.pin, 12); sw.position.y = -0.38; hk.add(sw);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, -0.47, 0), new THREE.Vector3(-0.015, -0.55, 0),
        new THREE.Vector3(0.04, -0.61, 0), new THREE.Vector3(0.1, -0.58, 0), new THREE.Vector3(0.115, -0.5, 0)
      ]);
      hk.add(mesh(new THREE.TubeGeometry(curve, 28, 0.024, 10), M('#c7cbcf', { metalness: 0.85, roughness: 0.3 })));
      const latch = box(0.11, 0.008, 0.02, M('#d42a1e')); latch.position.set(0.055, -0.46, 0); latch.rotation.z = -0.35; hk.add(latch);
      rig.add(hk);

      const ld = this.loadG = new THREE.Group();
      this.crateMat = M('#ffffff', { roughness: 0.8, metalness: 0.0 });
      this.crate = new THREE.Group();
      this.crate.add(mesh(new THREE.BoxGeometry(1, 1, 1), this.crateMat));
      const strapM = M('#3a3d40', { metalness: 0.7, roughness: 0.4 });
      [-0.3, 0.3].forEach(z => { const s = box(1.006, 1.006, 0.035, strapM); s.position.z = z; this.crate.add(s); });
      ld.add(this.crate);
      const slingM = M('#2a62b8', { roughness: 0.75 });
      this.slings = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => {
        const s = box(0.045, 1, 0.006, slingM); s.userData = { sx, sz }; ld.add(s); return s;
      });
      rig.add(ld);
      this.crateKg = -1;

      // anéis de raio
      this.workRing.position.x = this.maxRing.position.x = c.x;
      const rMax = model.loadChart.points[model.loadChart.points.length - 1].r;
      this.maxRing.scale.set(rMax, 1, rMax);
    }

    /* -------------------------------------------------------------- guincho */
    buildWinch(model, slew) {
      const wd = model.winch, mt = wd.mount;
      const B = this.booms[mt.boom];
      if (!B) { this.winch = null; return; }
      const [w, h] = B.def.section;
      const R = wd.drumRadius, W = wd.drumWidth;
      const g = new THREE.Group();
      g.position.set(mt.along, h / 2, 0);
      B.g.add(g);
      const frameM = this.mat.column;
      // cavaletes laterais + base
      const baseP = box(0.42, 0.04, W + 0.12, frameM); baseP.position.y = 0.02; g.add(baseP);
      [-1, 1].forEach(s => {
        const sp = new THREE.Shape();
        sp.moveTo(-0.21, 0); sp.lineTo(0.21, 0); sp.lineTo(0.13, 0.2 + R + 0.06); sp.lineTo(-0.13, 0.2 + R + 0.06); sp.lineTo(-0.21, 0);
        const pg = new THREE.ExtrudeGeometry(sp, { depth: 0.025, bevelEnabled: false });
        const p = mesh(pg, frameM); p.position.z = s > 0 ? W / 2 + 0.03 : -(W / 2 + 0.055); g.add(p);
      });
      // tambor (gira)
      const drum = new THREE.Group(); drum.position.y = 0.2; g.add(drum);
      drum.add(cylZ(R, W, this.mat.dark, 24));
      [-1, 1].forEach(s => {
        const f = cylZ(R + 0.07, 0.022, this.mat.column, 28); f.position.z = s * W / 2; drum.add(f);
        for (let k = 0; k < 4; k++) {           // marcas para ver a rotação
          const a = k / 4 * Math.PI * 2;
          const mk = box(0.05, 0.02, 0.026, this.mat.black); mk.position.set(Math.cos(a) * (R + 0.035), Math.sin(a) * (R + 0.035), s * W / 2); mk.rotation.z = a; drum.add(mk);
        }
      });
      const rope = cylZ(1, W * 0.94, M('#3b3e41', { metalness: 0.75, roughness: 0.42 }), 28); drum.add(rope);
      const shaft = cylZ(0.03, W + 0.16, this.mat.pin, 10); drum.add(shaft);
      // motor hidráulico + redutor
      const motor = cylZ(0.075, 0.16, this.mat.dark, 18); motor.position.set(0, 0.2, -(W / 2 + 0.15)); g.add(motor);
      const red = cylZ(0.1, 0.06, this.mat.column, 18); red.position.set(0, 0.2, -(W / 2 + 0.08)); g.add(red);
      [0.03, -0.03].forEach(dy => { const hs = cylX(0.012, 0.3, this.mat.hose, 6); hs.position.set(-0.17, 0.2 + dy, -(W / 2 + 0.15)); g.add(hs); });

      // segmentos do cabo: tambor → ponta de cada lança até a ponta final
      const cableM = M('#2a2c2e', { metalness: 0.85, roughness: 0.35 });
      const n = model.booms.length - mt.boom;
      const segs = [];
      for (let i = 0; i < n; i++) { const c = cylY(0.011, 1, cableM, 6); c.castShadow = false; slew.add(c); segs.push(c); }
      this.winch = { mt, R, W, h, drum, rope, segs };
    }

    /* ------------------------------------------------------------ caminhão */
    buildTruck(model, rig) {
      const v = model.vehicle, c = model.column;
      const T = new THREE.Group(); rig.add(T);
      const chassis = M(v.chassisColor || '#24272b', { metalness: 0.45, roughness: 0.5 });
      const R = v.wheelRadius;

      // sombra de contato
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.75 }));
      blob.rotation.x = -Math.PI / 2; blob.position.set((v.frontX + v.rearX) / 2, 0.008, 0);
      blob.scale.set(v.rearX - v.frontX + 2.2, v.width + 1.6, 1); T.add(blob);

      // longarinas e travessas
      const len = v.rearX - v.frontX - 0.25, midX = (v.frontX + 0.25 + v.rearX) / 2;
      [-1, 1].forEach(s => {
        const web = box(len, 0.28, 0.02, chassis); web.position.set(midX, v.frameTop - 0.14, s * 0.43); T.add(web);
        [0, 0.27].forEach(dy => { const fl = box(len, 0.02, 0.09, chassis); fl.position.set(midX, v.frameTop - 0.01 - dy, s * 0.4); T.add(fl); });
      });
      for (let x = v.frontX + 0.6; x < v.rearX; x += 1.2) { const cm = box(0.08, 0.22, 0.84, chassis); cm.position.set(x, v.frameTop - 0.15, 0); T.add(cm); }

      // cabine
      const cab = v.cab;
      if (cab) this.buildCab(cab, v, T);

      // escapamento vertical
      if (cab) {
        const chrome = M('#d8dde2', { metalness: 1, roughness: 0.12 });
        const ex = cylY(0.07, cab.top - 0.6, chrome, 16); ex.position.set(cab.x1 + 0.14, 0.6 + (cab.top - 0.6) / 2 + 0.25, -(cab.width / 2 - 0.25)); T.add(ex);
        const shield = cylY(0.085, 0.7, M('#9ea4a9', { metalness: 0.9, roughness: 0.35 }), 16); shield.position.set(ex.position.x, cab.top - 0.6, ex.position.z); T.add(shield);
      }

      // rodas
      const tread = treadTex();
      const tireM = new THREE.MeshStandardMaterial({ color: lin('#1a1b1d'), roughness: 0.92, metalness: 0, bumpMap: tread, bumpScale: 0.025, side: THREE.DoubleSide });
      const rimM = M('#d9dcdf', { metalness: 0.65, roughness: 0.3 });
      const hubM = M('#8c9196', { metalness: 0.8, roughness: 0.3 });
      const tw = 0.3, Ri = R * 0.6;
      const prof = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, a = -Math.PI / 2 + t * Math.PI;
        const y = Math.sin(a) * tw / 2;
        const rr = Ri + (R - Ri) * (0.82 + 0.18 * Math.cos(a)) * (i === 0 || i === 10 ? 0.55 : 1);
        prof.push(new THREE.Vector2(i === 0 || i === 10 ? Ri : rr, y));
      }
      const tireGeo = new THREE.LatheGeometry(prof, 40); tireGeo.rotateX(Math.PI / 2);
      const wheel = (outer) => {
        const g = new THREE.Group();
        g.add(mesh(tireGeo, tireM));
        const disc = cylZ(Ri * 1.02, tw * 0.6, rimM, 32); g.add(disc);
        if (outer) {
          const lip = mesh(new THREE.TorusGeometry(Ri * 1.0, 0.018, 8, 40), rimM); lip.position.z = tw * 0.32; g.add(lip);
          const hub = cylZ(Ri * 0.38, 0.12, hubM, 20); hub.position.z = tw * 0.33; g.add(hub);
          for (let k = 0; k < 10; k++) {
            const a = k / 10 * Math.PI * 2;
            const nut = cylZ(0.016, 0.05, hubM, 6); nut.position.set(Math.cos(a) * Ri * 0.55, Math.sin(a) * Ri * 0.55, tw * 0.33); g.add(nut);
          }
          for (let k = 0; k < 8; k++) {
            const a = (k + 0.5) / 8 * Math.PI * 2;
            const hole = cylZ(0.035, 0.01, this.mat.black, 12); hole.position.set(Math.cos(a) * Ri * 0.78, Math.sin(a) * Ri * 0.78, tw * 0.31); g.add(hole);
          }
        }
        return g;
      };
      v.axles.forEach(a => {
        const zs = a.dual ? [v.track / 2 - 0.17, v.track / 2 + 0.15] : [v.track / 2];
        [-1, 1].forEach(s => zs.forEach((z, zi) => {
          const wg = wheel(zi === zs.length - 1);
          wg.position.set(a.x, R, s * z);
          if (s < 0) wg.rotation.y = Math.PI;
          T.add(wg);
        }));
        const ax = cylZ(0.075, v.track - 0.2, chassis, 12); ax.position.set(a.x, R, 0); T.add(ax);
        const diff = a.dual ? mesh(new THREE.SphereGeometry(0.22, 16, 12), chassis) : null;
        if (diff) { diff.position.set(a.x, R, 0); diff.scale.set(1, 1, 0.8); T.add(diff); }
        // para-lamas dos eixos traseiros
        if (a.dual) {
          const fg = new THREE.CylinderGeometry(R + 0.1, R + 0.1, 0.72, 24, 1, true, Math.PI / 2, Math.PI);
          fg.rotateX(Math.PI / 2);
          [-1, 1].forEach(s => { const f = mesh(fg, M('#121314', { roughness: 0.6, side: THREE.DoubleSide })); f.position.set(a.x, R, s * v.track / 2); T.add(f); });
        }
      });
      // apara-barro atrás do último eixo
      const lastAx = v.axles[v.axles.length - 1];
      [-1, 1].forEach(s => { const mf = box(0.02, 0.55, 0.62, this.mat.rubber); mf.position.set(lastAx.x + R + 0.15, 0.5, s * v.track / 2); T.add(mf); });

      // tanques e caixas laterais
      const alu = M('#c6ccd1', { metalness: 0.85, roughness: 0.28 });
      const tankL = 1.0;
      const tank = cylX(0.28, tankL, alu, 28); tank.position.set(c.x + 1.55, 0.72, -0.82); T.add(tank);
      [-1, 1].forEach(s => { const e = mesh(new THREE.SphereGeometry(0.28, 20, 12), alu); e.scale.set(0.25, 1, 1); e.position.set(c.x + 1.55 + s * tankL / 2, 0.72, -0.82); T.add(e); });
      [0.25, -0.25].forEach(dx => { const st = box(0.04, 0.6, 0.62, chassis); st.position.set(c.x + 1.55 + dx, 0.72, -0.82); T.add(st); });
      const batt = box(0.7, 0.5, 0.5, chassis); batt.position.set(c.x + 1.55, 0.72, 0.84); T.add(batt);
      const air = cylX(0.13, 0.9, M('#5d6166', { metalness: 0.6, roughness: 0.4 }), 16); air.position.set(c.x + 1.55, 0.42, 0.84); T.add(air);

      // carroceria
      const bed = v.bed;
      if (bed) {
        const bl = bed.x1 - bed.x0, bx = (bed.x0 + bed.x1) / 2;
        const deck = box(bl, 0.08, v.width - 0.08, M('#ffffff', { map: woodTex([Math.round(bl / 2), 1], false), roughness: 0.85, metalness: 0 }));
        deck.position.set(bx, bed.top - 0.04, 0); T.add(deck);
        const frame = M(bed.color, { metalness: 0.5, roughness: 0.45 });
        [-1, 1].forEach(s => {
          const side = box(bl, 0.18, 0.06, frame); side.position.set(bx, bed.top - 0.07, s * (v.width / 2 - 0.03)); T.add(side);
          for (let x = bed.x0 + 0.4; x < bed.x1 - 0.2; x += 0.8) { const sp = box(0.08, 0.14, 0.05, frame); sp.position.set(x, bed.top - 0.2, s * (v.width / 2 + 0.01)); T.add(sp); }
          const tl = box(0.04, 0.12, 0.26, M('#ff3020', { emissive: '#ff1a0a', emissiveIntensity: 0.6 }));
          tl.position.set(bed.x1 + 0.03, bed.top - 0.32, s * (v.width / 2 - 0.22)); T.add(tl);
          const tlA = box(0.04, 0.12, 0.08, M('#ffa21a', { emissive: '#ff8a00', emissiveIntensity: 0.4 }));
          tlA.position.set(bed.x1 + 0.03, bed.top - 0.32, s * (v.width / 2 - 0.42)); T.add(tlA);
        });
        const cross = box(0.08, 0.18, v.width, frame); cross.position.set(bed.x1 - 0.04, bed.top - 0.07, 0); T.add(cross);
        const under = box(0.1, 0.1, v.width - 0.3, this.mat.redWhite); under.position.set(bed.x1 - 0.1, 0.55, 0); T.add(under);
        [-1, 1].forEach(s => { const ub = box(0.06, bed.top - 0.6, 0.06, chassis); ub.position.set(bed.x1 - 0.1, (bed.top + 0.55) / 2, s * 0.6); T.add(ub); });
      }

      // base do guindaste (subchassi + carcaça do giro)
      const bh = c.baseHeight - v.frameTop;
      const cb = box(1.1, bh, 1.0, this.mat.column); cb.position.set(c.x, v.frameTop + bh / 2, 0); T.add(cb);
      const rack = cylZ(0.17, v.width * 0.92, this.mat.column, 24); rack.position.set(c.x, c.baseHeight - 0.2, 0); T.add(rack);
      [-1, 1].forEach(s => { const e = cylZ(0.2, 0.08, this.mat.dark, 24); e.position.set(c.x, c.baseHeight - 0.2, s * v.width * 0.46); T.add(e); });
      // posto de comando lateral
      [-1, 1].forEach(s => {
        const panel = box(0.6, 0.36, 0.1, this.mat.dark); panel.position.set(c.x - 0.1, 1.12, s * (v.width / 2 + 0.06)); T.add(panel);
        for (let i = 0; i < 5; i++) {
          const lever = cylY(0.011, 0.24, this.mat.pin, 6); lever.position.set(c.x - 0.34 + i * 0.12, 1.4, s * (v.width / 2 + 0.09)); T.add(lever);
          const knob = mesh(new THREE.SphereGeometry(0.026, 10, 8), M('#e23b2a', { roughness: 0.4 })); knob.position.set(c.x - 0.34 + i * 0.12, 1.53, s * (v.width / 2 + 0.09)); T.add(knob);
        }
        const gauge = cylZ(0.05, 0.02, M('#f2f2f2', { roughness: 0.3 }), 16); gauge.position.set(c.x + 0.12, 1.18, s * (v.width / 2 + 0.115)); T.add(gauge);
      });
    }

    buildCab(cab, v, T) {
      const L = cab.x1 - cab.x0, Tp = cab.top, W = cab.width, R = v.wheelRadius;
      const bt = 0.12, bs = 0.105;                       // raio dos cantos da cabine
      const bottom = 0.74;
      const fa = v.axles.find(a => a.x > cab.x0 && a.x < cab.x1);
      const archX = fa ? fa.x - cab.x0 : null;
      const wsB = [0.05, 1.98], wsT = [0.22, Tp - 0.22];   // para-brisa (perfil)
      const X = x => cab.x0 + x;
      const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

      const cm = paint(cab.color, { clearcoat: 1, clearcoatRoughness: 0.08, roughness: 0.28, metalness: 0.08 });
      const glass = new THREE.MeshPhysicalMaterial({ color: lin('#16212a'), roughness: 0.03, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 });
      const rubber = M('#0d0e0f', { roughness: 0.7, metalness: 0 });
      const plastic = M('#2a2d31', { roughness: 0.62, metalness: 0.05 });
      const chrome = M('#e2e6ea', { metalness: 1, roughness: 0.1 });
      const amber = M('#ffa21a', { emissive: '#ff8a00', emissiveIntensity: 0.35, roughness: 0.25 });

      // ------------------------------------------------------------ casco
      const s = new THREE.Shape();
      s.moveTo(0.03, bottom);
      s.lineTo(0.0, 1.88);
      s.quadraticCurveTo(0.0, 1.95, wsB[0], wsB[1]);
      s.lineTo(wsT[0], wsT[1]);
      s.quadraticCurveTo(0.28, Tp, 0.55, Tp);
      s.lineTo(L - 0.16, Tp);
      s.quadraticCurveTo(L, Tp, L, Tp - 0.16);
      s.lineTo(L, bottom);
      let archR = 0;
      if (archX != null) {
        archR = R + 0.17;
        const a = Math.asin(clamp((bottom - R) / archR, -0.99, 0.99));
        s.lineTo(archX + archR * Math.cos(a), bottom);
        s.absarc(archX, R, archR, a, Math.PI - a, false);
      }
      s.lineTo(0.03, bottom);
      const D = W - 2 * bt;
      const geo = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 6, curveSegments: 24 });
      geo.translate(0, 0, -D / 2);
      const body = mesh(geo, cm); body.position.x = cab.x0; T.add(body);

      // ------------------------------------------------------------ para-brisa (plano inclinado)
      const rr = (w, h, r) => {
        const p = new THREE.Shape(), x = -w / 2, y = -h / 2;
        p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
        p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
        p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
        return p;
      };
      const dx = wsT[0] - wsB[0], dy = wsT[1] - wsB[1], dl = Math.hypot(dx, dy);
      const dir = V3(dx / dl, dy / dl, 0), nrm = V3(-dy / dl, dx / dl, 0);
      const ws = new THREE.Group();
      ws.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 0, 1), dir, nrm));
      ws.position.set(X((wsB[0] + wsT[0]) / 2), (wsB[1] + wsT[1]) / 2, 0).addScaledVector(nrm, bs + 0.004);
      T.add(ws);
      const fr = new THREE.Mesh(new THREE.ShapeGeometry(rr(W - 0.2, dl + 0.12, 0.12)), rubber); ws.add(fr);
      const gl = new THREE.Mesh(new THREE.ShapeGeometry(rr(W - 0.3, dl + 0.02, 0.09)), glass); gl.position.z = 0.004; ws.add(gl);
      [[-0.42, 0.1], [0.36, 0.06]].forEach(([zx, rot]) => {        // palhetas
        const arm = box(0.78, 0.022, 0.022, plastic); arm.position.set(zx, -dl / 2 + 0.09, 0.02); arm.rotation.z = rot; ws.add(arm);
        const piv = cylZ(0.025, 0.03, plastic, 10); piv.position.set(zx - 0.36, -dl / 2 + 0.04, 0.012); ws.add(piv);
      });
      // quebra-sol com luzes de teto
      const visor = box(0.32, 0.035, W - 0.16, plastic); visor.position.set(X(wsT[0] - 0.02), Tp - 0.05, 0); visor.rotation.z = 0.22; T.add(visor);
      for (let i = 0; i < 5; i++) {
        const ml = box(0.035, 0.03, 0.09, amber); ml.position.set(X(wsT[0] - 0.17), Tp - 0.075, (i - 2) * 0.3); T.add(ml);
      }

      // ------------------------------------------------------------ laterais
      const wb = Math.min(1.22, L * 0.56);              // fim da porta
      const winTop = Tp - 0.26;
      const sideWin = (inset) => {
        const p = new THREE.Shape(), r = 0.06;
        const fx0 = wsB[0] + 0.2 - inset, fx1 = wsT[0] + 0.14 - inset, bx = wb - 0.04 + inset;
        const y0 = 2.02 - inset, y1 = winTop + inset;
        p.moveTo(fx0 + r, y0); p.lineTo(bx - r, y0); p.quadraticCurveTo(bx, y0, bx, y0 + r);
        p.lineTo(bx, y1 - r); p.quadraticCurveTo(bx, y1, bx - r, y1);
        p.lineTo(fx1 + r, y1); p.quadraticCurveTo(fx1, y1, fx1 - 0.01, y1 - r);
        p.lineTo(fx0, y0 + r); p.quadraticCurveTo(fx0, y0, fx0 + r, y0);
        return new THREE.ShapeGeometry(p);
      };
      const winFrameG = sideWin(0.035), winG = sideWin(0);
      const seamM = M('#3a3d40', { roughness: 0.6 });
      [-1, 1].forEach(sd => {
        const side = (obj, zOff) => {                   // coloca shape na face lateral
          obj.position.set(cab.x0, 0, sd * (W / 2 + zOff));
          if (sd < 0) { obj.scale.x = -1; obj.rotation.y = Math.PI; }
          T.add(obj);
        };
        side(new THREE.Mesh(winFrameG, rubber), 0.002);
        side(new THREE.Mesh(winG, glass), 0.004);
        // contorno da porta, maçaneta e alça
        const sz = sd * (W / 2 + 0.002);
        const rs = box(0.01, winTop - 0.95, 0.006, seamM); rs.position.set(X(wb + 0.03), (winTop + 0.95) / 2, sz); T.add(rs);
        const bsm = box(wb - 0.05, 0.01, 0.006, seamM); bsm.position.set(X(0.06 + (wb - 0.05) / 2), 0.95, sz); T.add(bsm);
        const handle = box(0.17, 0.04, 0.025, plastic); handle.position.set(X(wb - 0.12), 1.7, sd * (W / 2 + 0.01)); T.add(handle);
        const grab = cylY(0.016, 0.7, chrome, 8); grab.position.set(X(wb + 0.12), 1.45, sd * (W / 2 + 0.05)); T.add(grab);
        [1.1, 1.8].forEach(y => { const gb = box(0.03, 0.03, 0.05, plastic); gb.position.set(X(wb + 0.12), y, sd * (W / 2 + 0.025)); T.add(gb); });
        // alargador do para-lama e degraus
        if (archX != null) {
          const ar = archR - bs, ro = ar + 0.09, ri = ar - 0.005;
          const a0 = Math.asin(clamp((bottom - bs - R) / ro, -0.99, 0.99));
          const fs = new THREE.Shape();
          fs.absarc(0, 0, ro, a0, Math.PI - a0, false);
          fs.absarc(0, 0, ri, Math.PI - a0, a0, true);
          const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 24 });
          const fl = mesh(fg, plastic);
          fl.position.set(X(archX), R, sd > 0 ? W / 2 - 0.04 : -(W / 2 - 0.04) - 0.07); T.add(fl);
          const sx = X(Math.min(L - 0.24, archX + R + 0.3));
          const housing = box(0.44, 0.58, 0.12, plastic); housing.position.set(sx, 0.5, sd * (W / 2 - 0.08)); T.add(housing);
          [0.38, 0.7].forEach(y => { const st = box(0.4, 0.035, 0.2, M('#9ea4aa', { metalness: 0.85, roughness: 0.35 })); st.position.set(sx, y, sd * (W / 2 - 0.05)); T.add(st); });
        }
        // defletor de canto (traseira da cabine)
        const cd = box(0.26, Tp - 1.25, 0.035, cm); cd.position.set(X(L - 0.02), (Tp + 1.25) / 2, sd * (W / 2 + 0.04)); cd.rotation.y = -sd * 0.28; T.add(cd);
        // lanterna lateral
        const sm = box(0.08, 0.04, 0.012, amber); sm.position.set(X(0.5), 0.86, sd * (W / 2 + 0.004)); T.add(sm);
        // retrovisores: braços + principal + grande-angular
        const mz = sd * (W / 2 + 0.34);
        const arm1 = cylZ(0.018, 0.36, plastic, 8); arm1.position.set(X(0.24), Tp - 0.45, sd * (W / 2 + 0.17)); T.add(arm1);
        const arm2 = cylZ(0.018, 0.36, plastic, 8); arm2.position.set(X(0.24), 1.95, sd * (W / 2 + 0.17)); T.add(arm2);
        const post = cylY(0.018, Tp - 0.45 - 1.95, plastic, 8); post.position.set(X(0.24), (Tp - 0.45 + 1.95) / 2, mz - sd * 0.02); T.add(post);
        const mainM = box(0.1, 0.5, 0.21, rubber); mainM.position.set(X(0.2), Tp - 0.72, mz); T.add(mainM);
        const mg = box(0.006, 0.44, 0.17, chrome); mg.position.set(X(0.255), Tp - 0.72, mz); T.add(mg);
        const wideM = box(0.1, 0.2, 0.19, rubber); wideM.position.set(X(0.2), 2.16, mz); T.add(wideM);
        const wg = box(0.006, 0.15, 0.15, chrome); wg.position.set(X(0.255), 2.16, mz); T.add(wg);
      });
      // espelho frontal (lado do passageiro)
      const fm = box(0.08, 0.16, 0.22, rubber); fm.position.set(X(-0.16), Tp - 0.2, -(W / 2 - 0.32)); T.add(fm);
      const fma = box(0.2, 0.02, 0.02, plastic); fma.position.set(X(-0.05), Tp - 0.14, -(W / 2 - 0.32)); T.add(fma);

      // ------------------------------------------------------------ frente: grade
      const fx = X(-bs);                                   // superfície frontal
      const grille = box(0.03, 0.6, W * 0.64, M('#101113', { roughness: 0.5 })); grille.position.set(fx - 0.01, 1.5, 0); T.add(grille);
      const slatM = M('#6e747a', { metalness: 0.8, roughness: 0.3 });
      for (let i = 0; i < 6; i++) {
        const sl = box(0.035, 0.04, W * 0.62, i % 2 ? plastic : slatM);
        sl.position.set(fx - 0.025, 1.25 + i * 0.1, 0); T.add(sl);
      }
      [-1, 1].forEach(sd => { const g = box(0.02, 0.64, 0.03, chrome); g.position.set(fx - 0.02, 1.5, sd * W * 0.32); T.add(g); });
      const badge = box(0.025, 0.11, 0.36, chrome); badge.position.set(fx - 0.035, 1.88, 0); T.add(badge);
      const badgeIn = box(0.02, 0.07, 0.3, M('#1d2730', { metalness: 0.4, roughness: 0.3 })); badgeIn.position.set(fx - 0.042, 1.88, 0); T.add(badgeIn);

      // ------------------------------------------------------------ para-choque envolvente
      const bw = W + 0.06, bx0 = -bs - 0.13, bx1 = 0.32, brd = 0.2;
      const bsh = new THREE.Shape();
      bsh.moveTo(bx1, -bw / 2); bsh.lineTo(bx0 + brd, -bw / 2); bsh.quadraticCurveTo(bx0, -bw / 2, bx0, -bw / 2 + brd);
      bsh.lineTo(bx0, bw / 2 - brd); bsh.quadraticCurveTo(bx0, bw / 2, bx0 + brd, bw / 2); bsh.lineTo(bx1, bw / 2); bsh.lineTo(bx1, -bw / 2);
      const bump = (y0, h, mat) => {
        const g = new THREE.ExtrudeGeometry(bsh, { depth: h, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 12 });
        g.rotateX(-Math.PI / 2);
        const m = mesh(g, mat); m.position.set(cab.x0, y0, 0); T.add(m); return m;
      };
      bump(0.64, 0.3, cm);
      bump(0.42, 0.22, plastic);
      // faróis embutidos no para-choque
      const lens = new THREE.MeshPhysicalMaterial({ color: lin('#dfe7ee'), transparent: true, opacity: 0.35, roughness: 0.02, clearcoat: 1, envMapIntensity: 2 });
      const fxB = X(bx0 - 0.016);
      const bulbM = M('#fffbea', { emissive: '#fff6dc', emissiveIntensity: 0.9 });
      [-1, 1].forEach(sd => {
        const zc = sd * (bw / 2 - 0.36);
        const hous = box(0.04, 0.2, 0.5, M('#141618', { roughness: 0.4, metalness: 0.4 })); hous.position.set(fxB + 0.01, 0.79, zc); T.add(hous);
        [-0.1, 0.06].forEach(dz => {
          const rf = cylX(0.062, 0.02, chrome, 20); rf.position.set(fxB - 0.005, 0.8, zc + dz * sd); T.add(rf);
          const bulb = cylX(0.02, 0.025, bulbM, 10); bulb.position.set(fxB - 0.012, 0.8, zc + dz * sd); T.add(bulb);
        });
        const drl = box(0.01, 0.022, 0.44, M('#ffffff', { emissive: '#e8f3ff', emissiveIntensity: 1.2 })); drl.position.set(fxB - 0.012, 0.705, zc); T.add(drl);
        const ind = box(0.012, 0.16, 0.07, amber); ind.position.set(fxB - 0.008, 0.79, zc + sd * 0.215); T.add(ind);
        const ln = box(0.008, 0.2, 0.5, lens); ln.position.set(fxB - 0.02, 0.79, zc); ln.castShadow = false; T.add(ln);
        // farol de neblina
        const fog = cylX(0.055, 0.02, M('#fdf8e6', { emissive: '#fff1c4', emissiveIntensity: 0.4, roughness: 0.1 }), 18); fog.position.set(X(bx0 - 0.01), 0.53, sd * (bw / 2 - 0.3)); T.add(fog);
        const fogR = cylX(0.07, 0.015, chrome, 18); fogR.position.set(X(bx0 - 0.004), 0.53, sd * (bw / 2 - 0.3)); T.add(fogR);
      });
      // degrau central e gancho de reboque
      const stepC = box(0.02, 0.07, 0.5, M('#0b0c0d')); stepC.position.set(X(bx0 - 0.008), 0.53, 0); T.add(stepC);
      const tow = mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 16), M('#c0262a', { roughness: 0.5 })); tow.position.set(X(bx0 - 0.02), 0.47, 0.32); tow.rotation.y = Math.PI / 2; T.add(tow);

      // ------------------------------------------------------------ teto: defletor aerodinâmico
      const df = new THREE.Shape();
      df.moveTo(0.78, Tp); df.lineTo(L - 0.1, Tp); df.lineTo(L - 0.1, Tp + 0.5);
      df.quadraticCurveTo(1.25, Tp + 0.48, 0.78, Tp);
      const dg = new THREE.ExtrudeGeometry(df, { depth: W - 0.56, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.06, bevelSegments: 4, curveSegments: 16 });
      dg.translate(0, 0, -(W - 0.56) / 2);
      const defl = mesh(dg, cm); defl.position.x = cab.x0; T.add(defl);

      // faixa decorativa
      [-1, 1].forEach(sd => {
        const x0 = archX != null ? archX + archR - bs + 0.12 : 0.1;
        const stripe = box(L - x0 - 0.05, 0.05, 0.004, M('#f2b100', { roughness: 0.4 }));
        stripe.position.set(X(x0 + (L - x0 - 0.05) / 2), 1.2, sd * (W / 2 + 0.003)); T.add(stripe);
      });
    }

    buildStabilizers(model, rig) {
      this.stabs = model.stabilizers.map(sd => {
        const y = sd.y ?? 0.95, hw = sd.retracted / 2;
        const housing = box(0.3, 0.3, sd.retracted, this.mat.column); housing.position.set(sd.x, y, 0); rig.add(housing);
        const sides = [-1, 1].map(s => {
          const stroke = sd.extended / 2 - hw, bl = stroke + 0.4;
          const beam = box(0.22, 0.22, bl, this.mat.column);
          const band = box(0.232, 0.232, 0.36, this.mat.redWhite);
          const legHead = box(0.3, 0.3, 0.3, this.mat.column);
          const leg = cylY(0.11, 0.9, this.mat.column, 20);
          const rod = cylY(0.065, 1, this.mat.rod, 16);
          const pad = cylY(0.24, 0.06, this.mat.dark, 24);
          const mat = box(0.62, 0.07, 0.62, this.mat.wood);
          rig.add(beam, band, legHead, leg, rod, pad, mat);
          return { s, beam, band, bl, legHead, leg, rod, pad, mat };
        });
        return { sd, y, hw, sides };
      });
    }

    updateStabs(t) {
      const p1 = clamp(t / 0.6, 0, 1), p2 = clamp((t - 0.6) / 0.4, 0, 1);
      this.stabs.forEach(({ sd, y, hw, sides }) => {
        const half = hw + (sd.extended / 2 - hw) * p1;
        sides.forEach(({ s, beam, band, bl, legHead, leg, rod, pad, mat }) => {
          beam.position.set(sd.x, y, s * (half - bl / 2));
          band.position.set(sd.x, y, s * (half - 0.2));
          const z = s * (half + 0.12);
          legHead.position.set(sd.x, y, z);
          leg.position.set(sd.x, y - 0.1, z);
          const top = y - 0.5;
          const foot = THREE.MathUtils.lerp(y - 0.62, 0.1, p2);
          rod.position.set(sd.x, (top + foot) / 2, z); rod.scale.y = Math.max(0.01, top - foot);
          pad.position.set(sd.x, foot, z);
          mat.visible = p1 >= 0.999;
          mat.position.set(sd.x, 0.035, z);
        });
      });
    }

    /* --------------------------------------------------------------- update */
    update(model, st, ev, tipW, hookW, time) {
      const kin = ev.kin, c = model.column;
      this.slew.rotation.y = st.slew * DEG;

      kin.booms.forEach((kb, i) => {
        const B = this.booms[i];
        B.g.rotation.z = (kb.abs - (i ? kin.booms[i - 1].abs : 0)) * DEG;
        if (i === 0) B.g.position.set(c.pivotOffset, c.pivotHeight, 0);
        else B.g.position.set(kin.booms[i - 1].len, 0, 0);
        let tip = B.def.length;
        B.secs.forEach((s, k) => { tip += kb.outs[k]; s.mesh.position.x = tip - s.len / 2; });
        B.tipHead.position.x = kb.len;
      });

      const P = ref => {
        if (ref.boom < 0) return [ref.x, ref.y];
        const b = kin.booms[ref.boom];
        const al = ref.fromEnd ? b.len + ref.along : ref.along;
        return [b.x + b.dx * al - b.dy * ref.perp, b.y + b.dy * al + b.dx * ref.perp];
      };
      this.cyls.forEach(({ cd, g, barrel, capE, rod, eyeB, hose }) => {
        const A = P(cd.from), Bp = P(cd.to);
        const dx = Bp[0] - A[0], dy = Bp[1] - A[1], d = Math.hypot(dx, dy);
        g.position.set(A[0], A[1], 0);
        g.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
        const bl = Math.min(cd.barrel, d * 0.98);
        barrel.scale.y = bl; barrel.position.y = bl / 2;
        capE.position.y = bl - 0.02;
        hose.scale.y = bl * 0.8; hose.position.y = bl * 0.45;
        const rs = bl * 0.95, rl = Math.max(0.02, d - rs);
        rod.scale.y = rl; rod.position.y = rs + rl / 2;
        eyeB.position.y = d;
      });

      this.updateStabs(st.outrigger);

      // guincho: tambor gira conforme o cabo é pago/recolhido; cabo segue por cima das lanças
      if (this.winch) {
        const W = this.winch, wd = model.winch;
        const wound = clamp(1 - st.cable / wd.maxCable, 0, 1);
        const rr = W.R + 0.012 + 0.05 * wound;
        W.rope.scale.set(rr, rr, 1);
        W.drum.rotation.z = -st.cable / W.R;
        const pts = [P({ boom: W.mt.boom, along: W.mt.along, perp: W.h / 2 + 0.2 + rr })];
        for (let j = W.mt.boom; j < kin.booms.length; j++) {
          const bj = kin.booms[j], dj = model.booms[j];
          const sh = dj.section[1] * Math.pow(0.86, dj.extensions.length);
          const off = sh / 2 + 0.05;
          pts.push([bj.ex - bj.dy * off, bj.ey + bj.dx * off]);
        }
        W.segs.forEach((s, i) => stretch(s, new THREE.Vector3(pts[i][0], pts[i][1], 0), new THREE.Vector3(pts[i + 1][0], pts[i + 1][1], 0)));
      }

      // cabo, gancho e carga
      stretch(this.cable, hookW, tipW);
      this.hookG.position.copy(hookW);
      const sl = model.hook.slingLength, bh = model.hook.blockHeight;
      this.loadG.visible = st.load > 0;
      if (st.load > 0) {
        const s = kin.loadH;
        const kgR = Math.round(st.load);
        if (kgR !== this.crateKg) {
          if (this.crateMat.map) this.crateMat.map.dispose();
          this.crateMat.map = crateTexture(kgR); this.crateMat.needsUpdate = true; this.crateKg = kgR;
        }
        this.loadG.position.copy(hookW);
        this.crate.scale.set(s, s, s);
        this.crate.position.set(0, -bh - sl - s / 2, 0);
        const a = new THREE.Vector3(0.1, -bh + 0.02, 0);
        this.slings.forEach(m => {
          const b = new THREE.Vector3(m.userData.sx * s * 0.45, -bh - sl, m.userData.sz * s * 0.45);
          stretch(m, a, b);
        });
      }

      // anéis e marcação do raio
      const r = Math.max(0.01, kin.radius);
      this.workRing.scale.set(r, 1, r);
      const col = ev.col.count || ev.util > 1 || (ev.susp > 0 && ev.cap.reason) ? '#ff3b30' : ev.util > 0.9 ? '#ffb020' : '#39d98a';
      this.workRing.material.color.set(col);
      this.hookMark.material.color.set(col);
      this.hookMark.position.set(hookW.x, 0.03, hookW.z);

      const danger = ev.col.count > 0 || ev.util > 1 || (ev.susp > 0 && !!ev.cap.reason);
      const e = danger ? 0.18 + 0.18 * Math.sin(time * 9) : 0;
      this.alarmMats.forEach(m => m.emissive.setRGB(e, 0, 0));
    }

    /* --------------------------------------------------------------- câmera */
    setView(name, info, instant) {
      this.view = name;
      const R = info.maxR, H = info.maxH, cx = info.cx;
      const tx = info.truckX ?? cx, ty = info.truckY ?? 1.5;
      let pos, tgt;
      switch (name) {
        // alvo da câmera = centro do caminhão → o zoom (roda do mouse) aproxima mantendo o caminhão no centro
        case 'lateral': tgt = new THREE.Vector3(tx, ty, 0); pos = new THREE.Vector3(tx, ty, Math.max(R, H) * 2.6); break;
        case 'superior': tgt = new THREE.Vector3(tx, 0, 0); pos = new THREE.Vector3(tx, R * 3.6, 0.01); break;
        case 'operador': pos = new THREE.Vector3(cx + 0.3, 1.72, info.width / 2 + 1.4); tgt = info.hook.clone(); break;
        case 'cabine': {   // close da cabine (3/4 frontal)
          const cb = info.cab || { x0: tx - 3, x1: tx - 1, top: 3 };
          tgt = new THREE.Vector3((cb.x0 + cb.x1) / 2, cb.top * 0.55, 0);
          pos = new THREE.Vector3(cb.x0 - 4.2, cb.top * 0.75, 3.6); break;
        }
        case 'gancho': tgt = info.hook.clone(); pos = tgt.clone().add(new THREE.Vector3(-6, 3.5, 8)); break;
        default: tgt = new THREE.Vector3(tx, ty, 0); pos = new THREE.Vector3(tx - R * 0.95, ty + H * 0.55, R * 1.45);
      }
      if (instant) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.camAnim = null; return; }
      this.camAnim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, k: 0 };
    }

    tick(dt, hookW) {
      const C = this.camera, ctl = this.controls;
      if (this.camAnim) {
        const a = this.camAnim; a.k = Math.min(1, a.k + dt / 0.9);
        const e = a.k < 0.5 ? 4 * a.k ** 3 : 1 - (-2 * a.k + 2) ** 3 / 2;
        if (this.view === 'gancho' || this.view === 'operador') a.t1.copy(hookW);
        C.position.lerpVectors(a.p0, a.p1, e);
        ctl.target.lerpVectors(a.t0, a.t1, e);
        if (a.k >= 1) this.camAnim = null;
      } else if (this.view === 'gancho') {
        const d = hookW.clone().sub(ctl.target).multiplyScalar(Math.min(1, dt * 4));
        ctl.target.add(d); C.position.add(d);
      } else if (this.view === 'operador') {
        ctl.target.lerp(hookW, Math.min(1, dt * 4));
      }
      ctl.update();
      this.renderer.render(this.scene, C);
    }
  }

  window.CraneScene = CraneScene;
})();
