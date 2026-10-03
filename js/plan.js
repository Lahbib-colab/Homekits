// ---------------------------------------------------------------------------
// Opérations sur le PLAN (fonctions pures, sans DOM) : pièces, ouvertures,
// mobilier, appareils, modèles. L'éditeur ne fait qu'appeler ces fonctions ;
// les murs 3D sont ensuite dérivés des rectangles de pièces par world.js.
// ---------------------------------------------------------------------------
import { computeWalls, FURN_INFO, SHOWER_SIZES, WARDROBE_DEFAULT, LH, levelOf, STAIR_DEFAULT, STAIR_L_DEFAULT, STAIR_U_DEFAULT, stairRect, stairHoles, stairLayout } from './world.js';
import { DEVICE_TYPES } from './catalog.js';
import { defaultHouse } from './data.js';

export const MAX_ROOMS = 22;
export const MAX_LEVELS = 3;
export { LH, levelOf, stairRect, stairHoles, stairLayout };
export const levelCount = (S) => Math.max(1, S.layout.levels || 1);
export const levelName = (l) => (l === 0 ? 'RDC' : `Étage ${l}`);
export const wallsOf = (S, lv = 0) => computeWalls(S.rooms, S.layout.wallMods || [], S.layout.walls || [], lv);
export const roomLevel = (S, id) => { const r = S.rooms.find((q) => q.id === id); return r ? levelOf(r) : 0; };
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const snapv = (v, st) => (st ? r3(Math.round(v / st) * st) : r3(v));
const rid = (p) => `${p}-${Math.random().toString(36).slice(2, 7)}`;

export const OPEN_DEFAULTS = {
  door: { w: 0.9, h: 2.1, label: 'Porte' }, frontdoor: { w: 1.0, h: 2.1, label: 'Porte d’entrée' },
  window: { w: 1.2, h: 1.3, sill: 0.9, label: 'Fenêtre' }, glass: { w: 2.4, h: 2.1, sill: 0, label: 'Baie vitrée' },
  garage: { w: 2.6, h: 2.3, label: 'Porte de garage' },
};

export const area = (r) => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
export const inRect = (x, z, rc, e = 0) => x >= rc[0] - e && x <= rc[2] + e && z >= rc[1] - e && z <= rc[3] + e;
const rectsOverlap = (a, b, eps = 0.01) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > eps && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > eps;
const others = (S, id, lv) => S.rooms.filter((r) => r.id !== id && r.id !== 'jardin' && levelOf(r) === lv);

export function roomAt(S, x, z, lv = 0) {
  const ind = S.rooms.find((q) => !q.outdoor && levelOf(q) === lv && x >= q.rect[0] && x < q.rect[2] && z >= q.rect[1] && z < q.rect[3]);
  if (ind || lv > 0) return ind || null;
  return S.rooms.find((q) => q.outdoor && q.id !== 'jardin' && x >= q.rect[0] && x < q.rect[2] && z >= q.rect[1] && z < q.rect[3])
    || S.rooms.find((q) => q.id === 'jardin') || null;
}

// Chevauchement interdit entre pièces d'un même niveau (le terrain "jardin" est exclu)
export function findOverlap(S, id, rect, level) {
  const me = id && S.rooms.find((r) => r.id === id);
  const lv = level !== undefined ? level : me ? levelOf(me) : 0;
  return others(S, id, lv).find((r) => rectsOverlap(r.rect, rect)) || null;
}

export function fitGarden(S, margin = 1.2) {
  let g = S.rooms.find((r) => r.id === 'jardin');
  const rs = S.rooms.filter((r) => r.id !== 'jardin');
  let x1 = 1e9, z1 = 1e9, x2 = -1e9, z2 = -1e9;
  const add = (r, m) => { x1 = Math.min(x1, r[0] - m); z1 = Math.min(z1, r[1] - m); x2 = Math.max(x2, r[2] + m); z2 = Math.max(z2, r[3] + m); };
  rs.forEach((r) => add(r.rect, margin)); (S.layout.ground || []).forEach((q) => add(q.rect, 0.3));
  S.layout.furniture.forEach((f) => { if (f.t === 'tree' || f.t === 'bush') add([f.x, f.z, f.x, f.z], 0.9); });
  if (x1 > x2) { x1 = -1; z1 = -1; x2 = 9; z2 = 9; }
  if (!g) { g = { id: 'jardin', name: 'Jardin', icon: 'leaf', rect: [0, 0, 1, 1], floor: 'grass', outdoor: true, primary: 'light', hideLabel: true }; S.rooms.push(g); }
  g.rect = [r3(x1), r3(z1), r3(x2), r3(z2)];
}

