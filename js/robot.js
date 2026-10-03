// ---------------------------------------------------------------------------
// Planificateur d'itinéraire du robot aspirateur (fonctions pures, sans DOM).
//  - graphe des pièces : deux pièces communiquent par une PORTE ou un MUR OUVERT
//  - itinéraire : dock → pièces choisies (plus proche d'abord, en traversant les
//    portes) → retour au dock ; balayage en boustrophédon dans chaque pièce
//  - estimations : temps de nettoyage, temps de retour, surface
// ---------------------------------------------------------------------------
import { computeWalls, levelOf } from './world.js';

export const ROBOT = {
  speed: { eco: 0.5, auto: 0.7, turbo: 1.0 },   // m/s (temps de simulation = temps réel)
  retSpeed: 1.3,                                // m/s vers la base
  drain: { eco: 0.07, auto: 0.11, turbo: 0.19 }, // % de batterie par seconde
  lowBattery: 15, resumeAt: 80,
};

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Balayage en boustrophédon dans le rectangle d'une pièce (marge 0,3 m, passes espacées de 0,4 m)
export function vacPath(rect, margin = 0.3, gap = 0.4) {
  const [x1, z1, x2, z2] = rect, pts = []; let dir = 1;
  for (let z = z1 + margin; z <= z2 - margin + 1e-6; z += gap) { const a = [x1 + margin, z], b = [x2 - margin, z]; if (dir > 0) pts.push(a, b); else pts.push(b, a); dir = -dir; }
  if (pts.length < 2) pts.push([x1 + margin, z1 + margin], [x2 - margin, z2 - margin]);
  return withCum(pts);
}
function withCum(pts) {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  return { pts, cum, total: cum[cum.length - 1] };
}
export function pathPoint(path, s) {
  if (path.pts.length < 2) return { x: (path.pts[0] || [0, 0])[0], z: (path.pts[0] || [0, 0])[1], ang: 0 };
  s = Math.max(0, Math.min(path.total, s)); let i = 1; while (i < path.cum.length - 1 && path.cum[i] < s) i++;
  const a = path.pts[i - 1], b = path.pts[i], seg = path.cum[i] - path.cum[i - 1] || 1, t = (s - path.cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

export const indoorRooms = (S, level) => S.rooms.filter((r) => !r.outdoor && r.id !== 'jardin' && levelOf(r) === level);
const center = (r) => [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2];
const area = (r) => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);

// Passages entre pièces d'un même niveau : portes (kind 'door') et murs ouverts
export function roomLinks(S, level) {
  const links = [];
  const base = computeWalls(S.rooms, [], [], level);
  const mods = (S.layout.wallMods || []).filter((m) => (m.level || 0) === level && m.mode === 'open');
  const ops = (S.layout.openings || []).filter((o) => (o.level || 0) === level && o.kind === 'door');
  base.forEach((w) => {
    if (w.ext || !w.rooms || w.rooms.length !== 2) return;
    const isH = w.orient === 'h';
    ops.forEach((o) => {
      const on = isH ? Math.abs(o.z - w.c) < 0.03 && o.x >= w.a - 0.02 && o.x <= w.b + 0.02 : Math.abs(o.x - w.c) < 0.03 && o.z >= w.a - 0.02 && o.z <= w.b + 0.02;
      if (on) links.push({ a: w.rooms[0], b: w.rooms[1], pt: [o.x, o.z], orient: w.orient, kind: 'door' });
    });
    mods.forEach((m) => {
      if (m.orient !== w.orient || Math.abs(m.c - w.c) > 0.03) return;
      const a = Math.max(m.a, w.a), b = Math.min(m.b, w.b);
      if (b - a > 0.5) links.push({ a: w.rooms[0], b: w.rooms[1], pt: isH ? [(a + b) / 2, w.c] : [w.c, (a + b) / 2], orient: w.orient, kind: 'open' });
    });
  });
  return links;
}
// Plus court chemin (en nombre de passages) entre deux pièces ; null si inaccessible
function roomPath(links, from, to) {
  if (from === to) return [];
  const prev = { [from]: null }, queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const l of links) {
      const nx = l.a === cur ? l.b : l.b === cur ? l.a : null;
      if (nx && !(nx in prev)) { prev[nx] = { from: cur, link: l }; if (nx === to) { queue.length = 0; break; } queue.push(nx); }
    }
  }
  if (!(to in prev)) return null;
  const out = []; for (let cur = to; prev[cur]; cur = prev[cur].from) out.unshift({ link: prev[cur].link, from: prev[cur].from, to: cur });
  return out;
}
// Points à suivre pour franchir un passage : avant la porte, la porte, après la porte
function crossPts(S, step) {
  const A = S.rooms.find((r) => r.id === step.from), B = S.rooms.find((r) => r.id === step.to), l = step.link;
  const cA = center(A), cB = center(B), isH = l.orient === 'h', sg = Math.sign(isH ? cB[1] - cA[1] : cB[0] - cA[0]) || 1, [px, pz] = l.pt, off = 0.4;
  return isH ? [[px, pz - sg * off], [px, pz], [px, pz + sg * off]] : [[px - sg * off, pz], [px, pz], [px + sg * off, pz]];
}
const roomOf = (S, x, z, level) => indoorRooms(S, level).find((r) => x >= r.rect[0] && x <= r.rect[2] && z >= r.rect[1] && z <= r.rect[3]);

