// ---------------------------------------------------------------------------
// Générateurs HTML des vues. Aucune valeur en dur : tout vient du store.
// ---------------------------------------------------------------------------
import { DEVICE_TYPES, CATEGORIES, fmtTemp, fmtPower, fmt1 } from './catalog.js';
import { icon } from './icons.js';
import { esc, sw } from './dom.js';

const toneOf = (s) => (s.tone === 'water' ? 'water' : s.tone === 'light' ? 'lit' : '');

// ------------------------------------------------------------------ Maison
export function hdrHTML(store) {
  const m = store.metrics(), lvl = m.security.level;
  return `<button class="house-btn" data-act="house" aria-label="Choisir la maison">
      <div class="house-title">${icon('home', 34)}<span>${esc(store.state.house.name)}</span>${icon('chevd', 18, 'chev')}</div>
      <div class="status"><i class="sdot ${lvl === 'ok' ? '' : lvl}"></i><span>${esc(m.health.text)}</span></div></button>
    <div class="hdr-actions"><button class="round" data-act="add" aria-label="Ajouter">${icon('plus', 22)}</button><button class="round" data-act="menu" aria-label="Menu">${icon('dots', 22)}</button></div>`;
}
export function quickHTML(store) {
  const lvl = store.metrics().security.level;
  const card = (cls, act, ic, label, live, val) => `<button class="qcard ${cls}" data-act="${act}"><div class="qi">${icon(ic, 18)}</div><div><div class="ql">${label}</div><div class="qv" data-live="${live}" data-flash>${esc(val)}</div></div>${icon('chev', 14, 'qc')}</button>`;
  const m = store.metrics();
  return card('q-temp', 'q-temp', 'thermo', 'Température', 'avgTemp', m.avgTemp == null ? '—' : fmtTemp(m.avgTemp)) +
    card('q-light', 'q-lights', 'bulb', 'Éclairage', 'lights', `${m.lightsOn} allumée${m.lightsOn > 1 ? 's' : ''}`) +
    card(`q-sec ${lvl === 'ok' ? '' : lvl}`, 'q-sec', 'shield', 'Sécurité', 'security', m.security.text) +
    card('q-nrg', 'q-nrg', 'leaf', 'Énergie', 'power', fmtPower(m.powerW));
}
export function roomCard(store, r, extra = '') {
  const s = store.roomSummary(r);
  return `<button class="rcard ${toneOf(s)}" data-act="room" data-id="${esc(r.id)}"><span class="ri">${icon(r.icon, 20)}</span>
    <span class="rt"><b>${esc(r.name)}</b><small ${s.live !== undefined || true ? `data-live="roomsum:${esc(r.id)}"` : ''}>${esc(s.text)}</small></span>${icon('chev', 16, 'rc')}</button>`;
}
export function roomsPanelHTML(store) {
  const rooms = store.state.rooms.filter((r) => !r.hideLabel);
  return `<div class="panel-h"><h2>Pièces</h2><button class="link" data-act="tab-rooms">Voir tout ${icon('chev', 14)}</button></div><div class="rooms-grid stagger">${rooms.map((r) => roomCard(store, r)).join('')}</div>`;
}
export function sceneTile(sc, active, editing) {
  return `<button class="scn ${active ? 'active' : ''}" style="--sc:${sc.color || '#fff'}" data-act="scene" data-id="${esc(sc.id)}" aria-label="${esc(sc.name)}">${icon(sc.icon, 26)}<span>${esc(sc.name)}</span>${editing ? `<i style="position:absolute;top:6px;right:6px;opacity:.8">${icon('edit', 14)}</i>` : ''}</button>`;
}
export function scenesPanelHTML(store, { editing = false, all = false } = {}) {
  const sc = store.state.scenes, act = store.rt.activeScene;
  const shown = all ? sc : sc.slice(0, 4);
  const addTile = `<button class="scn add" data-act="scene-new" style="${shown.length >= 4 ? 'grid-column:1/-1;min-height:46px;flex-direction:row' : ''}">${icon('plus', 20)}<span>Nouveau scénario</span></button>`;
  return `<div class="panel-h"><h2>Scénarios</h2>${all ? `<button class="link" data-act="edit-scenes">${editing ? 'Terminer' : 'Modifier'}</button>` : `<button class="link" data-act="tab-auto">Tout voir ${icon('chev', 14)}</button>`}</div>
    <div class="scn-row stagger">${shown.map((s) => sceneTile(s, act === s.id, editing)).join('')}${addTile}</div>`;
}

