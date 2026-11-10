// Panggung bab "Truk": truk tangki 32.000 liter empat kompartemen yang bisa dijelajahi. Badan truk berasal dari
// model referensi tim (dibakar oleh scripts/bake-showcase-truck.mjs, tanpa logo/wordmark); tangkinya digambar di sini
// agar bisa tembus pandang, diisi cairan per kompartemen, dan dilepas dinding sekatnya untuk demo guncangan cairan.
// Kerangka lokal: truk menghadap +X, tanah y = 0, sisi layanan (katup bongkar, placard) di -Z menghadap kamera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import bodyUrl from '../assets/truck-showcase-body.glb?url';
import wheelUrl from '../assets/truck-showcase-wheel.glb?url';
import { contactShadow } from '../../render/materials.js';
import { TRUCK } from '../world.js';
import { solveSurface, heightFor, Slosh } from './tankMath.js';

// Ukuran dari extras hasil bake (npm run bake:showcase); diperiksa ulang saat model dimuat.
const TANK = { x0: -6.131, x1: 2.481, y: 2.34, ry: 1.0, rz: 1.14 };
const COMPS = [[-6.019, -4.043], [-3.882, -1.906], [-1.744, 0.232], [0.393, 2.369]]; // belakang → depan
const BULKHEADS = [-3.963, -1.825, 0.313];
const WHEELS = [[5.72, 1], [2.84, 1], [1.55, 1], [-4.02, 1], [-5.42, 1], [5.72, -1], [2.84, -1], [1.55, -1], [-4.02, -1], [-5.42, -1]].map(([x, s]) => [x, 0.57, 1.1 * s]);
const WHEEL_R = 0.57;
const INNER = 0.955; // cairan sedikit lebih kecil dari cangkang
const RY = TANK.ry * INNER, RZ = TANK.rz * INNER;

export const COMPARTMENT_LITRES = 8000;
const FULL = 0.9; // kompartemen penuh tetap menyisakan ruang uap di atas cairan (agar permukaannya terlihat)
export const POSTER_LOAD = ['pertalite', 'pertamax', 'pertamaxTurbo', 'pertadex']; // belakang → depan, seperti infografik
const CRUISE = 60 / 3.6; // m/detik
const BRAKE = 5.5, ACCEL = 2.2; // m/detik²
const ROAD_LEN = 720;

// Titik bagian truk (lokal) dan arah pandang kamera saat bagian itu dipilih.
export const PARTS = [
  { key: 'cab', pos: [5.55, 2.62, -1.24], n: [0.25, 0, -1], view: [0.9, 0.3, -1], dist: 20 },
  { key: 'tank', pos: [-2.9, 2.5, -1.16], n: [0, 0, -1], view: [0.15, 0.32, -1], dist: 26, xray: true },
  { key: 'bulkhead', pos: [0.31, 3.02, -0.72], n: [0, 0.6, -1], view: [0.45, 0.5, -1], dist: 17, xray: true },
  { key: 'manhole', pos: [-0.76, 3.52, 0], n: [0, 1, 0], view: [0.35, 0.95, -1], dist: 17 },
  { key: 'valve', pos: [-3.05, 1.27, -1.32], n: [0, 0, -1], view: [-0.2, 0.16, -1], dist: 14 },
  { key: 'placard', pos: [-0.56, 1.13, -1.33], n: [0, 0, -1], view: [0.2, 0.14, -1], dist: 13 },
  { key: 'ladder', pos: [-6.5, 2.5, 0], n: [-1, 0, -0.2], view: [-1, 0.42, -0.75], dist: 20 },
];

function toFloat(attr) {
  if (attr.array instanceof Float32Array && !attr.normalized) return attr;
  const n = attr.count, sz = attr.itemSize, out = new Float32Array(n * sz);
  for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) out[i * sz + c] = attr.getComponent(i, c);
  return new THREE.BufferAttribute(out, sz);
}
function loadBaked(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      const geos = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
          else g.setAttribute(name, toFloat(g.getAttribute(name)));
        }
        g.applyMatrix4(o.matrixWorld);
        geos.push(g);
      });
      const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      resolve({ geometry, extras: gltf.parser.json.asset?.extras || {} });
    }, undefined, reject);
  });
}

