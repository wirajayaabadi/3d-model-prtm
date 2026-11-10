// Halaman video perkenalan ITJ Plumpang: garis waktu shot (shots.js) diputar seperti film pendek. Adegan 3D memakai
// SceneView, engine simulasi dan dunia presentasi yang sama (peta, terminal, truk pameran, SPBU); foto kunjungan
// tampil layar penuh dengan zoom pelan. Seluruh tampilan dihitung dari waktu t, jadi bisa dijeda dan digeser.
import * as THREE from 'three';
import { createPresetConfig } from '../config/index.js';
import { Engine } from '../sim/engine.js';
import { SIM_STEP_SECONDS } from '../config/operations.js';
import { SceneView } from '../render/scene.js';
import { snapshotPoses } from '../render/animation.js';
import { formatSimTime } from '../sim/clock.js';
import { el, clear } from '../ui/dom.js';
import { MEDIA } from '../presentation/content/media.js';
import { applySunsetStyle } from '../presentation/worldStyle.js';
import { buildIndonesiaMap } from '../presentation/scenes/indonesiaMap.js';
import { buildSpbu } from '../presentation/scenes/spbu.js';
import { buildHighlights } from '../presentation/scenes/highlights.js';
import { buildTruckShow } from '../presentation/scenes/truckShow.js';
import { CONTENT } from './content.js';
import { SHOTS, TOTAL, PARTS, FADE, BAR, VISIT_STEPS, locate, partStart, fmtTime, labelDelay } from './shots.js';
import { Soundtrack } from './audio.js';
import { NARRATION_LANG } from './narration.js';
import { registerOffline } from '../offline/register.js';

const SEED = 20261025;
const SIM_SPEED = 2;
const FOG = { terminal: [700, 1900], map: [2400, 6500], truck: [70, 330] };
// Cahaya per adegan, mengikuti alur video referensi: pagi → siang → sore → senja. `pos` adalah letak matahari
// relatif terhadap pusat terminal; `css` adalah langit di belakang kanvas.
const LIGHT = {
  dawn: { sun: '#FFAE80', sunI: 2.7, pos: [245, 70, -115], sky: '#E9A995', ground: '#6F83A0', hemiI: 0.92, exposure: 0.98, fog: '#E7AE96', css: 'linear-gradient(180deg, #343a63 0%, #86628a 26%, #ef9f7c 56%, #f6cfae 100%)' },
  day: { sun: '#FFF0DA', sunI: 3.3, pos: [150, 170, -160], sky: '#EDF2F7', ground: '#A9BAC6', hemiI: 1.45, exposure: 1.1, fog: '#E4E7E6', css: 'linear-gradient(180deg, #8fbde6 0%, #c9dff2 42%, #eef1f1 100%)' },
  gold: { sun: '#FFD3A6', sunI: 3.1, pos: [115, 100, -225], sky: '#F3D0B5', ground: '#9FB8C8', hemiI: 1.32, exposure: 1.1, fog: '#E6D5C8', css: 'linear-gradient(180deg, #f3bf92 0%, #f1d2bd 22%, #cfdcec 52%, #e3e9ee 78%, #e6ddd2 100%)' },
  dusk: { sun: '#FF9A68', sunI: 2.5, pos: [-250, 66, -95], sky: '#E7B1A2', ground: '#7C8CA6', hemiI: 1.05, exposure: 1.0, fog: '#D99A80', css: 'linear-gradient(180deg, #1f2444 0%, #5c4170 30%, #d9765a 62%, #f2b28a 100%)' },
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;

function pickLanguage() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && CONTENT[q]) return q;
  try {
    const saved = localStorage.getItem('itj-pres-lang');
    if (saved && CONTENT[saved]) return saved;
  } catch {}
  return 'id';
}

