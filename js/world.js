// ---------------------------------------------------------------------------
// Construction de la maison 3D À PARTIR DES DONNÉES (pièces, ouvertures,
// mobilier, appareils). Fonction pure : aucune dépendance GL/DOM, donc
// testable. Les murs sont déduits des bords des pièces (bord partagé =
// cloison, bord isolé = mur extérieur), avec vraies ouvertures (linteau,
// allège, vitrage, cadre).
// ---------------------------------------------------------------------------
import { MeshBuilder, MAT, hex } from './gl.js';
import { TONES, hexToRgb } from './catalog.js';

const COL = {
  outer: '#2b313b', outerTop: '#e9edf2', plaster: '#e6e1d7', part: '#dcd7cd', partTop: '#f3f0e9',
  frame: '#cfd6de', shutter: '#39414d', wood: '#a9784a', tile: '#c6cbd3', concrete: '#7f858e',
  grass: '#3f7d3a', deck: '#9c7248', driveway: '#3a3e46', stone: '#575d67', poolTile: '#8fd3e6',
};
const FLOOR = {
  wood: { c: COL.wood, mat: MAT.WOOD }, tile: { c: COL.tile, mat: MAT.TILE }, concrete: { c: COL.concrete, mat: MAT.CONCRETE }, lino: { c: '#9aa1ab', mat: MAT.LINO },
};
const EXT_T = 0.24, INT_T = 0.12, INT_H = 1.7;
export const GROUND = {
  stone: { c: COL.stone, mat: MAT.CONCRETE, h: 0.03, label: 'Allée pavée' },
  driveway: { c: COL.driveway, mat: MAT.CONCRETE, h: 0.03, label: 'Enrobé / béton' },
  deck: { c: COL.deck, mat: MAT.DECK, h: 0.05, label: 'Terrasse bois' },
  gravel: { c: '#8b877c', mat: MAT.CONCRETE, h: 0.03, label: 'Gravier' },
  lawn: { c: '#4d9a42', mat: MAT.GRASS, h: 0.035, label: 'Pelouse' },
  hedge: { c: '#2f7a45', mat: MAT.PLAIN, h: 0, label: 'Haie / buissons' },
};

export function lightRadius(state, d) {
  const r = state.rooms.find((x) => x.id === d.roomId);
  if (r && r.outdoor) return 4.4;
  const rel = d.pos[1] - (r ? levelOf(r) * LH : 0);
  return rel > 2 ? 5.4 : 3.5;
}

// -------------------------------------------------------------------- niveaux / murs
export const LH = 2.9;                 // hauteur d'un niveau (sol à sol)
export const levelOf = (r) => r.level || 0;

// Coupe un mur selon les modifications utilisateur : "open" = supprimé, "half" = demi-mur
function splitByMods(w, mods) {
  let pieces = [{ a: w.a, b: w.b, low: false }];
  mods.forEach((m) => {
    const next = [];
    pieces.forEach((p) => {
      const o1 = Math.max(p.a, m.a), o2 = Math.min(p.b, m.b);
      if (o2 - o1 <= 0.01) { next.push(p); return; }
      if (o1 - p.a > 0.01) next.push({ a: p.a, b: o1, low: p.low });
      if (m.mode === 'half') next.push({ a: o1, b: o2, low: true });
      if (p.b - o2 > 0.01) next.push({ a: o2, b: p.b, low: p.low });
    });
    pieces = next;
  });
  return pieces.filter((p) => p.b - p.a > 0.05).map((p) => ({ ...w, a: p.a, b: p.b, low: p.low }));
}

export function computeWalls(rooms, mods = [], free = [], level = 0) {
  const H = new Map(), V = new Map();
  const add = (map, c, a, b, side, rid) => {
    const k = c.toFixed(3);
    if (!map.has(k)) map.set(k, { c, items: [] });
    map.get(k).items.push({ a, b, side, rid });
  };
  rooms.forEach((r) => {
    if (r.outdoor || levelOf(r) !== level) return;
    const [x1, z1, x2, z2] = r.rect;
    add(H, z1, x1, x2, +1, r.id); add(H, z2, x1, x2, -1, r.id);
    add(V, x1, z1, z2, +1, r.id); add(V, x2, z1, z2, -1, r.id);
  });
  const out = [];
  const proc = (map, orient) => map.forEach(({ c, items }) => {
    const pts = [...new Set(items.flatMap((i) => [+i.a.toFixed(3), +i.b.toFixed(3)]))].sort((p, q) => p - q);
    let cur = null;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const cov = items.filter((i) => i.a <= a + 1e-6 && i.b >= b - 1e-6);
      if (!cov.length) { cur = null; continue; }
      const ext = cov.length === 1, n = ext ? -cov[0].side : 0;
      const key = ext ? `e${n}` : `i${cov.map((x) => x.rid).sort().join('|')}`;
      if (cur && cur.key === key && Math.abs(cur.b - a) < 1e-6) cur.b = b;
      else { cur = { orient, c, a, b, ext, n, key, rooms: cov.map((x) => x.rid) }; out.push(cur); }
    }
  });
  proc(H, 'h'); proc(V, 'v');
  const res = [];
  out.forEach((w) => {
    const ms = mods.filter((m) => (m.level || 0) === level && m.orient === w.orient && Math.abs(m.c - w.c) < 0.03);
    if (ms.length) res.push(...splitByMods(w, ms)); else res.push(w);
  });
  (free || []).filter((f) => (f.level || 0) === level).forEach((f) => res.push({ orient: f.orient, c: f.c, a: f.a, b: f.b, ext: false, n: 0, key: 'free', free: true, low: f.mode === 'half' }));
  return res;
}