// Badan cairan di dalam tabung elips: irisan sepanjang X, tiap irisan berupa busur terendam + garis permukaan.
class LiquidBody {
  constructor(x0, x1, ns, material, na = 22) {
    this.len = x1 - x0;
    this.xc = (x0 + x1) / 2;
    this.ns = ns;
    this.na = na;
    this.xs = Array.from({ length: ns + 1 }, (_, i) => -this.len / 2 + (this.len * i) / ns);
    this.heights = [];
    this.shift = 0;
    const wall = (ns + 1) * (na + 1), surf = (ns + 1) * 2, caps = 2 * (na + 1), nv = wall + surf + caps;
    this.offset = { surf: wall, caps: wall + surf };
    this.pos = new Float32Array(nv * 3);
    this.nor = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3).fill(0.82);
    col.fill(0.96, wall * 3, (wall + surf) * 3);
    col.fill(0.92, (wall + surf) * 3);
    const idx = [];
    for (let i = 0; i < ns; i++) for (let j = 0; j < na; j++) {
      const a = i * (na + 1) + j, b = a + 1, c = a + na + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    for (let i = 0; i < ns; i++) {
      const a = wall + 2 * i, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    for (let k = 0; k < 2; k++) {
      const base = wall + surf + k * (na + 1);
      for (let j = 1; j < na; j++) idx.push(base, base + j, base + j + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }
  // fraction: bagian volume terisi; slope: tan θ permukaan (naik ke arah +X); ripple: riak kecil saat mengisi/berjalan.
  update(fraction, slope, time = 0, ripple = 0) {
    this.mesh.visible = fraction > 0.004;
    if (!this.mesh.visible) {
      this.shift = 0;
      return;
    }
    const { ns, na, pos, nor, xs } = this;
    const res = solveSurface(xs, slope / RY, fraction, this.heights);
    this.shift = res.shift;
    const sn = new THREE.Vector3(-slope, 1, 0).normalize();
    const put = (arr, k, x, y, z) => {
      arr[k * 3] = x;
      arr[k * 3 + 1] = y;
      arr[k * 3 + 2] = z;
    };
    for (let i = 0; i <= ns; i++) {
      let h = this.heights[i];
      if (ripple) h += ripple * Math.sin(xs[i] * 5.2 + time * 7.5) * (1 - Math.abs(h));
      h = Math.min(0.9995, Math.max(-0.9995, h));
      const pm = Math.acos(-h), x = this.xc + xs[i];
      for (let j = 0; j <= na; j++) {
        const p = pm * ((2 * j) / na - 1), c = Math.cos(p), s = Math.sin(p);
        const k = i * (na + 1) + j;
        put(pos, k, x, TANK.y - RY * c, RZ * s);
        const ny = -c / RY, nz = s / RZ, l = Math.hypot(ny, nz) || 1;
        put(nor, k, 0, ny / l, nz / l);
        if (i === 0 || i === ns) {
          const ck = this.offset.caps + (i === 0 ? 0 : na + 1) + j;
          put(pos, ck, x, TANK.y - RY * c, RZ * s);
          put(nor, ck, i === 0 ? -1 : 1, 0, 0);
        }
      }
      const y = TANK.y + RY * h, z = RZ * Math.sin(pm), sk = this.offset.surf + 2 * i;
      put(pos, sk, x, y, -z);
      put(pos, sk + 1, x, y, z);
      put(nor, sk, sn.x, sn.y, 0);
      put(nor, sk + 1, sn.x, sn.y, 0);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
  }
}

export function buildTruckShow({ M, products }) {
  const group = new THREE.Group();
  group.position.set(TRUCK.cx, TRUCK.y, TRUCK.cz);
  const scenery = new THREE.Group();
  const truck = new THREE.Group(); // badan + tangki: ikut mengangguk saat mengerem
  const mirror = new THREE.Group(); // model sumber punya katup di +Z; dicerminkan agar menghadap kamera di -Z
  mirror.scale.z = -1;
  truck.add(mirror);
  group.add(scenery, truck);

  const color = (id) => new THREE.Color(products[id]?.color || '#9AA5AE');
  const WHITE = new THREE.Color('#F3F5F7'), GLASS = new THREE.Color('#A9CBE4'), HL = new THREE.Color('#FFD45C');

  // ---------- Panggung: jalan, marka, patok dan pohon yang bergulir saat truk "berjalan" ----------
  const road = new THREE.Mesh(new THREE.BoxGeometry(ROAD_LEN, 0.2, 15), M.asphalt);
  road.position.set(0, -0.1, -2.7);
  road.receiveShadow = true;
  scenery.add(road);
  for (const z of [-9, 3.6]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, 0.2).rotateX(-Math.PI / 2), M.markingWhite);
    edge.position.set(0, 0.012, z);
    scenery.add(edge);
  }
  contactShadow(scenery, 19, 6.4, 0.2, 0.02, 0, 0.5);
  const dummy = new THREE.Object3D();
  const strips = [];
  const strip = (mesh, items, period) => {
    mesh.frustumCulled = false;
    scenery.add(mesh);
    strips.push({ mesh, items, period });
  };
  const DASH = 10, nDash = Math.floor(ROAD_LEN / DASH);
  strip(new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4, 0.22).rotateX(-Math.PI / 2), M.markingWhite, nDash), Array.from({ length: nDash }, (_, i) => ({ x: i * DASH, y: 0.014, z: -2.7, s: 1 })), nDash * DASH);
  const POST = 12, nPost = Math.floor(ROAD_LEN / POST);
  const postItems = [];
  for (let i = 0; i < nPost; i++) for (const z of [-9.7, 4.3]) postItems.push({ x: i * POST, y: 0.4, z, s: 1 });
  strip(new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), M.whiteSteel, postItems.length), postItems, nPost * POST);
  const rnd = ((seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)(20261111);
  const trees = Array.from({ length: 64 }, (_, i) => ({ x: (i + rnd() * 0.7) * (ROAD_LEN / 64), z: 10 + rnd() * 26, s: 0.75 + rnd() * 0.7 }));
  strip(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.36, 2.4, 6), M.trunk, trees.length), trees.map((t) => ({ ...t, y: 1.2 * t.s - 0.2 })), ROAD_LEN);
  strip(new THREE.InstancedMesh(new THREE.SphereGeometry(2.3, 10, 8), M.leaf, trees.length), trees.map((t) => ({ ...t, y: 3.7 * t.s - 0.2 })), ROAD_LEN);
  let scrollDrawn = null;
  function drawScenery(scroll) {
    if (scrollDrawn === scroll) return;
    scrollDrawn = scroll;
    for (const s of strips) {
      s.items.forEach((it, i) => {
        const x = ((((it.x - scroll) % s.period) + s.period) % s.period) - s.period / 2;
        dummy.position.set(x, it.y, it.z);
        dummy.scale.setScalar(it.s);
        dummy.updateMatrix();
        s.mesh.setMatrixAt(i, dummy.matrix);
      });
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- Tangki: cangkang per kompartemen, gelang, tutup ujung, dinding sekat, cairan ----------
  const tube = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).rotateZ(Math.PI / 2);
  const shells = COMPS.map(([x0, x1], i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.12, emissive: HL, emissiveIntensity: 0 });
    const m = new THREE.Mesh(tube, mat);
    m.scale.set(x1 - x0, TANK.ry, TANK.rz);
    m.position.set((x0 + x1) / 2, TANK.y, 0);
    m.userData.cardKey = `truck:comp:${i}`;
    m.castShadow = true;
    truck.add(m);
    return m;
  });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xb4bec8, roughness: 0.35, metalness: 0.55 });
  const bands = [[TANK.x0, COMPS[0][0]], ...COMPS.slice(0, -1).map((c, i) => [c[1], COMPS[i + 1][0]]), [COMPS[3][1], TANK.x1]];
  for (const [x0, x1] of bands) {
    const m = new THREE.Mesh(tube, ringMat);
    m.scale.set(x1 - x0, TANK.ry * 1.014, TANK.rz * 1.014);
    m.position.set((x0 + x1) / 2, TANK.y, 0);
    truck.add(m);
  }
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc3ccd5, roughness: 0.3, metalness: 0.5 });
  const dome = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const [x, dir] of [[TANK.x1, 1], [TANK.x0, -1]]) {
    const m = new THREE.Mesh(dome, capMat);
    m.rotation.z = (-dir * Math.PI) / 2;
    m.position.set(x, TANK.y, 0);
    // Sumbu lokal kubah: Y = kutub. Setelah rotasi Z ±90°, Y lokal → ±X dunia, X lokal → ∓Y dunia, Z lokal tetap.
    m.scale.set(TANK.ry * 1.014, 0.2, TANK.rz * 1.014);
    truck.add(m);
  }
  const bulkMat = new THREE.MeshStandardMaterial({ color: 0xaab4be, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide, transparent: true });
  const disc = new THREE.CylinderGeometry(1, 1, 0.05, 44).rotateZ(Math.PI / 2);
  const bulkheads = BULKHEADS.map((x) => {
    const m = new THREE.Mesh(disc, bulkMat);
    m.scale.set(1, TANK.ry * 0.985, TANK.rz * 0.985);
    m.position.set(x, TANK.y, 0);
    truck.add(m);
    return m;
  });
  const liquidMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, emissiveIntensity: 0.16 });
  const liquids = COMPS.map(([x0, x1]) => new LiquidBody(x0 + 0.02, x1 - 0.02, 14, liquidMat()));
  const merged = new LiquidBody(COMPS[0][0] + 0.02, COMPS[3][1] - 0.02, 48, liquidMat());
  for (const l of [...liquids, merged]) truck.add(l.mesh);
  merged.mesh.visible = false;
  const MERGED_LEN = merged.len, COMP_LEN = COMPS.map(([a, b]) => b - a);

  // Penanda titik berat muatan (demo guncangan)
  const comMarker = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 20).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xe31e2d, emissive: 0xe31e2d, emissiveIntensity: 0.5, roughness: 0.4 }));
  const comRest = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0x5c6b66, roughness: 0.6 }));
  comMarker.visible = comRest.visible = false;
  truck.add(comMarker, comRest);

  // ---------- Badan dan roda dari model referensi ----------
  let wheels = null;
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.5 });
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const ready = Promise.all([loadBaked(loader, bodyUrl), loadBaked(loader, wheelUrl)]).then(([body, wheel]) => {
    const t = body.extras.tank;
    if (t && (Math.abs(t.x0 - TANK.x0) > 0.02 || Math.abs(t.x1 - TANK.x1) > 0.02 || Math.abs(t.y - TANK.y) > 0.02)) console.warn('Ukuran tangki model berbeda dari konstanta truckShow.js; sesuaikan setelah bake ulang.', t);
    const mesh = new THREE.Mesh(body.geometry, bodyMat);
    mesh.castShadow = true;
    mirror.add(mesh);
    const wc = wheel.extras.wheel || WHEELS[0];
    wheel.geometry.translate(-wc[0], -wc[1], -wc[2]); // pusat roda ke titik asal agar bisa diputar
    wheels = new THREE.InstancedMesh(wheel.geometry, bodyMat, WHEELS.length);
    wheels.frustumCulled = false;
    const holder = new THREE.Group(); // roda tidak ikut mengangguk
    holder.scale.z = -1;
    holder.add(wheels);
    group.add(holder);
    drawWheels(0, true);
  }).catch((err) => console.warn('Model truk pameran gagal dimuat; hanya tangki yang ditampilkan.', err));
  let wheelDrawn = null;
  function drawWheels(angle, force = false) {
    if (!wheels || (!force && wheelDrawn === angle)) return;
    wheelDrawn = angle;
    WHEELS.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, z < 0 ? Math.PI : 0, z < 0 ? angle : -angle);
      dummy.updateMatrix();
      wheels.setMatrixAt(i, dummy.matrix);
    });
    dummy.rotation.set(0, 0, 0);
    wheels.instanceMatrix.needsUpdate = true;
  }

  // ---------- Keadaan ----------
  const state = {
    mode: null,
    xray: false,
    xr: 0,
    selected: -1,
    hover: -1,
    part: null,
    comps: POSTER_LOAD.map((product) => ({ product, litres: COMPARTMENT_LITRES, frac: FULL, slosh: new Slosh(), glow: 0 })),
    bulkheads: true,
    bulkT: 1,
    surgeFill: 0.7,
    cmd: 'park',
    v: 0,
    a: 0,
    aSm: 0,
    scroll: 0,
    wheelAngle: 0,
    pitch: 0,
    shift: 0,
    peak: { with: 0, without: 0 },
    mergedSlosh: new Slosh(),
    time: 0,
    version: 0,
  };
  const bump = () => state.version++;
  const mixColor = new THREE.Color(), tmpColor = new THREE.Color(), tmpColor2 = new THREE.Color();

  const api = {
    group,
    pickables: shells,
    state,
    ready,
    setMode(mode) {
      if (state.mode === mode) return;
      state.mode = mode;
      state.part = null;
      state.hover = -1;
      state.selected = mode === 'load' ? Math.max(0, state.selected) : -1;
      state.xray = mode === 'load' || mode === 'surge';
      state.bulkheads = true;
      state.a = 0;
      state.peak = { with: 0, without: 0 };
      for (const c of state.comps) c.slosh.reset();
      state.mergedSlosh.reset();
      if (mode === 'surge') {
        state.cmd = 'cruise';
        state.v = CRUISE;
        for (const c of state.comps) if (!c.product) c.product = POSTER_LOAD[state.comps.indexOf(c)];
      } else {
        state.cmd = 'park';
        state.v = 0;
      }
      comMarker.visible = comRest.visible = mode === 'surge' && state.markers !== false;
      bump();
    },
    // Penanda titik berat pada demo guncangan; halaman video menyembunyikannya
    showMarkers(on) {
      state.markers = on;
      comMarker.visible = comRest.visible = on && state.mode === 'surge';
    },
    setXray(on) {
      state.xray = on ?? !state.xray;
      bump();
    },
    select(i) {
      state.selected = i;
      bump();
    },
    setHover(i) {
      state.hover = i;
    },
    setPart(key) {
      state.part = key;
      const p = PARTS.find((x) => x.key === key);
      if (p?.xray) state.xray = true;
      bump();
    },
    setProduct(i, productId) {
      const c = state.comps[i];
      if (!c) return;
      c.product = productId;
      if (!productId) c.litres = 0;
      else if (c.litres === 0) c.litres = COMPARTMENT_LITRES;
      bump();
    },
    setLitres(i, litres) {
      const c = state.comps[i];
      if (!c) return;
      c.litres = Math.max(0, Math.min(COMPARTMENT_LITRES, litres));
      if (c.litres > 0 && !c.product) c.product = POSTER_LOAD[i];
      bump();
    },
    loadAll(list, litres = COMPARTMENT_LITRES) {
      state.comps.forEach((c, i) => {
        c.product = list[i] || null;
        c.litres = list[i] ? litres : 0;
      });
      bump();
    },
    setBulkheads(on) {
      const next = on ?? !state.bulkheads;
      if (next === state.bulkheads) return;
      state.bulkheads = next;
      // Serah terima kemiringan agar permukaan tidak melompat saat sekat dipasang/dilepas
      if (next) for (const c of state.comps) c.slosh.reset();
      else state.mergedSlosh.reset();
      bump();
    },
    setSurgeFill(f) {
      state.surgeFill = Math.max(0.3, Math.min(1, f));
      state.peak = { with: 0, without: 0 };
      bump();
    },
    brake() {
      if (state.mode !== 'surge' || state.v <= 0.05) return;
      state.cmd = 'brake';
      bump();
    },
    go() {
      if (state.mode !== 'surge') return;
      state.cmd = 'go';
      bump();
    },
    toggleDrive() {
      if (state.cmd === 'cruise' || state.cmd === 'go') api.brake();
      else api.go();
    },
    totals() {
      const by = {};
      let total = 0;
      for (const c of state.comps) if (c.product && c.litres > 0) {
        by[c.product] = (by[c.product] || 0) + c.litres;
        total += c.litres;
      }
      return { total, by, capacity: COMPARTMENT_LITRES * state.comps.length };
    },
    // Tujuan kamera (dunia) untuk seluruh truk atau satu bagian
    cameraGoal({ dir = [0.5, 0.36, -1], dist = 36, offset = [0, 0, 0], part = null } = {}) {
      const p = part ? PARTS.find((x) => x.key === part) : null;
      const tgt = p ? new THREE.Vector3(...p.pos) : new THREE.Vector3(0.2 + offset[0], 2.0 + offset[1], offset[2]);
      if (p) tgt.y = Math.max(1.4, tgt.y - 0.3);
      tgt.add(group.position);
      const d = new THREE.Vector3(...(p ? p.view : dir)).normalize();
      return { pos: tgt.clone().addScaledVector(d, p ? p.dist : dist), tgt };
    },
    // Penanda HTML (dunia): nomor bagian, label kompartemen, titik berat
    partAnchor(key, out = new THREE.Vector3()) {
      const p = PARTS.find((x) => x.key === key);
      return truck.localToWorld(out.set(...p.pos));
    },
    partFacing(key, cameraPos) {
      const p = PARTS.find((x) => x.key === key);
      const a = truck.localToWorld(new THREE.Vector3(...p.pos));
      return new THREE.Vector3(...p.n).dot(cameraPos.clone().sub(a)) > 0;
    },
    compAnchor(i, out = new THREE.Vector3()) {
      return truck.localToWorld(out.set((COMPS[i][0] + COMPS[i][1]) / 2, TANK.y + TANK.ry + 0.95, 0));
    },
    comAnchor(out = new THREE.Vector3()) {
      return truck.localToWorld(out.copy(comMarker.position).setY(comMarker.position.y + 0.55));
    },
    update(dt) {
      const s = state;
      s.time += dt;
      const ease = (rate) => 1 - Math.exp(-dt * rate);
      s.xr += ((s.xray ? 1 : 0) - s.xr) * ease(7);
      s.bulkT = THREE.MathUtils.clamp(s.bulkT + (s.bulkheads ? 1 : -1) * dt * 1.8, 0, 1);
      // Gerak truk (hanya pada demo guncangan)
      if (s.cmd === 'brake') {
        s.a = -BRAKE;
        s.v = Math.max(0, s.v + s.a * dt);
        if (s.v === 0) {
          s.cmd = 'stop';
          s.a = 0;
          bump();
        }
      } else if (s.cmd === 'go') {
        s.a = ACCEL;
        s.v = Math.min(CRUISE, s.v + s.a * dt);
        if (s.v === CRUISE) {
          s.cmd = 'cruise';
          s.a = 0;
          bump();
        }
      } else s.a = 0;
      s.aSm += (s.a - s.aSm) * ease(9);
      s.scroll += s.v * dt;
      s.wheelAngle += (s.v * dt) / WHEEL_R;
      drawScenery(s.scroll);
      drawWheels(s.wheelAngle);
      // Isi kompartemen menuju target
      const surge = s.mode === 'surge';
      let filling = 0;
      s.comps.forEach((c) => {
        const target = (surge ? s.surgeFill : c.litres / COMPARTMENT_LITRES) * FULL;
        const d = THREE.MathUtils.clamp(target - c.frac, -dt * 0.65, dt * 0.65);
        c.frac += d;
        c.filling = Math.abs(target - c.frac) > 1e-4;
        if (c.filling) filling++;
      });
      // Cairan
      const mergedOn = s.bulkT < 0.3;
      const road = (s.v / CRUISE) * 0.006;
      let wSum = 0, mSum = 0;
      mixColor.setRGB(0, 0, 0);
      const nProducts = new Set();
      s.comps.forEach((c, i) => {
        const w = c.frac * COMP_LEN[i];
        wSum += w;
        if (c.product && w > 0) {
          mixColor.add(tmpColor.copy(color(c.product)).multiplyScalar(w));
          nProducts.add(c.product);
        }
      });
      if (wSum > 0) mixColor.multiplyScalar(1 / wSum);
      if (nProducts.size > 1) mixColor.multiplyScalar(0.78); // tercampur: keruh
      if (!mergedOn) {
        merged.mesh.visible = false;
        s.comps.forEach((c, i) => {
          const depth = (heightFor(c.frac) + 1) * RY;
          c.slosh.step(dt, s.aSm, COMP_LEN[i], depth, 0.2);
          const l = liquids[i];
          l.update(c.frac, c.slosh.slope, s.time + i, (c.filling ? 0.02 : 0) + road);
          l.mesh.visible = l.mesh.visible && s.xr > 0.02;
          const col = c.product ? color(c.product) : WHITE;
          l.mesh.material.color.copy(col);
          l.mesh.material.emissive.copy(col);
          mSum += c.frac * COMP_LEN[i] * l.shift;
        });
        s.shift = wSum > 0 ? mSum / wSum : 0;
      } else {
        for (const l of liquids) l.mesh.visible = false;
        const f = wSum / MERGED_LEN;
        const depth = (heightFor(f) + 1) * RY;
        s.mergedSlosh.step(dt, s.aSm, MERGED_LEN, depth, 0.085);
        merged.update(f, s.mergedSlosh.slope, s.time, road);
        merged.mesh.visible = merged.mesh.visible && s.xr > 0.02;
        merged.mesh.material.color.copy(mixColor);
        merged.mesh.material.emissive.copy(mixColor);
        s.shift = merged.shift;
      }
      if (surge && (s.bulkT === 1 || s.bulkT === 0)) {
        const k = s.bulkheads ? 'with' : 'without';
        const a = Math.abs(s.shift);
        if (a > s.peak[k] + 0.002) s.peak[k] = a;
      }
      // Cangkang: warna produk saat padat, kaca saat tembus pandang; sorot saat dipilih/disentuh
      const opacity = THREE.MathUtils.lerp(1, 0.24, s.xr);
      s.comps.forEach((c, i) => {
        const mat = shells[i].material;
        const base = c.product && c.frac > 0.004 ? tmpColor.copy(color(c.product)).lerp(WHITE, 0.12) : tmpColor.copy(WHITE);
        if (mergedOn && wSum > 0) base.copy(mixColor).lerp(WHITE, 0.12);
        const glass = tmpColor2.copy(GLASS).lerp(base, 0.22);
        mat.color.copy(base).lerp(glass, s.xr);
        const wantGlow = s.mode === 'load' && i === s.selected ? 0.55 + Math.sin(s.time * 4) * 0.12 : i === s.hover && s.mode !== 'surge' ? 0.35 : s.mode === 'parts' && s.part === 'tank' ? 0.3 : 0;
        c.glow += (wantGlow - c.glow) * ease(10);
        mat.emissiveIntensity = c.glow;
        const transparent = opacity < 0.995;
        if (mat.transparent !== transparent) {
          mat.transparent = transparent;
          mat.depthWrite = !transparent;
          mat.side = transparent ? THREE.DoubleSide : THREE.FrontSide; // kaca: sisi dalam ikut terlihat
          mat.needsUpdate = true;
        }
        mat.opacity = opacity;
      });
      // Dinding sekat: terangkat keluar tangki saat dilepas
      const lift = 1 - s.bulkT, e = lift * lift * (3 - 2 * lift);
      bulkheads.forEach((m) => {
        m.position.y = TANK.y + e * 2.9;
        m.visible = s.xr > 0.02 || e > 0.02;
      });
      bulkMat.opacity = THREE.MathUtils.lerp(1, 0.4, e);
      bulkMat.emissive.copy(HL);
      bulkMat.emissiveIntensity = s.mode === 'parts' && s.part === 'bulkhead' ? 0.45 + Math.sin(s.time * 4) * 0.1 : 0;
      // Badan mengangguk saat mengerem dan saat muatan terdorong ke depan
      const pitchTarget = THREE.MathUtils.clamp(s.aSm * 0.0022 - s.shift * 0.004, -0.02, 0.012);
      s.pitch += (pitchTarget - s.pitch) * ease(6);
      truck.rotation.z = s.pitch;
      truck.position.y = Math.abs(s.pitch) * 1.2;
      // Penanda titik berat
      if (surge) {
        const cx = (COMPS[0][0] + COMPS[3][1]) / 2;
        comMarker.position.set(cx + s.shift, TANK.y + TANK.ry + 1.75 + Math.sin(s.time * 3) * 0.04, 0);
        comRest.position.set(cx, TANK.y + TANK.ry + 1.25, 0);
      }
    },
  };
  drawScenery(0);
  api.update(0);
  return api;
}