// ----------------------------------------------------------------- pièces
export function addRoom(S, rect, opts = {}) {
  const n = S.rooms.filter((r) => r.id !== 'jardin').length + 1;
  const room = { id: rid('r'), name: opts.name || `Pièce ${n}`, icon: opts.icon || 'sofa', rect: rect.map(r3), floor: opts.floor || 'wood', primary: opts.primary || 'light', ...(opts.outdoor ? { outdoor: true } : {}), ...(opts.level ? { level: opts.level } : {}) };
  S.rooms.splice(S.rooms.findIndex((r) => r.id === 'jardin') >= 0 ? S.rooms.findIndex((r) => r.id === 'jardin') : S.rooms.length, 0, room);
  fitGarden(S);
  return room;
}
function shiftContents(S, room, dx, dz) {
  const old = room.rect, lv = levelOf(room);
  S.layout.furniture.forEach((f) => { if ((f.level || 0) === lv && (f.room === room.id || inRect(f.x, f.z, old))) { f.x = r3(f.x + dx); f.z = r3(f.z + dz); f.room = room.id; } });
  S.devices.forEach((d) => { if (d.roomId === room.id) { d.pos = [r3(d.pos[0] + dx), d.pos[1], r3(d.pos[2] + dz)]; } });
  S.layout.openings.forEach((o) => { if ((o.level || 0) === lv && inRect(o.x, o.z, old, 0.15)) { o.x = r3(o.x + dx); o.z = r3(o.z + dz); } });
  (S.layout.stairs || []).forEach((s) => { if ((s.level || 0) === lv && inRect(s.x, s.z, old)) { s.x = r3(s.x + dx); s.z = r3(s.z + dz); } });
}
export function moveRoom(S, id, dx, dz) {
  const r = S.rooms.find((q) => q.id === id); if (!r) return;
  shiftContents(S, r, dx, dz);
  r.rect = [r3(r.rect[0] + dx), r3(r.rect[1] + dz), r3(r.rect[2] + dx), r3(r.rect[3] + dz)];
}
export function setRoomRect(S, id, rect) { const r = S.rooms.find((q) => q.id === id); if (r) r.rect = rect.map(r3); }
export function deleteRoom(S, id) {
  const r = S.rooms.find((q) => q.id === id); if (!r || id === 'jardin') return { devices: 0 };
  const devs = S.devices.filter((d) => d.roomId === id);
  S.devices = S.devices.filter((d) => d.roomId !== id);
  const lvD = levelOf(r);
  S.layout.furniture = S.layout.furniture.filter((f) => !((f.level || 0) === lvD && (f.room === id || inRect(f.x, f.z, r.rect))));
  S.layout.openings.forEach((o) => { if (o.shutter && !S.devices.some((d) => d.id === o.shutter)) delete o.shutter; if (o.device && !S.devices.some((d) => d.id === o.device)) delete o.device; });
  S.rooms = S.rooms.filter((q) => q.id !== id);
  fitGarden(S); reconcileOpenings(S); reconcileWallMods(S);
  return { devices: devs.length };
}

// ------------------------------------------------------------ murs / ouvertures
export function wallLen(w) { return w.b - w.a; }
export function nearestWall(S, x, z, maxDist = 0.6, lv = 0) {
  let best = null;
  wallsOf(S, lv).forEach((w) => {
    const isH = w.orient === 'h', perp = Math.abs((isH ? z : x) - w.c), al = isH ? x : z;
    const out = Math.max(0, w.a - al, al - w.b);
    const d = perp + out;
    if (d <= maxDist && (!best || d < best.dist)) best = { wall: w, dist: d, along: Math.min(w.b, Math.max(w.a, al)) };
  });
  return best;
}
export function wallRoom(S, w, lv = 0) {
  const isH = w.orient === 'h', mid = (w.a + w.b) / 2;
  const probe = (s) => (isH ? roomAt(S, mid, w.c + s * 0.3, lv) : roomAt(S, w.c + s * 0.3, mid, lv));
  const a = probe(1), b = probe(-1);
  return [a, b].find((r) => r && r.id !== 'jardin' && !r.outdoor) || a || b;
}
function openingsOnWall(S, w, lv = 0) {
  const isH = w.orient === 'h';
  return S.layout.openings.filter((o) => (o.level || 0) === lv && (isH ? Math.abs(o.z - w.c) < 0.02 : Math.abs(o.x - w.c) < 0.02) && (isH ? o.x : o.z) >= w.a - 0.01 && (isH ? o.x : o.z) <= w.b + 0.01);
}
const along = (o, w) => (w.orient === 'h' ? o.x : o.z);

export function reconcileOpenings(S) {
  const cache = {};
  S.layout.openings.forEach((o) => {
    const lv = o.level || 0, walls = cache[lv] || (cache[lv] = wallsOf(S, lv));
    let best = null;
    walls.forEach((w) => {
      const isH = w.orient === 'h', perp = Math.abs((isH ? o.z : o.x) - w.c), al = isH ? o.x : o.z;
      const lo = w.a + o.w / 2 + 0.05, hi = w.b - o.w / 2 - 0.05;
      if (hi < lo) return;
      const c = Math.min(hi, Math.max(lo, al)), d = perp + Math.abs(c - al) * 0.5;
      if (perp < 0.6 && (!best || d < best.d)) best = { w, c, d };
    });
    if (best) { if (best.w.orient === 'h') { o.z = r3(best.w.c); o.x = r3(best.c); } else { o.x = r3(best.w.c); o.z = r3(best.c); } delete o.orphan; }
    else o.orphan = true;
  });
}