// ---- escaliers : droit ("straight") ou en L à quart tournant ("L", turn = left | right)
export const STAIR_DEFAULT = { w: 1.0, d: 3.2 };
export const STAIR_L_DEFAULT = { w: 1.0, d: 1.8, d2: 2.1 };
export const STAIR_U_DEFAULT = { w: 0.9, d: 2.0 };
const N_RISERS = Math.round(LH / 0.18); // 16 contremarches
// Disposition locale (centrée) : parts = emprises pour la trémie, steps = volées à hachurer, path = sens de montée
export function stairLayout(st) {
  const w = st.w || 1;
  if (st.kind !== 'L' && st.kind !== 'U') {
    const d = st.d || 3.2;
    return { parts: [[-w / 2, -d / 2, w / 2, d / 2]], steps: [{ rect: [-w / 2, -d / 2, w / 2, d / 2], axis: 'z', n: 10 }], path: [[0, -d / 2 + 0.25], [0, d / 2 - 0.25]], W: w, D: d };
  }
  if (st.kind === 'U') { // demi-tour : deux volées parallèles reliées par un palier ; sortie à côté du départ
    const d = st.d || 2.0, gap = 0.1, m = st.turn === 'right' ? -1 : 1, Wt = 2 * w + gap, k1 = Math.floor(N_RISERS / 2) - 1;
    const mxu = (x) => (m === 1 ? x : Wt - x), cxu = Wt / 2, czu = (d + w) / 2;
    const tru = (x, z) => [mxu(x) - cxu, z - czu];
    const rcu = (a, b, c, e2) => { const p = tru(a, b), q = tru(c, e2); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
    return {
      parts: [rcu(0, 0, Wt, d + w)],
      steps: [{ rect: rcu(0, 0, w, d), axis: 'z', n: k1 }, { rect: rcu(w + gap, 0, Wt, d), axis: 'z', n: N_RISERS - k1 - 1 }],
      path: [tru(w / 2, 0.25), tru(w / 2, d + w / 2), tru(w + gap + w / 2, d + w / 2), tru(w + gap + w / 2, 0.25)],
      W: Wt, D: d + w, tr: tru, w, d1: d, k1, m, gap, Wt,
    };
  }
  const d1 = st.d || 1.8, d2 = st.d2 || 2.1, m = st.turn === 'right' ? -1 : 1;
  const k1 = Math.floor(N_RISERS / 2) - 1;
  // repère canonique (virage à gauche) : volée 1 vers +z, palier, volée 2 vers +x ; miroir pour un virage à droite
  const mx = (x) => (m === 1 ? x : w - x);
  const minx = m === 1 ? 0 : -d2, maxx = m === 1 ? w + d2 : w, cx = (minx + maxx) / 2, cz = (d1 + w) / 2;
  const tr = (x, z) => [mx(x) - cx, z - cz];
  const rc = (a, b, c, d) => { const p = tr(a, b), q = tr(c, d); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; };
  return {
    parts: [rc(0, 0, w, d1 + w), rc(w, d1, w + d2, d1 + w)],
    steps: [{ rect: rc(0, 0, w, d1), axis: 'z', n: k1 }, { rect: rc(w, d1, w + d2, d1 + w), axis: 'x', n: N_RISERS - k1 - 1 }],
    path: [tr(w / 2, 0.25), tr(w / 2, d1 + w / 2), tr(w + d2 - 0.25, d1 + w / 2)],
    W: maxx - minx, D: d1 + w, tr, w, d1, d2, k1, m,
  };
}
const rotPt = (s, lx, lz) => { const r = (s.r || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r); return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c]; };
// rectangles monde (trémies) : un par partie de l'escalier
export function stairHoles(s) {
  return stairLayout(s).parts.map(([x1, z1, x2, z2]) => {
    const ps = [rotPt(s, x1, z1), rotPt(s, x2, z1), rotPt(s, x2, z2), rotPt(s, x1, z2)];
    return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))];
  });
}
export function stairRect(s) {
  const h = stairHoles(s);
  return [Math.min(...h.map((q) => q[0])), Math.min(...h.map((q) => q[1])), Math.max(...h.map((q) => q[2])), Math.max(...h.map((q) => q[3]))];
}
function subtractRects(r, holes) {
  let out = [r.slice()];
  holes.forEach((h) => {
    const nx = [];
    out.forEach((q) => {
      const ix1 = Math.max(q[0], h[0]), iz1 = Math.max(q[1], h[1]), ix2 = Math.min(q[2], h[2]), iz2 = Math.min(q[3], h[3]);
      if (ix2 - ix1 <= 0.001 || iz2 - iz1 <= 0.001) { nx.push(q); return; }
      if (ix1 - q[0] > 0.001) nx.push([q[0], q[1], ix1, q[3]]);
      if (q[2] - ix2 > 0.001) nx.push([ix2, q[1], q[2], q[3]]);
      if (iz1 - q[1] > 0.001) nx.push([ix1, q[1], ix2, iz1]);
      if (q[3] - iz2 > 0.001) nx.push([ix1, iz2, ix2, q[3]]);
    });
    out = nx;
  });
  return out;
}

