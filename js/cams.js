// ---------------------------------------------------------------------------
// Flux caméra SIMULÉS (canvas 2D). Pour de vrais flux, remplacer drawFeed par
// un <video> HLS / WebRTC / MJPEG fourni par le driver (voir README.md).
// Un seul timer (≈12 im/s) dessine tous les canvas enregistrés.
// ---------------------------------------------------------------------------
const feeds = new Map(); // canvas -> deviceId
let store = null, timer = 0;

export function initFeeds(s) { store = s; }
export function attachFeed(canvas, deviceId) { feeds.set(canvas, deviceId); if (!timer) timer = setInterval(tick, 85); tick(); }
export function detachAll() { feeds.clear(); clearInterval(timer); timer = 0; }
export function pruneFeeds() { [...feeds.keys()].forEach((c) => { if (!c.isConnected) feeds.delete(c); }); if (!feeds.size) { clearInterval(timer); timer = 0; } }

function tick() {
  pruneFeeds();
  const t = performance.now() / 1000;
  feeds.forEach((id, canvas) => { const d = store.device(id); if (d && d.state.on) drawFeed(canvas, d, t); });
}

function drawFeed(canvas, d, t) {
  const w = canvas.clientWidth ? Math.min(canvas.clientWidth, 480) : 320, h = Math.round(w * 0.625);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const c = canvas.getContext('2d');
  const kind = d.roomId, motion = store.devicesIn(d.roomId).some((x) => x.type === 'motion' && x.state.detected);
  // ciel / sol
  let g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1526'); g.addColorStop(0.55, '#0e1a2b'); g.addColorStop(0.56, '#0b140e'); g.addColorStop(1, '#070c08');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const lightsOn = store.devicesIn(d.roomId).filter((x) => x.type === 'light' && x.state.on);
  if (kind === 'piscine') {
    const wg = c.createLinearGradient(0, h * 0.4, 0, h); wg.addColorStop(0, '#0d6ea1'); wg.addColorStop(1, '#0a3a5c'); c.fillStyle = wg; c.fillRect(w * 0.08, h * 0.42, w * 0.84, h * 0.5);
    c.strokeStyle = 'rgba(180,240,255,.35)'; c.lineWidth = 1;
    for (let i = 0; i < 6; i++) { c.beginPath(); for (let x = w * 0.08; x < w * 0.92; x += 6) { const y = h * (0.48 + i * 0.07) + Math.sin(x * 0.05 + t * 1.3 + i) * 2; x === w * 0.08 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
  } else if (kind === 'garage') {
    c.fillStyle = '#2a323d'; c.fillRect(0, h * 0.18, w, h * 0.5);
    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, h * 0.18 + i * h * 0.083, w, 1.5); }
    c.fillStyle = '#10151c'; c.fillRect(w * 0.18, h * 0.52, w * 0.64, h * 0.22); c.fillRect(w * 0.26, h * 0.42, w * 0.44, h * 0.14);
    c.fillStyle = '#ff3b30'; c.fillRect(w * 0.2, h * 0.6, 8, 4); c.fillRect(w * 0.78 - 8, h * 0.6, 8, 4);
  } else if (kind === 'jardin') {
    c.fillStyle = '#0a1b10'; for (let i = 0; i < 5; i++) { const x = w * (0.1 + i * 0.2), r = h * (0.13 + (i % 2) * 0.05); c.beginPath(); c.arc(x, h * 0.5, r, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(255,214,120,.9)'; [0.3, 0.7].forEach((p) => { c.beginPath(); c.arc(w * p, h * 0.66, 3, 0, 7); c.fill(); });
  } else {
    c.fillStyle = '#1b222d'; c.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.62); c.fillStyle = '#5a3f27'; c.fillRect(w * 0.36, h * 0.2, w * 0.28, h * 0.54);
    c.fillStyle = '#d6dbe2'; c.fillRect(w * 0.58, h * 0.45, 3, 12);
    const gl = c.createRadialGradient(w * 0.5, h * 0.1, 0, w * 0.5, h * 0.1, h * 0.6); gl.addColorStop(0, 'rgba(255,220,150,.45)'); gl.addColorStop(1, 'rgba(255,220,150,0)'); c.fillStyle = gl; c.fillRect(0, 0, w, h);
  }
  if (lightsOn.length) { const gl = c.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, w * 0.6); gl.addColorStop(0, 'rgba(255,214,140,.12)'); gl.addColorStop(1, 'rgba(255,214,140,0)'); c.fillStyle = gl; c.fillRect(0, 0, w, h); }
  if (motion) { // silhouette qui se déplace + cadre de détection
    const px = w * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.9))); c.fillStyle = '#04070b'; c.beginPath(); c.arc(px, h * 0.5, 6, 0, 7); c.fill(); c.fillRect(px - 6, h * 0.53, 12, h * 0.2);
    c.strokeStyle = '#ff453a'; c.lineWidth = 1.5; c.strokeRect(px - 14, h * 0.42, 28, h * 0.36);
  }
  // grain, lignes, vignette
  for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.1})`; c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  c.fillStyle = 'rgba(0,0,0,.14)'; for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  const vg = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = vg; c.fillRect(0, 0, w, h);
}
export { drawFeed };
