// ---------------------------------------------------------------------------
// Vue de la maison : contrôleur 3D (House3D) + repli Plan 2D (Plan2D).
// Les deux exposent la même API pour l'interface :
//   select(roomId|null, {shiftY}), resetView(), setActive(bool), resize(),
//   setMarkers(devices), refresh(), destroy()
// et appellent onRoom(roomId) / onDevice(deviceId) quand on touche la scène.
// La 3D ne lit QUE le store (pièces, appareils, états) : aucune valeur codée.
// ---------------------------------------------------------------------------
import { GLView, OrbitCam, MeshBuilder, MAT } from './gl.js';
import { buildHouse, lightRadius, lightRgb, LH, levelOf } from './world.js';
import { DEVICE_TYPES } from './catalog.js';
import { icon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ============================================================ base commune
class StageBase {
  constructor({ stage, store, onRoom, onDevice }) {
    this.stage = stage; this.store = store; this.onRoom = onRoom || (() => {}); this.onDevice = onDevice || (() => {});
    this.active = true; this.selId = null; this.markerDevs = []; this.pills = []; this.markerEls = [];
    this.w = 1; this.h = 1;
    const nl = Math.max(1, store.state.layout.levels || 1);
    this.viewLevel = Math.min(store.state.ui.level || 0, nl - 1);
  }
  roomVisible(r) { return r.outdoor ? this.viewLevel === 0 : levelOf(r) === this.viewLevel; }
  renderLevels() {
    if (!this.levelsEl) return;
    const n = Math.max(1, this.store.state.layout.levels || 1);
    this.levelsEl.hidden = n < 2;
    this.levelsEl.innerHTML = n < 2 ? '' : Array.from({ length: n }, (_, i) => `<button class="lvl ${i === this.viewLevel ? 'on' : ''}" data-lv="${i}">${i === 0 ? 'RDC' : 'Étage ' + i}</button>`).join('');
  }
  initDom(extra = '') {
    this.stage.innerHTML = `${extra}<svg class="h3d-lines"></svg><div class="h3d-labels"></div><div class="h3d-markers"></div><div class="stage-levels" hidden></div>`;
    this.levelsEl = this.stage.querySelector('.stage-levels');
    this.levelsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-lv]'); if (b) this.setViewLevel(+b.dataset.lv); });
    this.linesEl = this.stage.querySelector('.h3d-lines');
    this.labelsEl = this.stage.querySelector('.h3d-labels');
    this.markersEl = this.stage.querySelector('.h3d-markers');
    this.labelsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-room]'); if (b) this.onRoom(b.dataset.room);
    });
    this.markersEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dev]'); if (b) this.onDevice(b.dataset.dev);
    });
  }
  buildLabels() {
    const st = this.store.state;
    this.labelsEl.innerHTML = ''; this.linesEl.innerHTML = ''; this.pills = [];
    st.rooms.forEach((r) => {
      if (r.hideLabel) return;
      const el = document.createElement('button');
      el.className = 'pill'; el.dataset.room = r.id; el.type = 'button';
      el.innerHTML = `<span class="pill-ico">${icon(r.icon, 18)}</span><span class="pill-t"><b>${esc(r.name)}</b><small></small></span><i class="pill-dot"></i>`;
      this.labelsEl.appendChild(el);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'h3d-line'); this.linesEl.appendChild(line);
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '3'); dot.setAttribute('class', 'h3d-anchor'); this.linesEl.appendChild(dot);
      this.pills.push({ room: r, el, line, dot, small: el.querySelector('small'), dotEl: el.querySelector('.pill-dot'), pw: 0, ph: 0, x: 0, y: 0, ax: 0, ay: 0, vis: false });
    });
    this.refreshLabelTexts();
    requestAnimationFrame(() => { this.pills.forEach((p) => { p.pw = p.el.offsetWidth; p.ph = p.el.offsetHeight; }); this.overlayDirty = true; });
  }
  refreshLabelTexts() {
    this.pills.forEach((p) => {
      const s = this.store.roomSummary(p.room);
      if (p.small.textContent !== s.text) p.small.textContent = s.text;
      p.dotEl.className = `pill-dot tone-${s.tone}`;
      p.el.classList.toggle('sel', this.selId === p.room.id);
    });
  }
  setMarkers(devs) {
    this.markerDevs = devs || [];
    this.markersEl.innerHTML = '';
    this.markerEls = this.markerDevs.map((d) => {
      const t = DEVICE_TYPES[d.type];
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'marker'; b.dataset.dev = d.id; b.setAttribute('aria-label', d.name);
      b.innerHTML = icon(t ? t.icon : 'info', 17);
      this.markersEl.appendChild(b);
      return b;
    });
    this.updateMarkerStates(); this.overlayDirty = true;
  }
  updateMarkerStates() {
    this.markerEls.forEach((b, i) => {
      const d = this.markerDevs[i]; const t = DEVICE_TYPES[d.type];
      b.classList.toggle('on', !!(t && t.isOn(d.state)));
    });
  }
  // Placement des pastilles : vers l'extérieur, sans chevauchement, dans l'écran
  layoutOverlay() {
    const W = this.w, H = this.h;
    const vis = this.pills.filter((p) => { const a = this.anchorOf(p.room); p.ax = a[0]; p.ay = a[1]; p.vis = a[2] && this.roomVisible(p.room); return p.vis; });
    if (vis.length) {
      const cx = vis.reduce((s, p) => s + p.ax, 0) / vis.length, cy = vis.reduce((s, p) => s + p.ay, 0) / vis.length;
      vis.forEach((p) => {
        let dx = p.ax - cx, dy = p.ay - cy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const off = this.pillOffset || 46;
        p.x = p.ax + dx * off * 1.25; p.y = p.ay + dy * off * 0.9 - 6;
      });
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
          const a = vis[i], b = vis[j];
          const ox = (a.pw + b.pw) / 2 + 6 - Math.abs(a.x - b.x), oy = (a.ph + b.ph) / 2 + 4 - Math.abs(a.y - b.y);
          if (ox > 0 && oy > 0) {
            if (oy < ox) { const s = a.y <= b.y ? -1 : 1; a.y += s * oy / 2; b.y -= s * oy / 2; }
            else { const s = a.x <= b.x ? -1 : 1; a.x += s * ox / 2; b.x -= s * ox / 2; }
          }
        }
        vis.forEach((p) => {
          p.x = Math.min(W - p.pw / 2 - 6, Math.max(p.pw / 2 + 6, p.x));
          p.y = Math.min(H - p.ph / 2 - 6, Math.max(p.ph / 2 + 4, p.y));
        });
      }
    }
    this.pills.forEach((p) => {
      p.el.style.transform = `translate3d(${(p.x - p.pw / 2).toFixed(1)}px,${(p.y - p.ph / 2).toFixed(1)}px,0)`;
      p.el.style.visibility = p.vis ? 'visible' : 'hidden';
      const faded = this.selId && this.selId !== p.room.id;
      p.el.classList.toggle('faded', !!faded);
      p.line.setAttribute('x1', p.x.toFixed(1)); p.line.setAttribute('y1', (p.y + p.ph / 2 - 2).toFixed(1));
      p.line.setAttribute('x2', p.ax.toFixed(1)); p.line.setAttribute('y2', p.ay.toFixed(1));
      p.dot.setAttribute('cx', p.ax.toFixed(1)); p.dot.setAttribute('cy', p.ay.toFixed(1));
      const op = p.vis ? (faded ? 0.12 : 1) : 0;
      p.line.style.opacity = op; p.dot.style.opacity = op;
    });
    this.markerEls.forEach((b, i) => {
      const d = this.markerDevs[i]; const m = this.markerPos(d);
      b.style.transform = `translate3d(${(m[0] - 17).toFixed(1)}px,${(m[1] - 17).toFixed(1)}px,0)`;
      b.style.visibility = m[2] ? 'visible' : 'hidden';
    });
    this.overlayDirty = false;
  }
  roomAtXZ(x, z, lv = this.viewLevel) {
    const rooms = this.store.state.rooms, inr = (q) => x >= q.rect[0] && x < q.rect[2] && z >= q.rect[1] && z < q.rect[3];
    const ind = rooms.find((q) => !q.outdoor && levelOf(q) === lv && inr(q));
    if (ind || lv > 0) return ind || null;
    return rooms.find((q) => q.outdoor && q.id !== 'jardin' && inr(q)) || rooms.find((q) => q.id === 'jardin' && inr(q)) || null;
  }
  nearestMarker(px, py, radius = 26) {
    let best = null, bd = radius;
    this.markerDevs.forEach((d) => { const m = this.markerPos(d); if (!m[2]) return; const dd = Math.hypot(m[0] - px, m[1] - py); if (dd < bd) { bd = dd; best = d; } });
    return best;
  }
  setActive(a) { this.active = a; if (a) { this.dirty = true; this.overlayDirty = true; } }
  refresh() { this.refreshLabelTexts(); this.updateMarkerStates(); }
}

