// ---------------------------------------------------------------------------
// Feuilles (bottom sheets) : pièce, appareil, sections rapides, éditeurs de
// scénarios / automatisations, menu, ajout d'appareil. Tout écrit vers le store.
// ---------------------------------------------------------------------------
import { DEVICE_TYPES, CATEGORIES, TONES, DW_PROGRAMS, VAC_MODES, RGB_PRESETS, fmtTemp, fmtPower, fmtMin, fmtClock } from './catalog.js';
import { icon } from './icons.js';
import { sheets, esc, uid, toast, sw, rangeHTML, head } from './dom.js';
import { attachFeed } from './cams.js';
import { APP } from './version.js';
import { planRoute, estimate, dockInfo, indoorRooms, ROBOT } from './robot.js';
import { computeWalls } from './world.js';

const DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const SCENE_ICONS = ['moon', 'home', 'sun', 'leaf', 'bolt', 'sofa', 'bed', 'car', 'shield', 'waves', 'flame', 'camera'];
const SCENE_COLORS = ['#7d7aff', '#0a84ff', '#ffd60a', '#30d158', '#ff9f0a', '#ff453a', '#64d2ff', '#bf5af2'];
const CONTROLLABLE = ['light', 'thermostat', 'ac', 'heater', 'shutter', 'plug', 'lock', 'garage', 'pool', 'motion', 'camera', 'dishwasher', 'microwave', 'vacuum'];
// couleur : teinte (0-360) <-> #rrggbb
const hueHex = (h) => { const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))); }; return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, '0')).join('')}`; };
const hexHue = (hex) => { const n = parseInt(String(hex || '#ff9f0a').slice(1), 16), r = (n >> 16) / 255 & 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255; const R = ((n >> 16) & 255) / 255, mx = Math.max(R, g, b), mn = Math.min(R, g, b), d = mx - mn; if (!d) return 0; const h = mx === R ? ((g - b) / d) % 6 : mx === g ? (b - R) / d + 2 : (R - g) / d + 4; return Math.round(((h * 60) + 360) % 360); };
const TYPE_PLURAL = { dishwasher: 'Lave-vaisselle', microwave: 'Micro-ondes', vacuum: 'Robots aspirateurs', light: 'Éclairages', thermostat: 'Thermostats', ac: 'Climatisations', heater: 'Chauffages', shutter: 'Volets', plug: 'Prises', lock: 'Serrures', garage: 'Portes de garage', pool: 'Piscine', motion: 'Détecteurs', camera: 'Caméras', temp: 'Capteurs' };

// interrupteur rapide selon le type
export const TOGGLE = {
  light: { on: (s) => s.on, patch: (s) => ({ on: !s.on }) },
  plug: { on: (s) => s.on, patch: (s) => ({ on: !s.on }) },
  ac: { on: (s) => s.on, patch: (s) => ({ on: !s.on }) },
  heater: { on: (s) => s.on, patch: (s) => ({ on: !s.on }) },
  camera: { on: (s) => s.on, patch: (s) => ({ on: !s.on }) },
  pool: { on: (s) => s.pump, patch: (s) => ({ pump: !s.pump }) },
  lock: { on: (s) => s.locked, patch: (s) => ({ locked: !s.locked }) },
  garage: { on: (s) => s.position > 1 || s.target > 50, patch: (s) => ({ target: s.position > 1 || s.target > 50 ? 0 : 100 }) },
  motion: { on: (s) => s.armed, patch: (s) => ({ armed: !s.armed }) },
  shutter: { on: (s) => s.position > 5, patch: (s) => ({ position: s.position > 50 ? 0 : 100 }) },
  dishwasher: { on: (s) => s.status === 'running', patch: (s) => ({ command: s.status === 'running' ? 'stop' : 'start' }) },
  microwave: { on: (s) => s.status === 'cooking', patch: (s) => ({ command: s.status === 'cooking' ? 'stop' : 'start' }) },
  vacuum: { on: (s) => s.status === 'cleaning' || s.status === 'returning', patch: (s) => ({ command: s.status === 'cleaning' || s.status === 'returning' ? 'dock' : 'start' }) },
  thermostat: { on: (s) => s.mode !== 'off', patch: (s) => ({ mode: s.mode === 'off' ? 'heat' : 'off' }) },
};

// Carte 2D du robot : pièces cliquables (sélection), murs, portes, itinéraire, robot en direct
function vacMapHTML(store, d) {
  const S = store.state, v = d.state, { level, dockRoom, dock } = dockInfo(S, d), rooms = indoorRooms(S, level);
  if (!rooms.length) return '';
  const sel = v.rooms && v.rooms.length ? v.rooms : [dockRoom], run = ['cleaning', 'paused', 'returning'].includes(v.status), doneSet = new Set(v.done || []);
  const remaining = v.status === 'cleaning' || v.status === 'paused' ? sel.filter((id) => !doneSet.has(id)) : sel;
  const route = planRoute(S, d, remaining), bad = new Set(planRoute(S, d, sel).unreachable);
  const walls0 = computeWalls(S.rooms, S.layout.wallMods, S.layout.walls, level);
  let x1 = 1e9, z1 = 1e9, x2 = -1e9, z2 = -1e9; rooms.forEach((r) => { x1 = Math.min(x1, r.rect[0]); z1 = Math.min(z1, r.rect[1]); x2 = Math.max(x2, r.rect[2]); z2 = Math.max(z2, r.rect[3]); });
  const pad = 0.6, vw = x2 - x1 + pad * 2, vh = z2 - z1 + pad * 2, fs = Math.max(0.32, Math.min(0.5, vw / 26));
  const info = (r) => {
    const isSel = sel.includes(r.id), done = doneSet.has(r.id), cur = v.curRoom === r.id && v.status === 'cleaning', unreach = isSel && bad.has(r.id);
    return { isSel, done, cur, unreach, st: unreach ? 'Inaccessible' : done ? 'Fait ✓' : cur ? 'En cours…' : isSel ? 'À nettoyer' : '' };
  };
  const rects = rooms.map((r) => { const q = info(r); return `<rect class="vr ${q.isSel ? 'sel' : ''} ${q.done ? 'done' : ''} ${q.cur ? 'cur' : ''} ${q.unreach ? 'bad' : ''}" data-act="vroom" data-id="${esc(r.id)}" x="${r.rect[0]}" y="${r.rect[1]}" width="${r.rect[2] - r.rect[0]}" height="${r.rect[3] - r.rect[1]}" rx="0.12"/>`; }).join('');
  const labels = rooms.map((r) => {
    const q = info(r), cx = (r.rect[0] + r.rect[2]) / 2, cz = (r.rect[1] + r.rect[3]) / 2, f = Math.max(0.22, Math.min(fs, (r.rect[2] - r.rect[0]) / (r.name.length * 0.6)));
    return `<text x="${cx}" y="${cz - f * 0.1}" font-size="${f}" class="vt">${esc(r.name)}</text>${q.st ? `<text x="${cx}" y="${cz + f * 1.05}" font-size="${f * 0.78}" class="vt2">${q.st}</text>` : ''}`;
  }).join('');
  const walls = walls0.map((w) => { const h = w.orient === 'h'; return `<line class="vw" x1="${h ? w.a : w.c}" y1="${h ? w.c : w.a}" x2="${h ? w.b : w.c}" y2="${h ? w.c : w.b}"/>`; }).join('');
  const doors = (S.layout.openings || []).filter((o) => (o.level || 0) === level && o.kind === 'door').map((o) => { const sg = walls0.find((w) => (w.orient === 'h' ? Math.abs(o.z - w.c) < 0.03 : Math.abs(o.x - w.c) < 0.03)); const h = !sg || sg.orient === 'h'; return `<line class="vd" x1="${h ? o.x - o.w / 2 : o.x}" y1="${h ? o.z : o.z - o.w / 2}" x2="${h ? o.x + o.w / 2 : o.x}" y2="${h ? o.z : o.z + o.w / 2}"/>`; }).join('');
  const path = route.pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const bx = v.x === undefined ? dock[0] : v.x, bz = v.z === undefined ? dock[1] : v.z;
  return `<div class="vmap"><svg viewBox="${x1 - pad} ${z1 - pad} ${vw} ${vh}" role="group" aria-label="Plan du robot : touchez une pièce pour la choisir">
    ${rects}${walls}${doors}
    <polyline class="vpath" points="${path}"/>
    <polyline class="vdone" data-vdone="${esc(d.id)}" data-total="${route.total.toFixed(2)}" points="${path}" pathLength="1000" stroke-dasharray="0 1000"/>
    <rect class="vdock" x="${dock[0] - 0.22}" y="${dock[1] - 0.22}" width="0.44" height="0.44" rx="0.1"/><text x="${dock[0]}" y="${dock[1] + 0.1}" font-size="0.3" class="vt" style="fill:#0b1220">⚡</text>
    ${labels}
    <circle class="vbot ${run ? 'run' : ''}" data-vrobot="${esc(d.id)}" cx="${bx}" cy="${bz}" r="0.26"/>
  </svg></div>`;
}

export function createSheets(ctx) {
  const { store } = ctx;
  const S = () => store.state;
  const roomName = (id) => { const r = store.room(id); return r ? r.name : '—'; };
  const dock = () => ctx.currentTab() === 'home';

  // ============================================================ PIÈCE
  function openRoom(roomId, opts = {}) {
    const r = store.room(roomId); if (!r) return;
    const asDock = opts.dock ?? dock();
    if (asDock) { ctx.house && ctx.house.select(roomId); ctx.house && ctx.house.setMarkers(store.devicesIn(roomId)); }
    sheets.show({
      id: `room:${roomId}`, dock: asDock,
      render: () => roomHTML(r), actions: roomActions(r, asDock),
      onClose: () => { if (asDock && ctx.house && !sheets.isOpen()) { ctx.house.select(null); ctx.house.setMarkers([]); } },
    });
  }
  function tilesFor(r) {
    const ds = store.devicesIn(r.id), t = [];
    const has = (ty) => ds.some((d) => d.type === ty);
    if (store.roomTemp(r.id) != null) t.push(['Température', `<b data-live="temp:${r.id}">${fmtTemp(store.roomTemp(r.id))}</b>`]);
    if (has('temp')) t.push(['Humidité', `<b data-live="hum:${r.id}"></b>`]);
    if (has('light')) { const on = ds.filter((d) => d.type === 'light' && d.state.on); t.push(['Éclairage', `<b>${on.length ? Math.round(Math.max(...on.map((d) => d.state.brightness))) + ' %' : 'Éteint'}</b>`]); }
    if (has('shutter')) { const sh = ds.filter((d) => d.type === 'shutter'); t.push(['Volets', `<b>${DEVICE_TYPES.shutter.summary(sh[0].state)}</b>`]); }
    if (has('motion')) t.push(['Présence', `<b>${ds.some((d) => d.type === 'motion' && d.state.detected) ? 'Détectée' : 'Aucune'}</b>`]);
    if (has('pool')) t.push(['Eau', `<b data-live="poolt:${ds.find((d) => d.type === 'pool').id}"></b>`]);
    if (has('garage')) t.push(['Porte', `<b>${DEVICE_TYPES.garage.summary(ds.find((d) => d.type === 'garage').state)}</b>`]);
    t.push(['Consommation', `<b data-live="roompow:${r.id}"></b>`]);
    return t;
  }
  function deviceRow(d) {
    const T = DEVICE_TYPES[d.type], tg = TOGGLE[d.type];
    return `<div class="row" data-act="device" data-id="${esc(d.id)}" role="button" tabindex="0">
      <div class="ri ${T.isOn(d.state) ? 'on' : ''}">${icon(T.icon, 19)}</div>
      <div class="rt"><b>${esc(d.name)}</b><small data-live="sum:${esc(d.id)}">${esc(T.summary(d.state, d.props))}</small></div>
      ${tg ? sw(tg.on(d.state), 'toggle', d.id) : `<span class="end">${icon('chev', 16)}</span>`}</div>`;
  }
  function roomHTML(r) {
    const s = store.roomSummary(r);
    const ds = store.devicesIn(r.id);
    const tiles = tilesFor(r).slice(0, 6).map(([l, v]) => `<div class="tile"><small>${l}</small>${v}</div>`).join('');
    return `${head(r.name.toUpperCase(), s.text)}
      <div class="tiles">${tiles}</div>
      <div class="sec-t">Appareils · ${ds.length}</div>
      ${ds.length ? `<div class="list">${ds.map(deviceRow).join('')}</div>` : '<div class="empty">Aucun appareil dans cette pièce.</div>'}
      <div class="btn-row"><button class="btn sec" data-act="add-dev">${icon('plus', 18)} Ajouter un appareil</button>
      ${ctx.currentTab() !== 'home' ? `<button class="btn sec" data-act="see3d">${icon('cube', 18)} Voir en 3D</button>` : ''}</div>
      <div class="field"><label>Renommer la pièce</label><div class="btn-row" style="margin-top:0"><input class="inp" id="rn-room" value="${esc(r.name)}" maxlength="30"><button class="btn sec" style="flex:none;width:auto" data-act="rename-room">OK</button></div></div>`;
  }
  function roomActions(r, asDock) {
    return {
      close: () => sheets.close(),
      device: (el, e) => { if (e.target.closest('.sw')) return; openDevice(el.dataset.id, { fromRoom: r.id, dock: asDock }); },
      toggle: (el) => { const d = store.device(el.dataset.id); store.setDevice(d.id, TOGGLE[d.type].patch(d.state)); },
      'add-dev': () => openAddDevice(r.id),
      see3d: () => { sheets.close(); ctx.nav('home'); setTimeout(() => openRoom(r.id, { dock: true }), 80); },
      'rename-room': () => { const v = document.getElementById('rn-room').value; store.renameRoom(r.id, v); toast('Pièce renommée'); },
    };
  }

  // ============================================================ APPAREIL
  function openDevice(id, opts = {}) {
    const d = store.device(id); if (!d) return;
    const asDock = opts.dock ?? dock();
    sheets.show({
      id: `dev:${id}`, dock: asDock,
      render: () => deviceHTML(store.device(id), opts),
      actions: deviceActions(id, opts, asDock),
      inputs: {
        brightness: (v, el) => { store.setDevice(id, { on: true, brightness: +v }); el.style.setProperty('--p', `${v}%`); const b = document.querySelector('.sheet .ctl-h b'); if (b) b.textContent = `${Math.round(v)} %`; },
        position: (v, el) => { store.setDevice(id, { position: +v }); el.style.setProperty('--p', `${v}%`); const b = document.querySelector('.sheet .ctl-h b'); if (b) b.textContent = `${Math.round(v)} %`; },
        hue: (v) => { const c = hueHex(+v); store.setDevice(id, { on: true, tone: 'custom', color: c }); const sw2 = document.getElementById('rgb-sw'); if (sw2) sw2.style.background = c; },
        rgbpick: (v) => { store.setDevice(id, { on: true, tone: 'custom', color: v }); const sw2 = document.getElementById('rgb-sw'); if (sw2) sw2.style.background = v; },
      },
      afterBusy: () => sheets.rerender(),
      onClose: () => { if (asDock && !sheets.isOpen() && ctx.house) { ctx.house.select(null); ctx.house.setMarkers([]); } },
    });
  }
  function stepper(id, key, val, fmtFn) {
    return `<div class="stepper"><button class="round" data-act="step" data-id="${esc(id)}" data-key="${key}" data-d="-1" aria-label="Diminuer">−</button>
      <div class="val" data-live="${key === 'poolTarget' ? 'poolt' : 'cur'}:${esc(id)}" hidden></div><div class="val">${fmtFn(val)}</div>
      <button class="round" data-act="step" data-id="${esc(id)}" data-key="${key}" data-d="1" aria-label="Augmenter">+</button></div>`;
  }
  function chips(items, cur, act, id) { return `<div class="chips">${items.map(([v, l]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="${act}" data-id="${esc(id)}" data-v="${v}">${l}</button>`).join('')}</div>`; }

  function deviceHTML(d, opts) {
    if (!d) return `${head('Appareil', 'Supprimé')}<div class="empty">Cet appareil n’existe plus.</div>`;
    const T = DEVICE_TYPES[d.type], s = d.state, id = d.id, tg = TOGGLE[d.type];
    let ctl = '';
    const bigToggle = (label, on, txt) => `<div class="big-toggle"><div class="big-state"><span class="sdot ${on ? '' : 'warn'}" style="${on ? '' : 'background:#59606d;box-shadow:none'}"></span>${txt || label}</div>${sw(on, 'toggle', id)}</div>`;
    switch (d.type) {
      case 'light': {
        const rgb = !!(d.props && d.props.rgb), col = s.tone === 'custom' ? (s.color || '#ff9f0a') : '';
        ctl = bigToggle('', s.on, s.on ? 'Allumé' : 'Éteint') +
          `<div class="ctl"><div class="ctl-h"><span>Intensité</span><b>${Math.round(s.brightness)} %</b></div>${rangeHTML({ name: 'brightness', min: 1, max: 100, value: s.brightness, label: 'Intensité' })}</div>
           <div class="ctl"><div class="ctl-h"><span>Ambiance</span></div>${chips(Object.entries(TONES).filter(([k]) => k !== 'custom').map(([k, v]) => [k, v.label]), s.tone, 'tone', id)}</div>` +
          (rgb ? `<div class="ctl"><div class="ctl-h"><span>Couleur RVB</span><span class="swatch" id="rgb-sw" style="background:${col || '#ffc878'}"></span></div>
             <input class="rng hue" type="range" min="0" max="360" value="${hexHue(col || '#ff9f0a')}" data-input="hue" aria-label="Teinte">
             <div class="chips" style="margin-top:12px">${RGB_PRESETS.map((c) => `<button class="chip ${col === c ? 'on' : ''}" data-act="rgbcolor" data-v="${c}" style="padding:0;width:36px;height:36px;justify-content:center" aria-label="${c}"><span style="width:20px;height:20px;border-radius:50%;background:${c};display:block;box-shadow:0 0 8px ${c}"></span></button>`).join('')}
             <label class="chip" style="position:relative;overflow:hidden">${icon('palette', 16)} Palette<input type="color" data-input="rgbpick" value="${esc(col || '#ff9f0a')}" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer"></label></div></div>` : '');
        break;
      }
      case 'thermostat':
        ctl = `<div class="ctl"><div class="ctl-h"><span>Température actuelle</span><b data-live="cur:${esc(id)}">${fmtTemp(s.current)}</b></div>
          <div class="ctl-h" style="margin-top:6px"><span>Consigne</span></div>
          <div class="stepper"><button class="round" data-act="step" data-id="${esc(id)}" data-key="target" data-d="-0.5" aria-label="Diminuer">−</button><div class="val">${fmtTemp(s.target)}</div><button class="round" data-act="step" data-id="${esc(id)}" data-key="target" data-d="0.5" aria-label="Augmenter">+</button></div></div>
          <div class="ctl"><div class="ctl-h"><span>Mode</span><span>${s.heating ? 'Chauffe en cours' : 'Au repos'}</span></div>${chips([['heat', 'Chauffage'], ['off', 'Arrêt']], s.mode, 'mode', id)}</div>`;
        break;
      case 'ac':
        ctl = bigToggle('', s.on, s.on ? 'En marche' : 'Éteinte') +
          `<div class="ctl"><div class="ctl-h"><span>Mode</span></div>${chips([['cool', 'Froid'], ['heat', 'Chaud'], ['fan', 'Ventilation']], s.mode, 'mode', id)}</div>
           <div class="ctl"><div class="ctl-h"><span>Consigne</span></div><div class="stepper"><button class="round" data-act="step" data-id="${esc(id)}" data-key="target" data-d="-1">−</button><div class="val">${fmtTemp(s.target)}</div><button class="round" data-act="step" data-id="${esc(id)}" data-key="target" data-d="1">+</button></div></div>`;
        break;
      case 'shutter':
        ctl = `<div class="rollvis"><div class="curtain" data-hbar="shpos:${esc(id)}" style="height:${(100 - (s.actual === undefined ? s.position : s.actual)).toFixed(1)}%"></div></div>
          <div class="ctl"><div class="ctl-h"><span>Ouverture</span><b>${Math.round(s.position)} %</b></div>${rangeHTML({ name: 'position', min: 0, max: 100, value: s.position, color: 'var(--blue)', label: 'Ouverture' })}
          <div class="prog" style="margin-top:12px"><i data-bar="shpos:${esc(id)}"></i></div><div class="hint" style="margin-top:6px">Position réelle : <b data-live="shpos:${esc(id)}"></b> — le volet met environ 4 s à se déplacer.</div></div>
          <div class="btn-row"><button class="btn sec" data-act="shutter" data-id="${esc(id)}" data-v="100">Ouvrir</button><button class="btn sec" data-act="shutter" data-id="${esc(id)}" data-v="50">50 %</button><button class="btn sec" data-act="shutter" data-id="${esc(id)}" data-v="0">Fermer</button></div>`;
        break;
      case 'plug': case 'heater':
        ctl = bigToggle('', s.on, s.on ? 'Activée' : 'Éteinte') + `<div class="ctl"><div class="ctl-h"><span>Consommation</span><b data-live="devpow:${esc(id)}"></b></div></div>`;
        break;
      case 'camera':
        ctl = bigToggle('', s.on, s.on ? 'En direct' : 'Éteinte') +
          `<div class="big-toggle" style="margin-top:10px"><div class="big-state">${icon('rec', 16)} Enregistrement</div>${sw(s.recording, 'rec', id)}</div>
           <div class="btn-row"><button class="btn" data-act="watch" data-id="${esc(id)}">${icon('camera', 18)} Voir en direct</button></div>`;
        break;
      case 'motion':
        ctl = `<div class="big-toggle"><div class="big-state"><span class="sdot ${s.detected ? 'alert' : ''}"></span>${s.detected ? 'Présence détectée' : 'Aucune présence'}</div></div>
          <div class="big-toggle" style="margin-top:10px"><div class="big-state">${icon('shield', 18)} Alerte si mouvement</div>${sw(s.armed, 'toggle', id)}</div>
          <div class="btn-row"><button class="btn sec" data-act="detect" data-id="${esc(id)}">${icon('motion', 18)} Simuler une détection</button></div>
          <div class="hint">La détection retombe automatiquement après quelques secondes. Utile pour tester vos automatisations.</div>`;
        break;
      case 'lock':
        ctl = `<div class="big-toggle"><div class="big-state">${icon(s.locked ? 'lock' : 'unlock', 20)} ${s.locked ? 'Verrouillée' : 'Déverrouillée'}</div>${sw(s.locked, 'toggle', id)}</div>`;
        break;
      case 'garage':
        ctl = `<div class="rollvis garage"><i class="car"></i><div class="curtain" data-hbar="garage:${esc(id)}" style="height:${(100 - s.position).toFixed(1)}%"></div></div>
        <div class="ctl"><div class="ctl-h"><span>Porte</span><b data-live="sum:${esc(id)}">${T.summary(s)}</b></div>
          <div class="prog" style="margin-bottom:12px"><i data-bar="garage:${esc(id)}"></i></div>
          <div class="btn-row" style="margin-top:0"><button class="btn ${s.target > 50 ? 'sec' : ''}" data-act="garage" data-id="${esc(id)}" data-v="100">Ouvrir</button><button class="btn ${s.target > 50 ? '' : 'sec'}" data-act="garage" data-id="${esc(id)}" data-v="0">Fermer</button></div></div>`;
        break;
      case 'dishwasher': {
        const run = s.status === 'running';
        ctl = `<div class="ctl"><div class="ctl-h"><span>État</span><b data-live="sum:${esc(id)}">${T.summary(s)}</b></div>
          <div class="prog"><i data-bar="dw:${esc(id)}"></i></div>
          <div class="ctl-h" style="margin:10px 0 0"><span>Temps restant</span><b data-live="dwrem:${esc(id)}">—</b></div></div>
          <div class="ctl"><div class="ctl-h"><span>Programme</span></div><div class="chips">${Object.entries(DW_PROGRAMS).map(([k, [nm, mn]]) => `<button class="chip ${s.program === k ? 'on' : ''}" data-act="dwprog" data-v="${k}">${nm} · ${fmtMin(mn)}</button>`).join('')}</div></div>
          <div class="btn-row">${run ? `<button class="btn danger" data-act="dwstop">Arrêter le cycle</button>` : `<button class="btn" data-act="dwstart">${icon('play', 16)} Démarrer</button>${s.status === 'done' ? `<button class="btn sec" data-act="dwstop">Ouvrir / réinitialiser</button>` : ''}`}</div>
          <div class="hint">Simulation en temps accéléré : 1 seconde = 1 minute de cycle. Le lave-vaisselle se démarre aussi depuis un scénario ou une automatisation.</div>`;
        break;
      }
      case 'microwave': {
        const run = s.status === 'cooking';
        ctl = `<div class="ctl" style="text-align:center"><div class="ctl-h" style="justify-content:center"><span>${run ? 'Cuisson en cours' : 'Minuterie'}</span></div><div class="mw-clock" data-live="mwrem:${esc(id)}">${run ? fmtClock(s.remaining) : fmtClock(s.duration)}</div><div class="prog" style="margin-top:12px"><i data-bar="mw:${esc(id)}"></i></div></div>
          <div class="ctl"><div class="ctl-h"><span>Durée</span></div><div class="chips">${[30, 60, 120, 300].map((sec) => `<button class="chip ${s.duration === sec ? 'on' : ''}" data-act="mwdur" data-v="${sec}">${fmtClock(sec)}</button>`).join('')}</div>
            <div class="ctl-h" style="margin-top:12px"><span>Puissance</span></div><div class="chips">${[600, 800, 1000].map((w) => `<button class="chip ${s.level === w ? 'on' : ''}" data-act="mwlevel" data-v="${w}">${w} W</button>`).join('')}</div></div>
          <div class="btn-row">${run ? `<button class="btn danger" data-act="mwstop">Arrêter</button>` : `<button class="btn" data-act="mwstart">${icon('play', 16)} Démarrer</button>`}</div>`;
        break;
      }
      case 'vacuum': {
        const st = s.status, run = ['cleaning', 'paused', 'returning'].includes(st), busy = run;
        const { level, dockRoom } = dockInfo(store.state, d), rooms = indoorRooms(store.state, level), sel = s.rooms && s.rooms.length ? s.rooms : [dockRoom];
        const plan = planRoute(store.state, d, sel), est = estimate(plan, s.mode, s.battery), fmtT = (ms) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const areaTot = rooms.filter((r) => sel.includes(r.id) && !plan.unreachable.includes(r.id)).reduce((a, r) => a + (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]), 0);
        ctl = `<div class="ctl"><div class="ctl-h" style="gap:12px"><span>État</span><b data-live="sum:${esc(id)}" style="font-size:16px;text-align:right;line-height:1.25">${T.summary(s)}</b></div>
          <div class="ctl-h" style="margin-bottom:6px"><span>Batterie</span><b data-live="bat:${esc(id)}">${Math.round(s.battery)} %</b></div><div class="prog green"><i data-bar="bat:${esc(id)}"></i></div></div>
          <div class="ctl"><div class="ctl-h"><span>Pièces à nettoyer <small style="opacity:.7">(touchez le plan)</small></span><span data-live="vrooms:${esc(id)}">${(s.done || []).length}/${sel.length}</span></div>
            ${vacMapHTML(store, d)}
            <div class="chips" style="margin-top:10px">${rooms.map((r) => `<button class="chip ${sel.includes(r.id) ? 'on' : ''} ${(s.done || []).includes(r.id) ? 'done' : ''}" data-act="vroom" data-id="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>
            <div class="btn-row" style="margin-top:8px"><button class="btn sec" data-act="vall" ${busy ? 'disabled' : ''}>Toutes les pièces</button><button class="btn sec" data-act="vone" ${busy ? 'disabled' : ''}>Pièce de la base</button></div>
            ${plan.unreachable.length ? `<div class="ed-issues">Inaccessible (aucune porte ni mur ouvert) : ${plan.unreachable.map((rid) => esc((store.room(rid) || {}).name || rid)).join(', ')}</div>` : ''}
            ${!run && !est.enough ? `<div class="hint" style="margin-top:8px">Batterie insuffisante pour tout nettoyer d’un coup : le robot retournera se recharger puis <b>reprendra seul</b> (dès ${ROBOT.resumeAt} %).</div>` : ''}</div>
          <div class="tiles" style="margin-top:10px">
            <div class="tile"><small>${run ? 'Temps restant' : 'Durée estimée'}</small><b ${run ? `data-live="vclean:${esc(id)}"` : ''}>${run ? fmtClock(s.etaClean) : fmtClock(est.clean)}</b></div>
            <div class="tile"><small>${run ? 'Retour à la base' : 'Retour estimé'}</small><b ${run ? `data-live="vbase:${esc(id)}"` : ''}>${run ? fmtClock(s.etaBase) : fmtClock(est.back)}</b></div>
            <div class="tile"><small>${run ? 'Fin estimée' : 'Si démarré à l’instant'}</small><b ${run ? `data-live="vend:${esc(id)}"` : ''}>${run ? fmtT(Date.now() + s.etaBase * 1000) : fmtT(Date.now() + est.total * 1000)}</b></div>
            <div class="tile"><small>${run ? 'Pièce en cours' : 'Surface'}</small><b ${run ? `data-live="vcur:${esc(id)}"` : ''}>${run ? esc(s.curName || '—') : `${Math.round(areaTot)} m²`}</b></div></div>
          <div class="ctl"><div class="ctl-h" style="margin-bottom:6px"><span>Nettoyage</span><b><span data-live="vprog:${esc(id)}">${Math.round(s.progress)} %</span> · <span data-live="varea:${esc(id)}">${s.area || 0} m²</span></b></div><div class="prog"><i data-bar="vprog:${esc(id)}"></i></div>
            <div class="ctl-h" style="margin-top:12px"><span>Mode</span></div><div class="chips">${Object.entries(VAC_MODES).map(([k, l]) => `<button class="chip ${s.mode === k ? 'on' : ''}" data-act="vmode" data-v="${k}" ${busy ? 'disabled' : ''}>${l}</button>`).join('')}</div></div>
          <div class="btn-row">${st === 'cleaning' ? `<button class="btn sec" data-act="vpause">Pause</button><button class="btn" data-act="vdock">Retour base</button>` : st === 'paused' ? `<button class="btn" data-act="vresume">Reprendre</button><button class="btn sec" data-act="vdock">Retour base</button>` : st === 'returning' ? `<button class="btn sec" disabled>Retour à la base…</button>` : `<button class="btn" data-act="vstart">${icon('play', 16)} Nettoyer ${sel.length > 1 ? `${sel.length} pièces` : 'la pièce'}</button>`}</div>
          <div class="big-toggle" style="margin-top:10px"><div class="big-state">${icon('motion', 18)} Pause si présence</div>${sw(s.smart, 'vsmart', id)}</div>
          <div class="hint"><b>Robot intelligent</b> : il franchit les portes et les murs ouverts pour rejoindre les pièces choisies (dans l’ordre le plus court), se met en pause si un détecteur voit quelqu’un dans sa pièce, retourne se recharger sous ${ROBOT.lowBattery} % puis reprend, et revient à sa base à la fin. Temps de simulation = temps réel.</div>`;
        break;
      }
      case 'pool':
        ctl = bigToggle('', s.pump, s.pump ? 'Pompe active' : 'Pompe arrêtée') +
          `<div class="ctl"><div class="ctl-h"><span>Eau</span><b data-live="poolt:${esc(id)}">${fmtTemp(s.temperature)}</b></div><div class="ctl-h" style="margin-top:6px"><span>Consigne</span></div>
          <div class="stepper"><button class="round" data-act="step" data-id="${esc(id)}" data-key="target" data-d="-1">−</button><div class="val">${fmtTemp(s.target)}</div><button class="round" data-act="step" data-id="${esc(id)}" data-key="target" data-d="1">+</button></div></div>`;
        break;
      case 'temp':
        ctl = `<div class="tiles"><div class="tile"><small>Température</small><b>${fmtTemp(s.temperature)}</b></div><div class="tile"><small>Humidité</small><b>${Math.round(s.humidity)} %</b></div></div>`;
        break;
      default: ctl = '';
    }
    const back = opts.fromRoom ? `<button class="chip" data-act="back" data-room="${esc(opts.fromRoom)}" style="margin-bottom:6px">${icon('back', 14)} ${esc(roomName(opts.fromRoom))}</button>` : '';
    return `${back}${head(`${T.label} · ${roomName(d.roomId)}`, d.name)}${ctl}
      <div class="sec-t">Réglages</div>
      ${d.type === 'light' ? `<div class="big-toggle" style="margin-bottom:10px"><div class="big-state">${icon('palette', 18)} Lampe RVB (couleur libre)</div>${sw(!!(d.props && d.props.rgb), 'rgbcap', id)}</div>` : ''}
      <div class="field" style="margin-top:0"><label>Nom de l’appareil</label><div class="btn-row" style="margin-top:0"><input class="inp" id="rn-dev" value="${esc(d.name)}" maxlength="34"><button class="btn sec" style="flex:none;width:auto" data-act="rename-dev" data-id="${esc(id)}">OK</button></div></div>
      <div class="btn-row"><button class="btn danger" data-act="del-dev" data-id="${esc(id)}">${icon('trash', 18)} Supprimer l’appareil</button></div>`;
  }
  function deviceActions(id, opts, asDock) {
    const P = (patch) => store.setDevice(id, patch);
    const backToRoom = (rid) => { if (rid) openRoom(rid, { dock: asDock }); else sheets.close(); };
    return {
      close: () => backToRoom(opts.fromRoom),
      back: (el) => openRoom(el.dataset.room, { dock: asDock }),
      toggle: () => { const d = store.device(id); P(TOGGLE[d.type].patch(d.state)); },
      tone: (el) => P({ tone: el.dataset.v }),
      rgbcolor: (el) => P({ on: true, tone: 'custom', color: el.dataset.v }),
      rgbcap: () => store.setProps(id, { rgb: !(store.device(id).props && store.device(id).props.rgb) }),
      dwprog: (el) => { if (store.device(id).state.status === 'running') { toast('Arrêtez le cycle pour changer de programme'); return; } P({ program: el.dataset.v }); },
      dwstart: () => { const d = store.device(id); P({ command: 'start', program: d.state.program }); toast('Lave-vaisselle démarré'); },
      dwstop: () => P({ command: 'stop' }),
      mwdur: (el) => { if (store.device(id).state.status !== 'cooking') P({ duration: +el.dataset.v }); },
      mwlevel: (el) => { if (store.device(id).state.status !== 'cooking') P({ level: +el.dataset.v }); },
      mwstart: () => { const d = store.device(id); P({ command: 'start', duration: d.state.duration, level: d.state.level }); },
      mwstop: () => P({ command: 'stop' }),
      vstart: () => { P({ command: 'start' }); toast('Nettoyage démarré'); },
      vpause: () => P({ command: 'pause' }), vresume: () => P({ command: 'resume' }), vdock: () => P({ command: 'dock' }),
      vmode: (el) => P({ mode: el.dataset.v }),
      vroom: (el) => {
        const d = store.device(id), st = d.state.status;
        if (['cleaning', 'paused', 'returning'].includes(st)) { toast('Attendez la fin du nettoyage (ou le retour à la base) pour changer les pièces'); return; }
        const { dockRoom } = dockInfo(store.state, d), cur = d.state.rooms && d.state.rooms.length ? d.state.rooms : [dockRoom], rid = el.dataset.id;
        const next = cur.includes(rid) ? cur.filter((x) => x !== rid) : [...cur, rid];
        if (!next.length) { toast('Choisissez au moins une pièce'); return; }
        P({ rooms: next, done: [], progress: 0 });
      },
      vall: () => { const d = store.device(id), { level } = dockInfo(store.state, d); P({ rooms: indoorRooms(store.state, level).map((r) => r.id), done: [], progress: 0 }); },
      vone: () => { const d = store.device(id), { dockRoom } = dockInfo(store.state, d); P({ rooms: [dockRoom], done: [], progress: 0 }); },
      vsmart: () => P({ smart: !store.device(id).state.smart }),
      mode: (el) => P({ mode: el.dataset.v }),
      step: (el) => { const d = store.device(id); const k = el.dataset.key, dl = +el.dataset.d; P({ [k]: d.state[k] + dl }); },
      shutter: (el) => P({ position: +el.dataset.v }),
      garage: (el) => P({ target: +el.dataset.v }),
      rec: () => P({ recording: !store.device(id).state.recording }),
      detect: () => { P({ detected: true }); toast('Détection simulée'); },
      watch: () => { sheets.close(); ctx.nav('cams'); setTimeout(() => openCamera(id), 120); },
      'rename-dev': () => { store.renameDevice(id, document.getElementById('rn-dev').value); toast('Appareil renommé'); },
      'del-dev': () => ctx.confirm(`Supprimer « ${store.device(id).name} » ?`, 'Supprimer', () => { store.removeDevice(id); toast('Appareil supprimé'); backToRoom(opts.fromRoom); }),
    };
  }

  // ============================================================ SECTIONS RAPIDES
  function openQuick(kind) {
    if (kind === 'temp') {
      sheets.show({
        id: 'q:temp', dock: false,
        render: () => {
          const ths = S().devices.filter((d) => d.type === 'thermostat'), acs = S().devices.filter((d) => d.type === 'ac');
          const m = store.metrics();
          return `${head('Climat', m.avgTemp == null ? '—' : fmtTemp(m.avgTemp))}
          <div class="sec-t">Thermostats</div><div class="list">${ths.map((d) => `<div class="row"><div class="ri">${icon('thermo', 19)}</div><div class="rt"><b>${roomName(d.roomId)}</b><small>Actuel <span data-live="cur:${esc(d.id)}">${fmtTemp(d.state.current)}</span>${d.state.heating ? ' · chauffe' : ''}</small></div>
            <div class="end"><button class="round" style="width:36px;height:36px" data-act="tstep" data-id="${esc(d.id)}" data-d="-0.5">−</button><b style="min-width:44px;text-align:center;color:#fff">${fmtTemp(d.state.target)}</b><button class="round" style="width:36px;height:36px" data-act="tstep" data-id="${esc(d.id)}" data-d="0.5">+</button></div></div>`).join('')}</div>
          ${acs.length ? `<div class="sec-t">Climatisation</div><div class="list">${acs.map(deviceRow).join('')}</div>` : ''}`;
        },
        actions: { close: () => sheets.close(), tstep: (el) => { const d = store.device(el.dataset.id); store.setDevice(d.id, { target: d.state.target + +el.dataset.d }); }, device: (el, e) => { if (!e.target.closest('.sw')) openDevice(el.dataset.id, { dock: false }); }, toggle: (el) => { const d = store.device(el.dataset.id); store.setDevice(d.id, TOGGLE[d.type].patch(d.state)); } },
      });
    } else if (kind === 'lights') {
      sheets.show({
        id: 'q:lights', dock: false,
        render: () => {
          const m = store.metrics();
          const groups = S().rooms.map((r) => [r, store.devicesIn(r.id).filter((d) => d.type === 'light')]).filter((g) => g[1].length);
          return `${head('Éclairage', `${m.lightsOn} allumée${m.lightsOn > 1 ? 's' : ''}`)}
          <div class="btn-row" style="margin-top:0"><button class="btn sec" data-act="all-on">Tout allumer</button><button class="btn sec" data-act="all-off">Tout éteindre</button></div>
          ${groups.map(([r, ls]) => `<div class="sec-t">${esc(r.name)}</div><div class="list">${ls.map(deviceRow).join('')}</div>`).join('')}`;
        },
        actions: {
          close: () => sheets.close(),
          'all-on': () => { store.applyAction({ target: { type: 'light' }, patch: { on: true } }); toast('Toutes les lumières allumées'); },
          'all-off': () => { store.applyAction({ target: { type: 'light' }, patch: { on: false } }); toast('Toutes les lumières éteintes'); },
          device: (el, e) => { if (!e.target.closest('.sw')) openDevice(el.dataset.id, { dock: false }); },
          toggle: (el) => { const d = store.device(el.dataset.id); store.setDevice(d.id, TOGGLE[d.type].patch(d.state)); },
        },
      });
    }
  }

  // ============================================================ CAMÉRA
  function openCamera(id) {
    sheets.show({
      id: `cam:${id}`, dock: false,
      render: () => {
        const d = store.device(id); if (!d) return '';
        return `${head(`Caméra · ${roomName(d.roomId)}`, d.name)}
        <div class="cam-big"><canvas></canvas>${d.state.on ? '' : '<div class="cam off" style="position:absolute;inset:0"></div>'}</div>
        <div class="hint">Flux simulé — branchez un flux réel via la couche drivers (README).</div>
        <div class="big-toggle" style="margin-top:12px"><div class="big-state">${icon('camera', 18)} Caméra allumée</div>${sw(d.state.on, 'toggle', id)}</div>
        <div class="big-toggle" style="margin-top:10px"><div class="big-state">${icon('rec', 16)} Enregistrement</div>${sw(d.state.recording, 'rec', id)}</div>`;
      },
      actions: { close: () => sheets.close(), toggle: () => { const d = store.device(id); store.setDevice(id, { on: !d.state.on }); }, rec: () => store.setDevice(id, { recording: !store.device(id).state.recording }) },
      afterBusy: () => {},
    });
    const c = document.querySelector('.sheet .cam-big canvas'); if (c) attachFeed(c, id);
  }

  // ============================================================ ACTIONS (scénarios & automatisations)
  const patchLabel = (type, p) => {
    const out = [];
    const onl = { light: ['Allumé', 'Éteint'], plug: ['Activée', 'Éteinte'], ac: ['En marche', 'Éteinte'], heater: ['Actif', 'Éteint'], camera: ['Activée', 'Éteinte'] };
    if ('on' in p) out.push((onl[type] || ['Activé', 'Désactivé'])[p.on ? 0 : 1]);
    if ('brightness' in p) out.push(`${p.brightness} %`);
    if ('target' in p) out.push(type === 'garage' ? (p.target > 50 ? 'Ouvrir' : 'Fermer') : `Consigne ${fmtTemp(p.target)}`);
    if ('position' in p) out.push(p.position >= 95 ? 'Ouvrir' : p.position <= 5 ? 'Fermer' : `${p.position} %`);
    if ('locked' in p) out.push(p.locked ? 'Verrouiller' : 'Déverrouiller');
    if ('rooms' in p && Array.isArray(p.rooms)) out.push(`${p.rooms.length} pièce${p.rooms.length > 1 ? 's' : ''}`);
    if ('command' in p) out.push(({ start: 'Démarrer', stop: 'Arrêter', dock: 'Retour à la base', pause: 'Pause', resume: 'Reprendre' }[p.command] || p.command) + (p.program && DW_PROGRAMS[p.program] ? ` (${DW_PROGRAMS[p.program][0]})` : ''));
    if ('tone' in p) out.push(p.tone === 'custom' ? `Couleur ${p.color}` : (TONES[p.tone] || {}).label || '');
    if ('pump' in p) out.push(p.pump ? 'Pompe active' : 'Pompe arrêtée');
    if ('armed' in p) out.push(p.armed ? 'Armer' : 'Désarmer');
    if ('recording' in p && !('on' in p)) out.push(p.recording ? 'Enregistrer' : 'Ne pas enregistrer');
    return out.join(' · ');
  };
  function describeAction(a) {
    if (a.sceneId) { const sc = store.scene(a.sceneId); return { t: `Scénario « ${sc ? sc.name : '?'} »`, s: 'Lancer', ic: sc ? sc.icon : 'play' }; }
    const t = a.target || {};
    if (t.deviceId) { const d = store.device(t.deviceId); return { t: d ? d.name : 'Appareil supprimé', s: `${d ? roomName(d.roomId) : ''} · ${patchLabel(d ? d.type : '', a.patch)}`, ic: d ? DEVICE_TYPES[d.type].icon : 'info' }; }
    const T = DEVICE_TYPES[t.type];
    return { t: `${TYPE_PLURAL[t.type] || 'Appareils'}${t.nonEssential ? ' (non essentiels)' : ''}`, s: `${t.roomId ? roomName(t.roomId) : 'Toutes les pièces'} · ${patchLabel(t.type, a.patch)}`, ic: T ? T.icon : 'info' };
  }
  const actionRows = (arr, act) => arr.length ? `<div class="list">${arr.map((a, i) => { const d = describeAction(a); return `<div class="row"><div class="ri">${icon(d.ic, 18)}</div><div class="rt"><b>${esc(d.t)}</b><small>${esc(d.s)}</small></div><button class="round" style="width:34px;height:34px" data-act="${act}" data-i="${i}" aria-label="Retirer">${icon('x', 14)}</button></div>`; }).join('')}</div>` : '<div class="empty">Aucune action.</div>';

  // --- constructeur d'une action (partagé) ---------------------------------
  function openActionBuilder(onAdd, onBack) {
    const f = { type: 'light', roomId: '', deviceId: '', on: true, brightness: 70, target: 21, position: 100, locked: true, open: false, pump: true, armed: true, tone: '', color: '#8a5cff', cmd: 'start', program: 'eco', duration: 60, vrooms: [] };
    const build = () => {
      const t = f.type;
      const devs = S().devices.filter((d) => d.type === t && (!f.roomId || d.roomId === f.roomId));
      let val = '';
      const yn = (key, a, b) => `<div class="seg" data-i="${key}">${[[true, a], [false, b]].map(([v, l]) => `<button class="${f[key] === v ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
      if (t === 'light') val = `<div class="field"><label>État</label>${yn('on', 'Allumé', 'Éteint')}</div>${f.on ? `<div class="ctl"><div class="ctl-h"><span>Intensité</span><b id="ab-v">${f.brightness} %</b></div>${rangeHTML({ name: 'brightness', min: 1, max: 100, value: f.brightness })}</div>
        <div class="field"><label>Couleur (optionnel)</label><div class="chips">${[['', 'Inchangée'], ['warm', 'Chaud'], ['neutral', 'Neutre'], ['cool', 'Froid']].map(([k, l]) => `<button class="chip ${f.tone === k ? 'on' : ''}" data-act="setv" data-k="tone" data-v="${k}">${l}</button>`).join('')}${RGB_PRESETS.map((c) => `<button class="chip ${f.tone === 'custom' && f.color === c ? 'on' : ''}" data-act="setrgb" data-v="${c}" style="padding:0;width:34px;height:34px;justify-content:center"><span style="width:18px;height:18px;border-radius:50%;background:${c};display:block"></span></button>`).join('')}</div></div>` : ''}`;
      else if (['plug', 'heater', 'camera'].includes(t)) val = `<div class="field"><label>État</label>${yn('on', 'Activé', 'Éteint')}</div>`;
      else if (t === 'dishwasher') val = `<div class="field"><label>Commande</label><div class="seg">${[['start', 'Démarrer'], ['stop', 'Arrêter']].map(([k, l]) => `<button class="${f.cmd === k ? 'on' : ''}" data-act="setv" data-k="cmd" data-v="${k}">${l}</button>`).join('')}</div></div>${f.cmd === 'start' ? `<div class="field"><label>Programme</label><div class="chips">${Object.entries(DW_PROGRAMS).map(([k, [nm]]) => `<button class="chip ${f.program === k ? 'on' : ''}" data-act="setv" data-k="program" data-v="${k}">${nm}</button>`).join('')}</div></div>` : ''}`;
      else if (t === 'microwave') val = `<div class="field"><label>Commande</label><div class="seg">${[['start', 'Démarrer'], ['stop', 'Arrêter']].map(([k, l]) => `<button class="${f.cmd === k ? 'on' : ''}" data-act="setv" data-k="cmd" data-v="${k}">${l}</button>`).join('')}</div></div>${f.cmd === 'start' ? `<div class="field"><label>Durée</label><div class="chips">${[30, 60, 120, 300].map((sec) => `<button class="chip ${f.duration === sec ? 'on' : ''}" data-act="setv" data-k="duration" data-v="${sec}">${fmtClock(sec)}</button>`).join('')}</div></div>` : ''}`;
      else if (t === 'vacuum') val = `${f.cmd === 'start' ? `<div class="field"><label>Pièces (aucune = sélection actuelle du robot)</label><div class="chips">${S().rooms.filter((r) => !r.outdoor && r.id !== 'jardin').map((r) => `<button class="chip ${f.vrooms.includes(r.id) ? 'on' : ''}" data-act="vtoggle" data-v="${r.id}">${esc(r.name)}</button>`).join('')}</div></div>` : ''}<div class="field"><label>Commande</label><div class="chips">${[['start', 'Démarrer'], ['pause', 'Pause'], ['resume', 'Reprendre'], ['dock', 'Retour base']].map(([k, l]) => `<button class="chip ${f.cmd === k ? 'on' : ''}" data-act="setv" data-k="cmd" data-v="${k}">${l}</button>`).join('')}</div></div>`;
      else if (t === 'ac') val = `<div class="field"><label>État</label>${yn('on', 'En marche', 'Éteinte')}</div><div class="ctl"><div class="ctl-h"><span>Consigne</span><b id="ab-v">${f.target}°</b></div>${rangeHTML({ name: 'target', min: 16, max: 30, value: Math.round(f.target), color: 'var(--orange)' })}</div>`;
      else if (t === 'thermostat') val = `<div class="ctl"><div class="ctl-h"><span>Consigne</span><b id="ab-v">${fmtTemp(f.target)}</b></div>${rangeHTML({ name: 'target', min: 10, max: 30, step: 0.5, value: f.target, color: 'var(--orange)' })}</div>`;
      else if (t === 'shutter') val = `<div class="ctl"><div class="ctl-h"><span>Ouverture</span><b id="ab-v">${f.position} %</b></div>${rangeHTML({ name: 'position', min: 0, max: 100, value: f.position, color: 'var(--blue)' })}</div>`;
      else if (t === 'lock') val = `<div class="field"><label>Action</label>${yn('locked', 'Verrouiller', 'Déverrouiller')}</div>`;
      else if (t === 'garage') val = `<div class="field"><label>Action</label>${yn('open', 'Ouvrir', 'Fermer')}</div>`;
      else if (t === 'pool') val = `<div class="field"><label>Pompe</label>${yn('pump', 'Active', 'Arrêtée')}</div>`;
      else if (t === 'motion') val = `<div class="field"><label>Détecteurs</label>${yn('armed', 'Armés', 'Désarmés')}</div>`;
      return `${head('Nouvelle action', 'Réglage d’appareils', 'back')}
        <div class="field" style="margin-top:0"><label>Type d’appareil</label><select class="inp" data-change="type">${CONTROLLABLE.map((k) => `<option value="${k}" ${k === t ? 'selected' : ''}>${DEVICE_TYPES[k].label}</option>`).join('')}</select></div>
        <div class="two"><div class="field"><label>Pièce</label><select class="inp" data-change="room"><option value="">Toutes</option>${S().rooms.map((r) => `<option value="${r.id}" ${r.id === f.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Appareil</label><select class="inp" data-change="dev"><option value="">Tous (${devs.length})</option>${devs.map((d) => `<option value="${d.id}" ${d.id === f.deviceId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div></div>
        ${val}
        <div class="btn-row"><button class="btn" data-act="add">${icon('check', 18)} Ajouter l’action</button></div>`;
    };
    const toAction = () => {
      const t = f.type; let patch = {};
      if (t === 'light') { patch = f.on ? { on: true, brightness: +f.brightness } : { on: false }; if (f.on && f.tone === 'custom') { patch.tone = 'custom'; patch.color = f.color; } else if (f.on && f.tone) patch.tone = f.tone; }
      else if (t === 'dishwasher') patch = f.cmd === 'stop' ? { command: 'stop' } : { command: 'start', program: f.program };
      else if (t === 'microwave') patch = f.cmd === 'stop' ? { command: 'stop' } : { command: 'start', duration: +f.duration, level: 800 };
      else if (t === 'vacuum') patch = f.cmd === 'start' && f.vrooms.length ? { command: 'start', rooms: f.vrooms.slice() } : { command: f.cmd };
      else if (['plug', 'heater', 'camera'].includes(t)) patch = { on: !!f.on };
      else if (t === 'ac') patch = { on: !!f.on, target: +f.target, mode: 'cool' };
      else if (t === 'thermostat') patch = { target: +f.target };
      else if (t === 'shutter') patch = { position: +f.position };
      else if (t === 'lock') patch = { locked: !!f.locked };
      else if (t === 'garage') patch = { target: f.open ? 100 : 0 };
      else if (t === 'pool') patch = { pump: !!f.pump };
      else if (t === 'motion') patch = { armed: !!f.armed };
      const target = f.deviceId ? { deviceId: f.deviceId } : { type: t, ...(f.roomId ? { roomId: f.roomId } : {}) };
      return { target, patch };
    };
    const setNum = (k) => (v, el) => { f[k] = +v; el.style.setProperty('--p', `${((v - el.min) / (el.max - el.min)) * 100}%`); const b = document.getElementById('ab-v'); if (b) b.textContent = k === 'brightness' || k === 'position' ? `${f[k]} %` : `${f[k]}°`; };
    sheets.show({
      id: 'action-builder', dock: false, render: build,
      actions: { back: onBack, close: onBack, set: (el) => { f[el.dataset.k] = el.dataset.v === 'true'; sheets.rerender(true); },
        setv: (el) => { const k = el.dataset.k; f[k] = k === 'duration' ? +el.dataset.v : el.dataset.v; if (k === 'type') f.cmd = 'start'; sheets.rerender(true); },
        vtoggle: (el) => { const v = el.dataset.v; f.vrooms = f.vrooms.includes(v) ? f.vrooms.filter((x) => x !== v) : [...f.vrooms, v]; sheets.rerender(true); },
        setrgb: (el) => { f.tone = 'custom'; f.color = el.dataset.v; sheets.rerender(true); }, add: () => { onAdd(toAction()); } },
      inputs: {
        brightness: setNum('brightness'), target: setNum('target'), position: setNum('position'),
        type: (v) => { f.type = v; f.deviceId = ''; f.cmd = 'start'; if (v === 'thermostat') f.target = 21; if (v === 'ac') f.target = 24; sheets.rerender(true); },
        room: (v) => { f.roomId = v; f.deviceId = ''; sheets.rerender(true); },
        dev: (v) => { f.deviceId = v; },
      },
    });
  }

  // ============================================================ SCÉNARIOS
  function openSceneEditor(id) {
    const existing = id && store.scene(id);
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid('sc'), name: '', icon: 'sun', color: SCENE_COLORS[0], actions: [] };
    const isNew = !existing;
    const render = () => `${head(isNew ? 'Nouveau scénario' : 'Scénario', draft.name || 'Sans titre')}
      <div class="field" style="margin-top:0"><label>Nom</label><input class="inp" data-input="name" value="${esc(draft.name)}" maxlength="24" placeholder="Ex. Soirée cinéma" id="sc-name"></div>
      <div class="field"><label>Icône</label><div class="icons-pick">${SCENE_ICONS.map((k) => `<button class="${draft.icon === k ? 'on' : ''}" data-act="pick-icon" data-v="${k}" aria-label="${k}">${icon(k, 22)}</button>`).join('')}</div></div>
      <div class="field"><label>Couleur</label><div class="icons-pick">${SCENE_COLORS.map((c) => `<button class="${draft.color === c ? 'on' : ''}" data-act="pick-color" data-v="${c}" style="color:${c}" aria-label="${c}"><span style="width:20px;height:20px;border-radius:50%;background:${c};display:block"></span></button>`).join('')}</div></div>
      <div class="sec-t">Actions · ${draft.actions.length}</div>${actionRows(draft.actions, 'rm')}
      <div class="btn-row"><button class="btn sec" data-act="capture">${icon('camera', 18)} Capturer l’état actuel</button><button class="btn sec" data-act="add-action">${icon('plus', 18)} Ajouter</button></div>
      <div class="hint">« Capturer » enregistre l’état de tous les appareils pilotables tel qu’il est maintenant (vous pourrez ensuite retirer des actions).</div>
      <div class="btn-row"><button class="btn" data-act="save">${icon('check', 18)} Enregistrer</button><button class="btn sec" data-act="test" style="flex:none;width:auto">${icon('play', 16)} Tester</button></div>
      ${isNew ? '' : `<div class="btn-row"><button class="btn danger" data-act="delete">${icon('trash', 18)} Supprimer le scénario</button></div>`}`;
    const show = () => sheets.show({
      id: 'scene-edit', dock: false, render,
      inputs: { name: (v) => { draft.name = v; } },
      actions: {
        close: () => sheets.close(),
        'pick-icon': (el) => { draft.icon = el.dataset.v; sheets.rerender(true); },
        'pick-color': (el) => { draft.color = el.dataset.v; sheets.rerender(true); },
        rm: (el) => { draft.actions.splice(+el.dataset.i, 1); sheets.rerender(true); },
        capture: () => { draft.actions = store.snapshotActions(); sheets.rerender(true); toast(`${draft.actions.length} actions capturées`); },
        'add-action': () => openActionBuilder((a) => { draft.actions.push(a); show(); }, () => show()),
        test: () => { store.upsertScene({ ...draft, name: draft.name || 'Test' }); if (!existing) { /* sera remplacé à l'enregistrement */ } store.activateScene(draft.id); if (isNew && !draft.name) store.deleteScene(draft.id); },
        save: () => {
          if (!draft.name.trim()) { toast('Donnez un nom au scénario'); const n = document.getElementById('sc-name'); n && n.focus(); return; }
          if (!draft.actions.length) { toast('Ajoutez au moins une action'); return; }
          draft.name = draft.name.trim(); store.upsertScene(draft); sheets.close(); toast(isNew ? 'Scénario créé' : 'Scénario enregistré');
        },
        delete: () => ctx.confirm(`Supprimer « ${draft.name} » ?`, 'Supprimer', () => { store.deleteScene(draft.id); sheets.close(); toast('Scénario supprimé'); }),
      },
    });
    show();
  }

  // ============================================================ AUTOMATISATIONS
  function describeTrigger(t) {
    if (t.kind === 'time') { const d = t.days || []; return `${t.at} · ${d.length === 7 ? 'tous les jours' : d.length === 5 && !d.includes(0) && !d.includes(6) ? 'en semaine' : d.map((x) => DAYS[x] + (x === 0 || x === 6 ? '' : '')).join(' ')}`; }
    if (t.kind === 'motion') { const d = store.device(t.deviceId); return `Présence · ${d ? d.name : '?'}`; }
    if (t.kind === 'temp') return `${roomName(t.roomId)} ${t.op} ${fmtTemp(t.value)}`;
    return '';
  }
  function openAutoEditor(id) {
    const existing = id && store.automation(id);
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid('auto'), name: '', enabled: true, trigger: { kind: 'time', at: '22:00', days: [0, 1, 2, 3, 4, 5, 6] }, actions: [] };
    const isNew = !existing;
    const motions = S().devices.filter((d) => d.type === 'motion'), tempRooms = S().rooms.filter((r) => store.roomTemp(r.id) != null);
    const kinds = [['time', 'Heure'], ['motion', 'Présence'], ['temp', 'Température']];
    const render = () => {
      const t = draft.trigger; let cfg = '';
      if (t.kind === 'time') cfg = `<div class="field"><label>Heure</label><input class="inp" type="time" data-input="at" value="${esc(t.at)}"></div><div class="field"><label>Jours</label><div class="days">${DAYS.map((l, i) => `<button class="${(t.days || []).includes(i) ? 'on' : ''}" data-act="day" data-i="${i}">${l}</button>`).join('')}</div></div>`;
      else if (t.kind === 'motion') cfg = `<div class="field"><label>Quand ce détecteur voit du mouvement</label><select class="inp" data-change="mdev">${motions.map((d) => `<option value="${d.id}" ${d.id === t.deviceId ? 'selected' : ''}>${esc(d.name)} — ${esc(roomName(d.roomId))}</option>`).join('')}</select></div>`;
      else cfg = `<div class="field"><label>Pièce</label><select class="inp" data-change="troom">${tempRooms.map((r) => `<option value="${r.id}" ${r.id === t.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="two"><div class="field"><label>Condition</label><div class="seg">${['>', '<'].map((o) => `<button class="${t.op === o ? 'on' : ''}" data-act="op" data-v="${o}">${o === '>' ? 'Supérieure à' : 'Inférieure à'}</button>`).join('')}</div></div>
        <div class="field"><label>Valeur (°C)</label><input class="inp" type="number" inputmode="decimal" step="0.5" min="0" max="45" data-input="tval" value="${t.value}"></div></div>`;
      const scenesSel = S().scenes.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
      return `${head(isNew ? 'Nouvelle automatisation' : 'Automatisation', draft.name || 'Sans titre')}
        <div class="field" style="margin-top:0"><label>Nom</label><input class="inp" id="au-name" data-input="name" value="${esc(draft.name)}" maxlength="40" placeholder="Ex. Volets à la tombée de la nuit"></div>
        <div class="field"><label>Déclencheur</label><div class="seg">${kinds.map(([k, l]) => `<button class="${t.kind === k ? 'on' : ''}" data-act="kind" data-v="${k}">${l}</button>`).join('')}</div></div>${cfg}
        <div class="sec-t">Alors · ${draft.actions.length} action${draft.actions.length > 1 ? 's' : ''}</div>${actionRows(draft.actions, 'rm')}
        <div class="btn-row"><button class="btn sec" data-act="add-action">${icon('plus', 18)} Régler des appareils</button></div>
        ${S().scenes.length ? `<div class="field"><label>… ou lancer un scénario</label><select class="inp" data-change="addscene"><option value="">Choisir…</option>${scenesSel}</select></div>` : ''}
        <div class="btn-row"><button class="btn" data-act="save">${icon('check', 18)} Enregistrer</button>${isNew ? '' : `<button class="btn sec" data-act="test" style="flex:none;width:auto">${icon('play', 16)} Tester</button>`}</div>
        ${isNew ? '' : `<div class="btn-row"><button class="btn danger" data-act="delete">${icon('trash', 18)} Supprimer</button></div>`}`;
    };
    const show = () => sheets.show({
      id: 'auto-edit', dock: false, render,
      inputs: {
        name: (v) => { draft.name = v; }, at: (v) => { draft.trigger.at = v; }, tval: (v) => { draft.trigger.value = parseFloat(v); },
        mdev: (v) => { draft.trigger.deviceId = v; }, troom: (v) => { draft.trigger.roomId = v; },
        addscene: (v) => { if (v) { draft.actions.push({ sceneId: v }); sheets.rerender(true); } },
      },
      actions: {
        close: () => sheets.close(),
        kind: (el) => {
          const k = el.dataset.v;
          draft.trigger = k === 'time' ? { kind: 'time', at: '22:00', days: [0, 1, 2, 3, 4, 5, 6] } : k === 'motion' ? { kind: 'motion', deviceId: (motions[0] || {}).id } : { kind: 'temp', roomId: (tempRooms[0] || {}).id, op: '>', value: 25 };
          sheets.rerender(true);
        },
        day: (el) => { const d = new Set(draft.trigger.days || []); const i = +el.dataset.i; d.has(i) ? d.delete(i) : d.add(i); draft.trigger.days = [...d].sort(); sheets.rerender(true); },
        op: (el) => { draft.trigger.op = el.dataset.v; sheets.rerender(true); },
        rm: (el) => { draft.actions.splice(+el.dataset.i, 1); sheets.rerender(true); },
        'add-action': () => openActionBuilder((a) => { draft.actions.push(a); show(); }, () => show()),
        test: () => { store.runAutomation(draft.id, true); },
        save: () => {
          if (!draft.name.trim()) { toast('Donnez un nom à l’automatisation'); document.getElementById('au-name').focus(); return; }
          if (!draft.actions.length) { toast('Ajoutez au moins une action'); return; }
          if (draft.trigger.kind === 'time' && !(draft.trigger.days || []).length) { toast('Choisissez au moins un jour'); return; }
          if (draft.trigger.kind === 'temp' && !(draft.trigger.value >= 0)) { toast('Valeur de température invalide'); return; }
          draft.name = draft.name.trim(); store.upsertAutomation(draft); sheets.close(); toast(isNew ? 'Automatisation créée' : 'Automatisation enregistrée');
        },
        delete: () => ctx.confirm(`Supprimer « ${draft.name} » ?`, 'Supprimer', () => { store.deleteAutomation(draft.id); sheets.close(); toast('Automatisation supprimée'); }),
      },
    });
    show();
  }

  // ============================================================ AJOUT D'APPAREIL
  function openAddDevice(roomId) {
    const f = { roomId: roomId || S().rooms[0].id, type: 'light', name: '' };
    sheets.show({
      id: 'add-dev', dock: false,
      render: () => `${head('Ajouter', 'Nouvel appareil')}
        <div class="field" style="margin-top:0"><label>Pièce</label><select class="inp" data-change="room">${S().rooms.map((r) => `<option value="${r.id}" ${r.id === f.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Type</label><select class="inp" data-change="type">${Object.entries(DEVICE_TYPES).map(([k, v]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
        <div class="field"><label>Nom (optionnel)</label><input class="inp" id="nd-name" data-input="name" value="${esc(f.name)}" maxlength="34" placeholder="${esc(DEVICE_TYPES[f.type].label)}"></div>
        <div class="hint">L’appareil apparaît dans la pièce, dans les scénarios et les automatisations, et comme repère dans la maison 3D. Avec un vrai matériel, il sera synchronisé par votre driver.</div>
        <div class="btn-row"><button class="btn" data-act="create">${icon('plus', 18)} Ajouter</button></div>`,
      inputs: { room: (v) => { f.roomId = v; }, type: (v) => { f.type = v; sheets.rerender(true); }, name: (v) => { f.name = v; } },
      actions: { close: () => sheets.close(), create: () => { const d = store.addDevice(f); toast(`« ${d.name} » ajouté`); const rid = f.roomId; sheets.close(); setTimeout(() => (ctx.currentTab() === 'home' ? openRoom(rid, { dock: true }) : openRoom(rid, { dock: false })), 420); } },
    });
  }

  // ============================================================ MENU & MAISON
  function openAddMenu() {
    sheets.show({
      id: 'add-menu', dock: false,
      render: () => `${head('Ajouter', 'Que souhaitez-vous créer ?')}<div class="list">
        <div class="row" data-act="a-dev" role="button"><div class="ri">${icon('bulb', 19)}</div><div class="rt"><b>Appareil</b><small>Lumière, prise, capteur, volet…</small></div>${icon('chev', 16)}</div>
        <div class="row" data-act="a-sc" role="button"><div class="ri">${icon('moon', 19)}</div><div class="rt"><b>Scénario</b><small>Un bouton, plusieurs réglages</small></div>${icon('chev', 16)}</div>
        <div class="row" data-act="a-au" role="button"><div class="ri">${icon('clock', 19)}</div><div class="rt"><b>Automatisation</b><small>Heure, présence ou température</small></div>${icon('chev', 16)}</div></div>`,
      actions: { close: () => sheets.close(), 'a-dev': () => openAddDevice(), 'a-sc': () => openSceneEditor(null), 'a-au': () => openAutoEditor(null) },
    });
  }
  function openHouse() {
    sheets.show({
      id: 'house', dock: false,
      render: () => `${head('Maison', S().house.name)}
        <div class="tiles"><div class="tile"><small>Pièces</small><b>${S().rooms.length}</b></div><div class="tile"><small>Appareils</small><b>${S().devices.length}</b></div><div class="tile"><small>Scénarios</small><b>${S().scenes.length}</b></div><div class="tile"><small>Automatisations</small><b>${S().automations.length}</b></div></div>
        <div class="field"><label>Nom de la maison</label><div class="btn-row" style="margin-top:0"><input class="inp" id="hn" value="${esc(S().house.name)}" maxlength="26"><button class="btn sec" style="flex:none;width:auto" data-act="save">OK</button></div></div>
        <div class="hint">Une seule maison est configurée. Le modèle de données (house → rooms → devices → scenes → automations) peut contenir plusieurs sites : voir README.</div>`,
      actions: { close: () => sheets.close(), save: () => { const v = document.getElementById('hn').value.trim(); if (v) { S().house.name = v; store.save(); ctx.refreshAll(); toast('Nom enregistré'); } } },
    });
  }
  function openMenu() {
    const st = S().settings, canInstall = !!ctx.installPrompt(), ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
    sheets.show({
      id: 'menu', dock: false,
      render: () => `${head('Réglages', 'Menu')}
        <div class="list">
          <div class="row" data-act="edit-plan" role="button"><div class="ri">${icon('edit', 19)}</div><div class="rt"><b>Éditer le plan de la maison</b><small>Pièces, murs, portes, meubles — rendu 3D en direct</small></div>${icon('chev', 16)}</div>
          ${canInstall ? `<div class="row" data-act="install" role="button"><div class="ri">${icon('install', 19)}</div><div class="rt"><b>Installer l’application</b><small>Ajouter à l’écran d’accueil</small></div>${icon('chev', 16)}</div>` : ''}
          ${ios ? `<div class="row"><div class="ri">${icon('install', 19)}</div><div class="rt"><b>Installer sur iPhone</b><small>Partager → « Sur l’écran d’accueil »</small></div></div>` : ''}
        </div>
        <div class="sec-t">Graphismes 3D</div>
        <div class="seg">${[['auto', 'Auto'], ['high', 'Élevé'], ['low', 'Éco'], ['2d', 'Plan 2D']].map(([k, l]) => `<button class="${st.graphics === k ? 'on' : ''}" data-act="gfx" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="hint">« Auto » réduit la qualité si l’appareil peine. « Éco » : résolution réduite, sans halos. « Plan 2D » : vue à plat très légère.</div>
        <div class="sec-t">Simulation</div>
        <div class="list"><div class="row"><div class="ri">${icon('motion', 19)}</div><div class="rt"><b>Événements aléatoires</b><small>Détections de présence simulées</small></div>${sw(st.simulateEvents, 'sim', 'x')}</div></div>
        <div class="field"><label>Prix du kWh (€)</label><input class="inp" type="number" inputmode="decimal" step="0.01" min="0" data-input="price" value="${st.energyPrice}"></div>
        <div class="sec-t">Données</div>
        <div class="btn-row" style="margin-top:0"><button class="btn sec" data-act="export">${icon('download', 18)} Exporter</button><button class="btn sec" data-act="import">${icon('upload', 18)} Importer</button></div>
        <input type="file" id="imp" accept="application/json,.json" hidden>
        <div class="btn-row"><button class="btn danger" data-act="reset">${icon('reset', 18)} Réinitialiser la maison</button></div>
        <div class="about"><div class="about-ico">${icon('home', 26)}</div><div><b>${APP.name}</b><small>Version ${APP.version} · build ${APP.build}</small><span class="by">by ${APP.author}</span></div></div>
        <div class="hint" style="text-align:center;margin-top:10px">PWA · modèle de données v${store.state.version} · moteur 3D WebGL2 intégré</div>`,
      inputs: { price: (v) => { const n = parseFloat(v); if (n >= 0) store.setSetting('energyPrice', n); } },
      actions: {
        close: () => sheets.close(),
        'edit-plan': () => { sheets.close(); ctx.openEditor(); },
        gfx: (el) => { store.setSetting('graphics', el.dataset.v); ctx.applyGraphics(); sheets.rerender(true); },
        sim: () => { store.setSetting('simulateEvents', !S().settings.simulateEvents); sheets.rerender(true); },
        install: () => ctx.doInstall(),
        export: () => {
          const blob = new Blob([store.exportData()], { type: 'application/json' }); const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = `ma-maison-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Export téléchargé');
        },
        import: () => {
          const f = document.getElementById('imp');
          f.onchange = () => { const file = f.files[0]; if (!file) return; const rd = new FileReader(); rd.onload = () => { try { store.importData(rd.result); sheets.close(); toast('Données importées'); } catch (e) { toast(`Import impossible : ${e.message}`, 4200); } }; rd.readAsText(file); };
          f.click();
        },
        reset: () => ctx.confirm('Remettre la maison, les scénarios et les automatisations à zéro ?', 'Réinitialiser', () => { store.reset(); sheets.close(); toast('Maison réinitialisée'); }),
      },
    });
  }

  return { openRoom, openDevice, openQuick, openCamera, openSceneEditor, openAutoEditor, openAddDevice, openAddMenu, openHouse, openMenu, describeTrigger, describeAction };
}
