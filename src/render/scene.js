// Tampilan 3D: renderer (ACES, sRGB, bayangan PCF lembut), pencahayaan berbasis citra (RoomEnvironment), matahari
// kunci dari tenggara, rim dan fill; mode tampilan (Operasi, Zona, Tanpa atap, Satu truk); label terproyeksi;
// rasio piksel adaptif; penanganan visibilitas dan kehilangan konteks; pembuangan GPU penuh.
// Renderer hanya membaca status engine dan tidak pernah mengubahnya.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CameraRig } from './cameras.js';
import { LabelLayer } from './labels.js';
import { createMaterialLibrary, disposeGeometryCache } from './materials.js';
import { createTruck, setTruckLights, setTruckHighlight, WheelPool } from './assets/truck.js';
import { buildBayBlock } from './assets/bay.js';
import { buildEnvironment } from './assets/environment.js';
import { lerpPose } from './animation.js';
import { BRAND, hexToInt } from '../ui/theme.js';
import { ID } from '../ui/i18n/en.js';
import { TRUCK_STATES } from '../sim/models/truck.js';

const DETAIL_DISTANCE = 260;

export class SceneView {
  constructor({ container, labelsEl, tooltipEl, engine, reduceMotion = false, onReady, onError, onContextRestored }) {
    this.container = container;
    this.engine = engine;
    this.reduceMotion = reduceMotion;
    this.onError = onError;
    this.onContextRestored = onContextRestored;
    this.cleanups = [];
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.setClearColor(0x000000, 0);
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, container.clientWidth < 900 ? 1.5 : 1.75);
    this.pixelRatio = this.basePixelRatio;
    r.setPixelRatio(this.pixelRatio);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    container.appendChild(r.domElement);
    this.canvas = r.domElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(hexToInt('#EEF3F8'), 700, 1900);
    const pmrem = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.35;
    room.dispose();
    pmrem.dispose();
    this.setupLights();