class Film {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.params = new URLSearchParams(location.search);
    this.lang = pickLanguage();
    this.content = CONTENT[this.lang];
    this.t = 0;
    this.playing = false;
    this.started = false;
    this.ended = false;
    this.loop = this.params.get('loop') === '1';
    this.shotIndex = -1;
    this.applied3d = null;
    this.labels = [];
    this.stepAccumulator = 0;
    this.prevPoses = null;
    this.lastFrame = performance.now();
    this.v = new THREE.Vector3();
    this.audio = new Soundtrack();
    this.audio.setVoiceLanguage(this.lang === NARRATION_LANG);
    this.audio.preload(); // musik latar dan narasi didekode sambil adegan 3D disiapkan
    this.buildChrome();
    this.preload().then(() => this.initScene());
  }

  // ---------- Persiapan ----------
  // Semua foto diunduh sekali dan disimpan di memori (blob URL). Setelah video siap, pemutaran tidak lagi menyentuh
  // jaringan, jadi tetap utuh bila koneksi putus di tengah presentasi.
  preload() {
    this.photoUrl = {};
    const keys = [...new Set(SHOTS.filter((s) => s.photo).map((s) => s.photo))];
    return Promise.all(keys.map((k) => fetch(MEDIA[k])
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => (this.photoUrl[k] = URL.createObjectURL(b)))
      .catch(() => (this.photoUrl[k] = MEDIA[k])))); // gagal: pakai alamat biasa, dicoba lagi saat tampil
  }

  initScene() {
    const cfg = createPresetConfig('baseline');
    cfg.operations.seed = SEED;
    this.engine = new Engine(cfg, { presetId: 'baseline' });
    while (this.engine.time < 75 * 60 && !this.engine.deadlock) this.engine.stepMany(60); // terminal sudah ramai saat video dimulai
    try {
      this.view = new SceneView({ container: this.$('scene'), labelsEl: this.$('simlabels'), tooltipEl: this.$('simtooltip'), engine: this.engine, onError: () => this.fail() });
    } catch (e) {
      console.error('Adegan 3D gagal dimulai', e);
      return this.fail();
    }
    const { rig, scene, M, renderer } = this.view;
    rig.arrowKeys = false;
    rig.keysEnabled = false;
    rig.boundless = true;
    rig.bounds = null;
    rig.mode = 'story';
    rig.animating = false;
    rig.camera.far = 8000;
    rig.camera.updateProjectionMatrix();
    Object.assign(rig.controls, { enabled: false, minDistance: 1, maxDistance: 6000, minPolarAngle: 0, maxPolarAngle: Math.PI * 0.499 });
    applySunsetStyle(this.view);
    const layout = this.engine.layout, config = this.engine.config;
    const far = new THREE.Mesh(new THREE.PlaneGeometry(4400, 1200).rotateX(-Math.PI / 2), M.ground);
    far.position.set(0, -0.3, 60);
    this.map = buildIndonesiaMap({ M, renderer });
    this.map.setLayer('java', true);
    this.spbu = buildSpbu({ M, renderer, layout, config, scene });
    this.hl = buildHighlights({ layout, config, M });
    this.truck = buildTruckShow({ M, products: config.products });
    this.truck.showMarkers(false);
    this.truck.group.visible = false;
    scene.add(far, this.map.group, this.spbu.group, this.hl.group, this.truck.group, this.buildRoutes());
    this.sunTarget = this.view.sun.target.position.clone();
    this.hemi = scene.children.find((o) => o.isHemisphereLight);
    this.view.resize();
    this.installInput();
    const at = parseFloat(this.params.get('t'));
    if (!Number.isNaN(at)) {
      this.t = Math.min(TOTAL, Math.max(0, at));
      this.started = true;
    } else if (this.params.get('autoplay') === '1') this.start();
    this.$('loading').classList.add('done');
    document.body.classList.toggle('prestart', !this.started);
    requestAnimationFrame((ts) => this.frame(ts));
  }

  // Garis rute merah dari ITJ ke kota-kota wilayah layanan (seperti grafik rute di video referensi); digambar bertahap
  buildRoutes() {
    const g = new THREE.Group(), H = 3.8;
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4b3e, toneMapped: false, fog: false });
    const from = this.map.pins.itj.pos.clone().setY(H);
    const SEG = 40, RAD = 6;
    this.routes = Object.values(this.map.pins.serviceArea).map((p, n) => {
      const to = p.clone().setY(H), mid = from.clone().add(to).multiplyScalar(0.5);
      mid.y += 3 + from.distanceTo(to) * 0.4;
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), SEG, 0.3, RAD, false), mat);
      mesh.geometry.setDrawRange(0, 0);
      g.add(mesh);
      return { mesh, per: RAD * 6, seg: SEG, delay: n * 0.07 };
    });
    g.visible = false;
    this.routeGroup = g;
    return g;
  }
  applyLight(name) {
    const L = LIGHT[name] || LIGHT.gold, { sun, scene, renderer } = this.view;
    sun.color.set(L.sun);
    sun.intensity = L.sunI;
    sun.position.copy(this.sunTarget).add(this.v.set(...L.pos));
    if (this.hemi) {
      this.hemi.color.set(L.sky);
      this.hemi.groundColor.set(L.ground);
      this.hemi.intensity = L.hemiI;
    }
    renderer.toneMappingExposure = L.exposure;
    scene.fog.color.set(L.fog);
    this.$('stage').style.background = L.css;
  }

  fail() {
    const l = this.$('loading');
    l.classList.remove('done');
    l.classList.add('error');
    l.lastChild.textContent = this.content.ui.webglError;
  }

  // ---------- Kerangka: poster, kontrol, teks tetap ----------
  buildChrome() {
    const ui = this.content.ui;
    document.documentElement.lang = this.lang;
    document.title = ui.pageTitle;
    this.$('loading').lastChild.textContent = ui.loading;
    this.$('disclaimer').textContent = ui.disclaimer;
    this.$('modelnote').textContent = ui.model;
    const first = this.content.shots.title;
    const poster = clear(this.$('poster'));
    poster.append(
      el('div', { class: 'p-kicker', text: first.kicker }),
      el('h1', { text: first.title }),
      el('p', { text: first.text }),
      el('button', { type: 'button', class: 'p-play', onClick: (e) => { e.stopPropagation(); this.start(); } }, el('i', { text: '▶' }), el('span', { text: `${ui.start} · ${fmtTime(TOTAL)}` })),
      el('div', { class: 'p-links' }, ...this.destinations().map((d) => el('a', { href: d.href, onClick: (e) => e.stopPropagation(), text: d.label }))),
      el('small', { text: ui.startHint }),
    );
    const c = clear(this.$('controls'));
    this.refs = {
      fill: el('div', { class: 'fill' }),
      knob: el('div', { class: 'knob' }),
      play: el('button', { type: 'button', class: 'cb play', onClick: () => this.toggle() }),
      time: el('span', { class: 'time' }),
      parts: PARTS.map((key, i) => el('button', { type: 'button', class: 'part', onClick: () => this.seek(partStart(i), true), text: ui.parts[key] })),
    };
    const track = el('div', { class: 'track', role: 'slider', 'aria-label': 'Timeline', 'aria-valuemin': '0', 'aria-valuemax': String(Math.round(TOTAL)) }, el('div', { class: 'rail' }, this.refs.fill, ...[1, 2].map((p) => el('i', { class: 'mark', style: { left: `${(partStart(p) / TOTAL) * 100}%` } }))), this.refs.knob);
    this.refs.track = track;
    // Tombol lanjut: tampil saat video dijeda atau selesai
    const actions = el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'go replay', onClick: () => this.seek(0, true) }, el('i', { text: '↺' }), el('b', { text: ui.replay })),
      el('span', { class: 'a-label', text: ui.goOn }),
      ...this.destinations().map((d) => el('a', { class: 'go', href: d.href }, el('i', { text: d.icon }), el('span', {}, el('b', { text: d.label }), el('small', { text: d.sub })))),
    );
    c.append(
      actions,
      track,
      el('div', { class: 'row' },
        this.refs.play,
        this.refs.time,
        el('div', { class: 'parts' }, ...this.refs.parts),
        el('span', { class: 'grow' }),
        (this.refs.voice = el('button', { type: 'button', class: 'cb voice', onClick: () => this.toggleVoice(), text: ui.voice })),
        (this.refs.sound = el('button', { type: 'button', class: 'cb sound', onClick: () => this.toggleSound(), text: '♪' })),
        el('button', { type: 'button', class: 'cb', title: ui.language, onClick: () => this.toggleLanguage(), text: this.lang === 'id' ? 'ID' : 'EN' }),
        el('button', { type: 'button', class: 'cb', title: ui.fullscreen, onClick: () => this.toggleFullscreen(), text: '⛶' }),
      ),
    );
    const scrub = (e) => {
      const r = track.getBoundingClientRect();
      this.seek(clamp01((e.clientX - r.left) / r.width) * TOTAL);
    };
    track.addEventListener('pointerdown', (e) => {
      track.setPointerCapture(e.pointerId);
      this.scrubbing = true;
      scrub(e);
    });
    track.addEventListener('pointermove', (e) => this.scrubbing && scrub(e));
    const end = () => (this.scrubbing = false);
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    this.syncSound();
    this.capKey = null;
    this.shotIndex = -1; // teks shot dibangun ulang pada frame berikutnya
  }
  syncSound() {
    const ui = this.content.ui, b = this.refs.sound;
    b.hidden = !this.audio.available;
    b.classList.toggle('off', this.audio.muted);
    b.title = `${this.audio.muted ? ui.soundOn : ui.soundOff} (M)`;
    b.setAttribute('aria-pressed', String(!this.audio.muted));
    const v = this.refs.voice, on = this.audio.voicePref;
    v.hidden = !this.audio.available || this.lang !== NARRATION_LANG; // narasi hanya ada dalam bahasa Indonesia
    v.classList.toggle('off', !on);
    v.title = `${on ? ui.voiceOff : ui.voiceOn} (N)`;
    v.setAttribute('aria-pressed', String(on));
  }
  toggleVoice() {
    this.audio.unlock();
    this.audio.setVoice(!this.audio.voicePref);
    this.syncSound();
  }
  toggleSound() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.syncSound();
  }

  // Halaman lain yang ditawarkan dari video (jalur relatif terhadap halaman utama)
  destinations() {
    const ui = this.content.ui;
    return [
      { href: './simulasi/', icon: '◆', label: ui.toSim, sub: ui.toSimSub },
      { href: './presentasi/', icon: '▤', label: ui.toPresentation, sub: ui.toPresentationSub },
    ];
  }

  installInput() {
    this.wakeUi = () => {
      document.body.classList.remove('idle');
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.playing && document.body.classList.add('idle'), 2600);
    };
    const wake = () => {
      this.audio.unlock(); // browser hanya mengizinkan suara setelah gestur pengguna (klik atau tombol)
      this.wakeUi();
    };
    this.wake = wake;
    window.addEventListener('pointermove', () => this.wakeUi());
    window.addEventListener('pointerdown', wake);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.audio.update(this.t, false); // tab disembunyikan: suara ikut berhenti
      else this.lastFrame = performance.now(); // kembali ke tab: lanjut dari posisi terakhir, tanpa melompat
    });
    this.$('stage').addEventListener('click', () => (this.started ? this.toggle() : this.start()));
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key, low = k.toLowerCase();
      const done = () => {
        e.preventDefault();
        wake();
      };
      if (k === ' ' || low === 'k' || k === 'Enter') return done(), this.started ? this.toggle() : this.start();
      if (k === 'ArrowRight' || k === 'PageDown') return done(), this.skip(1);
      if (k === 'ArrowLeft' || k === 'PageUp') return done(), this.skip(-1);
      if (k === 'Home' || k === '0') return done(), this.seek(0, true);
      if (/^[1-3]$/.test(k)) return done(), this.seek(partStart(+k - 1), true);
      if (low === 'f') return done(), this.toggleFullscreen();
      if (low === 'l') return done(), this.toggleLanguage();
      if (low === 'm') return done(), this.toggleSound();
      if (low === 'n') return done(), this.toggleVoice();
    });
  }

  // ---------- Kendali putar ----------
  start() {
    this.started = true;
    this.playing = true;
    document.body.classList.remove('prestart');
    this.wake?.();
  }
  toggle() {
    if (this.ended) return this.seek(0, true);
    this.playing = !this.playing;
    this.wake?.();
  }
  seek(t, play = false) {
    this.t = Math.min(TOTAL, Math.max(0, t));
    this.ended = this.t >= TOTAL;
    if (!this.started) {
      this.started = true;
      document.body.classList.remove('prestart');
    }
    if (play) this.playing = true;
    this.prevPoses = null;
  }
  skip(dir) {
    const { i, local } = locate(this.t);
    const j = dir > 0 ? Math.min(SHOTS.length - 1, i + 1) : local > 1.5 ? i : Math.max(0, i - 1);
    this.seek(SHOTS[j].start + 0.001);
  }
  toggleLanguage() {
    this.lang = this.lang === 'id' ? 'en' : 'id';
    this.content = CONTENT[this.lang];
    try {
      localStorage.setItem('itj-pres-lang', this.lang);
    } catch {}
    this.audio.setVoiceLanguage(this.lang === NARRATION_LANG);
    this.buildChrome();
  }
  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  // ---------- Shot ----------
  enterShot(i) {
    this.shotIndex = i;
    const shot = SHOTS[i];
    // Teks hanya dibangun ulang bila kelompok teksnya berganti; potongan gambar di dalam satu kelompok tidak mengusiknya
    if (this.capKey !== shot.cap) {
      this.capKey = shot.cap;
      const data = this.content.shots[shot.cap] || {};
      const cap = clear(this.$('caption'));
      cap.className = `layout-${shot.layout || (shot.kind === 'photo' ? 'photo' : 'lower')}`;
      const step = VISIT_STEPS.indexOf(shot.id);
      if (step >= 0) cap.append(el('div', { class: 'c-step' }, el('b', { text: String(step + 1).padStart(2, '0') }), ` ${this.content.ui.stepOf} ${VISIT_STEPS.length}`));
      if (data.kicker) cap.append(el('div', { class: 'c-kicker', text: data.kicker }));
      if (data.title) cap.append(el('h2', { text: data.title }));
      if (data.stats) cap.append(el('div', { class: 'c-stats' }, ...data.stats.map(([v, l]) => el('div', { class: 'c-stat' }, el('b', { text: v }), el('span', { text: l })))));
      if (data.text) cap.append(el('p', { text: data.text }));
      if (data.credit) cap.append(el('small', { text: data.credit }));
    }
    // Tag miring pada objek 3D: judul + keterangan kecil, dengan garis penunjuk
    const box = clear(this.$('labels'));
    this.labels = (shot.labels || []).map(([key, at, delay, side = ''], n) => {
      const [title, sub] = this.content.labels[key];
      const tag = el('div', { class: 'tag' }, el('b', { text: title }), sub ? el('span', { text: sub }) : null);
      const node = el('div', { class: `f-label ${side}` }, tag, el('i'));
      box.append(node);
      return { node, tag, at, delay: labelDelay(n, delay) };
    });
  }

  // Keadaan adegan 3D untuk satu shot: atap, sorotan, kabut, panggung truk, perjalanan ke SPBU
  applyScene(shot) {
    this.applied3d = shot;
    this.applyLight(shot.light);
    this.routeGroup.visible = !!shot.routes;
    this.view.setMode(shot.mode || 'operation');
    this.hl.show(shot.highlight || []);
    const fog = FOG[shot.world] || FOG.terminal;
    this.view.scene.fog.near = fog[0];
    this.view.scene.fog.far = fog[1];
    const onStage = shot.world === 'truck';
    this.truck.group.visible = onStage;
    if (onStage) {
      this.truck.setMode(null);
      this.truck.setMode('surge'); // truk melaju; penanda titik berat disembunyikan
      this.truck.setXray(false);
    }
    if (shot.trip) this.spbu.trip.start();
    else this.spbu.trip.stop();
    this.prevPoses = null;
  }

  camera(shot, p) {
    const smooth = p * p * (3 - 2 * p);
    let e = shot.ease === 'inOut' ? smooth : (p + smooth) / 2; // sebagian besar gerak rata, ujungnya halus
    if (p > 1) e = shot.ease === 'inOut' ? 1 : 1 + (p - 1) * 0.5; // sedikit terus bergerak saat melebur ke foto
    const a = shot.cam.from, b = shot.cam.to, rig = this.view.rig;
    const tgt = rig.controls.target;
    if (shot.follow === 'trip') tgt.copy(this.spbu.trip.pos).setY(2);
    else tgt.set(lerp(a.tgt[0], b.tgt[0], e), lerp(a.tgt[1], b.tgt[1], e), lerp(a.tgt[2], b.tgt[2], e));
    this.v.set(lerp(a.dir[0], b.dir[0], e), lerp(a.dir[1], b.dir[1], e), lerp(a.dir[2], b.dir[2], e)).normalize();
    const dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), e));
    rig.camera.position.copy(tgt).addScaledVector(this.v, dist);
    rig.mode = 'story';
    rig.animating = false;
  }

  photo(layer, shot, p, opacity) {
    const node = this.$(layer);
    if (!shot || opacity <= 0) {
      node.style.opacity = '0';
      return;
    }
    const img = node.firstChild;
    if (img.dataset.key !== shot.photo) {
      img.dataset.key = shot.photo;
      img.src = this.photoUrl?.[shot.photo] || MEDIA[shot.photo];
    }
    img.alt = this.content.shots[shot.id]?.title || '';
    img.style.objectPosition = shot.pos || '50% 50%';
    img.style.transformOrigin = `${shot.kb.focus[0]}% ${shot.kb.focus[1]}%`;
    img.style.transform = `scale(${lerp(shot.kb.s[0], shot.kb.s[1], p).toFixed(4)})`;
    node.dataset.layout = shot.layout || 'photo';
    node.style.opacity = String(opacity);
  }

  // ---------- Frame ----------
  frame(ts) {
    const real = Math.min(1.5, (ts - this.lastFrame) / 1000); // waktu video mengikuti jam (dan musik), juga saat frame tersendat
    const dt = Math.min(0.1, real); // langkah simulasi dan animasi dibatasi agar tidak melompat
    this.lastFrame = ts;
    if (this.playing && !this.scrubbing) {
      this.t += real;
      if (this.t >= TOTAL) {
        if (this.loop) this.t = 0;
        else {
          this.t = TOTAL;
          this.playing = false;
          this.ended = true;
        }
      }
    }
    const { i, shot, local, p } = locate(this.t);
    if (i !== this.shotIndex) this.enterShot(i);
    const prev = SHOTS[i - 1];
    const is3d = shot.kind === '3d';
    const moving = this.playing && !this.scrubbing;

    // Adegan 3D: shot ini, atau shot 3D sebelumnya yang masih terlihat di bawah foto yang sedang melebur masuk
    const under = is3d ? shot : prev?.kind === '3d' && local < FADE ? prev : null;
    if (under) {
      if (under !== this.applied3d) this.applyScene(under);
      const p3 = under === shot ? p : 1 + local / under.dur;
      if (under.world === 'truck') {
        const xray = p3 >= under.xrayFrom;
        if (this.truck.state.xray !== xray) this.truck.setXray(xray);
        if (!moving) this.truck.state.xr = xray ? 1 : 0; // saat dijeda atau digeser, langsung ke keadaan akhirnya
        this.truck.update(moving ? dt : 0);
      }
      if (under.trip) {
        const k = clamp01(p3), ease = under.tripEase ? 1 - (1 - k) * (1 - k) : k; // hanya shot kedatangan yang melambat
        this.spbu.trip.s = lerp(under.trip[0], under.trip[1], ease) * this.spbu.trip.length;
        this.spbu.update(0);
      }
      if (under.routes) {
        for (const r of this.routes) r.mesh.geometry.setDrawRange(0, Math.floor(clamp01(p3 * 1.9 - 0.12 - r.delay) * r.seg) * r.per);
      }
      const e = this.engine;
      let alpha = 1;
      if (moving && !e.deadlock && !e.horizonReached) {
        this.stepAccumulator += (dt * SIM_SPEED) / SIM_STEP_SECONDS;
        const steps = Math.floor(this.stepAccumulator);
        if (steps > 0) {
          this.prevPoses = snapshotPoses(e);
          const t0 = performance.now();
          let done = 0;
          while (done < steps && performance.now() - t0 < 16) {
            e.step();
            done++;
          }
          this.stepAccumulator -= done;
          if (this.stepAccumulator > 1) this.stepAccumulator = 1;
          if (e.autoPaused) e.autoPaused = false;
        }
        alpha = Math.min(1, this.stepAccumulator);
      }
      this.hl.update(moving ? dt : 0);
      this.camera(under, p3);
      this.view.update(this.prevPoses, alpha, dt, { clock: formatSimTime(e.time, e.config.operations.calendar), running: moving });
    }
    this.$('scene').style.visibility = under ? 'visible' : 'hidden';

    // Foto: lapisan bawah = foto shot sebelumnya, lapisan atas = foto shot ini yang melebur masuk
    const prevPhoto = prev?.kind === 'photo' ? prev : null;
    const fadeIn = i === 0 ? 1 : clamp01(local / FADE);
    this.photo('photoA', prevPhoto && local < FADE ? prevPhoto : null, prevPhoto ? 1 + local / prevPhoto.dur : 0, is3d ? 1 - fadeIn : 1);
    this.photo('photoB', is3d ? null : shot, p, fadeIn);

    // Adegan 3D berganti dengan potongan langsung tepat di ketukan. Gelap hanya saat video dibuka (muncul dari
    // hitam) dan di birama terakhir (meredup ke hitam, teks penutup tetap terbaca).
    const last = i === SHOTS.length - 1;
    let dip = 0;
    if (i === 0) dip = clamp01(1 - local / 1.4);
    if (last) dip = Math.max(dip, clamp01((local - (shot.dur - BAR)) / BAR) * 0.82);
    this.$('dip').style.opacity = String(dip);

    // Teks: muncul di awal kelompok teks, hilang di akhirnya
    const capIn = clamp01((this.t - shot.capStart - 0.2) / 0.45), capOut = last ? 1 : clamp01((shot.capEnd - this.t - 0.08) / 0.4);
    const cap = this.$('caption');
    cap.style.opacity = String(Math.min(capIn, capOut));
    cap.style.transform = `translateY(${((1 - capIn * capIn * (3 - 2 * capIn)) * 18).toFixed(1)}px)`;
    document.body.dataset.kind = shot.layout || shot.kind;
    this.$('modelnote').style.opacity = is3d ? '1' : '0';

    // Label yang menempel pada objek 3D
    if (this.labels.length) {
      const cam = this.view.rig.camera, w = window.innerWidth, h = window.innerHeight;
      const ctx = { map: this.map, hl: this.hl };
      for (const l of this.labels) {
        const pos = l.at(ctx);
        if (Array.isArray(pos)) this.v.set(pos[0], pos[1], pos[2]);
        else this.v.copy(pos);
        this.v.project(cam);
        const on = this.v.z < 1 && Math.abs(this.v.x) < 1 && Math.abs(this.v.y) < 1;
        const k = clamp01((local - l.delay) / 0.45), o = on ? Math.min(k > 0 ? 1 : 0, clamp01((shot.dur - local - 0.15) / 0.3)) : 0;
        l.node.style.opacity = String(o);
        l.tag.style.clipPath = `inset(-20% ${((1 - k * k * (3 - 2 * k)) * 100).toFixed(1)}% -20% -20%)`; // tag tersapu masuk dari kiri
        if (on) l.node.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-this.v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
      }
    }

    // Kontrol
    const r = this.refs, frac = this.t / TOTAL;
    r.fill.style.width = `${frac * 100}%`;
    r.knob.style.left = `${frac * 100}%`;
    r.track.setAttribute('aria-valuenow', String(Math.round(this.t)));
    const icon = this.ended ? '↺' : this.playing ? '❚❚' : '▶';
    if (r.play.textContent !== icon) {
      r.play.textContent = icon;
      r.play.title = this.ended ? this.content.ui.replay : this.playing ? this.content.ui.pause : this.content.ui.play;
    }
    const clock = `${fmtTime(this.t)} / ${fmtTime(TOTAL)}`;
    if (r.time.textContent !== clock) r.time.textContent = clock;
    r.parts.forEach((b, n) => b.classList.toggle('on', n === shot.part));
    this.audio.update(this.t, this.playing && !this.scrubbing);
    document.body.classList.toggle('paused', this.started && !this.playing && !this.scrubbing);
    document.body.classList.toggle('ended', this.ended);
    if (!this.playing) document.body.classList.remove('idle');
    requestAnimationFrame((ts2) => this.frame(ts2));
  }
}

const fontReady = document.fonts?.load ? document.fonts.load("700 20px 'Plus Jakarta Sans'").catch(() => null) : Promise.resolve();
Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(() => (window.__film = new Film()));
registerOffline(); // simpan situs di browser untuk dibuka saat jaringan bermasalah