// --------------------------------------------------------------- construction
export function buildHouse(state, opts = {}) {
  const mb = new MeshBuilder();
  const rooms = state.rooms, layout = state.layout;
  const roomIdx = Object.fromEntries(rooms.map((r, i) => [r.id, i]));
  const nLevels = Math.max(1, layout.levels || 1), maxL = Math.min(nLevels - 1, opts.maxLevel === undefined ? 99 : opts.maxLevel);
  const roomLv = Object.fromEntries(rooms.map((r) => [r.id, levelOf(r)]));
  const lightDevs = state.devices.filter((d) => d.type === 'light' && (roomLv[d.roomId] || 0) <= maxL).slice(0, 24);
  const lightIdx = Object.fromEntries(lightDevs.map((d, i) => [d.id, i]));
  const applDevs = state.devices.filter((d) => ['dishwasher', 'microwave', 'vacuum'].includes(d.type) && (roomLv[d.roomId] || 0) <= maxL).slice(0, 16);
  const applIdx = Object.fromEntries(applDevs.map((d, i) => [d.id, i]));
  const dynamics = [];
  const H = layout.wallHeight;

  const roomAtPoint = (x, z, lv = 0) => {
    const r = rooms.find((q) => !q.outdoor && levelOf(q) === lv && x >= q.rect[0] && x < q.rect[2] && z >= q.rect[1] && z < q.rect[3]);
    return r ? roomIdx[r.id] : -1;
  };
  const jardin = roomIdx.jardin ?? -1;

  // ------------------------------------------------------------ sol / île
  const G = (rooms.find((r) => r.id === 'jardin') || { rect: [-1.6, -1.6, 18, 17] }).rect;
  const pool = rooms.find((r) => r.floor === 'water');
  const SIDE = '#161c25';
  const gBox = (x1, z1, x2, z2, y0, h, c, mat, room, thick = false) => {
    if (x2 - x1 < 0.01 || z2 - z1 < 0.01) return;
    const f = thick ? { px: SIDE, nx: SIDE, pz: SIDE, nz: SIDE } : undefined;
    mb.attr({ room, mat }).box((x1 + x2) / 2, y0, (z1 + z2) / 2, x2 - x1, h, z2 - z1, c, { ao: thick ? 0.55 : 1, noBottom: true, faces: f });
  };
  if (pool) {
    const P = pool.rect;
    gBox(G[0], G[1], G[2], P[1], -0.9, 0.9, COL.grass, MAT.GRASS, jardin, true);
    gBox(G[0], P[3], G[2], G[3], -0.9, 0.9, COL.grass, MAT.GRASS, jardin, true);
    gBox(G[0], P[1], P[0], P[3], -0.9, 0.9, COL.grass, MAT.GRASS, jardin, true);
    gBox(P[2], P[1], G[2], P[3], -0.9, 0.9, COL.grass, MAT.GRASS, jardin, true);
    // bassin : parois + fond + eau
    const pi = roomIdx[pool.id];
    mb.attr({ room: pi, mat: MAT.PLAIN });
    const pw = P[2] - P[0], pd = P[3] - P[1], pcx = (P[0] + P[2]) / 2, pcz = (P[1] + P[3]) / 2;
    mb.box(pcx, -1.0, pcz, pw, 0.05, pd, COL.poolTile, { ao: 1 });
    [[pcx, P[1] - 0.05, pw + 0.2, 0.1], [pcx, P[3] + 0.05, pw + 0.2, 0.1]].forEach(([x, z, sx, sz]) => mb.box(x, -1.0, z, sx, 1.0, sz, COL.poolTile, { ao: 0.9 }));
    [[P[0] - 0.05, pcz], [P[2] + 0.05, pcz]].forEach(([x, z]) => mb.box(x, -1.0, z, 0.1, 1.0, pd, COL.poolTile, { ao: 0.9 }));
    const pl = lightDevs.find((d) => d.roomId === pool.id);
    mb.attr({ room: pi, mat: MAT.WATER, emis: pl ? 10 + lightIdx[pl.id] : 0 });
    mb.box(pcx, -0.16, pcz, pw, 0.03, pd, '#1d7fc0', { ao: 1, noBottom: true });
    mb.attr({ emis: 0 });
    // margelle
    mb.attr({ room: jardin, mat: MAT.PLAIN });
    const cp = 0.3;
    [[pcx, P[1] - cp / 2 - 0.1, pw + 0.2 + cp * 2, cp], [pcx, P[3] + cp / 2 + 0.1, pw + 0.2 + cp * 2, cp]].forEach(([x, z, sx, sz]) => mb.box(x, 0, z, sx, 0.09, sz, '#e8ebef', { ao: 1 }));
    [[P[0] - cp / 2 - 0.1, pcz], [P[2] + cp / 2 + 0.1, pcz]].forEach(([x, z]) => mb.box(x, 0, z, cp, 0.09, pd, '#e8ebef', { ao: 1 }));
    // terrasse en bois autour du bassin
    gBox(P[0] - 1.0, P[1] - 1.0, P[2] + 1.6, P[1] - cp - 0.1, 0, 0.05, COL.deck, MAT.DECK, jardin);
    gBox(P[0] - 1.0, P[3] + cp + 0.1, P[2] + 1.6, P[3] + 0.9, 0, 0.05, COL.deck, MAT.DECK, jardin);
    gBox(P[0] - 1.0, P[1] - cp - 0.1, P[0] - cp - 0.1, P[3] + cp + 0.1, 0, 0.05, COL.deck, MAT.DECK, jardin);
    gBox(P[2] + cp + 0.1, P[1] - cp - 0.1, P[2] + 1.6, P[3] + cp + 0.1, 0, 0.05, COL.deck, MAT.DECK, jardin);
  } else {
    gBox(G[0], G[1], G[2], G[3], -0.9, 0.9, COL.grass, MAT.GRASS, jardin, true);
  }
  // sols extérieurs (allées, terrasses…) : données layout.ground + pièces extérieures non aquatiques
  const groundItems = (layout.ground || []).map((g) => ({ rect: g.rect, kind: g.kind }));
  rooms.forEach((r) => { if (r.outdoor && r.id !== 'jardin' && r.floor !== 'water' && GROUND[r.floor === 'concrete' ? 'driveway' : r.floor]) groundItems.push({ rect: r.rect, kind: r.floor === 'concrete' ? 'driveway' : r.floor }); });
  const hedge = (rc) => {
    const [hx1, hz1, hx2, hz2] = rc, hw = hx2 - hx1, hd = hz2 - hz1, alongX = hw >= hd, len = alongX ? hw : hd, wid = alongX ? hd : hw, n = Math.max(1, Math.round(len / 0.8));
    const greens = ['#2f7a45', '#3a8a4f', '#2a6a3c', '#357f48'];
    mb.attr({ room: jardin, mat: MAT.PLAIN, emis: 0, level: 0 });
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, cx = alongX ? hx1 + len * t : (hx1 + hx2) / 2, cz = alongX ? (hz1 + hz2) / 2 : hz1 + len * t, ry = 0.5 + 0.07 * ((i * 7) % 3);
      const along = Math.max(0.28, (len / n) * 0.62), across = Math.max(0.28, (wid / 2) * 1.08);
      mb.sphere(cx, ry * 0.85, cz, alongX ? along : across, ry, alongX ? across : along, greens[i % 4], 8, 5);
    }
  };
  groundItems.forEach((g) => { if (g.kind === 'hedge') { hedge(g.rect); return; } const k = GROUND[g.kind]; if (k) gBox(g.rect[0], g.rect[1], g.rect[2], g.rect[3], 0, k.h, k.c, k.mat, jardin); });

  // ------------------------------------------- niveaux : planchers, murs, ouvertures, meubles, escaliers
  const allWalls = [];
  const stairsAll = layout.stairs || [];
  for (let L = 0; L <= maxL; L++) {
    const yb = L * LH, atTop = L === maxL;
    // planchers (dalle épaisse aux étages, percée par les trémies d'escalier)
    const holes = stairsAll.filter((st) => (st.level || 0) + 1 === L).flatMap(stairHoles);
    rooms.forEach((r) => {
      if (r.outdoor || levelOf(r) !== L) return;
      const f = FLOOR[r.floor] || FLOOR.wood, thick = L === 0 ? 0.12 : 0.36, by = L === 0 ? -0.06 : yb - 0.3;
      subtractRects(r.rect, holes).forEach((q) => {
        mb.attr({ room: roomIdx[r.id], mat: f.mat, level: L, cx: 0, cz: 0 }).box((q[0] + q[2]) / 2, by, (q[1] + q[3]) / 2, q[2] - q[0], thick, q[3] - q[1], r.floorColor || f.c, { ao: 1, noBottom: L === 0 });
      });
    });
    mb.attr({ mat: MAT.PLAIN, room: -1, level: L });

    // murs
    const walls = computeWalls(rooms, layout.wallMods, layout.walls, L);
    walls.forEach((w) => allWalls.push({ ...w, level: L }));
    mb.group(0, 0, 0, yb);
    walls.forEach((w) => {
      const t = w.ext ? EXT_T : INT_T, top = w.low ? 1.0 : (w.ext ? H : INT_H);
      const isH = w.orient === 'h';
      const cd = w.ext && atTop ? (isH ? [0, w.n] : [w.n, 0]) : [0, 0];
      const a0 = w.a - t / 2, b0 = w.b + t / 2;
      const ops = (layout.openings || [])
        .filter((o) => (o.level || 0) === L && (isH ? Math.abs(o.z - w.c) < 0.02 && o.x - o.w / 2 >= w.a - 1e-3 && o.x + o.w / 2 <= w.b + 1e-3
          : Math.abs(o.x - w.c) < 0.02 && o.z - o.w / 2 >= w.a - 1e-3 && o.z + o.w / 2 <= w.b + 1e-3))
        .map((o) => ({ ...o, p: isH ? o.x : o.z })).sort((p, q) => p.p - q.p);

      const block = (along, len, y0, y1, off, thick, colors, opts2 = {}) => {
        if (len < 0.005 || y1 - y0 < 0.005) return;
        const faces = colors || {};
        if (isH) mb.box(along, y0, w.c + off, len, y1 - y0, thick, faces.base, { ao: 0.88, faces: { top: faces.top, pz: w.n === 1 ? faces.out : faces.in, nz: w.n === 1 ? faces.in : faces.out, px: faces.end, nx: faces.end }, ...opts2 });
        else mb.box(w.c + off, y0, along, thick, y1 - y0, len, faces.base, { ao: 0.88, faces: { top: faces.top, px: w.n === 1 ? faces.out : faces.in, nx: w.n === 1 ? faces.in : faces.out, pz: faces.end, nz: faces.end }, ...opts2 });
      };
      const cols = w.ext
        ? { base: COL.plaster, top: COL.outerTop, out: COL.outer, in: COL.plaster, end: COL.plaster }
        : { base: COL.part, top: COL.partTop, out: COL.part, in: COL.part, end: COL.part };
      const colsEdge = w.ext ? { ...cols, end: COL.outer } : cols;
      mb.attr({ room: -1, mat: MAT.PLAIN, cx: cd[0], cz: cd[1], level: L });

      let cursor = a0;
      ops.forEach((o) => {
        const s0 = o.p - o.w / 2, e0 = o.p + o.w / 2;
        const seg = (from, to, y0, y1, isFirst) => block((from + to) / 2, to - from, y0, y1, 0, t, isFirst ? colsEdge : cols);
        seg(cursor, s0, 0, top, cursor === a0);
        const sill = o.sill || 0, oh = Math.min(o.h, top);
        if (sill > 0.01) block(o.p, o.w, 0, sill, 0, t, cols);
        if (sill + oh < top - 0.01) block(o.p, o.w, sill + oh, top, 0, t, cols);
        const inside = w.ext ? roomAtPoint(isH ? o.p : w.c - w.n * 0.4, isH ? w.c - w.n * 0.4 : o.p, L) : -1;
        if (o.kind === 'window' || o.kind === 'glass') {
          mb.attr({ room: inside, mat: MAT.GLASS });
          block(o.p, o.w - 0.06, sill + 0.03, sill + oh - 0.03, 0, 0.03, { base: '#0b1626', top: '#0b1626', out: '#0b1626', in: '#0b1626', end: '#0b1626' }, { ao: 1 });
          mb.attr({ room: -1, mat: MAT.PLAIN });
          const fr = { base: COL.frame, top: COL.frame, out: COL.frame, in: COL.frame, end: COL.frame };
          const ft = 0.05;
          block(o.p, o.w, sill, sill + ft, 0, t + 0.02, fr, { ao: 1 });
          block(o.p, o.w, sill + oh - ft, sill + oh, 0, t + 0.02, fr, { ao: 1 });
          block(o.p - o.w / 2 + ft / 2, ft, sill, sill + oh, 0, t + 0.02, fr, { ao: 1 });
          block(o.p + o.w / 2 - ft / 2, ft, sill, sill + oh, 0, t + 0.02, fr, { ao: 1 });
          if (o.kind === 'glass' || o.w > 1.6) block(o.p, 0.05, sill, sill + oh, 0, t + 0.02, fr, { ao: 1 });
          if (o.shutter) {
            block(o.p, o.w + 0.08, sill + oh + 0.03, sill + oh + 0.17, w.n * (t / 2 + 0.07), 0.13, { base: '#39414d', top: '#4a5462', out: '#39414d', in: '#39414d', end: '#39414d' }, { ao: 0.9 });
            dynamics.push(...rollMeshes(o, w, isH, sill, oh + 0.05, t, cd, inside, yb, L, o.shutter, 'shutter'));
          }
        } else if (o.kind === 'frontdoor') {
          block(o.p, o.w - 0.04, 0.02, oh, 0, 0.06, { base: '#6b4a2e', top: '#6b4a2e', out: '#6b4a2e', in: '#7a5636', end: '#6b4a2e' }, { ao: 0.9 });
          block(o.p + o.w / 2 - 0.15, 0.03, 1.0, 1.25, w.n * 0.06, 0.04, { base: '#d6dbe2', top: '#d6dbe2', out: '#d6dbe2', in: '#d6dbe2', end: '#d6dbe2' }, { ao: 1 });
        } else if (o.kind === 'garage') {
          block(o.p, o.w + 0.1, oh, oh + 0.18, w.n * (t / 2 + 0.08), 0.15, { base: '#8a919c', top: '#a0a7b2', out: '#8a919c', in: '#8a919c', end: '#8a919c' }, { ao: 0.9 });
          [-1, 1].forEach((sd) => block(o.p + sd * (o.w / 2 - 0.02), 0.06, 0, oh, w.n * 0.02, t + 0.04, { base: '#4a515c', top: '#4a515c', out: '#4a515c', in: '#4a515c', end: '#4a515c' }, { ao: 1 }));
          dynamics.push(...rollMeshes(o, w, isH, 0, oh, t, cd, -1, yb, L, o.device, 'garage'));
        }
        cursor = e0;
      });
      block((cursor + b0) / 2, b0 - cursor, 0, top, 0, t, colsEdge, {});
    });
    mb.ungroup();
    mb.attr({ room: -1, mat: MAT.PLAIN, cx: 0, cz: 0, emis: 0, level: L });

    // mobilier
    (layout.furniture || []).forEach((f) => {
      if ((f.level || 0) !== L) return;
      const fn = FURN[f.t]; if (!fn) return;
      const ri = roomIdx[f.room] ?? -1;
      mb.attr({ room: ri, mat: MAT.PLAIN, emis: 0, level: L });
      mb.group(f.x, f.z, f.r || 0, yb + (f.elev || 0));
      const li = f.light !== undefined && lightIdx[f.light] !== undefined ? 10 + lightIdx[f.light] : 0;
      const ai = f.device !== undefined && applIdx[f.device] !== undefined ? 40 + applIdx[f.device] : 0;
      fn(mb, f, li, ai);
      mb.ungroup();
      if (f.t === 'vacuum' && f.device) dynamics.push(robotMesh(ri, yb, L, f.device, ai));
    });
    // escaliers (montent de L vers L+1) + garde-corps de la trémie à l'étage supérieur
    stairsAll.forEach((st) => {
      if ((st.level || 0) !== L) return;
      mb.attr({ room: -1, mat: MAT.PLAIN, emis: 0, level: L });
      mb.group(st.x, st.z, st.r || 0, yb); FURN.stairs(mb, st); mb.ungroup();
      if (L + 1 <= maxL) { mb.attr({ level: L + 1 }); mb.group(st.x, st.z, st.r || 0, yb + LH); FURN.stairRails(mb, st); mb.ungroup(); }
    });
    mb.attr({ room: -1, mat: MAT.PLAIN, emis: 0, level: L });
  }
  mb.attr({ room: -1, mat: MAT.PLAIN, emis: 0, level: 0 });

  return { mb, dynamics, lightDevs, lightIdx, applDevs, applIdx, roomIdx, walls: allWalls, maxL };
}