// ================================================================== 3D
export class House3D extends StageBase {
  constructor(opts) {
    super(opts);
    this.initDom('<canvas class="h3d-canvas" aria-label="Maison en 3D"></canvas><div class="h3d-loading"><div class="spin"></div></div>');
    this.canvas = this.stage.querySelector('canvas');
    this.loadingEl = this.stage.querySelector('.h3d-loading');
    this.view = new GLView(this.canvas); // lève une exception si WebGL2 indisponible
    this.cam = new OrbitCam();
    this.dirty = true; this.overlayDirty = true; this.time = 0; this.last = performance.now();
    this.selIdx = -1; this.quality = 'high'; this.frameAvg = 16; this.frameN = 0; this.slowStrikes = 0;
    this.lightCur = []; this.ring = null; this.pillOffset = 46;
    this.build();
    this.bindGestures();
    this.bindContext();
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    setTimeout(() => this.loadingEl && this.loadingEl.classList.add('done'), 350);
  }

  // ---- (re)construction à partir des données --------------------------------
  fitHome() {
    const all = this.store.state.rooms, rs = all.filter((r) => r.id !== 'jardin'), use = rs.length ? rs : all;
    let x1 = 1e9, z1 = 1e9, x2 = -1e9, z2 = -1e9;
    use.forEach((r) => { x1 = Math.min(x1, r.rect[0]); z1 = Math.min(z1, r.rect[1]); x2 = Math.max(x2, r.rect[2]); z2 = Math.max(z2, r.rect[3]); });
    if (x1 > x2) { x1 = 0; z1 = 0; x2 = 10; z2 = 10; }
    const mg = this.fitMargin === undefined ? 4 : this.fitMargin;
    this.bw = Math.max(8, x2 - x1 + mg); this.bd = Math.max(8, z2 - z1 + mg); // construction + marge
    this.cam.home.target = [(x1 + x2) / 2, this.viewLevel * LH * 0.5, (z1 + z2) / 2];
  }
  build() {
    const st = this.store.state, view = this.view;
    this.fitHome();
    this.viewLevel = Math.min(this.viewLevel, Math.max(1, st.layout.levels || 1) - 1);
    const w = buildHouse(st, { maxLevel: this.viewLevel });
    this.world = w;
    view.setStatic(w.mb);
    view.clearDynamics();
    this.dyn = w.dynamics.map((d) => {
      const m = view.addDynamic(d.builder, [0, 1, 0]);
      m.kind = d.kind; m.deviceId = d.deviceId; m.cur = null; m.info = d; m.pose = null; return m;
    });
    this.applCur = w.applDevs.map(() => 0);
    view.setGlowCount(w.lightDevs.length);
    this.lightCur = w.lightDevs.map(() => 0);
    this.lightsSnap = true; // 1re synchro sans animation
    this.buildRing();
    this.buildLabels();
    this.renderLevels();
    this.dirty = true;
  }
  setViewLevel(l, { fly = true } = {}) {
    const n = Math.max(1, this.store.state.layout.levels || 1); l = Math.max(0, Math.min(n - 1, l));
    if (l === this.viewLevel) return;
    this.viewLevel = l; this.store.setUi('level', l);
    if (this.selId) { const r = this.store.room(this.selId); if (r && !this.roomVisible(r)) { this.selId = null; this.selIdx = -1; } }
    this.build(); this.resize();
    if (fly && !this.selId) { this.cam.tw = null; this.cam.flyTo({ az: this.cam.az, el: this.cam.home.el, dist: this.cam.home.dist, target: this.cam.home.target.slice(), shiftY: 0 }); }
    if (this.onLevel) this.onLevel(l);
  }
  buildRing() {
    const st = this.store.state; const r = st.rooms.find((x) => x.id === this.selId);
    if (!this.ring) { this.ring = this.view.addDynamic(new MeshBuilder(), [0, 1, 0]); }
    const b = new MeshBuilder();
    if (r && r.id !== 'jardin') {
      const [x1, z1, x2, z2] = r.rect, y = (r.outdoor ? 0.1 : 0.09) + levelOf(r) * LH, t = 0.11, c = '#4db2ff';
      b.attr({ room: -1, mat: MAT.RING, emis: 1 });
      b.box((x1 + x2) / 2, y, z1 + t / 2, x2 - x1, 0.03, t, c, { ao: 1 }); b.box((x1 + x2) / 2, y, z2 - t / 2, x2 - x1, 0.03, t, c, { ao: 1 });
      b.box(x1 + t / 2, y, (z1 + z2) / 2, t, 0.03, z2 - z1 - 2 * t, c, { ao: 1 }); b.box(x2 - t / 2, y, (z1 + z2) / 2, t, 0.03, z2 - z1 - 2 * t, c, { ao: 1 });
    } else b.box(0, -50, 0, 0.01, 0.01, 0.01, '#000');
    this.view.replaceDynamic(this.ring, b);
  }

