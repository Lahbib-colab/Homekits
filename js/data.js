// ---------------------------------------------------------------------------
// Modèle de données de la maison : house → rooms → devices → états →
// scenes → automations. C'est la SEULE source de vérité : l'interface, la 3D
// et les automatisations lisent uniquement ces données (via store.js).
// Tout est du JSON pur : modifiable, exportable, importable.
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 2;

const light = (id, roomId, name, pos, state = {}, props = {}) => ({
  id, roomId, type: 'light', name, pos, props: { watts: 12, ...props },
  state: { on: true, brightness: 70, tone: 'warm', ...state },
});
const dev = (id, roomId, type, name, pos, state = {}, props = {}) => ({ id, roomId, type, name, pos, props, state });

export function defaultHouse() {
  return {
    version: SCHEMA_VERSION,
    house: { id: 'h1', name: 'Ma maison' },

    // --- Pièces : rect = [x1, z1, x2, z2] en mètres (x est, z sud) --------
    rooms: [
      { id: 'salon', name: 'Salon', icon: 'sofa', rect: [0, 4.2, 6.4, 9.6], floor: 'wood', primary: 'light', label: [3.2, 1.2, 7.0] },
      { id: 'cuisine', name: 'Cuisine', icon: 'utensils', rect: [6.4, 4.2, 12, 9.6], floor: 'tile', primary: 'light', label: [9.2, 1.2, 6.9] },
      { id: 'chp', name: 'Chambre parentale', icon: 'bed', rect: [0, 0, 4.6, 4.2], floor: 'wood', primary: 'temp', label: [2.3, 1.2, 2.1] },
      { id: 'che', name: 'Chambre enfant', icon: 'bed', rect: [7.4, 0, 12, 4.2], floor: 'wood', primary: 'temp', label: [9.7, 1.2, 2.1] },
      { id: 'sdb', name: 'Salle de bain', icon: 'drop', rect: [4.6, 0, 7.4, 4.2], floor: 'tile', primary: 'humidity', label: [6.0, 1.2, 2.1] },
      { id: 'garage', name: 'Garage', icon: 'car', rect: [12, 4.2, 16.4, 9.6], floor: 'concrete', primary: 'garage', label: [14.2, 1.0, 6.9] },
      { id: 'piscine', name: 'Piscine', icon: 'waves', rect: [0.8, 11.2, 6.4, 14.8], floor: 'water', outdoor: true, primary: 'pool', label: [3.6, 0.2, 13.0] },
      { id: 'jardin', name: 'Jardin', icon: 'leaf', rect: [-1.2, -1.2, 17.6, 16.2], floor: 'grass', outdoor: true, primary: 'light', hideLabel: true, label: [9, 0.2, 13] },
    ],

    // --- Décor 3D (modifiable : on peut déplacer/ajouter des éléments) -----
    layout: {
      wallHeight: 2.6,
      levels: 1, wallMods: [], walls: [], stairs: [],
      ground: [
        { rect: [7.3, 9.6, 8.7, 13.4], kind: 'stone' },
        { rect: [12, 9.6, 16.4, 16.2], kind: 'driveway' },
        { rect: [-0.4, 9.6, 4.8, 10.55], kind: 'deck' },
      ],
      openings: [
        { id: 'o-salon-baie', kind: 'glass', x: 2.6, z: 9.6, w: 3.0, h: 2.1, sill: 0, shutter: 'volet-salon' },
        { id: 'o-salon-fen', kind: 'window', x: 5.5, z: 9.6, w: 1.0, h: 1.2, sill: 0.9 },
        { id: 'o-salon-ouest', kind: 'window', x: 0, z: 6.6, w: 1.6, h: 1.3, sill: 0.8 },
        { id: 'o-entree', kind: 'frontdoor', x: 8.0, z: 9.6, w: 1.0, h: 2.1 },
        { id: 'o-cuisine-fen', kind: 'window', x: 10.5, z: 9.6, w: 1.8, h: 1.2, sill: 0.9, shutter: 'volet-cuisine' },
        { id: 'o-garage', kind: 'garage', x: 14.2, z: 9.6, w: 3.8, h: 2.3, device: 'garage-porte' },
        { id: 'o-chp-nord', kind: 'window', x: 2.3, z: 0, w: 1.8, h: 1.3, sill: 0.8, shutter: 'volet-chp' },
        { id: 'o-chp-ouest', kind: 'window', x: 0, z: 2.1, w: 1.2, h: 1.3, sill: 0.8 },
        { id: 'o-che-nord', kind: 'window', x: 9.7, z: 0, w: 1.8, h: 1.3, sill: 0.8, shutter: 'volet-che' },
        { id: 'o-che-est', kind: 'window', x: 12, z: 2.1, w: 1.2, h: 1.3, sill: 0.8 },
        { id: 'o-sdb-nord', kind: 'window', x: 6.0, z: 0, w: 0.7, h: 0.7, sill: 1.4 },
        { id: 'd-chp-salon', kind: 'door', x: 2.0, z: 4.2, w: 0.9, h: 2.1 },
        { id: 'd-sdb-salon', kind: 'door', x: 5.4, z: 4.2, w: 0.9, h: 2.1 },
        { id: 'd-che-cuisine', kind: 'door', x: 10.2, z: 4.2, w: 0.9, h: 2.1 },
        { id: 'd-salon-cuisine', kind: 'door', x: 6.4, z: 6.9, w: 2.0, h: 2.1 },
        { id: 'd-cuisine-garage', kind: 'door', x: 12, z: 8.5, w: 0.9, h: 2.1 },
      ],
      // t = type de meuble ; x,z en mètres ; r = rotation en degrés (0 = face au sud)
      furniture: [
        { t: 'rug', room: 'salon', x: 2.9, z: 7.6, w: 2.8, d: 2.0, c: '#3a4658' },
        { t: 'sofa', room: 'salon', x: 3.9, z: 7.6, r: -90 },
        { t: 'coffee', room: 'salon', x: 2.5, z: 7.6 },
        { t: 'tv', room: 'salon', x: 0.35, z: 8.0, r: 90 },
        { t: 'armchair', room: 'salon', x: 1.9, z: 5.5, r: 45 },
        { t: 'floorlamp', room: 'salon', x: 4.6, z: 5.0, light: 'salon-lampadaire' },
        { t: 'plant', room: 'salon', x: 5.8, z: 9.0 },
        { t: 'ledStrip', room: 'salon', x: 0.16, z: 8.0, r: 90, len: 1.9, elev: 1.65, light: 'salon-led' },
        { t: 'rgbLamp', room: 'salon', x: 0.5, z: 9.3, light: 'salon-rgb' },
        { t: 'vacuum', room: 'salon', x: 0.4, z: 5.3, r: 90, device: 'robot-aspi' },
        { t: 'dishwasher', room: 'cuisine', x: 11.65, z: 4.5, r: -90, device: 'lave-vaisselle' },
        { t: 'microwave', room: 'cuisine', x: 11.75, z: 6.9, r: -90, elev: 0.96, device: 'micro-ondes' },
        { t: 'shelf', room: 'salon', x: 6.2, z: 8.6, r: -90 },
        { t: 'counter', room: 'cuisine', x: 11.6, z: 6.4, r: -90, len: 3.2 },
        { t: 'island', room: 'cuisine', x: 9.2, z: 6.0 },
        { t: 'fridge', room: 'cuisine', x: 7.0, z: 4.7 },
        { t: 'table', room: 'cuisine', x: 9.4, z: 8.3 },
        { t: 'chair', room: 'cuisine', x: 8.85, z: 7.6, r: 0 },
        { t: 'chair', room: 'cuisine', x: 9.95, z: 7.6, r: 0 },
        { t: 'chair', room: 'cuisine', x: 8.85, z: 9.0, r: 180 },
        { t: 'chair', room: 'cuisine', x: 9.95, z: 9.0, r: 180 },
        { t: 'rug', room: 'chp', x: 2.3, z: 1.9, w: 3.0, d: 2.6, c: '#4a5568' },
        { t: 'bed', room: 'chp', x: 2.3, z: 1.4, c: '#41537a' },
        { t: 'nightstand', room: 'chp', x: 1.0, z: 0.5, light: 'chp-chevet-g' },
        { t: 'nightstand', room: 'chp', x: 3.6, z: 0.5, light: 'chp-chevet-d' },
        { t: 'wardrobe', room: 'chp', x: 3.9, z: 3.85, r: 180 },
        { t: 'bed', room: 'che', x: 10.6, z: 1.3, single: true, c: '#1f6fdc' },
        { t: 'desk', room: 'che', x: 7.95, z: 1.6, r: 90 },
        { t: 'wardrobe', room: 'che', x: 11.2, z: 3.8, r: 180 },
        { t: 'rug', room: 'che', x: 9.2, z: 2.9, w: 1.8, d: 1.8, c: '#e8e4dc', round: true },
        { t: 'nightstand', room: 'che', x: 11.4, z: 0.5, light: 'che-veilleuse' },
        { t: 'shower', room: 'sdb', x: 6.85, z: 0.75 },
        { t: 'vanity', room: 'sdb', x: 5.2, z: 0.55 },
        { t: 'toilet', room: 'sdb', x: 6.9, z: 3.4, r: 180 },
        { t: 'car', room: 'garage', x: 14.0, z: 7.0, r: 180 },
        { t: 'charger', room: 'garage', x: 15.8, z: 4.4 },
        { t: 'shelf', room: 'garage', x: 16.2, z: 6.0, r: -90 },
        { t: 'lounger', room: 'jardin', x: 8.2, z: 12.3, r: 90 },
        { t: 'lounger', room: 'jardin', x: 8.2, z: 13.7, r: 90 },
        { t: 'tree', room: 'jardin', x: -0.7, z: 1.5, s: 1.1 },
        { t: 'tree', room: 'jardin', x: -0.6, z: 8.2, s: 1.2 },
        { t: 'tree', room: 'jardin', x: 16.9, z: 1.8, s: 1.1 },
        { t: 'tree', room: 'jardin', x: 14.2, z: -0.5, s: 1.0 },
        { t: 'tree', room: 'jardin', x: 16.6, z: 13.2, s: 1.2 },
        { t: 'tree', room: 'jardin', x: 9.6, z: 15.4, s: 1.0 },
        { t: 'bush', room: 'jardin', x: 7.0, z: 10.4 }, { t: 'bush', room: 'jardin', x: 10.2, z: 10.4 },
        { t: 'bush', room: 'jardin', x: 1.0, z: 10.2 }, { t: 'bush', room: 'jardin', x: 11.6, z: 12.6 },
        { t: 'bush', room: 'jardin', x: 12.6, z: 15.4 }, { t: 'bush', room: 'jardin', x: 5.5, z: 15.6 },
        { t: 'postlamp', room: 'jardin', x: 8.2, z: 11.6, light: 'jardin-allee' },
        { t: 'postlamp', room: 'jardin', x: 4.0, z: 10.3, light: 'jardin-terrasse' },
        { t: 'postlamp', room: 'jardin', x: 16.5, z: 12.0, light: 'jardin-arbres' },
        { t: 'poollight', room: 'piscine', x: 3.6, z: 13.0, light: 'piscine-eclairage' },
      ],
    },

    // --- Appareils ---------------------------------------------------------
    devices: [
      light('salon-plafond', 'salon', 'Plafonnier salon', [3.2, 2.4, 7.0], { brightness: 70 }),
      light('salon-lampadaire', 'salon', 'Lampadaire', [4.6, 1.7, 5.0], { brightness: 60 }, { watts: 9 }),
      light('cuisine-plafond', 'cuisine', 'Plafonnier cuisine', [9.2, 2.4, 6.9], { brightness: 80 }),
      light('cuisine-plan', 'cuisine', 'Plan de travail', [11.2, 1.5, 6.4], { brightness: 80 }, { watts: 8 }),
      light('chp-plafond', 'chp', 'Plafonnier', [2.3, 2.4, 2.1], { brightness: 50 }),
      light('chp-chevet-g', 'chp', 'Chevet gauche', [1.0, 1.0, 0.5], { brightness: 30 }, { watts: 6 }),
      light('chp-chevet-d', 'chp', 'Chevet droit', [3.6, 1.0, 0.5], { on: false, brightness: 30 }, { watts: 6 }),
      light('che-plafond', 'che', 'Plafonnier', [9.7, 2.4, 2.1], { brightness: 60 }),
      light('che-veilleuse', 'che', 'Veilleuse RVB', [11.4, 0.8, 0.5], { on: false, brightness: 20, tone: 'custom', color: '#7d5cff' }, { watts: 3, rgb: true }),
      light('sdb-plafond', 'sdb', 'Plafonnier', [6.0, 2.4, 2.1], { brightness: 80, tone: 'neutral' }),
      light('garage-plafond', 'garage', 'Plafonnier garage', [14.2, 2.4, 7.0], { on: false, brightness: 100, tone: 'cool' }, { watts: 18 }),
      light('piscine-eclairage', 'piscine', 'Éclairage bassin RVB', [3.6, -0.2, 13.0], { brightness: 100, tone: 'aqua' }, { watts: 35, rgb: true }),
      light('jardin-allee', 'jardin', 'Allée RVB', [8.2, 0.9, 11.6], { brightness: 60 }, { watts: 8, rgb: true }),
      light('jardin-terrasse', 'jardin', 'Terrasse', [4.0, 0.9, 10.3], { brightness: 60 }, { watts: 8 }),
      light('jardin-arbres', 'jardin', 'Arbres', [16.5, 0.9, 12.0], { brightness: 50 }, { watts: 8 }),

      light('salon-led', 'salon', 'Ruban LED TV (RVB)', [0.16, 1.7, 8.0], { on: false, brightness: 70, tone: 'custom', color: '#0a84ff' }, { watts: 12, rgb: true }),
      light('salon-rgb', 'salon', 'Lampe RVB', [0.5, 0.6, 9.3], { on: false, brightness: 70, tone: 'custom', color: '#ff2d92' }, { watts: 9, rgb: true }),

      dev('thermo-salon', 'salon', 'thermostat', 'Thermostat salon', [0.15, 1.5, 5.0], { current: 21.5, target: 21.5 }),
      dev('thermo-cuisine', 'cuisine', 'thermostat', 'Thermostat cuisine', [6.6, 1.5, 4.4], { current: 21.5, target: 21.5 }),
      dev('thermo-chp', 'chp', 'thermostat', 'Thermostat chambre', [0.15, 1.5, 3.3], { current: 21, target: 21 }),
      dev('thermo-che', 'che', 'thermostat', 'Thermostat chambre', [7.6, 1.5, 3.4], { current: 22, target: 22 }),
      dev('clim-salon', 'salon', 'ac', 'Climatisation salon', [3.2, 2.35, 4.4], { on: false, target: 24 }),
      dev('seche-sdb', 'sdb', 'heater', 'Sèche-serviettes', [4.75, 1.2, 2.5], { on: false }, { watts: 500 }),
      dev('hygro-sdb', 'sdb', 'temp', 'Capteur température', [7.2, 1.6, 2.5], { temperature: 23, humidity: 60 }),

      dev('volet-salon', 'salon', 'shutter', 'Volet baie vitrée', [2.6, 2.2, 9.5], { position: 100 }),
      dev('volet-cuisine', 'cuisine', 'shutter', 'Volet cuisine', [10.5, 2.0, 9.5], { position: 100 }),
      dev('volet-chp', 'chp', 'shutter', 'Volet chambre', [2.3, 2.2, 0.15], { position: 0 }),
      dev('volet-che', 'che', 'shutter', 'Volet chambre', [9.7, 2.2, 0.15], { position: 100 }),

      dev('plug-tv', 'salon', 'plug', 'Télévision', [0.6, 0.5, 8.0], { on: true }, { watts: 120, category: 'appliances' }),
      dev('plug-frigo', 'cuisine', 'plug', 'Réfrigérateur', [7.0, 1.0, 4.7], { on: true }, { watts: 90, essential: true, category: 'appliances' }),
      dev('plug-cafe', 'cuisine', 'plug', 'Cafetière', [11.3, 1.0, 5.2], { on: false }, { watts: 900, category: 'appliances' }),
      dev('plug-chargeur', 'chp', 'plug', 'Chargeurs', [3.6, 0.6, 0.4], { on: true }, { watts: 15, category: 'appliances' }),
      dev('plug-borne', 'garage', 'plug', 'Borne de recharge', [15.6, 1.3, 4.5], { on: false }, { watts: 7400, category: 'vehicle' }),

      dev('mot-salon', 'salon', 'motion', 'Présence salon', [5.9, 2.3, 4.5]),
      dev('mot-cuisine', 'cuisine', 'motion', 'Présence cuisine', [11.6, 2.3, 9.2]),
      dev('mot-chp', 'chp', 'motion', 'Présence chambre', [4.3, 2.3, 3.9]),
      dev('mot-che', 'che', 'motion', 'Présence chambre', [7.6, 2.3, 0.4]),
      dev('mot-garage', 'garage', 'motion', 'Présence garage', [16.2, 2.3, 9.2]),
      dev('mot-jardin', 'jardin', 'motion', 'Détecteur extérieur', [12.5, 2.4, 9.9]),

      dev('lock-entree', 'cuisine', 'lock', 'Porte d’entrée', [8.7, 1.1, 9.5], { locked: true }),
      dev('garage-porte', 'garage', 'garage', 'Porte de garage', [14.2, 2.0, 9.4]),
      dev('pool-pompe', 'piscine', 'pool', 'Piscine', [5.6, 0.2, 11.6], { pump: true, temperature: 26, target: 26 }, { watts: 800 }),

      dev('lave-vaisselle', 'cuisine', 'dishwasher', 'Lave-vaisselle', [11.65, 0.5, 4.5], {}, { watts: 1800 }),
      dev('micro-ondes', 'cuisine', 'microwave', 'Micro-ondes', [11.75, 1.1, 6.9], {}, { watts: 1200 }),
      dev('robot-aspi', 'salon', 'vacuum', 'Robot aspirateur', [0.4, 0.1, 5.3], { x: 0.4, z: 5.3, ang: 0, s: 0 }, { dock: [0.4, 5.3] }),

      dev('cam-entree', 'cuisine', 'camera', 'Caméra entrée', [7.2, 2.4, 9.8], { on: true, recording: true }),
      dev('cam-garage', 'garage', 'camera', 'Caméra garage', [16.2, 2.4, 9.8], { on: true }),
      dev('cam-jardin', 'jardin', 'camera', 'Caméra jardin', [17.6, 2.4, 6.0], { on: true }),
      dev('cam-piscine', 'piscine', 'camera', 'Caméra piscine', [6.6, 2.4, 11.3], { on: true }),
    ],

    // --- Scénarios : liste d'actions {target, patch} -----------------------
    // target : { deviceId } | { type, roomId?, nonEssential? } | { all:true }
    scenes: [
      {
        id: 'night', name: 'Bonne nuit', icon: 'moon', color: '#7d7aff',
        actions: [
          { target: { type: 'light' }, patch: { on: false } },
          { target: { deviceId: 'chp-chevet-g' }, patch: { on: true, brightness: 10 } },
          { target: { deviceId: 'che-veilleuse' }, patch: { on: true, brightness: 15 } },
          { target: { type: 'shutter' }, patch: { position: 0 } },
          { target: { type: 'lock' }, patch: { locked: true } },
          { target: { type: 'garage' }, patch: { target: 0 } },
          { target: { type: 'thermostat' }, patch: { target: 18.5 } },
          { target: { deviceId: 'thermo-che' }, patch: { target: 20 } },
          { target: { type: 'ac' }, patch: { on: false } },
          { target: { type: 'motion' }, patch: { armed: true } },
          { target: { type: 'vacuum' }, patch: { command: 'dock' } },
        ],
      },
      {
        id: 'away', name: 'Je suis parti', icon: 'home', color: '#0a84ff',
        actions: [
          { target: { type: 'light' }, patch: { on: false } },
          { target: { type: 'plug', nonEssential: true }, patch: { on: false } },
          { target: { type: 'lock' }, patch: { locked: true } },
          { target: { type: 'garage' }, patch: { target: 0 } },
          { target: { type: 'shutter' }, patch: { position: 20 } },
          { target: { type: 'thermostat' }, patch: { target: 17 } },
          { target: { type: 'ac' }, patch: { on: false } },
          { target: { type: 'camera' }, patch: { on: true, recording: true } },
          { target: { type: 'motion' }, patch: { armed: true } },
          { target: { type: 'vacuum' }, patch: { command: 'start' } },
        ],
      },
      {
        id: 'comfort', name: 'Mode confort', icon: 'sun', color: '#ffd60a',
        actions: [
          { target: { type: 'shutter' }, patch: { position: 100 } },
          { target: { roomId: 'salon', type: 'light' }, patch: { on: true, brightness: 70 } },
          { target: { roomId: 'cuisine', type: 'light' }, patch: { on: true, brightness: 80 } },
          { target: { type: 'thermostat' }, patch: { target: 21.5 } },
          { target: { type: 'motion' }, patch: { armed: false } },
        ],
      },
      {
        id: 'eco', name: 'Mode Éco', icon: 'leaf', color: '#30d158',
        actions: [
          { target: { type: 'thermostat' }, patch: { target: 19 } },
          { target: { type: 'ac' }, patch: { on: false } },
          { target: { type: 'light' }, patch: { on: false } },
          { target: { type: 'plug', nonEssential: true }, patch: { on: false } },
          { target: { type: 'heater' }, patch: { on: false } },
          { target: { type: 'pool' }, patch: { pump: false } },
        ],
      },
      {
        id: 'ambiance', name: 'Ambiance RVB', icon: 'bulb', color: '#bf5af2',
        actions: [
          { target: { roomId: 'salon', type: 'light' }, patch: { brightness: 25 } },
          { target: { type: 'light', rgb: true }, patch: { on: true, tone: 'custom', color: '#8a5cff', brightness: 75 } },
        ],
      },
    ],

    // --- Automatisations -----------------------------------------------------
    // trigger.kind : time | motion | temp | device
    automations: [
      {
        id: 'auto-jardin-on', name: 'Éclairage jardin au coucher', enabled: true,
        trigger: { kind: 'time', at: '20:00', days: [0, 1, 2, 3, 4, 5, 6] },
        actions: [{ target: { roomId: 'jardin', type: 'light' }, patch: { on: true, brightness: 60 } }],
      },
      {
        id: 'auto-jardin-off', name: 'Extinction du jardin', enabled: true,
        trigger: { kind: 'time', at: '23:30', days: [0, 1, 2, 3, 4, 5, 6] },
        actions: [{ target: { roomId: 'jardin', type: 'light' }, patch: { on: false } }],
      },
      {
        id: 'auto-volets-matin', name: 'Ouvrir les volets le matin', enabled: true,
        trigger: { kind: 'time', at: '07:30', days: [1, 2, 3, 4, 5] },
        actions: [{ target: { type: 'shutter' }, patch: { position: 100 } }],
      },
      {
        id: 'auto-presence-salon', name: 'Lampadaire si présence au salon', enabled: true,
        trigger: { kind: 'motion', deviceId: 'mot-salon' },
        actions: [{ target: { deviceId: 'salon-lampadaire' }, patch: { on: true, brightness: 60 } }],
      },
      {
        id: 'auto-clim', name: 'Clim si salon > 25 °C', enabled: true,
        trigger: { kind: 'temp', roomId: 'salon', op: '>', value: 25 },
        actions: [{ target: { deviceId: 'clim-salon' }, patch: { on: true, mode: 'cool', target: 24 } }],
      },
      {
        id: 'auto-aspi', name: 'Robot aspirateur en semaine', enabled: true,
        trigger: { kind: 'time', at: '10:30', days: [1, 2, 3, 4, 5] },
        actions: [{ target: { type: 'vacuum' }, patch: { command: 'start' } }],
      },
      {
        id: 'auto-nuit', name: 'Bonne nuit automatique', enabled: false,
        trigger: { kind: 'time', at: '23:00', days: [0, 1, 2, 3, 4, 5, 6] },
        actions: [{ sceneId: 'night' }],
      },
    ],

    settings: { energyPrice: 0.2516, graphics: 'auto', simulateEvents: false },
  };
}