// Volets roulants et porte de garage enroulable : rideau à lames dont le bord inférieur remonte
// (découpe par plan `clip` dans le shader) + barre finale qui accompagne le bord.
function rollMeshes(o, w, isH, sill, hW, t, cd, room, yb, L, deviceId, src) {
  const mk = () => { const b = new MeshBuilder(); b.group(0, 0, 0, yb); b.attr({ room, mat: MAT.PLAIN, cx: cd[0], cz: cd[1], level: L }); return b; };
  const garage = src === 'garage', off = w.n * (t / 2 + (garage ? 0.06 : 0.05)), th = garage ? 0.05 : 0.03;
  const n = Math.max(6, Math.round(hW / (garage ? 0.3 : 0.055))), ph = hW / n, top = sill + hW;
  const c1 = garage ? '#c3c9d2' : '#4d5766', c2 = garage ? '#b5bcc6' : '#414a57', cb = garage ? '#7a818c' : '#2f3540';
  const slats = mk(), bar = mk(), wd = garage ? o.w - 0.06 : o.w + 0.05;
  for (let i = 0; i < n; i++) {
    const y0 = top - (i + 1) * ph, col = i % 2 ? c2 : c1;
    if (isH) slats.box(o.p, y0, w.c + off, wd, ph - (garage ? 0.02 : 0.006), th, col, { ao: 1 }); else slats.box(w.c + off, y0, o.p, th, ph - (garage ? 0.02 : 0.006), wd, col, { ao: 1 });
  }
  if (isH) bar.box(o.p, sill - 0.01, w.c + off, wd + 0.02, 0.06, th + 0.02, cb, { ao: 1 }); else bar.box(w.c + off, sill - 0.01, o.p, th + 0.02, 0.06, wd + 0.02, cb, { ao: 1 });
  const yTop = yb + top;
  return [{ builder: slats, kind: 'roll', src, deviceId, yTop, hW }, { builder: bar, kind: 'rollbar', src, deviceId, yTop, hW }];
}
// Robot aspirateur : dynamique (déplacé et orienté à chaque image d'après l'état du robot)
function robotMesh(room, yb, L, deviceId, ai) {
  const b = new MeshBuilder(); b.group(0, 0, 0, yb + 0.02); b.attr({ room: -1, mat: MAT.PLAIN, cx: 0, cz: 0, level: L, emis: 0 });
  b.prism(0, 0, 0, 0.17, 0.17, 0.075, 18, '#2b3038', { ao: 0.85, top: '#3a404a' });
  b.prism(0, 0.075, 0, 0.12, 0.12, 0.012, 16, '#4a515c', { ao: 1 });
  b.prism(-0.03, 0.087, -0.02, 0.045, 0.045, 0.028, 10, '#1d2026', { ao: 1 });
  b.attr({ emis: ai || 0.3 }); b.box(0, 0.05, 0.168, 0.15, 0.014, 0.01, '#7dffb0', { ao: 1 }); b.box(0.0, 0.088, 0.0, 0.05, 0.004, 0.05, '#7dffb0', { ao: 1 }); b.attr({ emis: 0 });
  return { builder: b, kind: 'vacuum', deviceId, yb };
}

