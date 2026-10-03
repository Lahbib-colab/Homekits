// ---------------------------------------------------------------------------
// Point d'entrée : assemble store + driver + vue 3D + vues + feuilles.
// ---------------------------------------------------------------------------
import { createStore } from './store.js';
import { SimulatedDriver } from './drivers.js';
import { House3D, Plan2D } from './house3d.js';
import { createSheets } from './sheets.js';
import { hdrHTML, quickHTML, roomsPanelHTML, scenesPanelHTML, roomsViewHTML, autoViewHTML, camsViewHTML, energyViewHTML } from './views.js';
import { $, $$, sheets, toast, makeLive } from './dom.js';
import { icon } from './icons.js';
import { initFeeds, attachFeed } from './cams.js';
import { createEditor } from './editor.js';
import { APP, APP_LABEL } from './version.js';

const driver = new SimulatedDriver();
const store = createStore({ driver });
driver.attach(store);
initFeeds(store);
const live = makeLive(store);

const ui = { tab: store.state.ui.tab || 'home', editScenes: false, installEvt: null, house: null };
const ctx = {
  store, get house() { return ui.house; },
  currentTab: () => ui.tab,
  nav: (t) => setTab(t),
  confirm: askConfirm,
  refreshAll: () => renderAll(),
  applyGraphics: () => mountStage(),
  closeSheets: () => sheets.close(),
  openEditor: () => editor.open(),
  installPrompt: () => ui.installEvt,
  doInstall: async () => { const e = ui.installEvt; if (!e) return; e.prompt(); await e.userChoice; ui.installEvt = null; sheets.close(); },
};
const sh = createSheets(ctx);
const editor = createEditor(ctx);
const TABS = ['home', 'rooms', 'auto', 'cams', 'energy'];

// ------------------------------------------------------------ squelette
function buildShell() {
  const tabs = [['home', 'Maison', 'home'], ['rooms', 'Pièces', 'grid'], ['auto', 'Automatisations', 'clock'], ['cams', 'Caméras', 'camera'], ['energy', 'Énergie', 'leaf']];
  $('#app').innerHTML = `
    <main id="views">
      <section class="view" data-view="home"><div class="home-grid">
        <header class="hdr" id="hdr"></header>
        <div class="quick" id="quick"></div>
        <div class="stage-wrap"><div class="stage" id="stage"></div>
          <div class="stage-tools"><button class="round" data-act="edit-plan" aria-label="Modifier le plan de la maison">${icon('edit', 17)}</button><button class="round" data-act="reset-view" aria-label="Revenir à la vue initiale">${icon('reset', 18)}</button></div>
          <div class="stage-hint" id="stage-hint">Glisser pour tourner · pincer pour zoomer</div></div>
        <section class="panel" id="p-rooms"></section>
        <section class="panel" id="p-scn"></section>
        <div class="app-foot">${APP.name} ${APP_LABEL}</div>
      </div></section>
      <section class="view" data-view="rooms" id="v-rooms"></section>
      <section class="view" data-view="auto" id="v-auto"></section>
      <section class="view" data-view="cams" id="v-cams"></section>
      <section class="view" data-view="energy" id="v-energy"></section>
    </main>
    <nav id="tabbar" aria-label="Navigation principale">${tabs.map(([k, l, ic]) => `<button class="tab" data-tab="${k}" aria-label="${l}">${icon(ic, 23)}<span>${l}</span></button>`).join('')}</nav>`;
}

