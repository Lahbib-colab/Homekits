// ---------------------------------------------------------------------------
// Catalogue des types d'appareils : valeurs par défaut, puissance électrique,
// résumé lisible. AUCUNE valeur d'interface n'est codée ailleurs : l'UI et la
// 3D lisent tout via ce catalogue et via l'état du magasin (store.js).
// ---------------------------------------------------------------------------

export const fmt1 = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');
export const fmtTemp = (n) => `${fmt1(n)}°`;
export function fmtPower(w) {
  if (w >= 1000) return `${(w / 1000).toFixed(1).replace('.', ',')} kW`;
  return `${Math.round(w)} W`;
}

export const DW_PROGRAMS = { eco: ['Éco', 195], auto: ['Auto', 120], rapide: ['Rapide', 45], intensif: ['Intensif', 150] };
export const VAC_MODES = { eco: 'Éco', auto: 'Auto', turbo: 'Turbo' };
export const fmtMin = (m) => { m = Math.max(0, Math.round(m)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };
export const fmtClock = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const hexToRgb = (h) => { const n = parseInt(String(h || '#ffc878').slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const RGB_PRESETS = ['#ff3b30', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#7d5cff', '#ff2d92'];

export const CATEGORIES = {
  lighting: { label: 'Éclairage', color: '#ffd60a' },
  climate: { label: 'Chauffage & clim', color: '#ff9f0a' },
  appliances: { label: 'Prises & appareils', color: '#0a84ff' },
  pool: { label: 'Piscine', color: '#64d2ff' },
  vehicle: { label: 'Véhicule', color: '#30d158' },
  other: { label: 'Autres', color: '#bf5af2' },
};

export const DEVICE_TYPES = {
  light: {
    label: 'Éclairage', icon: 'bulb', category: 'lighting',
    defaults: () => ({ on: false, brightness: 70, tone: 'warm' }),
    isOn: (s) => !!s.on,
    power: (s, p) => (s.on ? (p.watts || 10) * (0.15 + 0.85 * s.brightness / 100) : 0),
    summary: (s, p) => (s.on ? `${Math.round(s.brightness)} %${p && p.rgb && s.tone === 'custom' ? ' · RVB' : ''}` : 'Éteint'),
  },
  thermostat: {
    label: 'Thermostat', icon: 'thermo', category: 'climate',
    defaults: () => ({ current: 20, target: 20, mode: 'heat', heating: false }),
    isOn: (s) => s.mode !== 'off',
    power: (s, p) => (s.heating ? (p.watts || 800) : 0),
    summary: (s) => `${fmtTemp(s.current)} → ${fmtTemp(s.target)}`,
  },
  ac: {
    label: 'Climatisation', icon: 'wind', category: 'climate',
    defaults: () => ({ on: false, mode: 'cool', target: 24 }),
    isOn: (s) => !!s.on,
    power: (s, p) => (s.on ? (p.watts || 1100) : 0),
    summary: (s) => (s.on ? `${s.mode === 'cool' ? 'Froid' : s.mode === 'heat' ? 'Chaud' : 'Ventil.'} ${fmtTemp(s.target)}` : 'Éteinte'),
  },
  heater: {
    label: 'Chauffage', icon: 'flame', category: 'climate',
    defaults: () => ({ on: false }),
    isOn: (s) => !!s.on,
    power: (s, p) => (s.on ? (p.watts || 500) : 0),
    summary: (s) => (s.on ? 'Actif' : 'Éteint'),
  },
  shutter: {
    label: 'Volet', icon: 'blinds', category: 'other',
    defaults: () => ({ position: 100 }),
    isOn: (s) => s.position > 5,
    power: () => 0,
    summary: (s) => (s.position >= 95 ? 'Ouverts' : s.position <= 5 ? 'Fermés' : `${Math.round(s.position)} %`),
  },
  plug: {
    label: 'Prise', icon: 'plug', category: 'appliances',
    defaults: () => ({ on: true }),
    isOn: (s) => !!s.on,
    power: (s, p) => (s.on ? (p.watts || 60) : 0),
    summary: (s, p) => (s.on ? `${p.watts || 60} W` : 'Éteinte'),
  },
  camera: {
    label: 'Caméra', icon: 'camera', category: 'other',
    defaults: () => ({ on: true, recording: false }),
    isOn: (s) => !!s.on,
    power: (s) => (s.on ? 6 : 0),
    summary: (s) => (s.on ? (s.recording ? 'Enregistre' : 'En direct') : 'Éteinte'),
  },
  motion: {
    label: 'Détecteur', icon: 'motion', category: 'other',
    defaults: () => ({ detected: false, armed: false, detectedUntil: 0 }),
    isOn: (s) => !!s.detected,
    power: () => 0,
    summary: (s) => (s.detected ? 'Présence' : s.armed ? 'Armé' : 'Aucune'),
  },
  lock: {
    label: 'Serrure', icon: 'lock', category: 'other',
    defaults: () => ({ locked: true }),
    isOn: (s) => !s.locked,
    power: () => 0,
    summary: (s) => (s.locked ? 'Verrouillée' : 'Déverrouillée'),
  },
  temp: {
    label: 'Capteur', icon: 'thermo', category: 'other',
    defaults: () => ({ temperature: 21, humidity: 50 }),
    isOn: () => false,
    power: () => 0,
    summary: (s) => `${fmtTemp(s.temperature)} · ${Math.round(s.humidity)} %`,
  },
  garage: {
    label: 'Porte de garage', icon: 'garage', category: 'vehicle',
    defaults: () => ({ position: 0, target: 0 }),
    isOn: (s) => s.position > 1,
    power: (s) => (Math.abs(s.position - s.target) > 0.5 ? 350 : 0),
    summary: (s) => (s.position <= 1 ? 'Fermée' : s.position >= 99 ? 'Ouverte' : 'En mouvement'),
  },
  dishwasher: {
    label: 'Lave-vaisselle', icon: 'dish', category: 'appliances',
    defaults: () => ({ status: 'idle', program: 'eco', remaining: 0, total: 0 }),
    isOn: (s) => s.status === 'running',
    power: (s, p) => (s.status === 'running' ? ((s.total - s.remaining) / Math.max(1, s.total) < 0.3 ? (p.watts || 1800) : 220) : 2),
    summary: (s) => (s.status === 'running' ? `${DW_PROGRAMS[s.program][0]} · reste ${fmtMin(s.remaining)}` : s.status === 'done' ? 'Terminé' : 'Prêt'),
    commands: {
      start: (s, a) => { const pr = DW_PROGRAMS[a.program] ? a.program : s.program; return { status: 'running', program: pr, total: DW_PROGRAMS[pr][1], remaining: DW_PROGRAMS[pr][1] }; },
      stop: () => ({ status: 'idle', remaining: 0 }),
    },
  },
  microwave: {
    label: 'Micro-ondes', icon: 'microwave', category: 'appliances',
    defaults: () => ({ status: 'idle', remaining: 0, duration: 60, level: 800 }),
    isOn: (s) => s.status === 'cooking',
    power: (s, p) => (s.status === 'cooking' ? Math.round(((p.watts || 1200) * s.level) / 800) : 1),
    summary: (s) => (s.status === 'cooking' ? `En cours · ${fmtClock(s.remaining)}` : 'Prêt'),
    commands: {
      start: (s, a) => { const d = a.duration > 0 ? a.duration : s.duration || 60; return { status: 'cooking', duration: d, remaining: d, level: a.level || s.level }; },
      stop: () => ({ status: 'idle', remaining: 0 }),
    },
  },
  vacuum: {
    label: 'Robot aspirateur', icon: 'robot', category: 'appliances',
    defaults: () => ({ status: 'docked', battery: 100, mode: 'auto', progress: 0, smart: true, area: 0, paused: '', rooms: [], done: [], curRoom: '', curName: '', etaClean: 0, etaBase: 0, resume: false, s: 0 }),
    isOn: (s) => s.status === 'cleaning' || s.status === 'returning',
    power: (s) => ({ cleaning: 35, returning: 25, charging: 20, docked: 3, paused: 4 }[s.status] || 3),
    summary: (s) => ({
      cleaning: `Nettoie${s.curName ? ` · ${s.curName}` : ''} · reste ${fmtClock(s.etaClean)}`,
      returning: `Retour à la base · ${fmtClock(s.etaBase)}`,
      paused: s.paused === 'presence' ? 'En pause (présence)' : 'En pause',
      charging: `En charge · ${Math.round(s.battery)} %${s.resume ? ' · reprise à 80 %' : ''}`,
      docked: `Sur la base · ${Math.round(s.battery)} %`,
    }[s.status] || ''),
    commands: {
      start: (s, a) => (s.status === 'paused' ? { status: 'cleaning', paused: '' }
        : s.battery < 12 ? { status: 'charging', resume: true }
          : { status: 'cleaning', progress: 0, s: 0, done: [], area: 0, resume: false, paused: '', mode: a.mode || s.mode }),
      pause: () => ({ status: 'paused', paused: 'user' }),
      resume: () => ({ status: 'cleaning', paused: '' }),
      dock: () => ({ status: 'returning', paused: '', resume: false }),
      stop: () => ({ status: 'returning', paused: '', resume: false }),
    },
  },
  pool: {
    label: 'Piscine', icon: 'waves', category: 'pool',
    defaults: () => ({ pump: true, temperature: 26, target: 26 }),
    isOn: (s) => !!s.pump,
    power: (s, p) => (s.pump ? (p.watts || 650) : 0),
    summary: (s) => `${fmtTemp(s.temperature)}${s.pump ? ' · Pompe active' : ' · Pompe arrêtée'}`,
  },
};

export function deviceCategory(d) {
  return (d.props && d.props.category) || (DEVICE_TYPES[d.type] && DEVICE_TYPES[d.type].category) || 'other';
}
export function devicePower(d) {
  const t = DEVICE_TYPES[d.type];
  return t ? t.power(d.state, d.props || {}) : 0;
}

export const TONES = {
  custom: { label: 'Couleur', rgb: [1.0, 0.78, 0.45] },
  warm: { label: 'Chaud', rgb: [1.0, 0.78, 0.45] },
  neutral: { label: 'Neutre', rgb: [1.0, 0.93, 0.8] },
  cool: { label: 'Froid', rgb: [0.78, 0.9, 1.0] },
  aqua: { label: 'Aqua', rgb: [0.35, 0.85, 1.0] },
};