export function addOpening(S, kind, x, z, lv = 0) {
  const def = OPEN_DEFAULTS[kind]; if (!def) return { error: 'Type inconnu' };
  if (kind === 'garage' && lv > 0) return { error: 'Porte de garage : rez-de-chaussée uniquement' };
  const nw = nearestWall(S, x, z, 0.7, lv); if (!nw) return { error: 'Touchez près d’un mur' };
  const w = nw.wall, len = wallLen(w);
  if (len < 0.6) return { error: 'Mur trop court' };
  const width = Math.min(def.w, len - 0.2);
  const lo = w.a + width / 2 + 0.1, hi = w.b - width / 2 - 0.1;
  let p = Math.min(hi, Math.max(lo, nw.along));
  const taken = openingsOnWall(S, w, lv);
  if (taken.some((q) => Math.abs(along(q, w) - p) < (q.w + width) / 2 + 0.05)) return { error: 'Emplacement déjà occupé' };
  const o = { id: rid('o'), kind, x: w.orient === 'h' ? r3(p) : r3(w.c), z: w.orient === 'h' ? r3(w.c) : r3(p), w: r3(width), h: def.h, ...(def.sill !== undefined ? { sill: def.sill } : {}), ...(lv ? { level: lv } : {}) };
  S.layout.openings.push(o);
  const room = wallRoom(S, w, lv);
  if (kind === 'garage' && room) {
    const d = newDevice(S, { roomId: room.id, type: 'garage', name: 'Porte de garage', pos: [o.x, 2.0, o.z - (w.n || 0) * 0.15] }); o.device = d.id;
  }
  return { opening: o };
}
export function removeOpening(S, o) {
  S.layout.openings = S.layout.openings.filter((q) => q !== o);
  [o.shutter, o.device].forEach((id) => { if (id) S.devices = S.devices.filter((d) => d.id !== id); });
}
export function setShutter(S, o, on) {
  if (!on) { if (o.shutter) S.devices = S.devices.filter((d) => d.id !== o.shutter); delete o.shutter; return; }
  const lv = o.level || 0, nw = nearestWall(S, o.x, o.z, 0.3, lv); const room = nw && wallRoom(S, nw.wall, lv); if (!room) return;
  const d = newDevice(S, { roomId: room.id, type: 'shutter', name: `Volet ${room.name}`, pos: [o.x, lv * LH + (o.sill || 0) + o.h, o.z], state: { position: 100 } });
  o.shutter = d.id;
}
export function moveOpeningTo(S, o, x, z) {
  const lv = o.level || 0, nw = nearestWall(S, x, z, 1.2, lv); if (!nw) return false;
  const w = nw.wall, lo = w.a + o.w / 2 + 0.05, hi = w.b - o.w / 2 - 0.05; if (hi < lo) return false;
  const p = Math.min(hi, Math.max(lo, nw.along));
  const taken = openingsOnWall(S, w, lv).filter((q) => q !== o);
  if (taken.some((q) => Math.abs(along(q, w) - p) < (q.w + o.w) / 2 + 0.05)) return false;
  if (w.orient === 'h') { o.x = r3(p); o.z = r3(w.c); } else { o.z = r3(p); o.x = r3(w.c); }
  delete o.orphan; return true;
}

