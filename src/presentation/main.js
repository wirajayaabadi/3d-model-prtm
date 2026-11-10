// Website presentasi 3D: satu dunia Three.js (peta Indonesia, diorama grup, terminal simulasi, papan BMC, SPBU)
// yang dijelajahi seperti slide. Engine simulasi dan SceneView dipakai ulang tanpa perubahan perilaku; langkah
// presentasi adalah data (story/steps.js), teks dua bahasa ada di content/.
import * as THREE from 'three';
import { createPresetConfig } from '../config/index.js';
import { Engine } from '../sim/engine.js';
import { SIM_STEP_SECONDS } from '../config/operations.js';
import { SceneView } from '../render/scene.js';
import { snapshotPoses } from '../render/animation.js';
import { formatSimTime } from '../sim/clock.js';
import { ID } from '../ui/i18n/en.js';
import { el, toast } from '../ui/dom.js';
import { CONTENT, pickLanguage } from './content/index.js';
import { STEPS, ACTIVE_CHAPTERS } from './story/steps.js';
import { StoryEngine } from './story/engine.js';
import { renderCard, renderLightbox } from './ui/card.js';
import { createSimPanel } from './ui/simPanel.js';
import { startNotesView } from './ui/presenterNotes.js';
import { buildChrome } from './ui/chrome.js';
import { renderHero, renderCoverBackdrop, showChapterIntro, hideChapterIntro } from './ui/hero.js';
import { buildIndonesiaMap } from './scenes/indonesiaMap.js';
import { buildHolding } from './scenes/holding.js';
import { buildCanvasBoard } from './scenes/canvasBoard.js';
import { buildValueChainFlow, buildStakeholderRing } from './scenes/valueChain.js';
import { buildSpbu } from './scenes/spbu.js';
import { buildHighlights } from './scenes/highlights.js';
import { buildTruckShow } from './scenes/truckShow.js';
import { applySunsetStyle } from './worldStyle.js';
import { createTruckPanel, createTruckTags } from './ui/truckPanel.js';
import { MAP, HOLDING, BMC, ISO, MAP_DIR, SKY_DIR, lonLat, terminalCenter, GEO } from './world.js';
import { bboxToWorld } from './scenes/indonesiaMap.js';
import { registerOffline } from '../offline/register.js';

const SEED = 20261025;
const BG_PRESETS = ['baseline', 'arrivalPlus50', 'turboShift'];
const BG_HOURS = 6;
const FOG = { terminal: [700, 1900], holding: [1100, 3000], map: [2400, 6500], truck: [70, 330] };

function presetEngine(presetId) {
  const cfg = createPresetConfig(presetId);
  cfg.operations.seed = SEED;
  return new Engine(cfg, { presetId });
}

// Simulasi latar belakang untuk tabel perbandingan bab 5: tiga preset, 6 jam, dicicil per frame.
class BackgroundRuns {
  constructor() {
    this.runs = {};
    this.queue = [...BG_PRESETS];
    this.engine = null;
  }
  tick(budgetMs) {
    const id = this.queue[0];
    if (!id) return;
    if (!this.engine) {
      this.engine = presetEngine(id);
      const th = this.engine.theory;
      this.runs[id] = { theory: { mu: th.mu, rho: th.rho, status: th.status }, progress: 0 };
    }
    const e = this.engine, target = BG_HOURS * 3600, t0 = performance.now();
    while (e.time < target && !e.deadlock && performance.now() - t0 < budgetMs) e.stepMany(60);
    this.runs[id].progress = Math.min(1, e.time / target);
    if (e.time >= target || e.deadlock) {
      this.runs[id].summary = e.summary();
      this.engine = null;
      this.queue.shift();
    }
  }
}