// ------------------------------------------------------------------- Pièces
export function roomsViewHTML(store) {
  const rooms = store.state.rooms;
  return `<div class="title-row"><h1>Pièces</h1><button class="round" data-act="add" aria-label="Ajouter">${icon('plus', 22)}</button></div>
    <div class="rooms-grid big stagger">${rooms.map((r) => {
      const s = store.roomSummary(r), n = store.devicesIn(r.id).length;
      const lvl = (store.state.layout.levels || 1) > 1 ? `${r.outdoor ? 'Extérieur' : r.level ? 'Étage ' + r.level : 'RDC'} · ` : '';
      return `<button class="rcard ${toneOf(s)}" data-act="room-modal" data-id="${esc(r.id)}"><span class="ri">${icon(r.icon, 22)}</span>
        <span class="rt"><b>${esc(r.name)}</b><small>${lvl}<span data-live="roomsum:${esc(r.id)}">${esc(s.text)}</span> · ${n} appareil${n > 1 ? 's' : ''} · <span data-live="roompow:${esc(r.id)}"></span></small></span>${icon('chev', 16, 'rc')}</button>`;
    }).join('')}</div>`;
}

// ---------------------------------------------------------- Automatisations
export function autoViewHTML(store, sheetsApi, { editing = false } = {}) {
  const autos = store.state.automations;
  const when = (t) => (t ? new Date(t).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais exécutée');
  return `<div class="title-row"><h1>Automatisations</h1><button class="round" data-act="add" aria-label="Ajouter">${icon('plus', 22)}</button></div>
    <section class="panel" id="p-scn-full">${scenesPanelHTML(store, { editing, all: true })}</section>
    <div class="panel-h" style="padding:20px 6px 10px"><h2 style="font-size:20px">Automatisations</h2><button class="link" data-act="auto-new">${icon('plus', 15)} Ajouter</button></div>
    <div class="stagger">${autos.length ? autos.map((a) => `<div class="auto ${a.enabled ? '' : 'off'}"><button class="ai" data-act="auto-edit" data-id="${esc(a.id)}" aria-label="Modifier">${icon(a.trigger.kind === 'time' ? 'clock' : a.trigger.kind === 'motion' ? 'motion' : 'thermo', 20)}</button>
      <button class="at" data-act="auto-edit" data-id="${esc(a.id)}"><b>${esc(a.name)}</b><small>${esc(sheetsApi.describeTrigger(a.trigger))} · ${a.actions.length} action${a.actions.length > 1 ? 's' : ''}</small><small style="color:var(--mut2)">${esc(when(a.lastRun))}</small></button>
      <button class="run" data-act="auto-run" data-id="${esc(a.id)}" aria-label="Exécuter maintenant">${icon('play', 14)}</button>${sw(a.enabled, 'auto-toggle', a.id)}</div>`).join('') : '<div class="empty">Aucune automatisation. Créez-en une avec « Ajouter ».</div>'}</div>
    <div class="hint" style="padding:0 4px">Les automatisations s’exécutent tant que l’application est ouverte. Une passerelle (Home Assistant, MQTT…) permet de les exécuter en continu.</div>`;
}

// ------------------------------------------------------------ Caméras / Sécurité
export function camsViewHTML(store) {
  const m = store.metrics(), lvl = m.security.level, S = store.state;
  const cams = S.devices.filter((d) => d.type === 'camera');
  const locks = S.devices.filter((d) => d.type === 'lock'), garage = S.devices.filter((d) => d.type === 'garage'), motions = S.devices.filter((d) => d.type === 'motion');
  const armed = motions.length && motions.every((d) => d.state.armed);
  const row = (d) => { const T = DEVICE_TYPES[d.type]; return `<div class="row" data-act="device" data-id="${esc(d.id)}" role="button"><div class="ri ${d.type === 'lock' && !d.state.locked ? 'on' : ''}">${icon(T.icon, 19)}</div><div class="rt"><b>${esc(d.name)}</b><small data-live="sum:${esc(d.id)}">${esc(T.summary(d.state, d.props))}</small></div><span class="end">${icon('chev', 16)}</span></div>`; };
  return `<div class="title-row"><h1>Caméras</h1><button class="round" data-act="add" aria-label="Ajouter">${icon('plus', 22)}</button></div>
    <div class="sec-card"><div class="sec-top ${lvl === 'ok' ? '' : lvl}"><div class="ico-big">${icon('shield', 26)}</div><div><b>Sécurité</b><small>${esc(m.security.text)}${m.alerts.length > 1 ? '' : ''}</small></div></div>
      ${m.alerts.length ? `<div class="chips" style="margin-top:12px">${m.alerts.map((a) => `<span class="chip" style="color:${a.level === 'alert' ? 'var(--red)' : 'var(--orange)'}">${esc(a.text)}</span>`).join('')}</div>` : ''}
      <div class="btn-row"><button class="btn sec" data-act="sec-lock">${icon('lock', 17)} Tout verrouiller</button><button class="btn sec" data-act="sec-garage">${icon('garage', 17)} Fermer garage</button></div>
      <div class="btn-row"><button class="btn ${armed ? '' : 'sec'}" data-act="sec-arm">${icon('shield', 17)} ${armed ? 'Détecteurs armés' : 'Armer les détecteurs'}</button></div>
      <div class="list" style="margin-top:12px">${[...locks, ...garage].map(row).join('')}</div></div>
    <div class="panel-h" style="padding:6px 4px 10px"><h2 style="font-size:20px">Caméras · ${cams.length}</h2></div>
    <div class="cams stagger">${cams.map((d) => `<button class="cam ${d.state.on ? '' : 'off'}" data-act="cam" data-id="${esc(d.id)}"><canvas data-cam="${esc(d.id)}"></canvas><div class="cl"><span>${esc(d.name)}</span><span>${d.state.on ? 'Direct' : ''}</span></div>${d.state.recording && d.state.on ? '<div class="rec"><i></i>REC</div>' : ''}</button>`).join('')}</div>
    <div class="hint" style="padding:8px 4px">Flux simulés. La couche drivers permet d’afficher de vrais flux (HLS, WebRTC, MJPEG).</div>`;
}

// ------------------------------------------------------------------- Énergie
function barChart(vals, { curIdx = -1, labels = [], color = '#0a84ff', hi = '#30d158', unit = 'kWh' }) {
  const W = 340, H = 150, padB = 18, padT = 8, n = vals.length, bw = W / n, max = Math.max(0.5, ...vals) * 1.1;
  const bars = vals.map((v, i) => {
    const h = ((H - padB - padT) * v) / max, x = i * bw + bw * 0.16, w = bw * 0.68;
    const c = i === curIdx ? hi : color, op = curIdx >= 0 && i > curIdx ? 0.18 : 1;
    return `<rect x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="${Math.min(4, w / 2).toFixed(1)}" fill="${c}" opacity="${op}"/>`;
  }).join('');
  const lab = labels.map(([i, t]) => `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${t}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Consommation en ${unit}">${bars}${lab}</svg>`;
}
export function energyViewHTML(store) {
  const S = store.state, E = S.energy, price = S.settings.energyPrice;
  const today = store.energyToday(), h = new Date().getHours();
  const bd = store.energyBreakdown(), total = Object.values(bd).reduce((a, b) => a + b, 0) || 1;
  const days = [...E.days, today];
  const names = ['D', 'L', 'M', 'M', 'J', 'V', 'S'], now = new Date();
  const dlabels = days.map((_, i) => { const d = new Date(now); d.setDate(now.getDate() - (days.length - 1 - i)); return [i, names[d.getDay()]]; });
  const week = E.days.reduce((a, b) => a + b, 0) + today;
  const cats = Object.entries(CATEGORIES).map(([k, c]) => [k, c, bd[k]]).filter((x) => x[2] > 0).sort((a, b) => b[2] - a[2]);
  const rooms = S.rooms.map((r) => [r, store.roomPower(r.id)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  return `<div class="title-row"><h1>Énergie</h1></div>
    <div class="nrg-hero"><div style="color:var(--mut);font-size:14px;margin-bottom:6px">Puissance instantanée</div>
      <div class="big"><span data-live="kw">${(store.powerW() / 1000).toFixed(2).replace('.', ',')}</span><small>kW</small></div>
      <div class="sub"><div><small>Aujourd’hui</small><b><span data-live="today">${today.toFixed(1).replace('.', ',')}</span> kWh</b></div><div><small>Coût estimé</small><b><span data-live="cost">${(today * price).toFixed(2).replace('.', ',')}</span> €</b></div><div><small>7 jours</small><b>${week.toFixed(0)} kWh</b></div></div></div>
    <section class="panel"><div class="panel-h"><h2>Aujourd’hui</h2><span style="color:var(--mut);font-size:13px">kWh par heure</span></div>${barChart(E.hourly, { curIdx: h, labels: [[0, '0h'], [6, '6h'], [12, '12h'], [18, '18h'], [23, '23h']] })}</section>
    <section class="panel"><div class="panel-h"><h2>Semaine</h2><span style="color:var(--mut);font-size:13px">kWh par jour</span></div>${barChart(days, { curIdx: days.length - 1, labels: dlabels, color: '#64d2ff', hi: '#30d158' })}</section>
    <section class="panel"><div class="panel-h"><h2>Répartition</h2><span style="color:var(--mut);font-size:13px">en direct</span></div>
      ${cats.map(([k, c, w]) => `<div class="bar-row"><span class="bl">${c.label}</span><span class="bt"><i style="width:${Math.max(3, (w / total) * 100).toFixed(1)}%;background:${c.color}"></i></span><span class="bv">${fmtPower(w)}</span></div>`).join('')}</section>
    <section class="panel"><div class="panel-h"><h2>Par pièce</h2></div>
      <div class="list">${rooms.length ? rooms.map(([r, w]) => `<div class="row" data-act="room-modal" data-id="${esc(r.id)}" role="button"><div class="ri">${icon(r.icon, 18)}</div><div class="rt"><b>${esc(r.name)}</b></div><span class="end">${fmtPower(w)}</span></div>`).join('') : '<div class="empty">Aucune consommation.</div>'}</div></section>
    <div class="hint" style="padding:8px 4px">Historique simulé (base de démonstration). Avec un compteur réel, le driver alimente l’historique. Prix du kWh : ${fmt1(price)} € — modifiable dans le menu.</div>`;
}