// ----------------------------------------------- murs libres, ouverts, demi-murs
// mode : 'full' (mur plein) | 'half' (demi-mur / comptoir) | 'open' (aucun mur : cuisine ouverte…)
export function wallMode(S, w, lv = 0) {
  if (w.free) return w.low ? 'half' : 'full';
  const m = (S.layout.wallMods || []).find((q) => (q.level || 0) === lv && q.orient === w.orient && Math.abs(q.c - w.c) < 0.03 && Math.min(q.b, w.b) - Math.max(q.a, w.a) > 0.01);
  return m ? m.mode : 'full';
}
export function setWallMode(S, w, mode, lv = 0) {
  const mods = S.layout.wallMods || (S.layout.wallMods = []);
  S.layout.wallMods = mods.filter((m) => !((m.level || 0) === lv && m.orient === w.orient && Math.abs(m.c - w.c) < 0.03 && Math.min(m.b, w.b) - Math.max(m.a, w.a) > 0.01));
  if (mode !== 'full') S.layout.wallMods.push({ orient: w.orient, c: r3(w.c), a: r3(w.a), b: r3(w.b), mode, level: lv });
  if (mode === 'open') {
    openingsOnWall(S, { orient: w.orient, c: w.c, a: w.a, b: w.b }, lv).forEach((o) => removeOpening(S, o));
  }
}
export function addFreeWall(S, orient, c, a, b, mode, lv = 0) {
  if (b - a < 0.3) return null;
  const f = { orient, c: r3(c), a: r3(a), b: r3(b), mode: mode || 'full', ...(lv ? { level: lv } : {}) };
  (S.layout.walls || (S.layout.walls = [])).push(f); return f;
}
export function removeFreeWall(S, f) { S.layout.walls = (S.layout.walls || []).filter((q) => q !== f); }
// recale les modifications de murs sur les murs existants (après déplacement/redimensionnement de pièces)
export function reconcileWallMods(S) {
  const cache = {}, out = [];
  (S.layout.wallMods || []).forEach((m) => {
    const lv = m.level || 0, base = cache[lv] || (cache[lv] = computeWalls(S.rooms, [], [], lv));
    let best = null;
    base.forEach((w) => {
      if (w.orient !== m.orient || Math.abs(w.c - m.c) > 0.6) return;
      const ov = Math.min(w.b, m.b) - Math.max(w.a, m.a);
      if (ov > 0.05 && (!best || ov - Math.abs(w.c - m.c) > best.s)) best = { w, ov, s: ov - Math.abs(w.c - m.c) };
    });
    if (best) out.push({ ...m, c: r3(best.w.c), a: r3(Math.max(m.a, best.w.a)), b: r3(Math.min(m.b, best.w.b)) });
  });
  S.layout.wallMods = out;
}

// ------------------------------------------------------------ niveaux & escaliers
export function addLevel(S) { if (levelCount(S) >= MAX_LEVELS) return false; S.layout.levels = levelCount(S) + 1; return true; }
export function removeTopLevel(S) {
  const top = levelCount(S) - 1; if (top < 1) return false;
  const ids = new Set(S.rooms.filter((r) => levelOf(r) === top).map((r) => r.id));
  S.devices = S.devices.filter((d) => !ids.has(d.roomId));
  S.rooms = S.rooms.filter((r) => !ids.has(r.id));
  S.layout.furniture = S.layout.furniture.filter((f) => (f.level || 0) !== top);
  S.layout.openings.filter((o) => (o.level || 0) === top).forEach((o) => removeOpening(S, o));
  S.layout.stairs = (S.layout.stairs || []).filter((s) => (s.level || 0) + 1 !== top && (s.level || 0) !== top);
  S.layout.wallMods = (S.layout.wallMods || []).filter((m) => (m.level || 0) !== top);
  S.layout.walls = (S.layout.walls || []).filter((m) => (m.level || 0) !== top);
  S.layout.levels = top; return true;
}
// kind : 'straight' | 'L' (quart tournant) | 'U' (demi-tour) ; turn : 'left' | 'right'
export function addStairs(S, x, z, lv = 0, opt = {}) {
  if (lv + 1 >= levelCount(S)) return { error: 'Ajoutez d’abord un étage au-dessus (bouton « + » des niveaux)' };
  const turn = opt.turn === 'right' ? 'right' : 'left';
  const s = { id: rid('st'), level: lv, x: r3(x), z: r3(z), r: 0,
    ...(opt.kind === 'L' ? { kind: 'L', turn, w: 1.0, d: STAIR_L_DEFAULT.d, d2: STAIR_L_DEFAULT.d2 }
      : opt.kind === 'U' ? { kind: 'U', turn, w: STAIR_U_DEFAULT.w, d: STAIR_U_DEFAULT.d }
        : { w: 1.0, d: STAIR_DEFAULT.d }) };
  (S.layout.stairs || (S.layout.stairs = [])).push(s); return { stairs: s };
}
// change le type d'un escalier : 'straight' | 'left' | 'right' (L) | 'uleft' | 'uright' (U), en gardant sa position
export function setStairsKind(s, mode) {
  if (mode === 'straight') { s.kind = 'straight'; delete s.turn; delete s.d2; s.w = Math.max(s.w || 1, 1); s.d = STAIR_DEFAULT.d; }
  else if (mode === 'uleft' || mode === 'uright') { s.kind = 'U'; s.turn = mode === 'uright' ? 'right' : 'left'; delete s.d2; s.w = Math.min(s.w || 0.9, 1.1); s.d = STAIR_U_DEFAULT.d; }
  else { s.kind = 'L'; s.turn = mode === 'right' ? 'right' : 'left'; s.d = STAIR_L_DEFAULT.d; s.d2 = STAIR_L_DEFAULT.d2; }
}
export function removeStairs(S, s) { S.layout.stairs = (S.layout.stairs || []).filter((q) => q !== s); }