// -------------------------------------------------------------- rendu
const R = {
  home() { $('#hdr').innerHTML = hdrHTML(store); $('#quick').innerHTML = quickHTML(store); $('#p-rooms').innerHTML = roomsPanelHTML(store); $('#p-scn').innerHTML = scenesPanelHTML(store); if (ui.house) ui.house.refresh(); },
  rooms() { $('#v-rooms').innerHTML = roomsViewHTML(store); },
  auto() { $('#v-auto').innerHTML = autoViewHTML(store, sh, { editing: ui.editScenes }); },
  cams() { $('#v-cams').innerHTML = camsViewHTML(store); $$('#v-cams canvas[data-cam]').forEach((c) => attachFeed(c, c.dataset.cam)); },
  energy() { $('#v-energy').innerHTML = energyViewHTML(store); },
};
let rafPending = 0;
function renderActive() { R[ui.tab](); live(); }
function scheduleRender() {
  if (rafPending) return; rafPending = requestAnimationFrame(() => { rafPending = 0; renderActive(); if (!sheets.busy) sheets.rerender(); live($('#sheet-layer')); });
}
function renderAll() { TABS.forEach((t) => R[t]()); live(); sheets.rerender(); }

function setTab(t, first) {
  if (!TABS.includes(t)) t = 'home';
  const changed = t !== ui.tab;
  if (changed && sheets.isOpen()) sheets.close();
  ui.tab = t; store.setUi('tab', t);
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === t));
  $$('.tab').forEach((b) => { const on = b.dataset.tab === t; b.classList.toggle('active', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  R[t](); live();
  if (ui.house) { ui.house.setActive(t === 'home'); if (t === 'home') requestAnimationFrame(() => ui.house.resize()); }
  if (changed || first) $('#views').scrollTo({ top: 0 });
}

// ------------------------------------------------------- scène 3D / 2D
function mountStage() {
  const stage = $('#stage'); if (ui.house) { ui.house.destroy(); ui.house = null; }
  const g = store.state.settings.graphics;
  const opts = {
    stage, store,
    onRoom: (id) => { if (!id) { if (sheets.isOpen()) sheets.close(); else if (ui.house) { ui.house.select(null); } return; } if (!sheets.isOpen(`room:${id}`)) sh.openRoom(id, { dock: true }); },
    onDevice: (id) => sh.openDevice(id, { fromRoom: ui.house && ui.house.selId, dock: true }),
  };
  let h = null;
  if (g !== '2d') { try { h = new House3D(opts); h.applySetting(g === 'auto' ? 'auto' : g); h.onAutoDowngrade = () => { toast('Graphismes ajustés pour rester fluide'); }; } catch (e) { console.warn('3D indisponible → plan 2D', e); stage.innerHTML = ''; toast('WebGL indisponible : plan 2D activé', 3200); } }
  if (!h) h = new Plan2D(opts);
  ui.house = h; h.setActive(ui.tab === 'home'); h.refresh();
}

// ---------------------------------------------------------- confirmation
function askConfirm(msg, label, cb) {
  const el = $('#confirm'); el.querySelector('p').textContent = msg; const yes = el.querySelector('[data-c=yes]'); yes.textContent = label || 'OK';
  el.hidden = false; requestAnimationFrame(() => el.classList.add('open'));
  const done = (ok) => { el.classList.remove('open'); setTimeout(() => { el.hidden = true; }, 200); el.onclick = null; if (ok) cb(); };
  el.onclick = (e) => { const c = e.target.closest('[data-c]'); if (c) done(c.dataset.c === 'yes'); else if (e.target === el) done(false); };
}

// ----------------------------------------------------------- événements
function onClick(e) {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case 'house': sh.openHouse(); break;
    case 'add': sh.openAddMenu(); break;
    case 'menu': sh.openMenu(); break;
    case 'q-temp': sh.openQuick('temp'); break;
    case 'q-lights': sh.openQuick('lights'); break;
    case 'q-sec': setTab('cams'); break;
    case 'q-nrg': setTab('energy'); break;
    case 'room': $('#views').scrollTo({ top: 0, behavior: 'smooth' }); sh.openRoom(id, { dock: true }); break;
    case 'room-modal': sh.openRoom(id, { dock: false }); break;
    case 'tab-rooms': setTab('rooms'); break;
    case 'tab-auto': setTab('auto'); break;
    case 'edit-plan': editor.open(); break;
    case 'reset-view': if (sheets.isOpen()) sheets.close(); else if (ui.house) ui.house.resetView(); break;
    case 'scene':
      if (ui.editScenes) sh.openSceneEditor(id);
      else { store.activateScene(id); t.classList.remove('fire'); void t.offsetWidth; t.classList.add('fire'); }
      break;
    case 'scene-new': sh.openSceneEditor(null); break;
    case 'edit-scenes': ui.editScenes = !ui.editScenes; R.auto(); break;
    case 'auto-new': sh.openAutoEditor(null); break;
    case 'auto-edit': sh.openAutoEditor(id); break;
    case 'auto-run': store.runAutomation(id, true); break;
    case 'auto-toggle': store.toggleAutomation(id); break;
    case 'cam': sh.openCamera(id); break;
    case 'device': if (!e.target.closest('.sw')) sh.openDevice(id, { dock: false }); break;
    case 'sec-lock': store.applyAction({ target: { type: 'lock' }, patch: { locked: true } }); toast('Serrures verrouillées'); break;
    case 'sec-garage': store.applyAction({ target: { type: 'garage' }, patch: { target: 0 } }); toast('Fermeture du garage'); break;
    case 'sec-arm': { const ms = store.state.devices.filter((d) => d.type === 'motion'); const all = ms.every((d) => d.state.armed); store.applyAction({ target: { type: 'motion' }, patch: { armed: !all } }); toast(all ? 'Détecteurs désarmés' : 'Détecteurs armés'); break; }
    default: break;
  }
}

function bind() {
  $('#app').addEventListener('click', onClick);
  $('#tabbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheets.isOpen()) sheets.close(); });
  window.addEventListener('resize', () => { if (ui.house) ui.house.resize(); });
  if (window.ResizeObserver) new ResizeObserver(() => { const st = $('#stage'); if (ui.house && st && st.clientWidth > 0 && st.clientHeight > 0) ui.house.resize(); }).observe($('#stage'));
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ui.installEvt = e; });
  window.addEventListener('appinstalled', () => { ui.installEvt = null; toast('Application installée'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { store.tick(0.001); scheduleRender(); } else store.save(); });
  window.addEventListener('pagehide', () => store.save());

  store.on('device', (id) => { if (ui.house) ui.house.refresh(); scheduleRender(); });
  store.on('scene', () => scheduleRender());
  store.on('toast', (m) => toast(m));
  store.on('change', (what) => {
    if (['devices', 'rooms', 'all'].includes(what) && ui.house) ui.house.rebuild();
    if (what === 'all') mountStage();
    if (['devices', 'rooms', 'all'].includes(what)) renderAll(); else scheduleRender();
  });
  let n = 0;
  store.on('live', () => {
    live(); if (sheets.isOpen()) live($('#sheet-layer'));
    if (ui.house) ui.house.refresh();
    if (++n % 5 === 0) { if (ui.tab === 'energy') R.energy(), live(); if (ui.tab === 'home') { $('#hdr').innerHTML = hdrHTML(store); $('#quick').innerHTML = quickHTML(store); live(); } }
  });
  let lastTick = performance.now();
  setInterval(() => { const now = performance.now(); let dt = Math.min(5, (now - lastTick) / 1000); lastTick = now; while (dt > 0.0005) { const s = Math.min(0.5, dt); store.tick(s); dt -= s; } }, 250); // pas de temps mesuré : suit l'horloge même si les timers sont retardés
}

// ------------------------------------------------------------------ PWA
function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('Service worker :', e));
}

// -------------------------------------------------------------- démarrage
function boot() {
  buildShell(); bind();
  setTab(ui.tab, true);
  mountStage();
  renderAll();
  registerSW();
  requestAnimationFrame(() => { const b = $('#boot'); if (b) { b.classList.add('done'); setTimeout(() => b.remove(), 600); } });
  setTimeout(() => { const h = $('#stage-hint'); if (h) h.style.opacity = 0; }, 6000);
  window.__app = { store, ui, ctx, sheets, setTab, sh, editor, APP };
  document.documentElement.dataset.version = APP.version;
}
window.addEventListener('error', (e) => { console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => console.error(e.reason));
boot();