  // ---- synchronisation avec le store -----------------------------------------
  syncFromStore(dt) {
    const st = this.store.state, v = this.view, k = Math.min(1, dt * 7);
    let animating = false;
    const roomMax = {};
    this.world.lightDevs.forEach((d, i) => {
      const target = d.state.on ? 0.22 + 0.78 * (d.state.brightness / 100) : 0;
      let cur = this.lightCur[i];
      if (this.lightsSnap) cur = target; else cur += (target - cur) * k;
      if (Math.abs(target - cur) > 0.003) animating = true; else cur = target;
      if (cur !== this.lightCur[i]) this.dirty = true;
      this.lightCur[i] = cur;
      const ri = this.world.roomIdx[d.roomId], room = st.rooms[ri];
      v.setLight(i, d.pos, lightRgb(d.state), lightRadius(st, d), room && room.outdoor ? -1 : ri, cur);
      roomMax[ri] = Math.max(roomMax[ri] || 0, cur);
    });
    for (let i = 0; i < st.rooms.length && i < 24; i++) v.setRoomGlow(i, roomMax[i] || 0);
    this.lightsSnap = false;
    // LED des appareils connectés (lave-vaisselle, micro-ondes, robot)
    this.world.applDevs.forEach((d, i) => {
      const s = d.state; let tgt = 0;
      if (d.type === 'dishwasher') tgt = s.status === 'running' ? 1 : s.status === 'done' ? 0.55 : 0;
      else if (d.type === 'microwave') tgt = s.status === 'cooking' ? 1 : 0;
      else tgt = s.status === 'cleaning' || s.status === 'returning' ? 1 : s.status === 'charging' ? 0.45 : s.status === 'paused' ? 0.3 : 0.12;
      let cur = this.applCur[i]; cur += (tgt - cur) * Math.min(1, dt * 6); if (Math.abs(tgt - cur) < 0.004) cur = tgt; else animating = true;
      if (cur !== this.applCur[i]) this.dirty = true; this.applCur[i] = cur; v.setAppliance(i, cur);
    });
    // objets animés : volets / porte de garage (rideau à lames qui s'enroule) et robot aspirateur
    this.dyn.forEach((m) => {
      const d = this.store.device(m.deviceId); if (!d) return;
      const I = m.info;
      if (m.kind === 'roll' || m.kind === 'rollbar') {
        const target = I.src === 'garage' ? d.state.position : (d.state.actual === undefined ? d.state.position : d.state.actual);
        if (m.cur === null) m.cur = target;
        const diff = target - m.cur;
        if (Math.abs(diff) > 0.05) { m.cur += Math.sign(diff) * Math.min(Math.abs(diff), (I.src === 'garage' ? 27 : 25) * dt); animating = true; this.dirty = true; }
        const open = Math.max(0, Math.min(1, m.cur / 100));
        if (m.kind === 'roll') { m.clip = I.yTop - (1 - open) * I.hW; m.hidden = open >= 0.995; } else m.dyn[2] = open * I.hW;
      } else if (m.kind === 'vacuum') {
        const s = d.state, tx = s.x === undefined ? 0 : s.x, tz = s.z === undefined ? 0 : s.z, ta = s.ang || 0;
        if (!m.pose) m.pose = [tx, tz, ta];
        const k = Math.min(1, dt * 5), da = ((ta - m.pose[2] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        const nx = m.pose[0] + (tx - m.pose[0]) * k, nz = m.pose[1] + (tz - m.pose[1]) * k, na = m.pose[2] + da * Math.min(1, dt * 8);
        if (Math.abs(nx - m.pose[0]) + Math.abs(nz - m.pose[1]) > 0.0004 || Math.abs(da) > 0.003) { animating = true; this.dirty = true; }
        m.pose = [nx, nz, na]; m.move = [nx, nz, na];
      }
    });
    return animating;
  }

  // ---- boucle de rendu ------------------------------------------------------------
  loop(now) {
    if (this.dead) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.3, (now - this.last) / 1000);
    if (!this.active || document.hidden) { this.last = now; return; }
    const ambient = this.quality === 'high' && this.view.glowCount > 0; // eau / pulsation
    if (!this.dirty && !this.cam.tw && Math.abs(this.cam.vel.az) < 0.0004 && !this.lightsAnimating) {
      // rien ne bouge : on n'anime l'eau qu'à ~30 im/s max
      if (!ambient || now - this.last < 33) return;
    }
    this.last = now; this.time += dt;
    if (this.cam.update(dt)) { this.dirty = true; this.overlayDirty = true; }
    this.lightsAnimating = this.syncFromStore(dt);
    this.draw();
    this.trackPerf(dt);
  }
  draw() {
    const aspect = this.w / this.h;
    const vp = this.cam.matrices(aspect);
    const b = this.cam.basis();
    this.view.render({
      vp, eye: this.cam.eye, camDir: [Math.sin(this.cam.az), Math.cos(this.cam.az)],
      time: this.time, sel: this.selIdx, low: this.quality === 'low', right: b.right, up: b.up,
    });
    if (this.overlayDirty || this.cam.tw) this.layoutOverlay();
    this.dirty = false;
  }
  trackPerf(dt) {
    if (this.settings === 'high' || this.settings === 'low') return;
    this.frameAvg = this.frameAvg * 0.94 + dt * 1000 * 0.06; this.frameN++;
    if (this.frameN > 90 && this.frameAvg > 36 && this.quality === 'high') { if (++this.slowStrikes > 40) { this.setQuality('low', true); } } else this.slowStrikes = Math.max(0, this.slowStrikes - 1);
  }
  setQuality(mode, auto = false) {
    this.settings = auto ? 'auto' : mode;
    this.quality = mode === 'low' ? 'low' : 'high';
    this.resize(); this.dirty = true;
    if (auto && this.onAutoDowngrade) this.onAutoDowngrade();
  }
  applySetting(g) { // 'auto' | 'high' | 'low'
    this.settings = g; this.frameN = 0; this.slowStrikes = 0; this.frameAvg = 16;
    this.quality = g === 'low' ? 'low' : 'high'; this.resize(); this.dirty = true;
  }
  resize() {
    const r = this.stage.getBoundingClientRect();
    this.w = Math.max(2, r.width); this.h = Math.max(2, r.height);
    const dprCap = this.quality === 'low' ? 1.25 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.view.resize(this.w, this.h, dpr);
    // cadrage : la maison doit tenir en largeur quelle que soit la forme du bloc
    const aspect = this.w / this.h;
    const az = this.cam.home.az, pw = (this.bw || 18.8) * Math.cos(az) + (this.bd || 17.4) * Math.sin(az);
    const ph = ((this.bw || 18.8) * Math.sin(az) + (this.bd || 17.4) * Math.cos(az)) * Math.sin(this.cam.home.el) + 3;
    const k = 2 * Math.tan(this.cam.fov / 2);
    this.cam.home.dist = Math.min(120, Math.max(14, Math.max(((this.fitK || 0.9) * pw) / (k * Math.min(1.2, aspect)), ((this.fitK || 0.9) * 1.05 * (ph + this.viewLevel * LH)) / k)));
    if (!this.selId && !this.userMoved) { this.cam.tw = null; this.cam.reset(false); }
    this.pillOffset = this.w < 420 ? 30 : 50;
    this.dirty = true; this.overlayDirty = true;
    if (this.pills.length) requestAnimationFrame(() => { this.pills.forEach((p) => { p.pw = p.el.offsetWidth; p.ph = p.el.offsetHeight; }); this.overlayDirty = true; this.dirty = true; });
  }

  // ---- projection pour les surcouches ------------------------------------------
  anchorOf(room) { const [x1, z1, x2, z2] = room.rect; return this.cam.project([(x1 + x2) / 2, room.outdoor ? 0.3 : levelOf(room) * LH + 1.2, (z1 + z2) / 2], this.w, this.h); }
  markerPos(d) { return this.cam.project(d.pos, this.w, this.h); }

  // ---- API interface ----------------------------------------------------------------
  select(roomId, { shiftY = 0.27 } = {}) {
    const st = this.store.state;
    if (roomId) { const rr = st.rooms.find((x) => x.id === roomId); if (rr) { const lv = rr.outdoor ? 0 : levelOf(rr); if (lv !== this.viewLevel) this.setViewLevel(lv, { fly: false }); } }
    this.selId = roomId; this.selIdx = roomId ? st.rooms.findIndex((r) => r.id === roomId) : -1;
    this.buildRing();
    if (!roomId) this.cam.flyTo({ az: this.cam.az, el: this.cam.home.el, dist: this.cam.home.dist, target: this.cam.home.target.slice(), shiftY: 0 });
    else {
      const r = st.rooms.find((x) => x.id === roomId); const [x1, z1, x2, z2] = r.rect;
      const wide = r.id === 'jardin';
      const size = Math.max(x2 - x1, z2 - z1);
      this.cam.flyTo({
        az: this.cam.az, el: Math.max(0.95, this.cam.el),
        dist: wide ? this.cam.home.dist : Math.min(30, Math.max(14, size * 2.3 + 7)),
        target: wide ? this.cam.home.target.slice() : [(x1 + x2) / 2, levelOf(r) * LH, (z1 + z2) / 2], shiftY: wide ? 0 : shiftY,
      });
    }
    this.refreshLabelTexts(); this.dirty = true; this.overlayDirty = true;
  }
  resetView() { this.userMoved = false; this.cam.reset(true); this.dirty = true; }
  refresh() { super.refresh(); this.dirty = true; }
  rebuild() { this.build(); this.resize(); if (this.selId && !this.store.room(this.selId)) this.select(null); }

  // ---- gestes : rotation / pinch / déplacement / tap ------------------------------
  bindGestures() {
    const c = this.canvas, pts = new Map(); let tap = null, pinch = null;
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId); const p = pos(e); pts.set(e.pointerId, { ...p, px: p.x, py: p.y });
      if (pts.size === 1) tap = { x: p.x, y: p.y, t: performance.now(), moved: false };
      else { tap = null; const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
      this.cam.vel.az = this.cam.vel.el = 0; this.cam.tw = null;
    });
    c.addEventListener('pointermove', (e) => {
      const q = pts.get(e.pointerId); if (!q) return; const p = pos(e);
      const dx = p.x - q.x, dy = p.y - q.y; q.x = p.x; q.y = p.y;
      if (pts.size === 1) {
        if (tap && !tap.moved && Math.hypot(p.x - tap.x, p.y - tap.y) > 6) tap.moved = true;
        if (!tap || tap.moved) { this.cam.rotate(dx, dy); this.userMoved = true; this.dirty = true; this.overlayDirty = true; }
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (pinch.d > 1) this.cam.zoom(pinch.d / d);
        this.cam.pan(mx - pinch.mx, my - pinch.my, this.h);
        pinch = { d, mx, my }; this.userMoved = true; this.dirty = true; this.overlayDirty = true;
      }
    });
    const end = (e) => {
      const q = pts.get(e.pointerId); pts.delete(e.pointerId);
      if (tap && !tap.moved && performance.now() - tap.t < 400 && pts.size === 0 && q) this.handleTap(q.x, q.y);
      if (pts.size < 2) pinch = null; if (pts.size === 0) tap = null;
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.zoom(Math.exp(e.deltaY * 0.0012)); this.userMoved = true; this.dirty = true; this.overlayDirty = true; }, { passive: false });
    c.addEventListener('dblclick', () => this.resetView());
  }
  handleTap(x, y) {
    const m = this.nearestMarker(x, y); if (m) { this.onDevice(m.id); return; }
    let room = null;
    for (let L = this.viewLevel; L >= 0 && !room; L--) {
      const g = this.cam.pickGround(x, y, this.w, this.h, L * LH + 0.08); if (!g) continue;
      const r = this.roomAtXZ(g[0], g[2], L); if (r && (L === this.viewLevel || !r.outdoor)) room = r;
    }
    this.onRoom(room ? room.id : null);
  }
  bindContext() {
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; try { this.view = new GLView(this.canvas); this.build(); this.resize(); } catch (err) { console.error(err); } });
  }
  destroy() { this.active = false; this.dead = true; }
  get stats() { return { tris: this.view.stats.tris, draws: this.view.stats.draws, quality: this.quality, fps: Math.round(1000 / this.frameAvg) }; }
}