export function dockInfo(S, dev) {
  const level = (S.rooms.find((r) => r.id === dev.roomId) ? levelOf(S.rooms.find((r) => r.id === dev.roomId)) : 0);
  const dock = (dev.props && dev.props.dock) || [dev.state.x || 0, dev.state.z || 0];
  const r = roomOf(S, dock[0], dock[1], level) || S.rooms.find((q) => q.id === dev.roomId);
  return { level, dock, dockRoom: r ? r.id : dev.roomId };
}

// Itinéraire complet : dock → pièces (ordre du plus proche) → retour au dock
export function planRoute(S, dev, roomIds) {
  const { level, dock, dockRoom } = dockInfo(S, dev), links = roomLinks(S, level), rooms = indoorRooms(S, level);
  const pts = [dock.slice()], legs = [], order = [], unreachable = [];
  const want = (roomIds && roomIds.length ? roomIds : [dockRoom]).filter((id) => { const okk = rooms.some((r) => r.id === id); if (!okk) unreachable.push(id); return okk; }); // extérieur / autre niveau
  let cur = dockRoom, rem = want.slice();
  while (rem.length) {
    let best = null;
    rem.forEach((id) => { const p = roomPath(links, cur, id); if (p && (!best || p.length < best.p.length)) best = { id, p }; });
    if (!best) { unreachable.push(...rem); break; }
    rem = rem.filter((id) => id !== best.id); order.push(best.id);
    best.p.forEach((st) => pts.push(...crossPts(S, st)));
    const r = rooms.find((q) => q.id === best.id), cov = vacPath(r.rect).pts.map((p) => p.slice());
    if (dist(pts[pts.length - 1], cov[0]) > dist(pts[pts.length - 1], cov[cov.length - 1])) cov.reverse();
    const i0 = pts.length; pts.push(...cov); legs.push({ roomId: best.id, i0, i1: pts.length - 1 });
    cur = best.id;
  }
  const cleanIdx = pts.length - 1;
  const back = roomPath(links, cur, dockRoom);
  (back || []).forEach((st) => pts.push(...crossPts(S, st)));
  pts.push(dock.slice());
  const route = withCum(pts);
  route.legs = legs.map((l) => ({ roomId: l.roomId, s0: route.cum[l.i0], s1: route.cum[l.i1] }));
  route.cleanEnd = route.cum[cleanIdx]; route.returnLen = route.total - route.cleanEnd;
  route.order = order; route.unreachable = unreachable; route.dockRoom = dockRoom; route.level = level;
  return route;
}
// Retour direct à la base depuis une position quelconque (interruption, batterie faible…)
export function planReturn(S, dev, x, z) {
  const { level, dock, dockRoom } = dockInfo(S, dev), links = roomLinks(S, level), here = roomOf(S, x, z, level);
  const pts = [[x, z]];
  const back = here ? roomPath(links, here.id, dockRoom) : null;
  (back || []).forEach((st) => pts.push(...crossPts(S, st)));
  pts.push(dock.slice());
  const route = withCum(pts); route.legs = []; route.cleanEnd = 0; route.returnLen = route.total; route.order = []; route.unreachable = []; route.dockRoom = dockRoom; route.level = level;
  return route;
}
// Estimations (secondes) pour un itinéraire, un mode et une batterie
export function estimate(route, mode = 'auto', battery = 100) {
  const sp = ROBOT.speed[mode] || 0.7, clean = route.cleanEnd / sp, back = route.returnLen / ROBOT.retSpeed;
  const drain = clean * (ROBOT.drain[mode] || 0.11), enough = battery - drain >= ROBOT.lowBattery;
  return { clean, back, total: clean + back, drain, enough };
}
// longueur de balayage de chaque pièce (base du pourcentage de progression)
export function coverageLen(S, level, ids) {
  return indoorRooms(S, level).filter((r) => ids.includes(r.id)).reduce((s, r) => s + vacPath(r.rect).total, 0);
}
export const roomArea = area;
// signature de la géométrie : invalide le cache d'itinéraire quand le plan change
export function geoSig(S, level) {
  return `${indoorRooms(S, level).map((r) => `${r.id}:${r.rect.join(',')}`).join(';')}|${(S.layout.openings || []).filter((o) => (o.level || 0) === level && o.kind === 'door').map((o) => `${o.x},${o.z}`).join(';')}|${(S.layout.wallMods || []).map((m) => `${m.orient}${m.c}${m.a}${m.b}${m.mode}`).join(';')}`;
}