// ----------------------------------------------------------------- appareils
export function newDevice(S, { roomId, type, name, pos, state = {}, props = {} }) {
  const t = DEVICE_TYPES[type];
  const d = { id: `${type}-${rid('d')}`, roomId, type, name: name || t.label, pos, props, state: { ...t.defaults(), ...state } };
  S.devices.push(d); return d;
}
export function syncOwnership(S) {
  S.devices.forEach((d) => { const r = roomAt(S, d.pos[0], d.pos[2], roomLevel(S, d.roomId)); if (r) d.roomId = r.id; });
  S.layout.furniture.forEach((f) => { const r = roomAt(S, f.x, f.z, f.level || 0); if (r) f.room = r.id; });
}

// ------------------------------------------------------------------- mobilier
export function footprint(f) {
  const i = FURN_INFO[f.t] || { w: 0.5, d: 0.5 };
  if (f.t === 'rug') return { w: f.w || i.w, d: f.d || i.d };
  if (f.t === 'counter') return { w: f.len || i.w, d: i.d };
  if (f.t === 'ledStrip') return { w: f.len || i.w, d: i.d };
  if (f.t === 'bed') return { w: f.single ? 1.0 : 1.75, d: 2.05 };
  if (f.t === 'shower') return { w: f.w || 1.0, d: f.d || 1.0 };
  if (f.t === 'wardrobe') return { w: f.w || 1.6, d: f.d || 0.6 };
  return { w: i.w, d: i.d };
}
// Appareils créés avec un meuble : luminaire (éventuellement RVB) et/ou appareil connecté (électroménager)
function linkLight(S, info, f, lv) {
  const L = info.light, rgb = !!L.rgb;
  return newDevice(S, { roomId: f.room, type: 'light', name: L.name, pos: [f.x, lv * LH + L.y, f.z], state: { on: true, brightness: 60, ...(rgb ? { tone: 'custom', color: L.color } : {}) }, props: { watts: L.watts, ...(rgb ? { rgb: true } : {}) } });
}
function linkDevice(S, info, f, lv) {
  const D = info.dev, d = newDevice(S, { roomId: f.room, type: D.type, name: D.name, pos: [f.x, lv * LH + (f.elev || 0) + D.y, f.z], props: { ...(D.props || {}) } });
  if (D.type === 'vacuum') { d.props.dock = [f.x, f.z]; d.state.x = f.x; d.state.z = f.z; d.state.ang = 0; d.state.s = 0; }
  return d;
}
export function addFurniture(S, type, x, z, lv = 0) {
  const t = type === 'bed1' ? 'bed' : type; // « Lit simple » = lit avec single:true
  const info = FURN_INFO[t]; if (!info) return null;
  const room = roomAt(S, x, z, lv);
  const f = { t, room: room ? room.id : (lv ? null : 'jardin'), x: r3(x), z: r3(z), r: 0, ...(lv ? { level: lv } : {}) };
  if (t === 'rug') { f.w = 2.4; f.d = 1.6; f.c = '#3a4658'; }
  if (t === 'counter') f.len = 3;
  if (t === 'ledStrip') f.len = 2.0;
  if (info.elev) f.elev = info.elev;
  if (t === 'bed') { f.c = '#41537a'; if (type === 'bed1') f.single = true; }
  if (t === 'shower') { f.w = 1.0; f.d = 1.0; }
  if (t === 'wardrobe') Object.assign(f, WARDROBE_DEFAULT);
  if (info.light && f.room) f.light = linkLight(S, info, f, lv).id;
  if (info.dev && f.room) f.device = linkDevice(S, info, f, lv).id;
  S.layout.furniture.push(f); return f;
}
export function removeFurniture(S, f) {
  S.layout.furniture = S.layout.furniture.filter((q) => q !== f);
  S.devices = S.devices.filter((d) => d.id !== f.light && d.id !== f.device);
}
export function moveFurniture(S, f, x, z) {
  const dx = x - f.x, dz = z - f.z; f.x = r3(x); f.z = r3(z);
  const r = roomAt(S, f.x, f.z, f.level || 0);
  [f.light, f.device].forEach((id) => {
    const d = id && S.devices.find((q) => q.id === id); if (!d) return;
    d.pos = [r3(d.pos[0] + dx), d.pos[1], r3(d.pos[2] + dz)]; if (r) d.roomId = r.id;
    if (d.type === 'vacuum') { d.props.dock = [f.x, f.z]; if (d.state.status === 'docked' || d.state.status === 'charging') { d.state.x = f.x; d.state.z = f.z; } }
  });
  if (r) f.room = r.id;
}
export function cloneFurniture(S, f) {
  const c = JSON.parse(JSON.stringify(f)); delete c.light; delete c.device; c.x = r3(f.x + 0.4); c.z = r3(f.z + 0.4);
  const info = FURN_INFO[f.t], lv = f.level || 0;
  if (info && info.light && f.room) c.light = linkLight(S, info, c, lv).id;
  if (info && info.dev && f.room) c.device = linkDevice(S, info, c, lv).id;
  S.layout.furniture.push(c); return c;
}