// ================================================================== 2D
const FLOOR2D = { wood: '#7a5a3c', tile: '#8b93a0', lino: '#9aa1ab', concrete: '#59606a', grass: '#173322', water: '#1f78b4' };
export class Plan2D extends StageBase {
  constructor(opts) {
    super(opts);
    this.initDom('<canvas class="h3d-canvas" aria-label="Plan 2D"></canvas>');
    this.canvas = this.stage.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.dirty = true; this.overlayDirty = true; this.pillOffset = 30;
    this.canvas.addEventListener('pointerup', (e) => {
      const r = this.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      const m = this.nearestMarker(x, y); if (m) return this.onDevice(m.id);
      const wx = (x - this.tx) / this.sc, wz = (y - this.ty) / this.sc; const room = this.roomAtXZ(wx, wz);
      this.onRoom(room ? room.id : null);
    });
    this.buildLabels(); this.resize();
    this.loop = () => { if (this.dead) return; requestAnimationFrame(this.loop); if (this.active && this.dirty) this.draw(); };
    requestAnimationFrame(this.loop);
  }
  resize() {
    const r = this.stage.getBoundingClientRect(); this.w = r.width; this.h = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rooms = this.store.state.rooms.filter((q) => q.id !== 'jardin');
    const minx = Math.min(...rooms.map((q) => q.rect[0])) - 0.6, maxx = Math.max(...rooms.map((q) => q.rect[2])) + 0.6;
    const minz = Math.min(...rooms.map((q) => q.rect[1])) - 0.6, maxz = Math.max(...rooms.map((q) => q.rect[3])) + 0.6;
    this.sc = Math.min(this.w / (maxx - minx), this.h / (maxz - minz)) * 0.94;
    this.tx = (this.w - (maxx - minx) * this.sc) / 2 - minx * this.sc; this.ty = (this.h - (maxz - minz) * this.sc) / 2 - minz * this.sc;
    this.dirty = true; this.overlayDirty = true;
    requestAnimationFrame(() => { this.pills.forEach((p) => { p.pw = p.el.offsetWidth; p.ph = p.el.offsetHeight; }); this.overlayDirty = true; });
  }
  draw() {
    const c = this.ctx, st = this.store.state, S = this.sc;
    c.clearRect(0, 0, this.w, this.h);
    const P = (x, z) => [this.tx + x * S, this.ty + z * S];
    st.rooms.forEach((r) => {
      if (r.id !== 'jardin' && !this.roomVisible(r)) return;
      const [x1, z1, x2, z2] = r.rect, [ax, ay] = P(x1, z1);
      const dim = this.selId && this.selId !== r.id && r.id !== 'jardin' ? 0.45 : 1;
      c.globalAlpha = dim; c.fillStyle = (!r.outdoor && r.floorColor) || FLOOR2D[r.floor] || '#555';
      if (r.id === 'jardin') { c.globalAlpha = 0.55; }
      c.fillRect(ax, ay, (x2 - x1) * S, (z2 - z1) * S);
      c.globalAlpha = 1;
      if (r.id !== 'jardin') { c.strokeStyle = this.selId === r.id ? '#4db2ff' : 'rgba(255,255,255,.85)'; c.lineWidth = this.selId === r.id ? 3 : 2; c.strokeRect(ax, ay, (x2 - x1) * S, (z2 - z1) * S); }
    });
    st.devices.filter((d) => d.type === 'light' && d.state.on).forEach((d) => { const [x, y] = P(d.pos[0], d.pos[2]); const g = c.createRadialGradient(x, y, 0, x, y, S * 2.2); g.addColorStop(0, 'rgba(255,200,110,.35)'); g.addColorStop(1, 'rgba(255,200,110,0)'); c.fillStyle = g; c.fillRect(x - S * 2.2, y - S * 2.2, S * 4.4, S * 4.4); });
    this.dirty = false; if (this.overlayDirty) this.layoutOverlay();
  }
  anchorOf(room) { const [x1, z1, x2, z2] = room.rect; return [this.tx + ((x1 + x2) / 2) * this.sc, this.ty + ((z1 + z2) / 2) * this.sc, true]; }
  markerPos(d) { return [this.tx + d.pos[0] * this.sc, this.ty + d.pos[2] * this.sc, true]; }
  select(roomId) { this.selId = roomId; this.refreshLabelTexts(); this.dirty = true; this.overlayDirty = true; }
  resetView() { this.select(null); }
  refresh() { super.refresh(); this.dirty = true; }
  rebuild() { this.buildLabels(); this.resize(); }
  applySetting() {}
  destroy() { this.active = false; this.dead = true; }
  get stats() { return { tris: 0, draws: 1, quality: '2d', fps: 60 }; }
}
