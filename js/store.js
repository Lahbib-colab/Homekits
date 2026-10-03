// ---------------------------------------------------------------------------
// Magasin d'état : source de vérité runtime. Il ne connaît NI le DOM NI la 3D.
//  - actions : setDevice, activateScene, runAutomation, addDevice, ...
//  - moteur d'automatisations (heure, présence, température, appareil)
//  - comptabilité énergétique
//  - persistance localStorage (état des appareils, réglages, onglet)
// Les appareils réels se branchent via un "driver" (voir drivers.js).
// ---------------------------------------------------------------------------
import { defaultHouse, SCHEMA_VERSION } from './data.js';
import { DEVICE_TYPES, devicePower, deviceCategory, CATEGORIES } from './catalog.js';

const STORAGE_KEY = 'hk.home.v2';
const BASE_STANDBY_W = 35; // box internet, veilles diverses

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function seedEnergy(now) {
  const hourly = new Array(24).fill(0);
  const curve = [0.12, 0.1, 0.1, 0.1, 0.11, 0.16, 0.42, 0.62, 0.48, 0.32, 0.3, 0.34, 0.5, 0.42, 0.3, 0.3, 0.38, 0.6, 0.85, 0.95, 0.8, 0.55, 0.3, 0.18];
  for (let h = 0; h < now.getHours(); h++) hourly[h] = curve[h];
  return { date: dayKey(now), hourly, days: [14.2, 12.8, 15.1, 13.4, 16.0, 13.9, 12.5] };
}