// ------------------------------------------------------------- équipement auto
export function autoEquip(S) {
  let n = 0;
  S.rooms.forEach((r) => {
    if (r.outdoor) return;
    const [x1, z1, x2, z2] = r.rect, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, yo = levelOf(r) * LH, has = (t) => S.devices.some((d) => d.roomId === r.id && d.type === t);
    if (!has('light')) { newDevice(S, { roomId: r.id, type: 'light', name: `Plafonnier ${r.name}`, pos: [r3(cx), yo + 2.4, r3(cz)], state: { on: true, brightness: 70 }, props: { watts: 12 } }); n++; }
    if (r.primary !== 'garage' && r.floor !== 'concrete' && !has('thermostat')) { newDevice(S, { roomId: r.id, type: 'thermostat', name: `Thermostat ${r.name}`, pos: [r3(x1 + 0.15), yo + 1.5, r3(cz)], state: { current: 20, target: 20 } }); n++; }
    if (r.icon === 'drop' && !has('temp')) { newDevice(S, { roomId: r.id, type: 'temp', name: 'Capteur température', pos: [r3(x2 - 0.15), yo + 1.6, r3(cz)], state: { temperature: 22, humidity: 55 } }); r.primary = 'humidity'; n++; }
  });
  return n;
}

// ------------------------------------------------------------------ validation
export function validate(S) {
  const issues = [];
  const real = S.rooms.filter((r) => r.id !== 'jardin');
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) if (levelOf(real[i]) === levelOf(real[j]) && rectsOverlap(real[i].rect, real[j].rect)) issues.push(`« ${real[i].name} » et « ${real[j].name} » se chevauchent`);
  const orphans = S.layout.openings.filter((o) => o.orphan).length;
  if (orphans) issues.push(`${orphans} ouverture${orphans > 1 ? 's' : ''} hors mur (à replacer ou supprimer)`);
  if (S.rooms.filter((r) => r.floor === 'water').length > 1) issues.push('Une seule piscine est affichée en 3D');
  (S.layout.stairs || []).forEach((s) => {
    const rc = stairRect(s), up = S.rooms.some((r) => !r.outdoor && levelOf(r) === (s.level || 0) + 1 && rectsOverlap(r.rect, rc));
    if (!up) issues.push(`Un escalier de ${levelName(s.level || 0)} n’arrive dans aucune pièce de l’étage`);
  });
  return issues;
}

