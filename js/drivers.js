// ---------------------------------------------------------------------------
// COUCHE D'APPAREILS — clairement séparée de l'application.
//
// Un "driver" est un objet avec (tous optionnels sauf attach) :
//   attach(store)            appelé une fois au démarrage
//   send(device, patch)      l'utilisateur/une scène change un appareil : à
//                            transmettre au matériel réel (HA, MQTT, Matter…)
//   step(dt)                 appelé chaque seconde (simulation uniquement)
//
// Pour un appareil réel, le driver appelle en retour :
//   store.setDevice(id, patch, { source: 'driver' })   changement discret
//   store.patchLive(id, patch)                          valeur continue
//
// Ci-dessous : SimulatedDriver, qui fait vivre la maison (thermique, porte de
// garage, détecteurs, humidité, piscine). Voir README.md pour brancher
// Home Assistant.
// ---------------------------------------------------------------------------

const OUTDOOR_TEMP = 12; // °C extérieur simulé

import { ROBOT, planRoute, planReturn, roomArea, indoorRooms, coverageLen, geoSig, dockInfo, vacPath, pathPoint } from './robot.js';
export { vacPath, pathPoint };

export class SimulatedDriver {
  constructor() { this.store = null; this.nextEvent = 40; this.rt = new Map(); }
  attach(store) { this.store = store; }
  send() { /* simulation : l'état est déjà à jour dans le store */ }

  // --- Robot aspirateur intelligent : pièces choisies, portes, batterie, présence, reprise après recharge
  stepVacuum(d, dt) {
    const S = this.store, v = d.state, room = S.room(d.roomId);
    if (!room) return;
    const { level, dock, dockRoom } = dockInfo(S.state, d);
    const set = (patch) => S.patchLive(d.id, patch), cmd = (patch) => S.setDevice(d.id, patch, { source: 'driver' });
    const R = this.rt.get(d.id) || {}; this.rt.set(d.id, R);
    const presence = S.devicesIn(d.roomId).some((m) => m.type === 'motion' && m.state.detected);
    // intelligence : pause quand quelqu'un est dans la pièce du robot, reprise après quelques secondes de calme
    if (v.smart && v.status === 'cleaning' && presence) { cmd({ status: 'paused', paused: 'presence', calm: 0 }); S.emit('toast', `${d.name} : pause (présence détectée)`); return; }
    if (v.status === 'paused' && v.paused === 'presence') {
      if (presence) set({ calm: 0 });
      else if ((v.calm || 0) + dt >= 8) { cmd({ status: 'cleaning', paused: '' }); S.emit('toast', `${d.name} : reprise du nettoyage`); }
      else set({ calm: (v.calm || 0) + dt });
      return;
    }
    const x = v.x === undefined ? dock[0] : v.x, z = v.z === undefined ? dock[1] : v.z;
    const sel = v.rooms && v.rooms.length ? v.rooms : [dockRoom];
    const rn = (id) => (S.room(id) || {}).name || '';

    if (v.status === 'cleaning') {
      R.ret = null;
      const done = v.done || [], remaining = sel.filter((id) => !done.includes(id));
      const sig = `${remaining.join(',')}|${geoSig(S.state, level)}`;
      if (!R.clean || R.clean.sig !== sig) R.clean = { sig, route: planRoute(S.state, d, remaining) };
      const route = R.clean.route, sp = ROBOT.speed[v.mode] || 0.7;
      const s = (v.s || 0) + sp * dt, pp = pathPoint(route, Math.min(s, route.cleanEnd));
      const inLeg = route.legs.find((l) => s >= l.s0 && s <= l.s1), fin = route.legs.filter((l) => s > l.s1).map((l) => l.roomId);
      const newDone = [...new Set([...done, ...fin])];
      const totalSel = coverageLen(S.state, level, sel), doneLen = coverageLen(S.state, level, newDone) + (inLeg ? s - inLeg.s0 : 0);
      const rooms = indoorRooms(S.state, level).filter((r) => sel.includes(r.id)), totArea = rooms.reduce((a, r) => a + roomArea(r), 0);
      const progress = Math.min(100, (100 * doneLen) / Math.max(1, totalSel));
      const etaClean = Math.max(0, route.cleanEnd - s) / sp;
      set({ s, x: pp.x, z: pp.z, ang: pp.ang, progress, area: Math.round(progress * totArea * 0.0092) / 10, etaClean, etaBase: etaClean + route.returnLen / ROBOT.retSpeed, curRoom: inLeg ? inLeg.roomId : '', curName: inLeg ? rn(inLeg.roomId) : 'Déplacement' });
      if (newDone.length !== done.length) cmd({ done: newDone });
      const bat = v.battery - (ROBOT.drain[v.mode] || 0.11) * dt; set({ battery: Math.max(0, bat) });
      if (s >= route.cleanEnd) { cmd({ status: 'returning', progress: 100, done: sel.filter((id) => !route.unreachable.includes(id)), etaClean: 0 }); S.emit('toast', `${d.name} : nettoyage terminé`); if (route.unreachable.length) S.emit('toast', `${route.unreachable.map(rn).join(', ')} : pièce inaccessible (porte manquante)`); }
      else if (bat < ROBOT.lowBattery) { cmd({ status: 'returning', resume: true }); S.emit('toast', `${d.name} : batterie faible, retour à la base (reprise après recharge)`); }
    } else if (v.status === 'returning') {
      if (!R.ret) R.ret = { route: planReturn(S.state, d, x, z), s: 0 };
      const rr = R.ret, s2 = rr.s + ROBOT.retSpeed * dt, pp = pathPoint(rr.route, s2); rr.s = s2;
      set({ x: pp.x, z: pp.z, ang: pp.ang, etaClean: 0, etaBase: Math.max(0, rr.route.total - s2) / ROBOT.retSpeed, curRoom: '', curName: 'Retour' });
      if (s2 >= rr.route.total) { R.ret = null; set({ x: dock[0], z: dock[1], s: 0, etaBase: 0 }); cmd({ status: v.resume || v.battery < 99 ? 'charging' : 'docked' }); }
    } else if (v.status === 'charging') {
      const bat = Math.min(100, v.battery + 2.2 * dt); set({ battery: bat });
      if (v.resume && bat >= ROBOT.resumeAt) { cmd({ status: 'cleaning', resume: false, s: 0, paused: '' }); S.emit('toast', `${d.name} : recharge suffisante, reprise du nettoyage`); }
      else if (!v.resume && bat >= 100) cmd({ status: 'docked' });
    } else if (v.status === 'docked' && (Math.abs(x - dock[0]) > 0.02 || Math.abs(z - dock[1]) > 0.02)) set({ x: dock[0], z: dock[1] });
  }

