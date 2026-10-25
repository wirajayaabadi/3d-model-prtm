import { createDefaultConfig, createPresetConfig, deepClone } from './config/index.js';
import { Engine } from './sim/engine.js';
import { SIM_STEP_SECONDS } from './config/operations.js';
import { PRODUCT_IDS } from './config/products.js';
import { SceneView } from './render/scene.js';
import { snapshotPoses } from './render/animation.js';
import { el, clear, toast } from './ui/dom.js';
import { ID, t, fmtNumber, fmtLiter } from './ui/i18n/en.js';
import { createAppBar } from './ui/controls/appBar.js';
import { createZoomControls } from './ui/controls/zoomControls.js';
import { createKpiCards } from './ui/dashboard/kpiCards.js';
import { createSideCard } from './ui/dashboard/sideCard.js';
import { createListTabs } from './ui/dashboard/listTabs.js';
import { createJourneyCard } from './ui/dashboard/journeyCard.js';
import { createScenarioPanel } from './ui/panels/scenarioPanel.js';
import { createBayPanel } from './ui/panels/bayPanel.js';
import { createGeometryPanel } from './ui/panels/geometryPanel.js';
import { showAbout } from './ui/panels/aboutPanel.js';
import { createDashboard } from './ui/dashboard/dashboard.js';
import { createComparePanel } from './ui/dashboard/comparePanel.js';
import { validateConfig } from './geometry/validation.js';
import { formatSimTime, formatDuration } from './sim/clock.js';

// Aplikasi "menara kendali": engine headless + adegan isometrik + kartu melayang. Semua aksi pengguna melewati
// antarmuka perintah engine. Satu-satunya global: window.__simDebug.getState().
class App {
  constructor() {
    this.presetId = 'baseline';
    this.engine = new Engine(createPresetConfig(this.presetId), { presetId: this.presetId });
    this.running = false;
    this.speed = 1;
    this.actualSpeed = 0;
    this.selection = null;
    this.mode = 'operation';
    this.presentation = false;
    this.notifications = [];
    this.storedRuns = this.loadStoredRuns();
    this.includeAfterHorizon = false;
    this.stepAccumulator = 0;
    this.prevPoses = null;
    this.lastFrame = performance.now();
    this.simAdvancedWindow = { sim: 0, real: 0 };
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pausedByVisibility = false;
    this.$ = (id) => document.getElementById(id);
    this.buildUi();
    this.bindEngineEvents();
    this.initScene();
  }

  // ---------- Adegan ----------
  initScene() {
    const loading = this.$('loading');
    const error = this.$('error');
    try {
      this.view = new SceneView({
        container: this.$('scene'),
        labelsEl: this.$('labels'),
        tooltipEl: this.$('tooltip'),
        engine: this.engine,
        reduceMotion: this.reduceMotion,
        onError: (msg) => this.showError(ID.app.webglError, msg),
        onContextRestored: () => (error.hidden = true),
      });
    } catch (e) {
      console.error('Adegan 3D gagal dimulai', e);
      this.showError(ID.app.webglError, ID.app.webglErrorDetail);
      return;
    }
    this.view.onSelect = (hit) => this.select(hit);
    this.view.onHoverDescribe = (hit) => this.describe(hit);
    this.view.onVisibility = (v) => this.onVisibility(v);
    this.view.labelPadding = { left: 20, right: 330, top: 110, bottom: 200 };
    this.view.resize();
    loading.classList.add('done');
    error.hidden = true;
    this.installDebugHook();
    requestAnimationFrame((ts) => this.frame(ts));
  }
  showError(title, detail) {
    const error = this.$('error');
    error.querySelector('strong').textContent = title;
    error.querySelector('p').textContent = detail;
    const btn = error.querySelector('button');
    btn.textContent = ID.app.retry;
    btn.onclick = () => location.reload();
    error.hidden = false;
    this.$('loading').classList.add('done');
  }