// ---------------------------------------------------------------------- modèles
const R = (id, name, icon, rect, floor, primary, extra = {}) => ({ id, name, icon, rect, floor, primary, ...extra });
export function blankPlan() {
  const S = { rooms: [R('piece1', 'Pièce 1', 'sofa', [0, 0, 5, 4], 'wood', 'light')], layout: { wallHeight: 2.6, levels: 1, wallMods: [], walls: [], stairs: [], openings: [], furniture: [], ground: [] }, devices: [] };
  fitGarden(S); return S;
}
export function villaPlan() { const h = defaultHouse(); return { rooms: h.rooms, layout: h.layout, devices: h.devices }; }
export function t2Plan() {
  const S = {
    rooms: [
      R('sejour', 'Séjour', 'sofa', [0, 0, 6, 5], 'wood', 'light'), R('cuisine', 'Cuisine', 'utensils', [0, 5, 3.5, 7.5], 'tile', 'light'),
      R('entree', 'Entrée', 'home', [3.5, 5, 6, 7.5], 'tile', 'light'), R('chambre', 'Chambre', 'bed', [6, 0, 10, 4.2], 'wood', 'temp'),
      R('sdb', 'Salle de bain', 'drop', [6, 4.2, 10, 7.5], 'tile', 'humidity'),
    ],
    layout: {
      wallHeight: 2.6, levels: 1, wallMods: [], walls: [], stairs: [],
      openings: [
        { id: 'o1', kind: 'frontdoor', x: 4.7, z: 7.5, w: 1.0, h: 2.1 }, { id: 'o2', kind: 'window', x: 3, z: 0, w: 1.6, h: 1.3, sill: 0.9 },
        { id: 'o3', kind: 'glass', x: 0, z: 2.5, w: 2.0, h: 2.1, sill: 0 }, { id: 'o4', kind: 'window', x: 0, z: 6.2, w: 1.0, h: 1.1, sill: 1.0 },
        { id: 'o5', kind: 'window', x: 8, z: 0, w: 1.4, h: 1.3, sill: 0.9 }, { id: 'o6', kind: 'window', x: 10, z: 2, w: 1.2, h: 1.3, sill: 0.9 },
        { id: 'o7', kind: 'window', x: 10, z: 5.8, w: 0.7, h: 0.7, sill: 1.4 }, { id: 'd1', kind: 'door', x: 4.7, z: 5, w: 0.9, h: 2.1 },
        { id: 'd2', kind: 'door', x: 1.7, z: 5, w: 0.9, h: 2.1 }, { id: 'd3', kind: 'door', x: 6, z: 2, w: 0.9, h: 2.1 },
        { id: 'd4', kind: 'door', x: 8.8, z: 4.2, w: 0.8, h: 2.1 }, { id: 'd5', kind: 'door', x: 6, z: 6.4, w: 0.8, h: 2.1 },
      ],
      furniture: [
        { t: 'rug', room: 'sejour', x: 2.6, z: 2.6, w: 2.8, d: 2.0, c: '#3a4658' }, { t: 'sofa', room: 'sejour', x: 4.6, z: 2.6, r: -90 },
        { t: 'coffee', room: 'sejour', x: 3.1, z: 2.6 }, { t: 'tv', room: 'sejour', x: 0.4, z: 3.9, r: 90 }, { t: 'plant', room: 'sejour', x: 5.5, z: 4.5 },
        { t: 'table', room: 'sejour', x: 3.2, z: 0.9 }, { t: 'chair', room: 'sejour', x: 2.7, z: 1.5, r: 0 }, { t: 'chair', room: 'sejour', x: 3.7, z: 1.5, r: 0 },
        { t: 'counter', room: 'cuisine', x: 3.15, z: 6.3, r: -90, len: 2.2 }, { t: 'fridge', room: 'cuisine', x: 0.6, z: 7.0 },
        { t: 'bed', room: 'chambre', x: 8, z: 1.4, c: '#41537a' }, { t: 'wardrobe', room: 'chambre', x: 9.0, z: 3.85, r: 180 },
        { t: 'nightstand', room: 'chambre', x: 6.6, z: 0.5 }, { t: 'nightstand', room: 'chambre', x: 9.4, z: 0.5 },
        { t: 'shower', room: 'sdb', x: 9.4, z: 4.9 }, { t: 'vanity', room: 'sdb', x: 7.4, z: 7.2, r: 180 }, { t: 'toilet', room: 'sdb', x: 6.5, z: 5.0, r: 90 },
      ],
      ground: [],
    },
    devices: [],
  };
  // luminaires des meubles liés
  S.layout.furniture.forEach((f) => { const i = FURN_INFO[f.t]; if (i && i.light) { const d = newDevice(S, { roomId: f.room, type: 'light', name: i.light.name, pos: [f.x, i.light.y, f.z], state: { on: true, brightness: 60 }, props: { watts: i.light.watts } }); f.light = d.id; } });
  S.layout.openings.filter((o) => o.kind === 'window' || o.kind === 'glass').slice(0, 3).forEach((o) => setShutter(S, o, true));
  autoEquip(S); fitGarden(S); reconcileOpenings(S); syncOwnership(S);
  return S;
}