export function createStore({ driver = null, storage = (typeof localStorage !== 'undefined' ? localStorage : null), clock = () => new Date() } = {}) {
  const listeners = {};
  const on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); return () => { listeners[evt] = listeners[evt].filter((f) => f !== fn); }; };
  const emit = (evt, ...a) => (listeners[evt] || []).slice().forEach((fn) => { try { fn(...a); } catch (e) { console.error('[store]', evt, e); } });

  let S = null;        // données persistées
  const rt = { autoArmed: {}, lastMinute: '', depth: 0, activeScene: null, saveTimer: 0, liveW: 0 };

  // ------------------------------------------------------------ chargement
  function normalize(data) {
    data.devices.forEach((d) => {
      const t = DEVICE_TYPES[d.type];
      d.state = { ...(t ? t.defaults() : {}), ...d.state };
      d.props = d.props || {};
      if (d.type === 'shutter') d.state.actual = d.state.actual === undefined ? d.state.position : d.state.actual;
      if (d.type === 'vacuum' && d.props.dock && d.state.x === undefined) { d.state.x = d.props.dock[0]; d.state.z = d.props.dock[1]; d.state.ang = 0; d.state.s = 0; }
    });
    data.layout = data.layout || defaultHouse().layout;
    if (!data.layout.ground) data.layout.ground = defaultHouse().layout.ground;
    data.layout.levels = data.layout.levels || 1; data.layout.wallMods = data.layout.wallMods || []; data.layout.walls = data.layout.walls || []; data.layout.stairs = data.layout.stairs || [];
    data.ui = data.ui || { tab: 'home' };
    data.settings = { energyPrice: 0.2516, graphics: 'auto', simulateEvents: false, ...(data.settings || {}) };
    data.energy = data.energy || seedEnergy(clock());
    return data;
  }
  function load() {
    let data = null;
    try { data = storage && JSON.parse(storage.getItem(STORAGE_KEY)); } catch (e) { data = null; }
    if (!data || data.version !== SCHEMA_VERSION || !Array.isArray(data.devices)) data = defaultHouse();
    S = normalize(data);
    rollEnergyDay();
  }
  function save() {
    if (!storage) return;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) { /* quota */ }
  }
  function scheduleSave() {
    clearTimeout(rt.saveTimer);
    rt.saveTimer = setTimeout(save, 250);
  }
  function flushSave() { clearTimeout(rt.saveTimer); save(); }

  // ------------------------------------------------------------- accès
  const device = (id) => S.devices.find((d) => d.id === id);
  const room = (id) => S.rooms.find((r) => r.id === id);
  const devicesIn = (roomId) => S.devices.filter((d) => d.roomId === roomId);
  const scene = (id) => S.scenes.find((s) => s.id === id);
  const automation = (id) => S.automations.find((a) => a.id === id);

  function resolveTargets(t) {
    if (!t) return [];
    if (t.deviceId) { const d = device(t.deviceId); return d ? [d] : []; }
    return S.devices.filter((d) =>
      (!t.type || d.type === t.type) &&
      (!t.roomId || d.roomId === t.roomId) &&
      (!t.rgb || (d.props && d.props.rgb)) &&
      (!t.nonEssential || !(d.props && d.props.essential)));
  }

  function sanitize(d, patch) {
    const p = { ...patch };
    if ('brightness' in p) { p.brightness = clamp(Math.round(p.brightness), 1, 100); }
    if ('target' in p && d.type === 'thermostat') p.target = clamp(Math.round(p.target * 2) / 2, 10, 30);
    if ('target' in p && d.type === 'ac') p.target = clamp(Math.round(p.target), 16, 30);
    if ('target' in p && d.type === 'pool') p.target = clamp(Math.round(p.target), 10, 32);
    if ('target' in p && d.type === 'garage') p.target = p.target > 50 ? 100 : 0;
    if ('position' in p && d.type === 'shutter') p.position = clamp(Math.round(p.position), 0, 100);
    return p;
  }

  // ------------------------------------------------------------ actions
  function setDevice(id, patch, meta = {}) {
    const d = device(id);
    if (!d) return false;
    const before = { ...d.state };
    if (patch.command) { // commandes métier : start / stop / pause… (lave-vaisselle, micro-ondes, robot)
      const T = DEVICE_TYPES[d.type], fn = T && T.commands && T.commands[patch.command];
      if (!fn) return false;
      const { command, ...rest } = patch;
      patch = { ...rest, ...fn(d.state, patch, d) };
      if (d.type === 'vacuum' && command === 'start' && (d.state.status === 'docked' || d.state.status === 'charging') && d.props && d.props.dock) { patch.x = d.props.dock[0]; patch.z = d.props.dock[1]; }
    }
    d.state = { ...d.state, ...sanitize(d, patch) };
    if (d.type === 'shutter' && patch.position !== undefined && d.state.actual === undefined) d.state.actual = before.position;
    if (d.type === 'motion' && patch.detected === true) d.state.detectedUntil = Date.now() + 25000;
    if (d.type === 'motion' && patch.detected === false) d.state.detectedUntil = 0;
    if (driver && driver.send && meta.source !== 'driver') driver.send(d, patch);
    scheduleSave();
    emit('device', id, before, meta);
    checkDeviceTriggers(d, before, meta);
    return true;
  }
  // Mise à jour continue (physique simulée) : pas d'événement par appareil.
  function patchLive(id, patch) {
    const d = device(id);
    if (d) d.state = { ...d.state, ...patch };
  }

  function applyAction(action, meta = {}) {
    if (action.sceneId) { const sc = scene(action.sceneId); if (sc) sc.actions.forEach((a) => applyAction(a, meta)); return; }
    resolveTargets(action.target).forEach((d) => setDevice(d.id, action.patch, meta));
  }

  function activateScene(id) {
    const sc = scene(id);
    if (!sc) return;
    sc.actions.forEach((a) => applyAction(a, { source: 'scene' }));
    rt.activeScene = id;
    scheduleSave();
    emit('scene', id);
    emit('toast', `Scénario « ${sc.name} » activé`);
  }

  function snapshotActions() {
    // Capture l'état actuel de tous les appareils pilotables comme actions.
    const keys = { light: ['on', 'brightness', 'tone', 'color'], thermostat: ['target'], ac: ['on', 'target'], heater: ['on'], shutter: ['position'], plug: ['on'], lock: ['locked'], garage: ['target'], pool: ['pump'], camera: ['on'] };
    return S.devices.filter((d) => keys[d.type]).map((d) => ({
      target: { deviceId: d.id },
      patch: Object.fromEntries(keys[d.type].map((k) => [k, d.state[k]])),
    }));
  }

  function upsertScene(sc) {
    const i = S.scenes.findIndex((s) => s.id === sc.id);
    if (i >= 0) S.scenes[i] = sc; else S.scenes.push(sc);
    scheduleSave(); emit('change', 'scenes');
  }
  function deleteScene(id) {
    S.scenes = S.scenes.filter((s) => s.id !== id);
    S.automations.forEach((a) => { a.actions = a.actions.filter((x) => x.sceneId !== id); });
    scheduleSave(); emit('change', 'scenes');
  }
  function upsertAutomation(a) {
    const i = S.automations.findIndex((x) => x.id === a.id);
    if (i >= 0) S.automations[i] = a; else S.automations.push(a);
    scheduleSave(); emit('change', 'automations');
  }
  function deleteAutomation(id) {
    S.automations = S.automations.filter((a) => a.id !== id);
    scheduleSave(); emit('change', 'automations');
  }
  function toggleAutomation(id, enabled) {
    const a = automation(id); if (!a) return;
    a.enabled = enabled === undefined ? !a.enabled : enabled;
    scheduleSave(); emit('change', 'automations');
  }

  function runAutomation(id, manual = false) {
    const a = automation(id);
    if (!a || (!manual && !a.enabled)) return;
    if (rt.depth > 2) return; // garde-fou anti-boucle
    rt.depth++;
    try { a.actions.forEach((x) => applyAction(x, { source: 'automation', automationId: id })); }
    finally { rt.depth--; }
    a.lastRun = Date.now();
    scheduleSave();
    emit('change', 'automations');
    emit('toast', `Automatisation « ${a.name} » exécutée`);
  }

  function addDevice({ roomId, type, name }) {
    const t = DEVICE_TYPES[type]; const r = room(roomId);
    if (!t || !r) return null;
    const [x1, z1, x2, z2] = r.rect;
    let id = `${type}-${roomId}-${Math.random().toString(36).slice(2, 6)}`;
    const d = { id, roomId, type, name: name || t.label, pos: [(x1 + x2) / 2 + (Math.random() - 0.5), r.outdoor ? 0.9 : 1.6, (z1 + z2) / 2 + (Math.random() - 0.5)], props: {}, state: t.defaults() };
    S.devices.push(d);
    scheduleSave(); emit('change', 'devices');
    return d;
  }
  function removeDevice(id) {
    S.devices = S.devices.filter((d) => d.id !== id);
    S.layout.furniture.forEach((f) => { if (f.light === id) delete f.light; });
    scheduleSave(); emit('change', 'devices');
  }
  function setProps(id, patch) { const d = device(id); if (d) { d.props = { ...(d.props || {}), ...patch }; scheduleSave(); emit('device', id, { ...d.state }, {}); emit('change', 'devices'); } }
  function renameDevice(id, name) { const d = device(id); if (d && name.trim()) { d.name = name.trim(); scheduleSave(); emit('change', 'devices'); } }
  function renameRoom(id, name) { const r = room(id); if (r && name.trim()) { r.name = name.trim(); scheduleSave(); emit('change', 'rooms'); } }
  function setSetting(k, v) { S.settings[k] = v; scheduleSave(); emit('change', 'settings'); }
  function setUi(k, v) { S.ui[k] = v; scheduleSave(); }

  // ------------------------------------------------------------ métriques
  function roomTemp(roomId) {
    const th = devicesIn(roomId).find((d) => d.type === 'thermostat');
    if (th) return th.state.current;
    const sensor = devicesIn(roomId).find((d) => d.type === 'temp');
    return sensor ? sensor.state.temperature : null;
  }
  function powerW() {
    return BASE_STANDBY_W + S.devices.reduce((s, d) => s + devicePower(d), 0);
  }
  function metrics() {
    const th = S.devices.filter((d) => d.type === 'thermostat');
    const avgTemp = th.length ? th.reduce((s, d) => s + d.state.current, 0) / th.length : null;
    const lights = S.devices.filter((d) => d.type === 'light');
    const alerts = [];
    S.devices.forEach((d) => {
      if (d.type === 'lock' && !d.state.locked) alerts.push({ level: 'warn', text: `${d.name} déverrouillée` });
      if (d.type === 'garage' && d.state.position > 1) alerts.push({ level: 'warn', text: 'Porte de garage ouverte' });
      if (d.type === 'motion' && d.state.detected && d.state.armed) alerts.push({ level: 'alert', text: `Mouvement : ${room(d.roomId).name}` });
    });
    const sev = alerts.some((a) => a.level === 'alert') ? 'alert' : alerts.length ? 'warn' : 'ok';
    return {
      avgTemp, lightsOn: lights.filter((l) => l.state.on).length, lightsTotal: lights.length,
      alerts, security: { level: sev, text: sev === 'ok' ? 'Tout est calme' : alerts.length === 1 ? alerts[0].text : `${alerts.length} alertes` },
      powerW: powerW(),
      health: sev === 'alert' ? { ok: false, text: 'Alerte de sécurité' } : { ok: true, text: 'Tout fonctionne parfaitement' },
    };
  }
  function roomSummary(r) {
    if (!r) return { text: '', tone: 'ok' };
    const ds = devicesIn(r.id);
    switch (r.primary) {
      case 'light': {
        const on = ds.filter((d) => d.type === 'light' && d.state.on);
        if (!on.length) return { text: 'Éteint', tone: 'off' };
        return { text: `Éclairage ${Math.round(Math.max(...on.map((d) => d.state.brightness)))} %`, tone: 'light' };
      }
      case 'temp': { const t = roomTemp(r.id); return { text: t == null ? '—' : `${Math.round(t)}°`, tone: 'ok', live: `temp:${r.id}` }; }
      case 'humidity': { const s = ds.find((d) => d.type === 'temp'); return { text: s ? `Humidité ${Math.round(s.state.humidity)} %` : '—', tone: 'ok', live: `hum:${r.id}` }; }
      case 'garage': { const g = ds.find((d) => d.type === 'garage'); return { text: g ? `Porte ${DEVICE_TYPES.garage.summary(g.state).toLowerCase()}` : '—', tone: g && g.state.position > 1 ? 'warn' : 'ok' }; }
      case 'pool': { const p = ds.find((d) => d.type === 'pool'); return { text: p ? `${Math.round(p.state.temperature)}°` : '—', tone: 'water', live: `pool:${r.id}` }; }
      default: return { text: '', tone: 'ok' };
    }
  }
  function energyBreakdown() {
    const cats = {};
    Object.keys(CATEGORIES).forEach((k) => { cats[k] = 0; });
    S.devices.forEach((d) => { cats[deviceCategory(d)] += devicePower(d); });
    cats.other += BASE_STANDBY_W;
    return cats;
  }
  function roomPower(roomId) { return devicesIn(roomId).reduce((s, d) => s + devicePower(d), 0); }

  // -------------------------------------------------------------- énergie
  function rollEnergyDay() {
    const now = clock();
    const key = dayKey(now);
    if (S.energy.date !== key) {
      const total = S.energy.hourly.reduce((a, b) => a + b, 0);
      S.energy.days = [...S.energy.days.slice(1), total];
      S.energy.hourly = new Array(24).fill(0);
      S.energy.date = key;
    }
  }
  function accumulateEnergy(dt) {
    rollEnergyDay();
    const h = clock().getHours();
    S.energy.hourly[h] += (powerW() * dt) / 3.6e6;
  }
  function energyToday() { return S.energy.hourly.reduce((a, b) => a + b, 0); }

  // ---------------------------------------------------- automatisations
  function checkDeviceTriggers(d, before, meta) {
    if (meta.source === 'driver' && d.type !== 'motion') return;
    S.automations.forEach((a) => {
      if (!a.enabled) return;
      const t = a.trigger;
      if (t.kind === 'motion' && t.deviceId === d.id && !before.detected && d.state.detected) runAutomation(a.id);
      if (t.kind === 'device' && t.deviceId === d.id && before[t.key] !== t.equals && d.state[t.key] === t.equals) runAutomation(a.id);
    });
  }
  function checkTimeTriggers() {
    const now = clock();
    const key = `${dayKey(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (key === rt.lastMinute) return;
    rt.lastMinute = key;
    const hm = key.slice(-5);
    S.automations.forEach((a) => {
      if (a.enabled && a.trigger.kind === 'time' && a.trigger.at === hm && (a.trigger.days || []).includes(now.getDay())) runAutomation(a.id);
    });
  }
  function checkTempTriggers() {
    S.automations.forEach((a) => {
      const t = a.trigger;
      if (t.kind !== 'temp') return;
      const cur = roomTemp(t.roomId);
      if (cur == null) return;
      const cond = t.op === '>' ? cur > t.value : cur < t.value;
      if (cond && rt.autoArmed[a.id] !== false) { rt.autoArmed[a.id] = false; if (a.enabled) runAutomation(a.id); }
      if (!cond) rt.autoArmed[a.id] = true;
    });
  }

  // ------------------------------------------------------------- boucle
  function tick(dt = 1) {
    if (driver && driver.step) driver.step(dt);
    accumulateEnergy(dt);
    checkTimeTriggers();
    checkTempTriggers();
    rt.liveW = powerW();
    rt.liveAcc = (rt.liveAcc || 0) + dt;
    if (rt.liveAcc >= 0.95) { rt.liveAcc = 0; emit('live'); } // l'interface se rafraîchit chaque seconde
  }

  // ------------------------------------------------- import / export / raz
  function exportData() { return JSON.stringify(S, null, 2); }
  function importData(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.rooms) || !Array.isArray(data.devices) || !Array.isArray(data.scenes)) throw new Error('Fichier invalide : pièces, appareils ou scénarios manquants.');
    if (data.version !== SCHEMA_VERSION) throw new Error(`Version de données ${data.version} non supportée (attendue : ${SCHEMA_VERSION}).`);
    S = normalize(data); flushSave(); emit('change', 'all');
  }
  // Remplace le plan (pièces, décor, appareils) — utilisé par l'éditeur (annuler/rétablir, modèles)
  function replacePlan(p, what = 'rooms') {
    S.rooms = p.rooms; S.layout = p.layout; S.devices = p.devices; normalize(S);
    flushSave(); emit('change', what);
  }
  function planChanged(what = 'rooms') { flushSave(); emit('change', what); }
  function reset() { S = normalize(defaultHouse()); flushSave(); emit('change', 'all'); }

  load();

  return {
    get state() { return S; }, get rt() { return rt; },
    on, emit, device, room, devicesIn, scene, automation, resolveTargets,
    setDevice, patchLive, applyAction, activateScene, snapshotActions, upsertScene, deleteScene,
    upsertAutomation, deleteAutomation, toggleAutomation, runAutomation,
    addDevice, removeDevice, setProps, renameDevice, renameRoom, setSetting, setUi,
    metrics, roomSummary, roomTemp, roomPower, powerW, energyBreakdown, energyToday,
    tick, save: flushSave, exportData, importData, reset, replacePlan, planChanged,
  };
}