  // ---------- UI ----------
  buildUi() {
    this.appBar = createAppBar(this.$('appbar'), this);
    const notices = this.$('notices');
    this.capacityNotice = el('span', { class: 'notice info' });
    this.horizonNotice = el('span', { class: 'notice info', text: ID.run.horizonReached, hidden: true });
    this.deadlockNotice = el('span', { class: 'notice alert', hidden: true });
    this.hiddenNotice = el('span', { class: 'notice info', text: ID.app.hiddenPaused, hidden: true });
    notices.append(this.horizonNotice, this.deadlockNotice, this.hiddenNotice);
    this.widgets = [
      createKpiCards(this.$('kpis'), this),
      createZoomControls(this.$('zoomctl'), this),
      createSideCard(this.$('side'), this),
      createListTabs(this.$('lists'), this),
      createJourneyCard(this.$('journey'), this),
    ];
    // Bilah mode dan baris kamera (Bagian 19.5)
    const modes = ['operation', 'zones', 'roofsOff', 'oneTruck'];
    this.modeBar = el('nav', { class: 'mode-bar', 'aria-label': ID.app.mode }, ...modes.map((m) => el('button', { 'data-mode': m, 'aria-pressed': String(m === 'operation'), text: ID.modes[m], onClick: () => this.setMode(m) })));
    const cams = ['overview', 'side', 'top', 'bay', 'flight', 'free'];
    this.presBtn = el('button', { text: ID.app.presentation, 'aria-pressed': 'false', onClick: () => this.togglePresentation() });
    this.camRow = el('nav', { class: 'camera-row', 'aria-label': ID.app.view }, el('span', { class: 'caption', text: ID.app.view }), ...cams.map((c) => el('button', { 'data-camera': c, 'aria-pressed': String(c === 'overview'), text: ID.cameras[c], onClick: () => this.setCamera(c) })), el('span', { class: 'muted', text: '·' }), this.presBtn);
    this.$('controls').append(this.modeBar, this.camRow);
    this.$('footer').append(el('span', { text: `${ID.app.footerNote} · ${ID.app.hint} · ${ID.app.notices[2]}` }));
    // Panel lanjutan di dalam laci (semua kontrol Bagian A tetap tersedia)
    this.drawerPanels = {};
    const mk = (key, factories) => {
      const host = el('div', { class: 'drawer-host' });
      this.drawerPanels[key] = { host, panels: factories.map((f) => f(host, this)) };
    };
    mk('params', [createScenarioPanel, createBayPanel]);
    mk('bays', [createBayPanel]);
    mk('geometry', [(h, a) => (this.geometryPanel = createGeometryPanel(h, a))]);
    mk('dashboard', [createDashboard]);
    mk('compare', [createComparePanel]);
    for (const p of Object.values(this.drawerPanels)) p.host.querySelectorAll('.panel').forEach((x) => x.classList.remove('collapsed'));
    this.$('drawer-close').addEventListener('click', () => this.closeDrawer());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.$('drawer').hidden) this.closeDrawer();
        else if (!this.$('modal').hidden) this.$('modal').hidden = true;
        else this.select(null);
      }
    });
    // Laci bawah untuk layar sempit
    const tabs = this.$('drawer-tabs');
    const root = this.$('root');
    const defs = [['side', ID.panels.inspect], ['journey', ID.tower.journey], ['lists', ID.tower.tabs.trucks]];
    for (const [id, label] of defs) {
      const b = el('button', { text: label, onClick: () => {
        const target = this.$(id);
        const wasActive = target.classList.contains('drawer-active');
        for (const [i2] of defs) this.$(i2).classList.remove('drawer-active');
        tabs.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        if (!wasActive) {
          target.classList.add('drawer-active');
          b.classList.add('active');
          root.classList.add('drawer-open');
        } else root.classList.remove('drawer-open');
      } });
      tabs.append(b);
    }
  }
  openDrawer(key) {
    const d = this.$('drawer');
    const body = this.$('drawer-body');
    clear(body);
    const p = this.drawerPanels[key] || this.drawerPanels.params;
    body.append(p.host);
    this.$('drawer-title').textContent = ID.tower.drawers[key] || key;
    d.hidden = false;
    this.openDrawerKey = key;
    this.forceDash = true;
  }
  closeDrawer() {
    this.$('drawer').hidden = true;
    this.openDrawerKey = null;
  }

  // ---------- Notifikasi dari kejadian engine ----------
  bindEngineEvents() {
    if (this._unbind) this._unbind();
    let holdWarned = false;
    this._unbind = this.engine.onEvent((ev) => {
      const push = (text, kind = 'info') => {
        this.notifications.push({ t: this.engine.time, text, kind, read: false });
        if (this.notifications.length > 50) this.notifications.shift();
      };
      if (ev.type === 'deadlock') push(ID.tower.eventTexts.deadlock, 'alert');
      else if (ev.type === 'horizon') push(ID.tower.eventTexts.horizon);
      else if (ev.type === 'protected') push(t('tower.eventTexts.protected', { truck: `TT-${String(ev.truck).padStart(3, '0')}` }), 'warn');
      else if (ev.type === 'bayDeactivate') push(t('tower.eventTexts.bayDeactivate', { bay: String(ev.bay).padStart(2, '0') }), 'warn');
      else if (ev.type === 'bayActivate') push(t('tower.eventTexts.bayActivate', { bay: String(ev.bay).padStart(2, '0') }));
      else if (ev.type === 'arrival' && !holdWarned && this.engine.holding.length > 0) {
        holdWarned = true;
        push(ID.tower.eventTexts.admitHold, 'warn');
      }
    });
  }
  toggleNotifications() {
    const modal = this.$('modal');
    clear(modal);
    const cal = this.engine.config.operations.calendar;
    const items = [...this.notifications].reverse();
    this.notifications.forEach((n) => (n.read = true));
    const kindPill = { info: 'info', warn: 'warn', alert: 'bad' };
    modal.append(el('div', { class: 'box', style: { maxWidth: '520px' } },
      el('div', { class: 'row between' }, el('h2', { text: ID.tower.notifications }), el('button', { text: ID.panels.close, onClick: () => (modal.hidden = true) })),
      items.length ? el('div', {}, ...items.map((n) => el('div', { class: 'row', style: { padding: '6px 0', borderTop: '1px solid var(--line)' } }, el('span', { class: `pill ${kindPill[n.kind] || 'info'}`, text: formatSimTime(n.t, cal).replace(' WIB', '') }), el('span', { text: n.text })))) : el('p', { class: 'note', text: ID.tower.noNotifications }),
    ));
    modal.hidden = false;
    modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };
  }

  // ---------- Kontrol run ----------
  start() {
    if (this.engine.deadlock) return toast(ID.run.deadlock);
    this.running = true;
    this.engine.autoPaused = false;
    this.lastFrame = performance.now();
  }
  pause() { this.running = false; }
  setSpeed(k) { this.speed = k; }
  reset() {
    this.running = false;
    this.engine.reset();
    this.afterEngineChange();
  }
  restoreDefaults() {
    this.presetId = 'baseline';
    this.replaceEngine(createDefaultConfig());
  }
  applyPreset(id) {
    this.presetId = id;
    const cfg = createPresetConfig(id);
    cfg.operations.seed = this.engine.config.operations.seed;
    this.replaceEngine(cfg);
  }
  setSeed(seed) {
    if (!Number.isFinite(seed)) return;
    const cfg = deepClone(this.engine.config);
    cfg.operations.seed = seed >>> 0;
    this.replaceEngine(cfg);
  }
  applyGeometry(cfg) {
    if (this.running) return toast(ID.geometry.pausedOnly), false;
    const errors = validateConfig(cfg);
    if (errors.length) {
      toast(`${ID.params.invalid}: ${errors.map((e) => e.code).join(', ')}`);
      return false;
    }
    try {
      this.replaceEngine(cfg);
      return true;
    } catch (e) {
      toast(String(e.message));
      return false;
    }
  }
  replaceEngine(cfg) {
    this.running = false;
    this.engine = new Engine(cfg, { presetId: this.presetId });
    this.bindEngineEvents();
    this.view?.rebuild(this.engine);
    this.selection = null;
    this.lastTracked = null;
    this.view?.setSelection(null);
    this.afterEngineChange();
  }
  afterEngineChange() {
    this.prevPoses = null;
    this.stepAccumulator = 0;
    this.forceDash = true;
    this.deadlockNotice.hidden = true;
    this.horizonNotice.hidden = true;
    this.lastTracked = null;
    if (this.view) this.view.setCamera('overview');
  }
  refreshTheory() { this.forceDash = true; }
  togglePresentation() {
    this.presentation = !this.presentation;
    this.view?.setPresentation(this.presentation);
  }

  // ---------- Mode, kamera, pemilihan, pencarian ----------
  setMode(mode) {
    this.mode = mode;
    this.view?.setMode(mode);
    if (mode === 'oneTruck' && this.selection?.type !== 'truck') toast(ID.journey.selectTruck);
  }
  setCamera(name) {
    if (this.mode === 'oneTruck') this.setMode('operation');
    this.view?.setCamera(name);
    if (name === 'free') toast(ID.freeCameraHint, 5000);
  }
  zoom(dir) { this.view?.zoom(dir > 0 ? 1.25 : 0.8); }
  focusSelection() {
    if (!this.view?.focusSelection()) toast(ID.truck.none);
  }
  select(sel) {
    if (sel?.type === 'truck') {
      const tr = this.engine.trucks.get(sel.id);
      sel = { ...sel, label: tr?.label };
      this.lastTracked = sel.id;
    }
    this.selection = sel;
    this.view?.setSelection(sel);
  }
  search(q) {
    const e = this.engine;
    const s = (q || '').trim().toLowerCase();
    if (!s) return;
    let sel = null;
    const num = parseInt(s.replace(/[^0-9]/g, ''), 10);
    if (/^(tt|truk|truck)/.test(s) && num) sel = e.trucks.has(num) ? { type: 'truck', id: num } : null;
    else if (/^bay/.test(s) && num >= 1 && num <= e.bays.length) sel = { type: 'bay', number: num };
    else if (/^stall/.test(s) && num >= 1 && num <= e.stalls.length) sel = { type: 'stall', index: num - 1 };
    else {
      const pid = PRODUCT_IDS.find((p) => e.config.products[p].name.toLowerCase() === s || p.toLowerCase() === s);
      if (pid) {
        const tr = [...e.trucks.values()].find((x) => x.product === pid && x.spawned);
        if (tr) sel = { type: 'truck', id: tr.id };
      } else if (num && e.trucks.has(num)) sel = { type: 'truck', id: num };
    }
    if (!sel) return toast(ID.tower.noResult);
    this.select(sel);
    this.focusSelection();
  }
  describe(hit) {
    const e = this.engine;
    if (hit?.type === 'bay') {
      const b = e.bays[hit.number - 1];
      const truck = b.truckId ? e.trucks.get(b.truckId)?.label : null;
      return { title: `Bay ${String(b.number).padStart(2, '0')}`, text: `${ID.bay.states[b.displayState]}${truck ? ` · ${truck}` : ''}` };
    }
    if (hit?.type === 'truck') {
      const tr = e.trucks.get(hit.id);
      if (!tr) return null;
      return { title: tr.label, text: `${ID.truck.states[tr.state]} · ${e.config.products[tr.product].name}` };
    }
    if (hit?.type === 'stall') {
      const st = e.stalls[hit.index];
      const truck = st.truckId ? e.trucks.get(st.truckId)?.label : null;
      return { title: `Stall ${st.number}`, text: truck ? `${ID.tower.stallOccupied} · ${truck}` : ID.tower.stallFree };
    }
    return null;
  }
  showAbout() {
    showAbout(this.$('modal'), {
      assumptions: [`${ID.geometry.effectiveCapacity}: ${this.engine.effectiveCapacity} stall (${ID.geometry.targetCapacity} ${this.engine.config.operations.targetWaitingCapacity}).`],
      limitations: this.engine.geometryReport.allFeasible ? [] : [t('geometry.someInfeasible', { n: '…' })],
    });
  }
  onVisibility(visible) {
    if (!visible && this.running) {
      this.running = false;
      this.pausedByVisibility = true;
    } else if (visible && this.pausedByVisibility) {
      this.pausedByVisibility = false;
      this.running = true;
      this.lastFrame = performance.now();
      this.hiddenNotice.hidden = false;
      clearTimeout(this._hiddenTimer);
      this._hiddenTimer = setTimeout(() => (this.hiddenNotice.hidden = true), 5000);
    }
  }

  // ---------- Perbandingan ----------
  storeRun() {
    if (!this.engine.horizonReached) toast(ID.compare.empty);
    const s = this.engine.summary();
    delete s.bays;
    delete s.unfinished;
    this.storedRuns.push(s);
    if (this.storedRuns.length > 6) this.storedRuns.shift();
    try { localStorage.setItem('itj-runs', JSON.stringify(this.storedRuns)); } catch {}
  }
  clearRuns() {
    this.storedRuns = [];
    try { localStorage.removeItem('itj-runs'); } catch {}
  }
  loadStoredRuns() {
    try { return JSON.parse(localStorage.getItem('itj-runs') || '[]'); } catch { return []; }
  }

  installDebugHook() {
    Object.defineProperty(window, '__simDebug', {
      value: { getState: () => ({ ...this.view.getDebugState(), running: this.running, speed: this.speed, actualSpeed: this.actualSpeed, presetId: this.presetId, mode: this.mode, selection: this.selection, clock: formatSimTime(this.engine.time, this.engine.config.operations.calendar), counts: this.engine.liveCounts(), rho: this.engine.theory.rho, horizonReached: this.engine.horizonReached, deadlock: !!this.engine.deadlock, logHash: this.engine.logHash.toString(16), drawer: this.openDrawerKey || null, notifications: this.notifications.length }) },
      configurable: true,
    });
  }

  // ---------- Loop utama ----------
  frame(ts) {
    const dtReal = Math.min(0.25, (ts - this.lastFrame) / 1000);
    this.lastFrame = ts;
    const e = this.engine;
    let alpha = 1;
    if (this.running && this.view.visible) {
      this.stepAccumulator += (dtReal * this.speed) / SIM_STEP_SECONDS;
      const steps = Math.floor(this.stepAccumulator);
      const budgetMs = 28;
      const t0 = performance.now();
      const simBefore = e.time;
      if (steps > 0) {
        this.prevPoses = snapshotPoses(e);
        let done = 0;
        while (done < steps && performance.now() - t0 < budgetMs && !e.autoPaused) {
          e.step();
          done++;
        }
        this.stepAccumulator -= done;
        if (performance.now() - t0 >= budgetMs) this.stepAccumulator = Math.min(this.stepAccumulator, 1);
      }
      this.simAdvancedWindow.sim += e.time - simBefore;
      this.simAdvancedWindow.real += dtReal;
      if (this.simAdvancedWindow.real >= 0.5) {
        this.actualSpeed = this.simAdvancedWindow.sim / this.simAdvancedWindow.real;
        this.simAdvancedWindow = { sim: 0, real: 0 };
      }
      alpha = Math.min(1, this.stepAccumulator);
      if (e.autoPaused) {
        this.running = false;
        e.autoPaused = false;
        if (e.deadlock) {
          this.deadlockNotice.textContent = `${ID.run.deadlock}. ${t('run.deadlockDetail', { trucks: e.deadlock.trucks.map((id) => `TT-${String(id).padStart(3, '0')}`).join(', ') })}`;
          this.deadlockNotice.hidden = false;
          this.select({ type: 'truck', id: e.deadlock.trucks[0] });
        } else if (e.horizonReached) {
          this.horizonNotice.hidden = false;
          this.forceDash = true;
        }
      }
    } else this.actualSpeed = 0;
    this.view.update(this.prevPoses, alpha, dtReal, { clock: formatSimTime(e.time, e.config.operations.calendar), running: this.running });
    this.appBar.update();
    for (const w of this.widgets) w.update();
    if (this.openDrawerKey) for (const p of this.drawerPanels[this.openDrawerKey].panels) p.update();
    this.modeBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === this.mode)));
    const cam = this.view.rig.mode;
    this.camRow.querySelectorAll('button[data-camera]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.camera === cam)));
    this.presBtn.setAttribute('aria-pressed', String(this.presentation));
    requestAnimationFrame((ts2) => this.frame(ts2));
  }
}

document.fonts.ready.then(() => new App());