class App {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.lang = pickLanguage();
    this.content = CONTENT[this.lang];
    document.documentElement.lang = this.lang;
    this.mode = 'presenter';
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.presetId = 'baseline';
    this.engine = presetEngine(this.presetId);
    this.running = true;
    this.speed = 1;
    this.stepAccumulator = 0;
    this.prevPoses = null;
    this.fastForwardTo = null;
    this.lastFrame = performance.now();
    this.fog = { near: 700, far: 1900 };
    this.fogTarget = [700, 1900];
    this.labelDefs = [];
    this.labelGroups = new Set();
    this.mapNav = { region: null, province: null, query: '', matches: [] };
    this.objectCard = null;
    this.simPanel = null;
    this.detailPinned = false;
    this.detailOpen = false;
    this.drift = { goal: null, since: 0 };
    this.bg = new BackgroundRuns();
    this.bgStartAt = performance.now() + 2500;
    this.story = new StoryEngine({ onApply: (s, ctx) => this.applyStep(s, ctx), onChange: () => this.chrome?.update(), chapters: this.content.chapters });
    this.chrome = buildChrome(this);
    this.buildMapNav();
    this.initScene();
  }

  // ---------- Adegan ----------
  initScene() {
    const loading = this.$('loading');
    try {
      this.view = new SceneView({
        container: this.$('scene'),
        labelsEl: this.$('labels'),
        tooltipEl: this.$('tooltip'),
        engine: this.engine,
        reduceMotion: this.reduceMotion,
        onError: (msg) => this.showError(this.content.ui.webglError, msg === true ? this.content.ui.webglErrorDetail : msg),
        onContextRestored: () => (this.$('error').hidden = true),
      });
    } catch (e) {
      console.error('Adegan 3D gagal dimulai', e);
      this.showError(this.content.ui.webglError, this.content.ui.webglErrorDetail);
      return;
    }
    const rig = this.view.rig;
    rig.arrowKeys = false;
    rig.keysEnabled = false;
    rig.boundless = true;
    rig.bounds = null;
    rig.camera.far = 8000;
    rig.camera.updateProjectionMatrix();
    rig.controls.maxDistance = 3000;
    this.view.labelPadding = { left: 16, right: 24, top: 84, bottom: 96 };
    this.styleWorld();
    this.view.onSelect = (hit) => this.onSceneSelect(hit);
    this.view.onHoverDescribe = (hit) => this.describe(hit);
    this.view.resize();
    this.buildWorld();
    this.installInput();
    this.story.start();
    loading.classList.add('done');
    requestAnimationFrame((ts) => this.frame(ts));
  }

  showError(title, detail) {
    const error = this.$('error');
    error.querySelector('strong').textContent = title;
    error.querySelector('p').textContent = detail;
    const btn = error.querySelector('button');
    btn.textContent = this.content.ui.retry;
    btn.onclick = () => location.reload();
    error.hidden = false;
    this.$('loading').classList.add('done');
  }

  buildWorld() {
    const { scene, M, renderer } = this.view;
    const layout = this.engine.layout, config = this.engine.config;
    // Tanah jauh di bawah seluruh dunia (peta, diorama, SPBU)
    const far = new THREE.Mesh(new THREE.PlaneGeometry(4400, 1200).rotateX(-Math.PI / 2), M.ground); // barat: peta dan diorama; timur: panggung truk
    far.position.set(0, -0.3, 60);
    scene.add(far);
    this.map = buildIndonesiaMap({ M, renderer });
    this.holding = buildHolding({ M });
    this.bmc = buildCanvasBoard({ renderer, texts: this.content.bmc });
    this.flow = buildValueChainFlow();
    const W = layout.plot.width, L = layout.plot.length;
    this.ringCenter = new THREE.Vector3(85, 0, 26);
    this.ring = buildStakeholderRing({ center: this.ringCenter, radius: 400, stakeholders: this.content.stakeholders });
    this.spbu = buildSpbu({ M, renderer, layout, config, scene });
    this.hl = buildHighlights({ layout, config, M });
    this.truck = buildTruckShow({ M, products: config.products });
    this.truckTags = createTruckTags(this.$('trucktags'), { truck: this.truck, onPart: (key) => this.focusTruckPart(this.truck.state.part === key ? null : key), onComp: (i) => this.truck.select(i) });
    for (const g of [this.map.group, this.holding.group, this.bmc.group, this.flow.group, this.ring.group, this.spbu.group, this.hl.group, this.truck.group]) scene.add(g);
    this.bmc.setAnchors({ ...this.hl.anchors, spbu: this.spbu.anchor });
    this.pickables = [...this.map.pickables, ...this.holding.pickables, ...this.bmc.pickables, ...this.ring.pickables, ...this.spbu.pickables, ...this.truck.pickables];
    this.buildLabelDefs();
  }

  // Definisi label HTML terproyeksi per kelompok; dibangun ulang saat bahasa berganti.
  buildLabelDefs() {
    const c = this.content;
    const defs = [];
    const add = (group, key, anchor, title, meta = '', kind = 'pin') => defs.push({ group, key: `p:${group}:${key}`, anchor, title, meta, kind });
    for (const [k, r] of Object.entries(this.map.regions)) add('regions', k, r.center, c.map.regions[k], '', 'region');
    for (const p of this.map.provinces) add(`prov:${p.region}`, p.id, p.center, p.name, '', 'prov');
    for (const [k, p] of Object.entries(this.map.pins)) {
      if (k === 'itj') add('pins', k, p.pos, c.map.itj, c.map.itjMeta);
      else if (p.kind === 'refinery') add('pins', k, p.pos, `${c.map.refinery} ${c.map.refineries[k]}`);
      else if (p.kind === 'field') add('pins', k, p.pos, c.map.fields[k]);
      else if (k === 'singapore') add('imports', k, p.pos, c.map.singapore, c.map.importMeta);
      else if (k === 'melaka') add('imports', k, p.pos, c.map.melaka, c.map.importMeta);
      else if (k === 'port') add('java', k, p.pos, c.map.port);
      else if (k === 'pipeline') add('java', k, p.pos, c.map.pipeline);
    }
    for (const [k, p] of Object.entries(this.map.pins.serviceArea)) add('java', `svc-${k}`, p, c.map.serviceArea[k]);
    add('holding', 'holding', this.holding.anchors.holding, c.holding.holding[0], c.holding.holding[1]);
    add('holding', 'owner', this.holding.anchors.owner, c.holding.owner[0], c.holding.owner[1]);
    for (const [k, v] of Object.entries(c.holding.units)) add('holding', k, this.holding.anchors[k], v[0], v[1]);
    add('holding', 'merger', this.holding.anchors.merger, c.holding.merger);
    for (const [k, v] of Object.entries(c.map.stages)) add('stages', k, this.flow.stageAnchors[k], v[0], v[1]);
    for (const s of c.stakeholders) add('ring', s.key, this.ring.anchors[s.key], s.name, c.stakeholderGroups[s.group]);
    for (const [k, v] of Object.entries(c.areas)) {
      const a = k === 'spbu' ? this.spbu.anchor : this.hl.labelAnchors[k];
      if (a) add(`area:${k}`, k, a, v[0], v[1]);
    }
    // Buang label lama dari kelompok presentasi lalu daftarkan yang baru
    for (const [key, l] of [...this.view.labels.labels]) if (key.startsWith('p:')) {
      l.el.remove();
      this.view.labels.labels.delete(key);
    }
    for (const d of defs) this.view.labels.ensure(d.key, { title: d.title, meta: d.meta, kind: d.kind });
    this.labelDefs = defs;
  }
  updateLabels() {
    for (const d of this.labelDefs) this.view.labels.set(d.key, d.anchor, this.labelGroups.has(d.group));
  }

  // ---------- Langkah ----------
  cameraGoal(step) {
    const cam = step.cam;
    if (cam.kind === 'truck') return this.truck.cameraGoal(cam);
    const layout = this.engine.layout;
    const off = new THREE.Vector3(...(cam.offset || [0, 0, 0]));
    const tgt = new THREE.Vector3(), pos = new THREE.Vector3();
    let dir = ISO;
    switch (cam.kind) {
      case 'sky':
        tgt.copy(terminalCenter(layout)).add(off);
        dir = SKY_DIR;
        break;
      case 'terminal':
        tgt.copy(terminalCenter(layout)).add(off);
        break;
      case 'map':
        tgt.set(MAP.cx + 20, 0, MAP.cz + 30).add(off);
        dir = MAP_DIR;
        break;
      case 'mapAt':
        tgt.copy(lonLat(cam.lonLat[0], cam.lonLat[1])).add(off);
        dir = MAP_DIR;
        break;
      case 'holding':
        tgt.set(HOLDING.cx, 6, HOLDING.cz).add(off);
        break;
      case 'focus': {
        const a = this.hl.anchors[cam.anchor] || terminalCenter(layout);
        tgt.copy(a).setY(2).add(off);
        break;
      }
      case 'bmc':
        tgt.set(BMC.cx - 20, BMC.cy - 2, BMC.cz + 20).add(off);
        break;
      case 'trip':
        tgt.copy(this.spbu.trip.pos).setY(2);
        break;
      default:
        tgt.copy(terminalCenter(layout));
    }
    pos.copy(tgt).addScaledVector(dir, cam.dist || 300);
    return { pos, tgt };
  }
  fogFor(step) {
    const k = step.cam.kind;
    if (k === 'map' || k === 'mapAt') return FOG.map;
    if (k === 'holding') return FOG.holding;
    if (k === 'truck') return FOG.truck;
    return FOG.terminal;
  }

  applyStep(step, ctx = {}) {
    this.currentStep = step;
    this.objectCard = null;
    this.mapNav = { region: null, province: null, query: '', matches: [] };
    this.map.setSelected(null);
    this.map.setFilter(null);
    const layers = new Set(step.layers || []);
    this.map.setLayer('imports', layers.has('imports'));
    this.map.setLayer('outlets', layers.has('outlets'));
    this.map.setLayer('java', layers.has('java'));
    this.bmc.group.visible = layers.has('bmc');
    this.bmc.setActive(layers.has('bmc') ? step.bmc || [] : []);
    this.flow.group.visible = layers.has('flow');
    this.holding.setFlow(layers.has('holdingFlow'));
    this.ring.group.visible = layers.has('ring');
    this.hl.show(step.highlight || []);
    // Bab Truk: mode adegan, dan seret kiri memutar truk (di langkah lain seret kiri menggeser tampilan)
    this.truck.setMode(step.truck || null);
    if (step.truck) this.truck.group.visible = true;
    this.truckHideAt = step.truck ? null : performance.now() + (ctx.immediate ? 0 : 3000); // tetap terlihat selama kamera terbang menjauh
    const controls = this.view.rig.controls, orbit = !!step.truck;
    controls.mouseButtons.LEFT = orbit ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    controls.touches.ONE = orbit ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
    this.view.setMode(step.roofs ? 'roofsOff' : step.zones ? 'zones' : 'operation');
    // Kelompok label yang tampil
    const g = new Set();
    const k = step.cam.kind;
    if (k === 'map' || k === 'mapAt') {
      if (layers.has('pins') && !layers.has('java') && !layers.has('flow')) g.add('pins');
      if (layers.has('imports')) g.add('imports');
      if (layers.has('flow')) g.add('stages');
      if (layers.has('java')) {
        g.add('java');
        g.add('pins');
        g.add('prov:jawa');
      }
      if (!layers.has('flow') && !layers.has('java')) g.add('regions');
    }
    if (k === 'holding') g.add('holding');
    if (layers.has('ring')) g.add('ring');
    for (const h of step.highlight || []) g.add(`area:${h}`);
    if (step.trip) g.add('area:spbu');
    this.labelGroups = g;
    // Simulasi
    if (step.sim) this.applySim(step.sim);
    // Perjalanan truk ke SPBU
    if (step.trip === true) this.spbu.trip.start();
    else if (step.trip !== 'hold') this.spbu.trip.stop();
    // Kamera dan kabut
    const goal = this.cameraGoal(step);
    const dist = this.view.rig.camera.position.distanceTo(goal.pos);
    const rate = dist > 900 ? 1.5 : dist > 300 ? 2.0 : 2.8;
    this.view.rig.flyTo(goal.pos, goal.tgt, { rate, immediate: ctx.immediate });
    this.fogTarget = this.fogFor(step);
    if (ctx.immediate) {
      this.fog.near = this.fogTarget[0];
      this.fog.far = this.fogTarget[1];
    }
    this.view.setSelection(null);
    this.drift = { goal, since: null };
    this.applyAccent(step.ch);
    this.renderStepCard();
    this.renderHeroLayer();
    renderCoverBackdrop(this.$('coverbg'), step.id === 'b0.cover');
    document.body.classList.toggle('cover-step', step.id === 'b0.cover');
    document.body.classList.toggle('truck-step', !!step.truck);
    const first = this.story.positionInChapter().n === 1;
    if (first && ctx.dir === 1 && !ctx.immediate && step.ch > 0 && !this.reduceMotion) showChapterIntro(this.$('intro'), { content: this.content, lang: this.lang, ch: step.ch });
    else hideChapterIntro(this.$('intro'));
    this.setDetail(this.detailPinned || !!step.panel);
    this.renderMapNav();
  }

  applySim({ preset, minute, speed }) {
    const target = minute * 60;
    const e = this.engine;
    if (preset !== this.presetId || e.time > target + 1800 || e.deadlock) this.replaceEngine(preset);
    if (this.engine.time < target) this.fastForwardTo = target;
    this.speed = speed || 1;
    this.running = true;
  }
  replaceEngine(presetId) {
    this.presetId = presetId;
    this.engine = presetEngine(presetId);
    this.view.rebuild(this.engine);
    this.view.rig.bounds = null;
    this.prevPoses = null;
    this.stepAccumulator = 0;
  }
  reapplyCamera() {
    if (!this.currentStep) return;
    const goal = this.cameraGoal(this.currentStep);
    this.view.rig.flyTo(goal.pos, goal.tgt, { rate: 2.8 });
    if (this.mode === 'explore') this.exploreAfterFlight = true;
  }

  // ---------- Hero, panel detail, gaya dunia ----------
  renderHeroLayer() {
    const step = this.currentStep;
    if (!step) return;
    renderHero(this.$('hero'), { content: this.content, lang: this.lang, step, data: this.content.steps[step.id], position: this.story.positionInChapter(), onPhoto: (k, list) => this.openPhoto(k, list) });
  }
  setDetail(open) {
    this.detailOpen = open;
    document.body.classList.toggle('detail-open', open);
    // Adegan digeser ke kanan-atas agar tidak tertutup teks hero di kiri bawah
    this.view.labelPadding = { left: 16, right: open ? 440 : 24, top: 84, bottom: 96, shiftY: 0.09 };
    this.view.resize();
    this.chrome?.update();
  }
  toggleDetail() {
    const open = !this.detailOpen;
    this.detailPinned = open;
    if (!open && this.objectCard) {
      this.objectCard = null;
      this.renderStepCard();
    }
    this.setDetail(open);
  }
  styleWorld() {
    applySunsetStyle(this.view);
  }
  // Satu warna aksen per bab (kicker, kartu angka pertama, posisi langkah)
  applyAccent(ch) {
    const ACCENT = ['#0067B3', '#0067B3', '#3FA587', '#5A5FB0', '#F07C00', '#E31E2D', '#4E9A2F', '#8E44AD'];
    document.body.style.setProperty('--accent', ACCENT[ch] || ACCENT[0]);
  }

  // ---------- Kartu ----------
  renderStepCard() {
    const step = this.currentStep;
    const data = this.content.steps[step.id];
    if (step.truck) this.simPanel = createTruckPanel({ content: this.content, lang: this.lang, mode: step.truck, truck: this.truck, products: this.engine.config.products, onFocus: (key) => this.focusTruckPart(key) });
    else this.simPanel = step.panel ? createSimPanel({ content: this.content, mode: step.panel, lang: this.lang, getEngine: () => this.engine, getRuns: () => this.bg.runs }) : null;
    renderCard(this.$('card'), {
      content: this.content,
      step,
      data,
      chapter: this.content.chapters[step.ch],
      position: this.story.positionInChapter(),
      simPanel: this.simPanel?.root,
      panelFirst: !!step.truck,
      onPhoto: (key, list) => this.openPhoto(key, list),
      lang: this.lang,
    });
    this.$('card').scrollTop = 0;
    this.simPanel?.update(true);
  }
  showObjectCard(key) {
    const data = this.content.objects[key];
    if (!data) return;
    this.objectCard = key;
    this.simPanel = null;
    this.setDetail(true);
    renderCard(this.$('card'), {
      content: this.content,
      step: this.currentStep,
      data,
      chapter: this.content.chapters[this.currentStep.ch],
      position: this.story.positionInChapter(),
      objectMode: true,
      onBack: () => {
        this.objectCard = null;
        this.renderStepCard();
      },
      onPhoto: (k, list) => this.openPhoto(k, list),
      lang: this.lang,
    });
    this.$('card').scrollTop = 0;
  }
  // Bab Truk: pilih satu bagian (kamera mendekat) atau kembali ke seluruh truk
  focusTruckPart(key) {
    const step = this.currentStep;
    if (!step?.truck) return;
    this.truck.setPart(key);
    const goal = key ? this.truck.cameraGoal({ part: key }) : this.cameraGoal(step);
    this.view.rig.flyTo(goal.pos, goal.tgt, { rate: 2.6 });
    this.drift = { goal, since: null };
  }
  onTruckPick(key) {
    const mode = this.currentStep?.truck;
    if (!mode) return;
    const i = +key.split(':')[2];
    if (mode === 'load') this.truck.select(i);
    else if (mode === 'parts') this.focusTruckPart('tank');
  }
  openPhoto(key, list) {
    this.lightbox = { key, list };
    renderLightbox(this.$('lightbox'), { content: this.content, key, list, onClose: () => this.closePhoto(), onNav: (k) => this.openPhoto(k, list) });
  }
  closePhoto() {
    this.lightbox = null;
    this.$('lightbox').hidden = true;
  }

  // ---------- Pemilih peta (klik pulau → zoom, klik provinsi → pilih; breadcrumb dan pencarian) ----------
  isMapStep() {
    const k = this.currentStep?.cam.kind;
    return k === 'map' || k === 'mapAt';
  }
  frameBBox(world, pad = 1.2) {
    const w = world.max.x - world.min.x, h = world.max.z - world.min.z;
    const cam = this.view.rig.camera, fr = this.view.rig.frame;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const freeFrac = Math.max(0.3, (fr.w - fr.left - fr.right) / fr.w);
    const dist = Math.max(120, Math.max(w / (2 * tanV * cam.aspect * freeFrac), h / (2 * tanV * 0.7)) * pad + 40);
    return { pos: world.center.clone().addScaledVector(MAP_DIR, dist), tgt: world.center.clone() };
  }
  setRegionLabels(region) {
    const g = new Set([...this.labelGroups].filter((x) => x !== 'regions' && !x.startsWith('prov:')));
    if (region) g.add(`prov:${region}`);
    else if (this.isMapStep()) g.add('regions');
    this.labelGroups = g;
  }
  onProvinceClick(id) {
    const p = this.map.provinces.find((x) => x.id === id);
    if (!p) return;
    if (this.mapNav.region !== p.region) {
      this.mapNav.region = p.region;
      this.mapNav.province = null;
      this.map.setSelected(null);
      const g = this.frameBBox(this.map.regions[p.region].world, 1.15);
      this.view.rig.flyTo(g.pos, g.tgt, { rate: 2.6 });
      this.setRegionLabels(p.region);
      if (this.objectCard) {
        this.objectCard = null;
        this.renderStepCard();
      }
    } else {
      this.mapNav.province = id;
      this.map.setSelected(id);
      const g = this.frameBBox(p.world, 1.3);
      this.view.rig.flyTo(g.pos, g.tgt, { rate: 2.6 });
      this.showProvinceCard(p);
    }
    this.renderMapNav();
  }
  mapBack() {
    if (this.mapNav.province) {
      this.mapNav.province = null;
      this.map.setSelected(null);
      const g = this.frameBBox(this.map.regions[this.mapNav.region].world, 1.15);
      this.view.rig.flyTo(g.pos, g.tgt, { rate: 2.6 });
      this.objectCard = null;
      this.renderStepCard();
    } else if (this.mapNav.region) {
      this.mapNav.region = null;
      this.setRegionLabels(null);
      if (this.isMapStep()) this.reapplyCamera();
      else {
        const g = this.frameBBox(bboxToWorld([95, -11, 141, 6]), 1.05);
        this.view.rig.flyTo(g.pos, g.tgt, { rate: 2.2 });
      }
    }
    this.renderMapNav();
  }
  mapSearch(q) {
    this.mapNav.query = q;
    const s = q.trim().toLowerCase();
    if (!s) {
      this.map.setFilter(null);
      this.mapNav.matches = [];
    } else {
      const c = this.content.map;
      const ids = new Set();
      for (const p of this.map.provinces) if (p.name.toLowerCase().includes(s) || c.regions[p.region].toLowerCase().includes(s)) ids.add(p.id);
      for (const [k, pin] of Object.entries(this.map.pins)) {
        if (!pin.lonLat) continue;
        const label = (c.refineries[k] || c.fields[k] || (k === 'itj' ? c.itj : '') || '').toLowerCase();
        if (label && (label.includes(s) || `${c.refinery} ${label}`.toLowerCase().includes(s))) {
          const pr = this.map.provinceAt(pin.lonLat[0], pin.lonLat[1]);
          if (pr) ids.add(pr.id);
        }
      }
      this.map.setFilter(ids);
      this.mapNav.matches = [...ids];
    }
    this.renderMapNav(true);
  }
  mapSearchSubmit() {
    const first = this.mapNav.matches[0];
    if (!first) return;
    const p = this.map.provinces.find((x) => x.id === first);
    this.mapNav.region = p.region;
    this.setRegionLabels(p.region);
    this.onProvinceClick(p.id);
  }
  showProvinceCard(p) {
    if (!p) return;
    const c = this.content.map, ui = this.content.ui;
    const here = (lonLat) => this.map.provinceAt(lonLat[0], lonLat[1])?.id === p.id;
    const facilities = [];
    for (const [k, pin] of Object.entries(this.map.pins)) {
      if (!pin.lonLat || !here(pin.lonLat)) continue;
      const name = k === 'itj' ? c.itj : pin.kind === 'refinery' ? `${c.refinery} ${c.refineries[k]}` : c.fields[k];
      facilities.push(`${c.kinds[pin.kind]} · ${name}`);
    }
    const terminals = GEO.terminals.filter((t) => here(t)).length;
    if (terminals) facilities.push(`${terminals} ${c.terminalMeta}`);
    const service = ['jakarta-raya', 'jawa-barat', 'banten'].includes(p.id);
    this.objectCard = `prov:${p.id}`;
    this.simPanel = null;
    this.setDetail(true);
    renderCard(this.$('card'), {
      content: this.content,
      step: this.currentStep,
      data: {
        title: p.name,
        lead: `${c.region}: ${c.regions[p.region]}.${service ? ` ${c.serviceNote}` : ''}`,
        facts: [{ k: c.facilities, v: facilities.length ? facilities.join(' · ') : c.noFacilities }],
        sources: [c.boundaryNote],
      },
      chapter: this.content.chapters[this.currentStep.ch],
      position: this.story.positionInChapter(),
      objectMode: true,
      onBack: () => this.mapBack(),
      onPhoto: () => {},
      lang: this.lang,
    });
    this.$('card').scrollTop = 0;
  }
  buildMapNav() {
    const nav = this.$('mapnav');
    const ui = this.content.ui;
    nav.innerHTML = '';
    this.mapNavEls = {
      crumbs: el('div', { class: 'crumbs' }),
      input: el('input', { type: 'search', placeholder: ui.mapSearch, 'aria-label': ui.mapSearch, value: this.mapNav.query }),
      hint: el('div', { class: 'hint', text: ui.mapHint }),
    };
    this.mapNavEls.input.addEventListener('input', (e) => this.mapSearch(e.target.value));
    this.mapNavEls.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.mapSearchSubmit();
      if (e.key === 'Escape') {
        e.target.value = '';
        this.mapSearch('');
        e.target.blur();
      }
      e.stopPropagation();
    });
    nav.append(this.mapNavEls.crumbs, el('div', { class: 'search' }, this.mapNavEls.input), this.mapNavEls.hint);
  }
  renderMapNav(keepInput = false) {
    const nav = this.$('mapnav');
    const show = this.isMapStep() || !!this.mapNav.region;
    nav.hidden = !show;
    if (!show) return;
    const ui = this.content.ui, c = this.content.map;
    const { crumbs, input, hint } = this.mapNavEls;
    crumbs.innerHTML = '';
    crumbs.append(el('button', { type: 'button', onClick: () => { this.mapNav.province = null; this.mapNav.region = null; this.map.setSelected(null); this.setRegionLabels(null); if (this.isMapStep()) this.reapplyCamera(); this.objectCard = null; this.renderStepCard(); this.renderMapNav(); }, text: ui.mapRoot }));
    if (this.mapNav.region) {
      const r = this.map.regions[this.mapNav.region];
      crumbs.append(el('span', { class: 'sep', text: '›' }));
      const regionEl = this.mapNav.province
        ? el('button', { type: 'button', onClick: () => this.mapBack(), text: c.regions[this.mapNav.region] })
        : el('span', { class: 'cur' }, el('i', { class: 'sw', style: { background: r.color } }), c.regions[this.mapNav.region]);
      crumbs.append(regionEl);
    }
    if (this.mapNav.province) {
      const p = this.map.provinces.find((x) => x.id === this.mapNav.province);
      crumbs.append(el('span', { class: 'sep', text: '›' }), el('span', { class: 'cur' }, el('i', { class: 'sw', style: { background: this.map.regions[p.region].color } }), p.name));
    }
    if (this.mapNav.region) crumbs.append(el('button', { type: 'button', class: 'back', onClick: () => this.mapBack(), text: `← ${ui.mapBack}` }));
    if (!keepInput) input.value = this.mapNav.query;
    const q = this.mapNav.query.trim();
    hint.textContent = q ? (this.mapNav.matches.length ? `${this.mapNav.matches.length} · ${this.mapNav.matches.map((id) => this.map.provinces.find((x) => x.id === id).name).slice(0, 4).join(', ')}${this.mapNav.matches.length > 4 ? '…' : ''}` : ui.mapNoMatch) : ui.mapHint;
    hint.classList.toggle('none', !!q && !this.mapNav.matches.length);
  }

  // ---------- Interaksi ----------
  installInput() {
    const canvas = this.view.canvas;
    let down = null;
    canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }), { capture: true });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const key = this.pickPresentation(e.clientX, e.clientY);
      if (key) {
        this.pendingObject = key;
        if (key.startsWith('prov:')) this.onProvinceClick(key.slice(5));
        else if (key.startsWith('truck:')) this.onTruckPick(key);
        else this.showObjectCard(key);
      }
    }, { capture: true });
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const key = this.pickPresentation(e.clientX, e.clientY);
      if (key) canvas.style.cursor = 'pointer';
      this.map.setHover(key && key.startsWith('prov:') ? key.slice(5) : null);
      this.truck.setHover(key && key.startsWith('truck:comp:') ? +key.split(':')[2] : -1);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.story.broadcast();
    });
  }
  pickPresentation(clientX, clientY) {
    const v = this.view;
    const rect = v.canvas.getBoundingClientRect();
    v.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    v.raycaster.setFromCamera(v.pointer, v.rig.camera);
    const visible = this.pickables.filter((m) => {
      let o = m;
      while (o) {
        if (!o.visible) return false;
        o = o.parent;
      }
      return true;
    });
    const hits = v.raycaster.intersectObjects(visible, false);
    return hits.length ? hits[0].object.userData.cardKey : null;
  }
  onSceneSelect(hit) {
    if (this.pendingObject) {
      this.pendingObject = null;
      return;
    }
    this.view.setSelection(hit && (hit.type === 'truck' || hit.type === 'bay') ? hit : null);
  }
  describe(hit) {
    const e = this.engine;
    if (hit?.type === 'truck') {
      const t = e.trucks.get(hit.id);
      return t ? { title: t.label, text: `${e.config.products[t.product].name} · ${ID.truck.states[t.state]}` } : null;
    }
    if (hit?.type === 'bay') {
      const st = e.bayStats()[hit.number - 1];
      return { title: `${ID.labels.bay} ${String(hit.number).padStart(2, '0')}`, text: `${ID.bay.states[st.state]} · ${st.products.map((p) => e.config.products[p].name).join(', ')}` };
    }
    return null;
  }
  onKey(e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (this.lightbox) {
      if (k === 'Escape') this.closePhoto();
      else if (k === 'ArrowRight') this.openPhoto(this.lightbox.list[(this.lightbox.list.indexOf(this.lightbox.key) + 1) % this.lightbox.list.length], this.lightbox.list);
      else if (k === 'ArrowLeft') this.openPhoto(this.lightbox.list[(this.lightbox.list.indexOf(this.lightbox.key) - 1 + this.lightbox.list.length) % this.lightbox.list.length], this.lightbox.list);
      else return;
      e.preventDefault();
      return;
    }
    const handled = () => e.preventDefault();
    const intro = this.$('intro');
    if (!intro.hidden && !intro.classList.contains('out') && ['ArrowRight', 'PageDown', ' ', 'Enter', 'Escape'].includes(k)) return handled(), hideChapterIntro(intro); // tekan saat memudar diteruskan ke navigasi
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) return handled(), this.story.next();
    if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) return handled(), this.story.prev();
    if (k === 'Home') return handled(), this.story.goTo(0);
    if (k === 'End') return handled(), this.story.goTo(STEPS.length - 1);
    if (k === 'Escape') {
      if (!this.$('help').hidden) return this.toggleHelp(false);
      if (this.objectCard) return (this.objectCard = null), this.renderStepCard();
      return this.toggleMenu();
    }
    if (/^[0-9]$/.test(k) && ACTIVE_CHAPTERS[+k] != null) return handled(), this.story.goToChapter(ACTIVE_CHAPTERS[+k]);
    const low = k.toLowerCase();
    if (low === 'm') return handled(), this.toggleMode();
    if (low === 'l') return handled(), this.toggleLanguage();
    if (low === 'n') return handled(), this.openNotes();
    if (low === 't') return handled(), this.story.toggleTimer();
    if (low === 'r') return handled(), this.reapplyCamera();
    if (low === 'f') return handled(), this.toggleFullscreen();
    if (low === 'h') return handled(), this.toggleHelp();
    if (low === 'd') return handled(), this.toggleDetail();
    if (this.currentStep?.truck) {
      if (low === 'x') return handled(), this.truck.setXray();
      if (low === 'b' && this.currentStep.truck === 'surge') return handled(), this.truck.toggleDrive();
      if (low === 'k' && this.currentStep.truck === 'surge') return handled(), this.truck.setBulkheads();
    }
  }

  toggleMode() {
    this.mode = this.mode === 'explore' ? 'presenter' : 'explore';
    const rig = this.view.rig;
    rig.keysEnabled = this.mode === 'explore';
    if (this.mode === 'explore') {
      rig.setFree(true);
      rig.controls.maxDistance = 3000;
      toast(this.content.ui.exploreHint, 4200);
    } else {
      this.reapplyCamera();
    }
    this.chrome.update();
    this.chrome.rebuild();
  }
  toggleLanguage() {
    this.lang = this.lang === 'id' ? 'en' : 'id';
    this.content = CONTENT[this.lang];
    try {
      localStorage.setItem('itj-pres-lang', this.lang);
    } catch {}
    document.documentElement.lang = this.lang;
    this.story.chapters = this.content.chapters;
    this.bmc.relabel(this.content.bmc);
    this.buildLabelDefs();
    this.chrome.rebuild();
    this.buildMapNav();
    this.renderMapNav();
    this.renderHeroLayer();
    if (this.objectCard?.startsWith('prov:')) this.showProvinceCard(this.map.provinces.find((x) => x.id === this.objectCard.slice(5)));
    else if (this.objectCard) this.showObjectCard(this.objectCard);
    else this.renderStepCard();
    this.story.broadcast({ lang: this.lang });
  }
  toggleMenu(force) {
    const m = this.$('menu');
    m.hidden = force === undefined ? !m.hidden : !force;
    if (!m.hidden) this.$('help').hidden = true;
  }
  toggleHelp(force) {
    const h = this.$('help');
    h.hidden = force === undefined ? !h.hidden : !force;
    if (!h.hidden) this.$('menu').hidden = true;
  }
  openNotes() {
    const url = `${location.pathname}?notes=1&lang=${this.lang}`;
    const w = window.open(url, 'itj-notes', 'width=760,height=680,menubar=no,toolbar=no');
    if (!w) toast(this.content.ui.openNotes);
    setTimeout(() => this.story.broadcast({ lang: this.lang }), 800);
  }
  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  // ---------- Frame ----------
  frame(ts) {
    const dt = Math.min(0.25, (ts - this.lastFrame) / 1000);
    this.lastFrame = ts;
    const e = this.engine;
    let alpha = 1;
    const ffEl = this.$('toast');
    if (this.fastForwardTo != null) {
      const t0 = performance.now();
      this.prevPoses = null;
      while (e.time < this.fastForwardTo && !e.deadlock && performance.now() - t0 < 24) e.stepMany(40);
      if (e.time >= this.fastForwardTo || e.deadlock) this.fastForwardTo = null;
      ffEl.textContent = this.content.ui.fastForward;
      ffEl.hidden = this.fastForwardTo == null;
      this.stepAccumulator = 0;
    } else if (this.running && this.view.visible && !e.deadlock && !e.horizonReached) {
      this.stepAccumulator += (dt * this.speed) / SIM_STEP_SECONDS;
      const steps = Math.floor(this.stepAccumulator);
      if (steps > 0) {
        this.prevPoses = snapshotPoses(e);
        const t0 = performance.now();
        let done = 0;
        while (done < steps && performance.now() - t0 < 16 && !e.autoPaused) {
          e.step();
          done++;
        }
        this.stepAccumulator -= done;
        if (this.stepAccumulator > 1) this.stepAccumulator = 1;
      }
      alpha = Math.min(1, this.stepAccumulator);
      if (e.autoPaused) e.autoPaused = false;
    }
    if (performance.now() > this.bgStartAt && this.fastForwardTo == null) this.bg.tick(8);
    // Dunia presentasi
    this.holding.update(dt);
    this.bmc.update(dt);
    this.flow.update(dt);
    this.hl.update(dt);
    this.spbu.update(dt);
    if (this.truck.group.visible) {
      if (this.truckHideAt != null && performance.now() >= this.truckHideAt) this.truck.group.visible = false; // dari terminal, panggung truk tidak perlu digambar
      else this.truck.update(dt);
    }
    if (this.currentStep?.cam.kind === 'trip' && this.spbu.trip.active && this.mode !== 'explore') {
      const goal = this.cameraGoal(this.currentStep);
      this.view.rig.flyTo(goal.pos, goal.tgt, { rate: 2.2 });
    }
    // Kabut mengikuti skala langkah
    const kf = 1 - Math.exp(-dt * 2);
    this.fog.near += (this.fogTarget[0] - this.fog.near) * kf;
    this.fog.far += (this.fogTarget[1] - this.fog.far) * kf;
    this.view.scene.fog.near = this.fog.near;
    this.view.scene.fog.far = this.fog.far;
    // Mode jelajah: kembali bebas setelah penerbangan langkah selesai
    if (this.mode === 'explore' && !this.view.rig.animating && this.view.rig.mode !== 'free') {
      this.view.rig.setFree(true);
      this.view.rig.controls.maxDistance = 3000;
    }
    // Kamera "bernapas": orbit pelan di sekitar tujuan langkah setelah tiba (presenter, bukan perjalanan truk)
    const rig = this.view.rig;
    if (rig.dragging) this.drift.goal = null; // pengguna menggeser kamera: jangan ditarik kembali
    if (rig.animating) this.drift.since = null;
    else if (this.drift.since == null) this.drift.since = performance.now();
    if (this.mode !== 'explore' && !this.reduceMotion && this.drift.goal && rig.mode === 'story' && !rig.animating && this.currentStep?.cam.kind !== 'trip' && !this.mapNav.region) {
      const t = (performance.now() - this.drift.since) / 1000;
      {
        const off = this.drift.goal.pos.clone().sub(this.drift.goal.tgt);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.18) * 0.07);
        rig.camera.position.copy(this.drift.goal.tgt).add(off.multiplyScalar(1 - Math.sin(t * 0.11) * 0.025));
        rig.controls.target.copy(this.drift.goal.tgt);
      }
    }
    this.view.update(this.prevPoses, alpha, dt, { clock: formatSimTime(e.time, e.config.operations.calendar), running: this.running });
    this.updateLabels();
    this.truckTags.update({ camera: this.view.rig.camera, w: this.view.canvas.clientWidth, h: this.view.canvas.clientHeight, content: this.content, lang: this.lang, products: this.engine.config.products });
    if (!this._avoidAt || performance.now() - this._avoidAt > 400) {
      this._avoidAt = performance.now();
      const r = this.$('hero').getBoundingClientRect(), c = this.view.canvas.getBoundingClientRect();
      this.view.labels.avoid = r.width ? [{ x0: r.left - c.left - 10, y0: r.top - c.top - 10, x1: r.right - c.left + 10, y1: r.bottom - c.top + 10 }] : [];
    }
    this.simPanel?.update();
    this.chrome.tick();
    requestAnimationFrame((ts2) => this.frame(ts2));
  }
}

const params = new URLSearchParams(location.search);
const boot = () => {
  if (params.get('notes')) startNotesView(document.getElementById('notes'), params.get('lang') || pickLanguage());
  else window.__presApp = new App();
};
const fontReady = document.fonts?.load ? document.fonts.load("700 20px 'Plus Jakarta Sans'").catch(() => null) : Promise.resolve();
Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(boot);
registerOffline(); // simpan situs di browser untuk dibuka saat jaringan bermasalah