// ------------------------------------------------------ constructeurs de meubles
const B = (mb, x, y, z, sx, sy, sz, c, o) => mb.box(x, y, z, sx, sy, sz, c, o);
const FURN = {
  rug(mb, f) {
    const w = f.w || 2.4, d = f.d || 1.6;
    if (f.round) mb.prism(0, 0.06, 0, w / 2, w / 2, 0.02, 20, f.c || '#555', { ao: 1 });
    else B(mb, 0, 0.06, 0, w, 0.02, d, f.c || '#555', { ao: 1 });
  },
  sofa(mb) {
    const c = '#cdc6ba', c2 = '#b9b2a6';
    B(mb, 0, 0.1, 0, 2.5, 0.32, 0.95, c); B(mb, 0, 0.42, -0.4, 2.5, 0.5, 0.2, c2);
    B(mb, -1.2, 0.42, 0.05, 0.16, 0.3, 0.85, c2); B(mb, 1.2, 0.42, 0.05, 0.16, 0.3, 0.85, c2);
    B(mb, 0.9, 0.1, 0.95, 0.7, 0.32, 0.95, c);
    [-0.6, 0.15].forEach((x) => B(mb, x, 0.42, 0.05, 0.7, 0.14, 0.7, '#dcd6cb'));
    B(mb, -0.85, 0.55, -0.22, 0.42, 0.34, 0.14, '#5b6b86', { ry: 12 });
    B(mb, 0.3, 0.55, -0.22, 0.42, 0.34, 0.14, '#c9a35f', { ry: -10 });
  },
  armchair(mb) {
    B(mb, 0, 0.08, 0, 0.9, 0.3, 0.85, '#8a6f52'); B(mb, 0, 0.36, -0.36, 0.9, 0.5, 0.16, '#7b6146');
    B(mb, -0.42, 0.36, 0, 0.12, 0.28, 0.8, '#7b6146'); B(mb, 0.42, 0.36, 0, 0.12, 0.28, 0.8, '#7b6146');
  },
  coffee(mb) {
    B(mb, 0, 0.36, 0, 1.1, 0.05, 0.6, '#1c2027'); [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(([x, z]) => B(mb, x, 0.06, z, 0.05, 0.3, 0.05, '#0e1014'));
    B(mb, -0.2, 0.41, 0, 0.3, 0.03, 0.2, '#d8d2c6'); mb.prism(0.25, 0.41, 0.05, 0.07, 0.07, 0.12, 8, '#8fa987');
  },
  tv(mb) {
    B(mb, 0, 0.06, 0, 1.9, 0.42, 0.42, '#2a2119');
    B(mb, 0, 0.66, -0.05, 1.5, 0.86, 0.05, '#0e1116');
    mb.attr({ emis: 0.5 }); B(mb, 0, 0.7, -0.02, 1.4, 0.78, 0.02, '#1c3358', { ao: 1 }); mb.attr({ emis: 0 });
  },
  floorlamp(mb, f, li) {
    mb.prism(0, 0.06, 0, 0.12, 0.12, 0.03, 10, '#20242b'); mb.prism(0, 0.09, 0, 0.018, 0.018, 1.4, 6, '#20242b');
    mb.attr({ emis: li || 0.4 }); mb.prism(0, 1.42, 0, 0.26, 0.19, 0.3, 12, '#ffd9a0', { ao: 1 }); mb.attr({ emis: 0 });
  },
  plant(mb) {
    mb.prism(0, 0.06, 0, 0.2, 0.15, 0.32, 10, '#c9c2b6'); mb.sphere(0, 0.75, 0, 0.32, 0.4, 0.32, '#2f7a3f'); mb.sphere(0.12, 1.0, 0.05, 0.22, 0.3, 0.22, '#3b8a4b');
  },
  shelf(mb) {
    B(mb, 0, 0.06, 0, 1.4, 1.9, 0.36, '#7a5a3a'); [0.5, 0.95, 1.4].forEach((y) => B(mb, 0, y, 0.02, 1.3, 0.03, 0.36, '#5a422b'));
    const cols = ['#b5533c', '#3a6ea5', '#d1a23a', '#5a8f5a', '#8a5a9c'];
    [0.1, 0.55, 1.0, 1.45].forEach((y, r) => { for (let k = 0; k < 7; k++) B(mb, -0.55 + k * 0.17, y + 0.03, 0.05, 0.1, 0.32, 0.22, cols[(k + r) % 5], { ao: 1 }); });
  },
  counter(mb, f) {
    const L = f.len || 3;
    B(mb, 0, 0.06, -0.05, L, 0.86, 0.62, '#e6e2da'); B(mb, 0, 0.92, -0.05, L, 0.04, 0.66, '#2d3138');
    B(mb, 0, 1.55, -0.2, L, 0.7, 0.34, '#e6e2da');
    for (let k = -1; k <= 1; k++) B(mb, k * (L / 3), 0.1, 0.27, 0.01, 0.75, 0.01, '#a8a39a', { ao: 1 });
    B(mb, -L / 4, 0.965, -0.05, 0.6, 0.012, 0.5, '#0d0f13', { ao: 1 }); [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.1], [0.15, 0.1]].forEach(([x, z]) => mb.prism(-L / 4 + x, 0.98, -0.05 + z, 0.07, 0.07, 0.006, 10, '#3a3f47'));
    B(mb, L / 4, 0.965, -0.05, 0.6, 0.012, 0.4, '#aeb6c1', { ao: 1 });
    mb.prism(L / 4, 0.97, -0.28, 0.018, 0.018, 0.3, 6, '#c9d0d8');
  },
  island(mb) {
    B(mb, 0, 0.06, 0, 2.3, 0.86, 0.9, '#2d3540'); B(mb, 0, 0.92, 0, 2.4, 0.05, 1.0, '#e8e5df');
    [-0.55, 0.55].forEach((x) => { mb.prism(x, 0.06, 0.85, 0.16, 0.16, 0.62, 10, '#1d2128'); });
  },
  fridge(mb) {
    B(mb, 0, 0.06, 0, 0.75, 1.85, 0.7, '#cfd5dc'); B(mb, 0, 1.0, 0.36, 0.72, 0.012, 0.01, '#8a919b', { ao: 1 });
    B(mb, 0.3, 1.1, 0.38, 0.03, 0.4, 0.03, '#9aa3ae', { ao: 1 }); B(mb, 0.3, 1.5, 0.38, 0.03, 0.3, 0.03, '#9aa3ae', { ao: 1 });
  },
  table(mb) {
    B(mb, 0, 0.72, 0, 1.7, 0.05, 0.9, '#6b4a30'); [[-0.75, -0.38], [0.75, -0.38], [-0.75, 0.38], [0.75, 0.38]].forEach(([x, z]) => B(mb, x, 0.06, z, 0.07, 0.68, 0.07, '#4a331f'));
    mb.prism(0, 0.77, 0, 0.09, 0.07, 0.16, 8, '#d9d3c7');
  },
  chair(mb) {
    B(mb, 0, 0.44, 0, 0.42, 0.04, 0.42, '#2b2f36'); B(mb, 0, 0.66, -0.2, 0.42, 0.46, 0.04, '#2b2f36');
    [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(([x, z]) => B(mb, x, 0.06, z, 0.04, 0.4, 0.04, '#171a1f'));
  },
  bed(mb, f) {
    const single = f.single, w = single ? 1.0 : 1.75, d = 2.05, c = f.c || '#41537a';
    B(mb, 0, 0.06, 0, w + 0.1, 0.28, d + 0.06, '#59452f'); B(mb, 0, 0.34, 0.02, w, 0.2, d, '#f1eee8');
    B(mb, 0, 0.36, 0.5, w + 0.02, 0.2, d * 0.55, c, { ao: 0.92 });
    B(mb, 0, 0.06, -d / 2 - 0.04, w + 0.2, 1.0, 0.09, '#4a3a28');
    (single ? [0] : [-0.42, 0.42]).forEach((x) => B(mb, x, 0.54, -d / 2 + 0.3, single ? 0.6 : 0.68, 0.12, 0.36, '#f7f5f0', { ao: 1 }));
  },
  nightstand(mb, f, li) {
    B(mb, 0, 0.06, 0, 0.44, 0.5, 0.4, '#59452f');
    mb.prism(0, 0.58, 0, 0.05, 0.05, 0.03, 8, '#1c1f24');
    mb.attr({ emis: li || 0.3 }); mb.prism(0, 0.62, 0, 0.11, 0.08, 0.17, 10, '#ffe0b0', { ao: 1 }); mb.attr({ emis: 0 });
  },
  wardrobe(mb, f) {
    const aw = f.w || 1.6, ad = f.d || 0.6, ah = f.h || 2.1, n = Math.max(2, Math.min(6, f.doors || 2)), base = f.c || '#d9d3c8';
    const mirror = f.finish === 'mirror', sliding = f.door === 'sliding';
    const rgb = hex(base), tint = (k) => [Math.min(1, rgb[0] * k), Math.min(1, rgb[1] * k), Math.min(1, rgb[2] * k)];
    const face = mirror ? '#b7d3e6' : tint(1.06), edge = tint(0.72);
    B(mb, 0, 0.06, 0, aw, ah, ad, base);
    const fz = ad / 2;
    if (mirror) mb.attr({ emis: 0.16 });
    if (sliding) {
      const pw = (aw - 0.06) / n + 0.07, span = n > 1 ? (aw - 0.06 - pw) / (n - 1) : 0;
      B(mb, 0, ah - 0.02, fz + 0.03, aw - 0.02, 0.05, 0.07, '#3a3f47', { ao: 1 }); B(mb, 0, 0.06, fz + 0.03, aw - 0.02, 0.03, 0.07, '#3a3f47', { ao: 1 });
      for (let i = 0; i < n; i++) {
        const cx = -aw / 2 + 0.03 + pw / 2 + i * span, z = fz + 0.018 + (i % 2) * 0.03;
        B(mb, cx, 0.09, z, pw, ah - 0.13, 0.024, face, { ao: 1 });
        if (!mirror) B(mb, cx + (i % 2 ? -1 : 1) * (pw / 2 - 0.05), 0.9, z + 0.016, 0.018, 0.34, 0.012, '#5b5f66', { ao: 1 });
      }
    } else {
      const pw = (aw - 0.04) / n;
      for (let i = 0; i < n; i++) {
        const cx = -aw / 2 + 0.02 + pw * (i + 0.5);
        B(mb, cx, 0.09, fz + 0.012, pw - 0.012, ah - 0.13, 0.024, face, { ao: 1 });
        B(mb, cx + (i % 2 ? -1 : 1) * (pw / 2 - 0.05), 0.95, fz + 0.03, 0.016, 0.3, 0.014, '#7c7a72', { ao: 1 });
      }
    }
    if (mirror) mb.attr({ emis: 0 });
    B(mb, 0, ah + 0.06, 0, aw + 0.02, 0.03, ad + 0.02, edge, { ao: 1 });
  },
  desk(mb) {
    B(mb, 0, 0.72, 0, 1.2, 0.04, 0.6, '#d8c4a3'); [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]].forEach(([x, z]) => B(mb, x, 0.06, z, 0.04, 0.66, 0.04, '#3a3f47'));
    B(mb, 0, 0.98, -0.2, 0.52, 0.32, 0.03, '#0e1116'); mb.attr({ emis: 0.35 }); B(mb, 0, 1.0, -0.185, 0.48, 0.28, 0.01, '#274a7a', { ao: 1 }); mb.attr({ emis: 0 });
    B(mb, 0.0, 0.76, 0.05, 0.4, 0.01, 0.14, '#2b2f36', { ao: 1 });
  },
  shower(mb, f) {
    const sw = f.w || 1.0, sd = f.d || 1.0;
    B(mb, 0, 0.06, 0, sw, 0.08, sd, '#e8ebef');
    B(mb, 0, 0.12, sd / 2, sw, 1.95, 0.03, '#9fc4d6', { ao: 1 });
    B(mb, -sw / 2, 0.12, 0, 0.03, 1.95, sd, '#9fc4d6', { ao: 1 });
    if (sw >= 1.3) B(mb, sw / 2 - 0.02, 0.12, sd / 2 - 0.4, 0.03, 1.95, 0.8, '#9fc4d6', { ao: 1 }); // paroi fixe des grandes douches
    mb.prism(sw / 2 - 0.2, 1.9, -sd / 2 + 0.2, 0.02, 0.02, 0.15, 6, '#c9d0d8'); mb.prism(sw / 2 - 0.2, 2.05, -sd / 2 + 0.2, 0.13, 0.13, 0.02, 12, '#c9d0d8');
  },
  vanity(mb) {
    B(mb, 0, 0.06, 0, 1.2, 0.8, 0.5, '#d9d3c8'); B(mb, 0, 0.86, 0, 1.24, 0.04, 0.54, '#eceff3');
    mb.prism(-0.25, 0.9, 0.02, 0.15, 0.12, 0.03, 12, '#ffffff'); mb.prism(0.25, 0.9, 0.02, 0.15, 0.12, 0.03, 12, '#ffffff');
    mb.attr({ emis: 0.28 }); B(mb, 0, 1.25, -0.24, 1.1, 0.7, 0.02, '#a9c4d6', { ao: 1 }); mb.attr({ emis: 0 });
  },
  toilet(mb) {
    B(mb, 0, 0.06, 0, 0.4, 0.4, 0.55, '#f2f4f7'); B(mb, 0, 0.5, -0.24, 0.42, 0.42, 0.18, '#f2f4f7');
  },
  // Escalier : marches pleines (de 0 à leur hauteur). Droit = montée vers +z local ; L = quart tournant.
  stairs(mb, st) {
    const w = st.w || 1, n = N_RISERS, rise = LH / n;
    const step = (cx, cz, sx, sz, k) => B(mb, cx, 0, cz, sx, 0.06 + k * rise, sz, '#a89676', { ao: 0.7, faces: { top: '#d3c3a4' } });
    if (st.kind === 'U') {
      const Ly = stairLayout(st), { tr, d1, gap, Wt, k1 } = Ly, k2 = n - k1 - 1, r1 = d1 / k1, r2 = d1 / k2;
      const put = (x, z, sx, sz, k) => { const p = tr(x, z); step(p[0], p[1], sx, sz, k); };
      for (let i = 0; i < k1; i++) put(w / 2, (i + 0.5) * r1, w, r1, i + 1);
      put(Wt / 2, d1 + w / 2, Wt, w, k1 + 1); // palier
      for (let j = 0; j < k2; j++) put(w + gap + w / 2, d1 - (j + 0.5) * r2, w, r2, k1 + 2 + j);
      return;
    }
    if (st.kind !== 'L') {
      const d = st.d || 3.2, run = d / n;
      for (let i = 0; i < n; i++) step(0, -d / 2 + (i + 0.5) * run, w, run, i + 1);
      B(mb, -w / 2 - 0.03, 0, 0, 0.05, 1.1, d, '#e8ebf0', { ao: 0.9 }); B(mb, w / 2 + 0.03, 0, 0, 0.05, 1.1, d, '#e8ebf0', { ao: 0.9 });
      return;
    }
    const L = stairLayout(st), { tr, d1, d2, k1 } = L, k2 = n - k1 - 1, run1 = d1 / k1, run2 = d2 / k2;
    const put = (x, z, sx, sz, k) => { const p = tr(x, z); step(p[0], p[1], sx, sz, k); };
    for (let i = 0; i < k1; i++) put(w / 2, (i + 0.5) * run1, w, run1, i + 1);
    put(w / 2, d1 + w / 2, w, w, k1 + 1); // palier
    for (let j = 0; j < k2; j++) put(w + (j + 0.5) * run2, d1 + w / 2, run2, w, k1 + 2 + j);
  },
  stairRails(mb, st) {
    const w = st.w || 1, c = '#e6e9ee';
    if (st.kind === 'U') {
      const { tr, d1, gap, Wt } = stairLayout(st);
      [[0, 0, w + gap, 0], [0, 0, 0, d1 + w], [0, d1 + w, Wt, d1 + w], [Wt, d1 + w, Wt, 0]].forEach(([x1, z1, x2, z2]) => {
        const a = tr(x1, z1), b = tr(x2, z2);
        B(mb, (a[0] + b[0]) / 2, 0.06, (a[1] + b[1]) / 2, Math.max(0.04, Math.abs(a[0] - b[0]) + 0.04), 0.95, Math.max(0.04, Math.abs(a[1] - b[1]) + 0.04), c, { ao: 1 });
      });
      return;
    }
    if (st.kind !== 'L') {
      const d = st.d || 3.2;
      [-1, 1].forEach((sd) => B(mb, sd * (w / 2 + 0.03), 0.06, -0.2, 0.04, 0.95, d - 0.4, c, { ao: 1 }));
      B(mb, 0, 0.06, -d / 2 - 0.03, w + 0.1, 0.95, 0.04, c, { ao: 1 });
      return;
    }
    const { tr, d1, d2 } = stairLayout(st);
    // contour du L sans le bord de sortie (extrémité de la volée 2)
    const edges = [[0, 0, w, 0], [w, 0, w, d1], [w, d1, w + d2, d1], [w + d2, d1 + w, 0, d1 + w], [0, d1 + w, 0, 0]];
    edges.forEach(([x1, z1, x2, z2]) => {
      const a = tr(x1, z1), b = tr(x2, z2), lx = Math.abs(a[0] - b[0]), lz = Math.abs(a[1] - b[1]);
      B(mb, (a[0] + b[0]) / 2, 0.06, (a[1] + b[1]) / 2, Math.max(0.04, lx + 0.04), 0.95, Math.max(0.04, lz + 0.04), c, { ao: 1 });
    });
  },
  dishwasher(mb, f, li, ai) {
    B(mb, 0, 0.06, 0, 0.6, 0.82, 0.58, '#d5dae0'); B(mb, 0, 0.7, 0.295, 0.6, 0.18, 0.012, '#2a2e35', { ao: 1 });
    mb.attr({ emis: ai || 0.12 }); B(mb, 0.16, 0.79, 0.303, 0.14, 0.02, 0.006, '#7dffb0', { ao: 1 }); B(mb, -0.2, 0.79, 0.303, 0.05, 0.02, 0.006, '#64d2ff', { ao: 1 }); mb.attr({ emis: 0 });
    B(mb, 0, 0.66, 0.31, 0.42, 0.018, 0.02, '#9aa3ae', { ao: 1 });
  },
  microwave(mb, f, li, ai) {
    B(mb, 0, 0, 0, 0.5, 0.3, 0.38, '#c9ced6'); B(mb, -0.07, 0.04, 0.192, 0.3, 0.22, 0.008, '#101318', { ao: 1 });
    mb.attr({ emis: ai || 0.06 }); B(mb, -0.07, 0.05, 0.198, 0.27, 0.19, 0.004, '#ffcf7a', { ao: 1 }); mb.attr({ emis: 0 });
    B(mb, 0.18, 0.04, 0.192, 0.1, 0.22, 0.008, '#2a2e35', { ao: 1 });
    mb.attr({ emis: ai || 0.2 }); B(mb, 0.18, 0.2, 0.198, 0.07, 0.03, 0.005, '#7dffb0', { ao: 1 }); mb.attr({ emis: 0 });
  },
  vacuum(mb, f, li, ai) { // base de charge (le robot est un maillage dynamique)
    B(mb, 0, 0.06, 0, 0.32, 0.025, 0.34, '#e8ebef'); B(mb, 0, 0.06, -0.14, 0.24, 0.16, 0.05, '#e8ebef');
    mb.attr({ emis: ai || 0.3 }); B(mb, 0, 0.19, -0.113, 0.06, 0.012, 0.006, '#7dffb0', { ao: 1 }); mb.attr({ emis: 0 });
  },
  rgbLamp(mb, f, li) {
    mb.prism(0, 0, 0, 0.11, 0.11, 0.03, 10, '#22262d'); mb.prism(0, 0.03, 0, 0.02, 0.02, 0.32, 6, '#22262d');
    mb.attr({ emis: li || 0.4 }); mb.sphere(0, 0.5, 0, 0.11, 0.15, 0.11, '#ffd9a0', 8, 5); mb.attr({ emis: 0 });
  },
  ledStrip(mb, f, li) { mb.attr({ emis: li || 0.4 }); B(mb, 0, 0, 0, f.len || 2.0, 0.03, 0.03, '#9fd0ff', { ao: 1 }); mb.attr({ emis: 0 }); },
  rgbCeiling(mb, f, li) {
    mb.prism(0, 0, 0, 0.2, 0.2, 0.03, 16, '#e9edf1'); mb.attr({ emis: li || 0.4 }); mb.prism(0, 0.03, 0, 0.15, 0.15, 0.006, 16, '#ffe2b0', { ao: 1 }); mb.attr({ emis: 0 });
  },
  bathtub(mb) {
    B(mb, 0, 0.06, 0, 1.7, 0.55, 0.75, '#f2f4f7'); B(mb, 0, 0.6, 0, 1.5, 0.02, 0.55, '#bcd7e6', { ao: 1 });
    mb.prism(-0.75, 0.6, 0, 0.03, 0.03, 0.25, 6, '#c9d0d8');
  },
  washer(mb) {
    B(mb, 0, 0.06, 0, 0.6, 0.85, 0.6, '#e9edf1'); mb.attr({ emis: 0.15 }); mb.prism(0, 0.3, 0.31, 0.2, 0.2, 0.02, 14, '#31485f', { ao: 1 }); mb.attr({ emis: 0 });
  },
  car(mb) {
    // capot vers +z local
    B(mb, 0, 0.32, 0, 1.92, 0.55, 4.5, '#1c2432'); B(mb, 0, 0.87, -0.15, 1.7, 0.5, 2.5, '#1c2432');
    B(mb, 0, 0.92, -0.15, 1.72, 0.32, 2.3, '#0b1119', { ao: 1 });
    [[-0.98, 1.4], [0.98, 1.4], [-0.98, -1.35], [0.98, -1.35]].forEach(([x, z]) => B(mb, x, 0.06, z, 0.26, 0.64, 0.64, '#0b0c0e'));
    mb.attr({ emis: 0.9 }); B(mb, -0.65, 0.62, 2.27, 0.42, 0.1, 0.04, '#dfeaff', { ao: 1 }); B(mb, 0.65, 0.62, 2.27, 0.42, 0.1, 0.04, '#dfeaff', { ao: 1 });
    B(mb, -0.7, 0.66, -2.27, 0.4, 0.1, 0.04, '#ff2a2a', { ao: 1 }); B(mb, 0.7, 0.66, -2.27, 0.4, 0.1, 0.04, '#ff2a2a', { ao: 1 }); mb.attr({ emis: 0 });
  },
  charger(mb) { B(mb, 0, 0.9, 0, 0.3, 0.5, 0.12, '#e9edf1'); mb.attr({ emis: 0.8 }); B(mb, 0, 1.25, 0.07, 0.16, 0.03, 0.01, '#3cff8a', { ao: 1 }); mb.attr({ emis: 0 }); },
  lounger(mb) {
    B(mb, 0, 0.28, 0, 0.7, 0.05, 1.9, '#e8e3d8'); B(mb, 0, 0.4, -0.8, 0.7, 0.05, 0.6, '#e8e3d8', { ry: 0 });
    [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]].forEach(([x, z]) => B(mb, x, 0.02, z, 0.04, 0.27, 0.04, '#333941'));
  },
  tree(mb, f) {
    const s = f.s || 1;
    mb.prism(0, 0, 0, 0.12 * s, 0.09 * s, 1.5 * s, 7, '#4b3a2a');
    mb.sphere(0, 2.1 * s, 0, 1.15 * s, 1.0 * s, 1.15 * s, '#2c6b3e', 9, 6);
    mb.sphere(0.5 * s, 1.75 * s, 0.25 * s, 0.8 * s, 0.7 * s, 0.8 * s, '#367a47', 8, 5);
    mb.sphere(-0.45 * s, 1.85 * s, -0.25 * s, 0.75 * s, 0.7 * s, 0.75 * s, '#2a6238', 8, 5);
  },
  bush(mb) { mb.sphere(0, 0.35, 0, 0.6, 0.42, 0.55, '#2f7a45', 8, 5); mb.sphere(0.4, 0.28, 0.15, 0.4, 0.3, 0.4, '#3a8a4f', 7, 4); },
  postlamp(mb, f, li) {
    mb.prism(0, 0, 0, 0.03, 0.03, 0.8, 6, '#1a1d22');
    mb.attr({ emis: li || 0.4 }); mb.sphere(0, 0.88, 0, 0.1, 0.09, 0.1, '#ffe2a8', 6, 4); mb.attr({ emis: 0 });
  },
  poollight(mb, f, li) { mb.attr({ emis: li || 0.4 }); mb.prism(0, -0.13, 0, 0.16, 0.16, 0.01, 10, '#bff3ff', { ao: 1 }); mb.attr({ emis: 0 }); },
};