  step(dt) {
    const S = this.store;
    const st = S.state;

    // --- Thermique : chaque pièce chauffée tend vers sa consigne ------------
    st.devices.filter((d) => d.type === 'thermostat').forEach((d) => {
      const s = d.state;
      let heating = s.heating;
      if (s.mode === 'off') heating = false;
      else if (s.current < s.target - 0.15) heating = true;
      else if (s.current >= s.target + 0.05) heating = false;
      let cur = s.current;
      const ac = S.devicesIn(d.roomId).find((x) => x.type === 'ac' && x.state.on);
      if (heating) cur += 0.06 * dt;
      else cur += (OUTDOOR_TEMP + 7 - cur) * 0.0025 * dt; // déperdition lente
      if (ac) cur += (ac.state.target - cur) * 0.03 * dt;
      S.patchLive(d.id, { current: Math.round(cur * 100) / 100, heating });
    });

    // --- Capteur salle de bain : le sèche-serviettes chauffe/sèche --------------
    st.devices.filter((d) => d.type === 'temp').forEach((d) => {
      const heater = S.devicesIn(d.roomId).find((x) => x.type === 'heater' && x.state.on);
      const t = d.state.temperature + ((heater ? 24.5 : 22) - d.state.temperature) * 0.01 * dt;
      const h = Math.min(85, Math.max(35, d.state.humidity + (Math.random() - 0.5) * 0.6 + (heater ? -0.05 : 0.0)));
      S.patchLive(d.id, { temperature: Math.round(t * 10) / 10, humidity: Math.round(h * 10) / 10 });
    });

    // --- Porte de garage : 4 s pour une course complète --------------------------
    st.devices.filter((d) => d.type === 'garage').forEach((d) => {
      const s = d.state; const diff = s.target - s.position;
      if (Math.abs(diff) > 0.01) S.patchLive(d.id, { position: Math.abs(diff) < 25 * dt ? s.target : s.position + Math.sign(diff) * 25 * dt });
    });

    // --- Volets : le mouvement réel (actual) rejoint la position commandée à ~22 %/s
    st.devices.filter((d) => d.type === 'shutter').forEach((d) => {
      const s = d.state, a = s.actual === undefined ? s.position : s.actual, diff = s.position - a;
      if (Math.abs(diff) > 0.05) S.patchLive(d.id, { actual: Math.abs(diff) < 22 * dt ? s.position : a + Math.sign(diff) * 22 * dt });
    });

    // --- Lave-vaisselle : 1 s réelle = 1 min de cycle (temps accéléré)
    st.devices.filter((d) => d.type === 'dishwasher' && d.state.status === 'running').forEach((d) => {
      const rem = d.state.remaining - dt;
      if (rem <= 0) { S.setDevice(d.id, { status: 'done', remaining: 0 }, { source: 'driver' }); S.emit('toast', `${d.name} : cycle terminé`); }
      else S.patchLive(d.id, { remaining: rem });
    });
    // --- Micro-ondes : temps réel
    st.devices.filter((d) => d.type === 'microwave' && d.state.status === 'cooking').forEach((d) => {
      const rem = d.state.remaining - dt;
      if (rem <= 0) { S.setDevice(d.id, { status: 'idle', remaining: 0 }, { source: 'driver' }); S.emit('toast', `${d.name} : terminé`); }
      else S.patchLive(d.id, { remaining: rem });
    });
    // --- Robot aspirateur intelligent : parcours, batterie, pause si présence, retour base
    st.devices.filter((d) => d.type === 'vacuum').forEach((d) => this.stepVacuum(d, dt));

    // --- Piscine : l'eau tend (lentement) vers la consigne -----------------------
    st.devices.filter((d) => d.type === 'pool').forEach((d) => {
      const s = d.state;
      const t = s.temperature + ((s.pump ? s.target : 18) - s.temperature) * 0.004 * dt;
      S.patchLive(d.id, { temperature: Math.round(t * 100) / 100 });
    });

    // --- Détecteurs : retombée automatique -------------------------------------
    st.devices.filter((d) => d.type === 'motion' && d.state.detected && Date.now() > d.state.detectedUntil).forEach((d) => {
      S.setDevice(d.id, { detected: false }, { source: 'driver' });
    });

    // --- Événements aléatoires (option) ----------------------------------------------
    if (st.settings.simulateEvents) {
      this.nextEvent -= dt;
      if (this.nextEvent <= 0) {
        this.nextEvent = 45 + Math.random() * 60;
        const sensors = st.devices.filter((d) => d.type === 'motion');
        const d = sensors[Math.floor(Math.random() * sensors.length)];
        if (d) S.setDevice(d.id, { detected: true }, { source: 'driver' });
      }
    }
  }
}