// Maison à étage : salon + cuisine OUVERTE (sans mur), escalier, 3 chambres et salle de bain à l'étage
export function duplexPlan() {
  const L1 = (o) => ({ ...o, level: 1 });
  const S = {
    rooms: [
      R('salon', 'Salon', 'sofa', [0, 0, 6.5, 5.4], 'wood', 'light'), R('cuisine', 'Cuisine', 'utensils', [6.5, 0, 10.5, 7.6], 'tile', 'light'),
      R('entree', 'Entrée', 'home', [0, 5.4, 3.2, 7.6], 'tile', 'light'), R('buand', 'Buanderie', 'drop', [3.2, 5.4, 6.5, 7.6], 'tile', 'humidity'),
      R('chp', 'Chambre parentale', 'bed', [0, 0, 5, 5.4], 'wood', 'temp', { level: 1 }), R('palier', 'Palier', 'home', [5, 0, 7.2, 5.4], 'wood', 'light', { level: 1 }),
      R('sdb', 'Salle de bain', 'drop', [7.2, 0, 10.5, 3], 'tile', 'humidity', { level: 1 }), R('ch2', 'Chambre 2', 'bed', [7.2, 3, 10.5, 7.6], 'wood', 'temp', { level: 1 }),
    ],
    layout: {
      wallHeight: 2.6, levels: 2, stairs: [{ id: 'st1', level: 0, x: 5.7, z: 3.4, w: 1.0, d: 3.2, r: 180 }], walls: [],
      wallMods: [{ orient: 'v', c: 6.5, a: 0, b: 5.4, mode: 'open', level: 0 }], // cuisine ouverte sur le salon
      openings: [
        { id: 'o1', kind: 'frontdoor', x: 1.6, z: 7.6, w: 1.0, h: 2.1 }, { id: 'o2', kind: 'glass', x: 0, z: 2.7, w: 2.4, h: 2.1, sill: 0 },
        { id: 'o3', kind: 'window', x: 3, z: 0, w: 1.6, h: 1.3, sill: 0.9 }, { id: 'o4', kind: 'window', x: 8.5, z: 0, w: 1.4, h: 1.3, sill: 0.9 },
        { id: 'o5', kind: 'window', x: 10.5, z: 3, w: 1.2, h: 1.3, sill: 0.9 }, { id: 'o6', kind: 'window', x: 8.5, z: 7.6, w: 1.4, h: 1.3, sill: 0.9 },
        { id: 'o7', kind: 'window', x: 4.8, z: 7.6, w: 0.7, h: 0.7, sill: 1.4 }, { id: 'd1', kind: 'door', x: 1.6, z: 5.4, w: 0.9, h: 2.1 }, { id: 'd2', kind: 'door', x: 3.2, z: 6.5, w: 0.8, h: 2.1 },
        L1({ id: 'u1', kind: 'window', x: 2.5, z: 0, w: 1.6, h: 1.3, sill: 0.9 }), L1({ id: 'u2', kind: 'window', x: 0, z: 2.7, w: 1.4, h: 1.3, sill: 0.9 }),
        L1({ id: 'u3', kind: 'window', x: 8.8, z: 0, w: 0.8, h: 0.7, sill: 1.3 }), L1({ id: 'u4', kind: 'window', x: 10.5, z: 5.2, w: 1.4, h: 1.3, sill: 0.9 }),
        L1({ id: 'u5', kind: 'window', x: 8.8, z: 7.6, w: 1.4, h: 1.3, sill: 0.9 }), L1({ id: 'ud1', kind: 'door', x: 5, z: 1.0, w: 0.9, h: 2.1 }),
        L1({ id: 'ud2', kind: 'door', x: 7.2, z: 1.5, w: 0.8, h: 2.1 }), L1({ id: 'ud3', kind: 'door', x: 7.2, z: 4.2, w: 0.9, h: 2.1 }),
      ],
      furniture: [
        { t: 'rug', room: 'salon', x: 2.8, z: 2.7, w: 2.8, d: 2.0, c: '#3a4658' }, { t: 'sofa', room: 'salon', x: 4.2, z: 3.4, r: -90 }, { t: 'coffee', room: 'salon', x: 2.9, z: 3.4 },
        { t: 'tv', room: 'salon', x: 0.4, z: 4.5, r: 90 }, { t: 'plant', room: 'salon', x: 0.6, z: 0.6 }, { t: 'shelf', room: 'salon', x: 3.0, z: 0.25, r: 180 },
        { t: 'counter', room: 'cuisine', x: 8.3, z: 0.4, len: 3.0 }, { t: 'fridge', room: 'cuisine', x: 10.0, z: 0.5 }, { t: 'island', room: 'cuisine', x: 8.5, z: 2.8 },
        { t: 'table', room: 'cuisine', x: 8.5, z: 5.3 }, { t: 'chair', room: 'cuisine', x: 8.0, z: 4.6 }, { t: 'chair', room: 'cuisine', x: 9.0, z: 4.6 }, { t: 'chair', room: 'cuisine', x: 8.0, z: 6.0, r: 180 }, { t: 'chair', room: 'cuisine', x: 9.0, z: 6.0, r: 180 },
        { t: 'washer', room: 'buand', x: 5.0, z: 6.0 }, { t: 'wardrobe', room: 'entree', x: 1.4, z: 5.9 },
        { t: 'bed', room: 'chp', x: 2.5, z: 1.5, c: '#41537a', level: 1 }, { t: 'nightstand', room: 'chp', x: 1.1, z: 0.5, level: 1 }, { t: 'nightstand', room: 'chp', x: 3.9, z: 0.5, level: 1 },
        { t: 'wardrobe', room: 'chp', x: 3.6, z: 5.0, r: 180, level: 1 }, { t: 'shower', room: 'sdb', x: 9.8, z: 0.8, level: 1 }, { t: 'vanity', room: 'sdb', x: 8.0, z: 0.55, level: 1 },
        { t: 'toilet', room: 'sdb', x: 9.9, z: 2.4, r: 180, level: 1 }, { t: 'bed', room: 'ch2', x: 9.0, z: 4.6, single: true, c: '#1f6fdc', level: 1 }, { t: 'desk', room: 'ch2', x: 7.7, z: 6.5, r: 90, level: 1 },
      ],
      ground: [{ rect: [1, 7.6, 2.4, 9.6], kind: 'stone' }],
    },
    devices: [],
  };
  S.layout.furniture.forEach((f) => { const i = FURN_INFO[f.t]; if (i && i.light) { const d = newDevice(S, { roomId: f.room, type: 'light', name: i.light.name, pos: [f.x, (f.level || 0) * LH + i.light.y, f.z], state: { on: true, brightness: 60 }, props: { watts: i.light.watts } }); f.light = d.id; } });
  S.layout.openings.filter((o) => o.kind === 'window' || o.kind === 'glass').slice(0, 4).forEach((o) => setShutter(S, o, true));
  autoEquip(S); fitGarden(S); reconcileOpenings(S); syncOwnership(S);
  return S;
}