export function toneRgb(tone) { return (TONES[tone] || TONES.warm).rgb; }
// couleur effective d'un luminaire : teinte prédéfinie ou couleur RVB libre
export function lightRgb(state) { return state.tone === 'custom' ? hexToRgb(state.color) : toneRgb(state.tone); }

// Catalogue d'édition : libellé, catégorie, emprise au sol (m) pour le plan 2D
export const FURN_INFO = {
  sofa: { label: 'Canapé', cat: 'Salon', w: 2.5, d: 1.9, ox: 0, oz: 0.45 }, armchair: { label: 'Fauteuil', cat: 'Salon', w: 0.9, d: 0.85 },
  coffee: { label: 'Table basse', cat: 'Salon', w: 1.1, d: 0.6 }, tv: { label: 'Meuble TV', cat: 'Salon', w: 1.9, d: 0.42 },
  shelf: { label: 'Bibliothèque', cat: 'Salon', w: 1.4, d: 0.36 }, rug: { label: 'Tapis', cat: 'Salon', w: 2.4, d: 1.6 },
  plant: { label: 'Plante', cat: 'Salon', w: 0.5, d: 0.5 }, floorlamp: { label: 'Lampadaire', cat: 'Salon', w: 0.3, d: 0.3, light: { y: 1.7, name: 'Lampadaire', watts: 9 } },
  counter: { label: 'Plan de travail', cat: 'Cuisine', w: 3, d: 0.65 }, island: { label: 'Îlot', cat: 'Cuisine', w: 2.4, d: 1.0 },
  fridge: { label: 'Réfrigérateur', cat: 'Cuisine', w: 0.75, d: 0.7 }, table: { label: 'Table à manger', cat: 'Cuisine', w: 1.7, d: 0.9 },
  chair: { label: 'Chaise', cat: 'Cuisine', w: 0.42, d: 0.42 },
  bed: { label: 'Lit double', cat: 'Chambre', w: 1.75, d: 2.05 }, bed1: { label: 'Lit simple', cat: 'Chambre', w: 1.0, d: 2.05 }, nightstand: { label: 'Chevet + lampe', cat: 'Chambre', w: 0.44, d: 0.4, light: { y: 1.0, name: 'Lampe de chevet', watts: 6 } },
  wardrobe: { label: 'Armoire / dressing', cat: 'Chambre', w: 1.6, d: 0.6 }, desk: { label: 'Bureau', cat: 'Chambre', w: 1.2, d: 0.6 },
  shower: { label: 'Douche', cat: 'Salle de bain', w: 1.0, d: 1.0 }, bathtub: { label: 'Baignoire', cat: 'Salle de bain', w: 1.7, d: 0.75 },
  vanity: { label: 'Vasque', cat: 'Salle de bain', w: 1.2, d: 0.5 }, toilet: { label: 'WC', cat: 'Salle de bain', w: 0.4, d: 0.55 },
  washer: { label: 'Lave-linge', cat: 'Salle de bain', w: 0.6, d: 0.6 },
  dishwasher: { label: 'Lave-vaisselle connecté', cat: 'Électroménager', w: 0.6, d: 0.6, dev: { type: 'dishwasher', name: 'Lave-vaisselle', y: 0.5, props: { watts: 1800 } } },
  microwave: { label: 'Micro-ondes connecté', cat: 'Électroménager', w: 0.5, d: 0.38, elev: 0.96, dev: { type: 'microwave', name: 'Micro-ondes', y: 0.12, props: { watts: 1200 } } },
  vacuum: { label: 'Robot aspirateur + base', cat: 'Électroménager', w: 0.34, d: 0.34, dev: { type: 'vacuum', name: 'Robot aspirateur', y: 0.1, props: {} } },
  rgbLamp: { label: 'Lampe RVB', cat: 'Éclairage RVB', w: 0.25, d: 0.25, light: { y: 0.6, name: 'Lampe RVB', watts: 9, rgb: true, color: '#8a5cff' } },
  ledStrip: { label: 'Ruban LED RVB', cat: 'Éclairage RVB', w: 2.0, d: 0.06, elev: 0.3, light: { y: 0.35, name: 'Ruban LED RVB', watts: 12, rgb: true, color: '#0a84ff' } },
  rgbCeiling: { label: 'Plafonnier RVB', cat: 'Éclairage RVB', w: 0.4, d: 0.4, elev: 2.5, light: { y: 2.4, name: 'Plafonnier RVB', watts: 14, rgb: true, color: '#ff9f0a' } },
  car: { label: 'Voiture', cat: 'Garage', w: 1.92, d: 4.5 }, charger: { label: 'Borne de recharge', cat: 'Garage', w: 0.3, d: 0.12 },
  tree: { label: 'Arbre', cat: 'Jardin', w: 1.6, d: 1.6 }, bush: { label: 'Buisson', cat: 'Jardin', w: 1.1, d: 1.0 },
  lounger: { label: 'Transat', cat: 'Jardin', w: 0.7, d: 1.9 }, postlamp: { label: 'Borne lumineuse', cat: 'Jardin', w: 0.2, d: 0.2, light: { y: 0.9, name: 'Borne extérieure', watts: 8 } },
};