    this.M = createMaterialLibrary();
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
    this.clipTarget = 100;
    this.trucks = new Map();
    this.selection = null;
    this.hovered = null;
    this.mode = 'operation';
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.labels = new LabelLayer(labelsEl, tooltipEl);
    this.rig = new CameraRig(this.canvas, engine.layout, { reduceMotion });
    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsCount = 0;
    this._measure = { frames: 0, time: 0 };
    this._displayAt = -1;
    this.visible = true;
    this.contextLost = false;
    this.wheels = new WheelPool(this.scene, this.M);
    this.buildMarkers();
    this.rebuild(engine);
    this.installListeners();
    this.resize();
    r.compile(this.scene, this.rig.camera);
    onReady?.();
  }

  setupLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(hexToInt('#E6EEF7'), hexToInt('#B9C1C8'), 1.5));
    const sun = new THREE.DirectionalLight(0xfff6ea, 2.8);
    sun.position.set(150, 170, -160); // tinggi di timur laut (+X, -Z): bayangan jatuh ke arah kamera isometrik barat daya
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // Skala adegan ~200 m: normal bias diskalakan agar tidak ada shadow acne di bidang datar.
    sun.shadow.normalBias = 0.12;
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 2;
    s.add(sun, sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0xd6e4f5, 0.7);
    rim.position.set(-120, 80, -140);
    s.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-60, 40, 160);
    s.add(fill);
  }

  fitShadow(layout) {
    const W = layout.plot.width, L = layout.plot.length;
    const c = this.sun.shadow.camera;
    this.sun.target.position.set(W / 2 + 20, 0, L / 2);
    this.sun.position.set(W / 2 + 20 + 150, 170, L / 2 - 160);
    // Frustum bayangan dipaskan ketat ke plot dan konteks terdekat.
    const half = Math.hypot(W + 90, L + 40) / 2;
    c.left = -half;
    c.right = half;
    c.top = half;
    c.bottom = -half;
    c.near = 40;
    c.far = 480;
    c.updateProjectionMatrix();
    this.sun.target.updateMatrixWorld();
  }

  rebuild(engine) {
    this.engine = engine;
    if (this.staticGroup) {
      this.scene.remove(this.staticGroup);
      this.disposeGroup(this.staticGroup);
    }
    for (const g of this.trucks.values()) this.scene.remove(g);
    this.trucks.clear();
    this.labels.hideAll();
    this.staticGroup = new THREE.Group();
    this.envi = buildEnvironment({ layout: engine.layout, network: engine.network, config: engine.config, M: this.M, renderer: this.renderer });
    this.bayBlock = buildBayBlock({ layout: engine.layout, config: engine.config, products: engine.config.products, M: this.M, renderer: this.renderer, clipPlane: this.clipPlane });
    this.staticGroup.add(this.envi.group, this.bayBlock.group);
    this.scene.add(this.staticGroup);
    this.rig.setLayout(engine.layout);
    this.fitShadow(engine.layout);
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.showFeasibility = false;
    this.setMode(this.mode);
  }

  // Pin lokasi (kerucut + bola) untuk objek terpilih/hover dan kotak sorotan biru untuk truk terpilih.
  buildMarkers() {
    const mk = () => {
      const g = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 16), this.M.pin);
      cone.rotation.x = Math.PI;
      cone.position.y = 1.2;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 14), this.M.pin);
      ball.position.y = 3.0;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), this.M.pinWhite);
      dot.position.set(0, 3.0, 0.9);
      g.add(cone, ball, dot);
      g.visible = false;
      this.scene.add(g);
      return g;
    };
    this.pinSel = mk();
    this.pinHover = mk();
    this.pinHover.scale.setScalar(0.75);
    const box = new THREE.BoxGeometry(13.2, 4.6, 3.4);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x1f6fd6 }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.outlineRing = new THREE.Mesh(new THREE.RingGeometry(0.1, 7, 40), new THREE.MeshBasicMaterial({ color: 0x1f6fd6, transparent: true, opacity: 0.18, depthWrite: false }));
    this.outlineRing.rotation.x = -Math.PI / 2;
    this.outlineRing.visible = false;
    this.scene.add(this.outlineRing);
  }

  // Posisi dunia (x, y, z) dari sebuah pilihan, untuk pin, fokus kamera dan label.
  anchorOf(sel) {
    if (!sel) return null;
    const e = this.engine;
    if (sel.type === 'truck') {
      const g = this.trucks.get(sel.id);
      return g ? new THREE.Vector3(g.position.x, 0, g.position.z) : null;
    }
    if (sel.type === 'bay') {
      const b = e.layout.bays[sel.number - 1];
      return new THREE.Vector3(b.cx, 0, (b.z0 + b.z1) / 2);
    }
    if (sel.type === 'stall') {
      const st = e.layout.stalls[sel.index];
      return new THREE.Vector3(st.x, 0, (st.z0 + st.z1) / 2);
    }
    return null;
  }

  updateMarkers(dtReal) {
    const t = performance.now() / 1000;
    const bob = this.reduceMotion ? 0 : Math.sin(t * 2.2) * 0.35;
    const place = (pin, sel, h) => {
      const a = this.anchorOf(sel);
      pin.visible = !!a;
      if (a) pin.position.set(a.x, h + bob, a.z);
    };
    place(this.pinSel, this.selection, this.selection?.type === 'bay' ? 10 : 6.5);
    const hov = this.hovered && JSON.stringify(this.hovered) !== JSON.stringify(this.selection) ? this.hovered : null;
    place(this.pinHover, hov, hov?.type === 'bay' ? 10 : 6.5);
    const g = this.selection?.type === 'truck' ? this.trucks.get(this.selection.id) : null;
    this.outline.visible = !!g;
    this.outlineRing.visible = !!this.selection && this.selection.type !== 'bay';
    if (g) {
      this.outline.position.copy(g.position).add(new THREE.Vector3(Math.cos(-g.rotation.y) * 1.5, 2.3, Math.sin(-g.rotation.y) * 1.5));
      this.outline.rotation.y = g.rotation.y;
    }
    const a = this.anchorOf(this.selection);
    if (a) this.outlineRing.position.set(a.x, 0.28, a.z);
  }

  // ---------- Mode dan kamera ----------
  setMode(mode) {
    this.mode = mode;
    this.envi.setZoneMode(mode === 'zones');
    this.clipTarget = mode === 'roofsOff' ? this.engine.config.facility.canopy.height - 3 : 100; // dipakai juga oleh pemotongan otomatis
    if (mode === 'oneTruck') {
      if (this.selection?.type === 'truck') this.rig.setView('follow', { truckId: this.selection.id });
    } else if (this.rig.mode === 'follow') this.rig.setView('overview');
  }
  setCamera(name) {
    if (name === 'bay') this.rig.setView('bay', { bay: this.selection?.type === 'bay' ? this.selection.number : null });
    else this.rig.setView(name);
  }
  zoom(factor) {
    this.rig.zoomBy(factor);
  }
  focusSelection() {
    const a = this.anchorOf(this.selection);
    if (!a) return false;
    this.rig.focusOn(a, this.selection.type === 'bay' ? 70 : 55);
    return true;
  }
  setPresentation(on) {
    this.rig.presentation = on;
  }
  setGrid(on) {
    this.envi.grid.visible = on;
  }
  setFeasibility(on) {
    this.showFeasibility = on;
    this.envi.setFeasibility(this.engine.geometryReport, on);
  }
  setSelection(sel) {
    if (this.selection?.type === 'truck') {
      const g = this.trucks.get(this.selection.id);
      if (g) setTruckHighlight(g, false);
    }
    this.selection = sel;
    this.bayBlock.setSelected(sel?.type === 'bay' ? sel.number : null);
    if (sel?.type === 'truck') {
      const g = this.trucks.get(sel.id);
      if (g) setTruckHighlight(g, true);
      if (this.mode === 'oneTruck') this.rig.setView('follow', { truckId: sel.id });
    }
    if (sel?.type === 'bay' && this.rig.mode === 'bay') this.rig.setView('bay', { bay: sel.number });
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    const meshes = [];
    for (const g of this.trucks.values()) for (const c of g.children) if (c.isMesh && c.userData?.type === 'truck') meshes.push(c);
    const hits = this.raycaster.intersectObjects(meshes, false);
    for (const h of hits) {
      const u = h.object.userData;
      if (u?.type === 'truck') return { type: 'truck', id: u.id };
    }
    // Bay/stall: potongan sinar dengan bidang tanah, dipetakan ke blok bay atau baris stall (tanpa mesh pemilih)
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, p)) {
      const n = this.bayBlock.bayAt(p.x, p.z);
      if (n) return { type: 'bay', number: n };
      const st = this.engine.layout.stalls.find((q) => p.x >= q.x0 && p.x < q.x1 && p.z >= q.z0 - 1 && p.z <= q.z1 + 1);
      if (st) return { type: 'stall', index: st.index };
    }
    return null;
  }

  // ---------- Listener: hover, klik, ukuran, visibilitas, konteks ----------
  installListeners() {
    const listen = (t, type, fn) => {
      t.addEventListener(type, fn);
      this.cleanups.push(() => t.removeEventListener(type, fn));
    };
    let downX = 0, downY = 0, dragged = false;
    listen(this.canvas, 'pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      dragged = false;
      this.labels.hideTooltip();
    });
    listen(this.canvas, 'pointermove', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5 && e.buttons) dragged = true;
      if (e.buttons || this.rig.dragging) return;
      const hit = this.pick(e.clientX, e.clientY);
      this.hovered = hit;
      this.canvas.style.cursor = hit ? 'pointer' : 'grab';
      if (hit && this.onHoverDescribe) {
        const d = this.onHoverDescribe(hit);
        const rect = this.canvas.getBoundingClientRect();
        if (d) this.labels.showTooltip(e.clientX - rect.left, e.clientY - rect.top, d.title, d.text, rect.width, rect.height);
        else this.labels.hideTooltip();
      } else this.labels.hideTooltip();
    });
    listen(this.canvas, 'pointerleave', () => {
      this.hovered = null;
      this.labels.hideTooltip();
    });
    listen(this.canvas, 'pointerup', (e) => {
      if (dragged) return;
      const hit = this.pick(e.clientX, e.clientY);
      this.onSelect?.(hit);
    });
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container);
    this.cleanups.push(() => ro.disconnect());
    listen(document, 'visibilitychange', () => this.setVisible(!document.hidden && this._intersecting !== false));
    this._intersecting = true;
    const io = new IntersectionObserver((entries) => {
      this._intersecting = entries[0].isIntersecting;
      this.setVisible(this._intersecting && !document.hidden);
    }, { threshold: 0.01 });
    io.observe(this.canvas);
    this.cleanups.push(() => io.disconnect());
    listen(this.canvas, 'webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.onError?.(ID.app.contextLost, true);
    });
    listen(this.canvas, 'webglcontextrestored', () => {
      this.contextLost = false;
      this.onContextRestored?.();
    });
  }
  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.onVisibility?.(v);
  }

  // ---------- Frame ----------
  update(prevPoses, alpha, dtReal, ui = {}) {
    if (!this.visible || this.contextLost) return;
    const engine = this.engine;
    const products = engine.config.products;
    const seen = new Set();
    const groups = [];
    for (const t of engine.trucks.values()) {
      if (!t.spawned || !t.pose) continue;
      seen.add(t.id);
      let g = this.trucks.get(t.id);
      if (!g) {
        g = createTruck({ id: t.id, label: t.label, productColor: products[t.product].color, M: this.M, renderer: this.renderer });
        this.scene.add(g);
        this.trucks.set(t.id, g);
        if (this.selection?.type === 'truck' && this.selection.id === t.id) setTruckHighlight(g, true);
      }
      const prev = prevPoses ? prevPoses.get(t.id) : null;
      const p = lerpPose(prev, t.pose, alpha);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = -p.theta;
      // Lampu: rem saat melambat/berhenti di rute aktif; mundur saat segmen mundur bergerak.
      const seg = t.currentSegment;
      const braking = t.travelling && (t.speed < (t._prevSpeed ?? t.speed) - 1e-6 || (t.speed === 0 && !t.atRouteEnd));
      setTruckLights(g, { brake: braking, reverse: !!(seg && seg.reverse && t.speed > 0) });
      t._prevSpeed = t.speed;
      groups.push(g);
    }
    for (const [id, g] of this.trucks) {
      if (!seen.has(id)) {
        this.scene.remove(g);
        this.disposeTruck(g);
        this.trucks.delete(id);
      }
    }
    this.wheels.update(groups);
    this.bayBlock.updateStatus(engine.bayStats(), products);
    this.updateGates(dtReal);
    // Bidang klip atap: mode Tanpa atap, atau otomatis saat kamera dekat agar truk di bawah kanopi terlihat
    const smooth = this.reduceMotion ? 1 : 1 - Math.exp(-dtReal * 5);
    const camDist = this.rig.camera.position.distanceTo(this.rig.controls.target);
    const roofCut = this.mode === 'roofsOff' || camDist < 95;
    const target = roofCut ? this.engine.config.facility.canopy.height - 3 : 100;
    this.clipPlane.constant = THREE.MathUtils.lerp(this.clipPlane.constant, target, smooth);
    // Layar ruang kontrol: maksimal 4 kali per detik
    if (ui.clock != null && performance.now() - this._displayAt > 250) {
      this._displayAt = performance.now();
      const c = engine.liveCounts();
      this.envi.updateDisplay({ queue: c.waiting, committed: c.committedBays, totalBays: engine.bays.length, rho: engine.theory.rho, clock: ui.clock });
    }
    // Kamera
    let followPose = null;
    if (this.rig.mode === 'follow' && this.rig.followId != null) {
      const g = this.trucks.get(this.rig.followId);
      if (g) followPose = { x: g.position.x, z: g.position.z, theta: -g.rotation.y };
    }
    this.rig.update(dtReal, followPose);
    this.updateMarkers(dtReal);
    // Detail kecil disembunyikan di luar jarak detail
    const dist = this.rig.camera.position.distanceTo(this.rig.controls.target);
    const showDetails = dist < DETAIL_DISTANCE;
    this.envi.setDetailsVisible(showDetails);
    this.bayBlock.setDetailsVisible(showDetails);
    this.updateLabels(dist);
    this.renderer.render(this.scene, this.rig.camera);
    // FPS dan rasio piksel adaptif (hanya resolusi raster; geometri dan waktu tidak berubah)
    this._fpsAcc += dtReal;
    this._fpsCount++;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsCount / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsCount = 0;
    }
    this._measure.frames++;
    this._measure.time += dtReal;
    if (this._measure.time > 4) {
      if (this._measure.frames / this._measure.time < 43 && this.pixelRatio > 1) {
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
      }
      this._measure = { frames: 0, time: 0 };
    }
  }

  updateGates(dt) {
    const e = this.engine;
    for (const gate of this.envi.gates) {
      let near = false;
      for (const t of e.trucks.values()) {
        if (!t.pose) continue;
        if (Math.abs(t.pose.z - gate.z) < 3 && Math.abs(t.pose.x - gate.x) < 16 && t.travelling && t.speed > 0) near = true;
      }
      const target = near ? 1 : 0;
      gate.open = this.reduceMotion ? target : THREE.MathUtils.lerp(gate.open, target, 1 - Math.exp(-dt * 3));
      gate.pivot.rotation.x = -gate.open * Math.PI * 0.46;
    }
  }

  updateLabels(dist) {
    const e = this.engine;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const stats = e.bayStats();
    const showBays = this.mode !== 'zones' && dist < 150;
    for (const b of this.bayBlock.bays) {
      const st = stats[b.number - 1];
      const l = this.labels.ensure(`bay${b.number}`, { title: `${ID.labels.bay} ${String(b.number).padStart(2, '0')}`, meta: `${ID.bay.icons[st.state]} ${ID.bay.states[st.state]}`, kind: 'bay' });
      this.labels.set(`bay${b.number}`, b.anchor, showBays);
      l.el.dataset.state = st.state;
    }
    for (const z of this.envi.zoneAnchors) {
      this.labels.ensure(`zone-${z.key}`, { title: z.name, meta: z.text, kind: 'zone' });
      this.labels.set(`zone-${z.key}`, z.pos, this.mode === 'zones');
    }
    if (this.selection?.type === 'truck') {
      const t = e.trucks.get(this.selection.id);
      const g = this.trucks.get(this.selection.id);
      if (t && g) {
        this.labels.ensure('truck', { title: t.label, meta: ID.truck.states[t.state], kind: 'truck' });
        this.labels.set('truck', new THREE.Vector3(g.position.x, 9.5, g.position.z), true);
      } else this.labels.set('truck', new THREE.Vector3(), false);
    } else this.labels.set('truck', new THREE.Vector3(), false);
    this.labels.project(this.rig.camera, w, h, this.labelPadding || { left: 10, right: 10, top: 110, bottom: 160 });
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    const pad = this.labelPadding || { left: 0, right: 0 };
    this.rig.resize(w, h, w > 860 ? { left: pad.left, right: pad.right } : { left: 0, right: 0 });
  }

  getDebugState() {
    const e = this.engine;
    return {
      mode: this.mode,
      camera: this.rig.mode,
      fps: this.fps,
      pixelRatio: this.renderer.getPixelRatio(),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      trucksDrawn: this.trucks.size,
      visible: this.visible,
      contextLost: this.contextLost,
      clip: this.clipPlane.constant,
      simTime: e.time,
      trucksInSystem: e.trucks.size,
      shadow: { enabled: this.renderer.shadowMap.enabled, cast: this.sun.castShadow, hasMap: !!this.sun.shadow.map, cam: [this.sun.shadow.camera.left, this.sun.shadow.camera.right, this.sun.shadow.camera.near, this.sun.shadow.camera.far], sun: this.sun.position.toArray().map((v) => Math.round(v)), target: this.sun.target.position.toArray().map((v) => Math.round(v)) },
    };
  }

  disposeTruck(g) {
    g.traverse((o) => {
      if (o.userData?.plate) o.userData.plate.texture.dispose();
      if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry') o.geometry.dispose();
    });
  }
  disposeGroup(group) {
    group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.map) m.map.dispose();
        }
      }
    });
  }
  dispose() {
    for (const fn of this.cleanups.reverse()) fn();
    this.cleanups.length = 0;
    this.labels.dispose();
    this.rig.dispose();
    this.wheels.dispose();
    if (this.staticGroup) this.disposeGroup(this.staticGroup);
    for (const g of this.trucks.values()) this.disposeTruck(g);
    for (const m of Object.values(this.M)) m?.dispose?.();
    disposeGeometryCache();
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