export const SHOWER_SIZES = [[0.8, 0.8], [0.9, 0.9], [1.0, 1.0], [1.2, 0.8], [1.4, 0.9], [1.6, 0.9]];
export const WARDROBE_DEFAULT = { w: 1.6, d: 0.6, h: 2.1, doors: 2, door: 'hinged', c: '#d9d3c8' };
export const FLOOR_PRESETS = {
  wood: [['Chêne clair', '#c9a26e'], ['Chêne', '#a9784a'], ['Noyer', '#6b4a2e'], ['Wengé', '#3d2b1f'], ['Gris', '#8d8f93'], ['Blanchi', '#d8c9b0']],
  tile: [['Blanc', '#e6e8ec'], ['Gris clair', '#c6cbd3'], ['Anthracite', '#4a4f57'], ['Beige', '#d9c9a8'], ['Terre cuite', '#b5654a'], ['Bleu', '#5b7fa6']],
  lino: [['Gris', '#9aa1ab'], ['Beige', '#cdbd9a'], ['Bleu', '#7fa3c7'], ['Vert', '#8fb28a'], ['Rouge', '#b56a6a'], ['Noir', '#2d3036']],
  concrete: [['Béton', '#7f858e'], ['Clair', '#a7acb3'], ['Sombre', '#4d525a'], ['Ciré beige', '#a89f8f']],
};
