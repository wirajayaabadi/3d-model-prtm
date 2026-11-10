// SPBU di ujung jalan keluar terminal (ujung rantai nilai) dan truk "perjalanan": keluar gerbang, menyusuri jalan,
// masuk lewat pintu MASUK, lalu berhenti di area bongkar di samping kanopi (bukan di pompa: truk tangki mengisi
// tangki pendam SPBU, kendaraan pelangganlah yang ke pompa).
// Tata letak mengikuti gambar acuan tim: pelataran ubin putih di tepi jalan bermarka putus-putus, kanopi putih
// bergaris biru-hijau-merah di atas dua pulau pompa, toko berpita biru, tiang papan nama, pagar semak dan pohon.
// Logo pada kanopi dan tiang memakai berkas logo tim sebagai stiker (render/assets/brandLogo.js); tidak digambar
// ulang di kode. Koordinat lokal: lx ke timur, lz ke selatan, dihitung dari SPBU.cx / SPBU.cz.
import * as THREE from 'three';
import { box, cyl, compact, contactShadow, stripGeometry, canvasTexture, FONT } from '../../render/materials.js';
import { createTruck, setTruckLights, WheelPool } from '../../render/assets/truck.js';
import { onTruckModelsReady } from '../../render/assets/truckModels.js';
import { logoMesh } from '../../render/assets/brandLogo.js';
import { SPBU } from '../world.js';
import { PLAN, tripLateral } from './spbuPlan.js';

export function buildSpbu({ M, renderer, layout, config, scene }) {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const C = new THREE.Vector3(SPBU.cx, 0, SPBU.cz);
  const X = (lx) => C.x + lx, Z = (lz) => C.z + lz;
  const exitZ = config.facility.gates.exit.z, roadZ = exitZ - C.z, roadW = config.facility.roads.width;
  const P = PLAN, TOP = 0.12; // tinggi muka pelataran
  const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
  const L = {
    dark: mat('#1E2A3A', 0.55),
    hose: mat('#12171E', 0.5),
    hedge: mat('#8CC63F', 0.95, { flatShading: true }),
    leaf: mat('#7FBF3F', 0.95, { flatShading: true }),
    planter: mat('#DCE2E7', 0.9),
    yellow: mat('#F2C230', 0.8),
    cone: mat('#F26A21', 0.7),
    door: mat('#22324A', 0.35),
    pane: mat('#8FA6BF', 0.2),
    car: mat('#2F6FD0', 0.45),
    lid: mat('#59636E', 0.7),
  };
  const flat = (w, d, lx, lz, m, y = TOP + 0.04, order = 2) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
    o.position.set(X(lx), y, Z(lz));
    o.receiveShadow = true;
    o.renderOrder = order;
    statics.add(o);
    return o;
  };
  // Teks pada bidang (papan atau marka lantai). Kanvas transparan, jadi warna dasar mengikuti benda di bawahnya.
  const sign = (text, w, h, { color = '#FFFFFF', bg = null, arrow = 0 } = {}) => {
    const px = 160, cw = Math.round(w * px), ch = Math.round(h * px);
    const tex = canvasTexture(cw, ch, (ctx) => {
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cw, ch);
      }
      ctx.fillStyle = color;
      let x0 = 0;
      if (arrow) { // panah di kiri teks: 1 = ke atas (masuk), -1 = ke bawah (keluar)
        const a = ch * 0.8, cx = a * 0.5, cy = ch / 2;
        ctx.save();
        ctx.translate(cx, cy);
        if (arrow < 0) ctx.rotate(Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, -a / 2);
        ctx.lineTo(a * 0.36, -a * 0.08);
        ctx.lineTo(a * 0.13, -a * 0.08);
        ctx.lineTo(a * 0.13, a / 2);
        ctx.lineTo(-a * 0.13, a / 2);
        ctx.lineTo(-a * 0.13, -a * 0.08);
        ctx.lineTo(-a * 0.36, -a * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        x0 = a * 1.05;
      }
      ctx.font = `800 ${Math.round(ch * 0.7)}px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(text, x0 + (cw - x0) / 2, ch * 0.54, cw - x0 - ch * 0.2);
    }, renderer);
    return new THREE.MeshBasicMaterial({ map: tex.texture, transparent: !bg, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  };
  const wallSign = (text, w, h, lx, y, lz, ry, opts) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sign(text, w, h, opts));
    o.position.set(X(lx), y, Z(lz));
    o.rotation.y = ry;
    o.renderOrder = 3;
    group.add(o);
  };
  const floorSign = (text, w, h, lx, lz, opts) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), sign(text, w, h, opts));
    o.position.set(X(lx), TOP + 0.07, Z(lz));
    o.renderOrder = 3;
    group.add(o);
  };

  // ---------- Jalan: satu arah dua lajur, garis tepi, marka putus-putus ----------
  const east = -config.facility.roads.exitRunoffLength + 2, west = X(P.slab.x0 - 26);
  const road = new THREE.Mesh(stripGeometry([{ x: east, z: exitZ }, { x: west, z: exitZ }], roadW), M.asphalt);
  road.position.y = 0.09;
  road.receiveShadow = true;
  statics.add(road);
  const line = (x0, x1, z, w = 0.16) => {
    const e = new THREE.Mesh(stripGeometry([{ x: x0, z }, { x: x1, z }], w), M.markingWhite);
    e.position.y = 0.13;
    e.renderOrder = 2;
    statics.add(e);
  };
  const half = roadW / 2 - 0.15;
  line(east, west, exitZ + half);
  line(east, X(P.entry.x1), exitZ - half); // garis tepi sisi SPBU terputus di bukaan masuk dan keluar
  line(X(P.entry.x0), X(P.exit.x1), exitZ - half);
  line(X(P.exit.x0), west, exitZ - half);
  for (let x = east - 8; x - 3 > west; x -= 7) line(x, x - 3, exitZ, 0.14);

  // ---------- Pelataran ubin, bukaan beraspal, pagar semak ----------
  const sw = P.slab.x1 - P.slab.x0, sd = P.slab.z1 - P.slab.z0, scx = (P.slab.x0 + P.slab.x1) / 2, scz = (P.slab.z0 + P.slab.z1) / 2;
  box(statics, sw, 0.6, sd, X(scx), TOP - 0.36, Z(scz), M.concreteLight, 0.25, false).receiveShadow = true; // alas; ubin di atasnya
  const tiles = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#F5F6F3';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#E2E6E8';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 128, 128);
  }, renderer).texture;
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set((sw - 0.5) / 2.5, (sd - 0.5) / 2.5);
  flat(sw - 0.5, sd - 0.5, scx, scz, mat('#FFFFFF', 0.9, { map: tiles }), TOP, 1);
  const apron = (g) => flat(g.x1 - g.x0, 5.6, (g.x0 + g.x1) / 2, P.slab.z1 - 2.8, M.asphalt);
  apron(P.entry);
  apron(P.exit);
  floorSign('MASUK', 5.2, 1.1, 22.5, -1.5, { arrow: 1 });
  floorSign('KELUAR', 5.6, 1.1, -26, -1.5, { arrow: -1 });
  const hx0 = P.hedge.x0, hx1 = P.hedge.x1;
  box(statics, hx1 - hx0, 0.34, 1.5, X((hx0 + hx1) / 2), TOP + 0.17, Z(P.hedge.z), L.planter, 0.08);
  box(statics, hx1 - hx0 - 0.3, 0.1, 1.2, X((hx0 + hx1) / 2), TOP + 0.36, Z(P.hedge.z), L.hedge, 0.02, false);
  const blob = (r, lx, y, lz, m, sy = 0.8) => {
    const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m);
    o.position.set(X(lx), y, Z(lz));
    o.scale.y = sy;
    o.castShadow = true;
    statics.add(o);
  };
  for (let x = hx0 + 1.5; x < hx1 - 1; x += 3.4) blob(0.8, x, TOP + 0.85, P.hedge.z, L.hedge);

  // ---------- Kanopi: muka putih, garis biru - hijau - merah keliling, empat tiang ----------
  const K = P.canopy;
  box(statics, K.w, 1.5, K.d, X(K.cx), 5.95, Z(K.cz), M.whiteSteel, 0.06);
  box(statics, K.w + 0.08, 0.12, K.d + 0.08, X(K.cx), 5.79, Z(K.cz), M.brandBlue, 0, false);
  box(statics, K.w + 0.08, 0.12, K.d + 0.08, X(K.cx), 5.65, Z(K.cz), M.brandGreen, 0, false);
  box(statics, K.w + 0.1, 0.36, K.d + 0.1, X(K.cx), 5.39, Z(K.cz), M.brandRed, 0, false);
  box(statics, K.w - 0.6, 0.1, K.d - 0.6, X(K.cx), 5.16, Z(K.cz), M.whiteSteel, 0, false);

  // ---------- Pulau pompa: tepi merah, tiang kanopi di kedua ujung, dua dispenser ----------
  const I = P.island, il = I.x1 - I.x0, icx = (I.x0 + I.x1) / 2;
  const dispenser = (lx, lz) => {
    const x = X(lx), z = Z(lz), y0 = TOP + 0.3;
    box(statics, 1.04, 0.14, 0.66, x, y0 + 0.07, z, L.dark, 0.03);
    box(statics, 0.86, 1.36, 0.5, x, y0 + 0.82, z, M.whiteSteel, 0.05);
    box(statics, 0.4, 0.2, 0.3, x, y0 + 1.58, z, L.dark, 0.02, false);
    box(statics, 1.0, 0.34, 0.66, x, y0 + 1.84, z, M.brandRed, 0.05);
    for (const s of [-1, 1]) {
      box(statics, 0.6, 0.4, 0.03, x, y0 + 1.16, z + s * 0.255, L.dark, 0, false); // layar
      [M.brandBlue, M.brandRed, M.brandGreen].forEach((m, i) => box(statics, 0.11, 0.11, 0.03, x + (i - 1) * 0.2, y0 + 0.74, z + s * 0.255, m, 0, false));
      const hose = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 14, Math.PI * 1.15), L.hose); // selang menggantung di sisi dispenser
      hose.position.set(x + s * 0.62, y0 + 0.86, z);
      hose.rotation.z = s > 0 ? -Math.PI * 0.62 : Math.PI * 0.47;
      hose.castShadow = true;
      statics.add(hose);
      box(statics, 0.1, 0.3, 0.14, x + s * 0.46, y0 + 1.02, z, L.dark, 0.02, false); // gagang nozzle
    }
  };
  for (const lz of P.islands) {
    box(statics, il + 0.3, 0.2, I.halfWidth * 2 + 0.3, X(icx), TOP + 0.1, Z(lz), M.brandRed, 0.06, false);
    box(statics, il, 0.3, I.halfWidth * 2, X(icx), TOP + 0.15, Z(lz), M.whiteSteel, 0.06);
    for (const lx of [I.x0 + 1.2, I.x1 - 1.2]) box(statics, 0.5, 5.2 - TOP, 0.5, X(lx), (5.2 + TOP) / 2 + 0.15, Z(lz), M.whiteSteel, 0.06);
    for (const lx of [I.x0 - 0.5, I.x1 + 0.5]) {
      cyl(statics, 0.11, 0.8, X(lx), TOP + 0.4, Z(lz), M.whiteSteel, 0.11, 10);
      cyl(statics, 0.13, 0.16, X(lx), TOP + 0.84, Z(lz), M.brandRed, 0.13, 10, false);
    }
    for (const lx of P.pumps) dispenser(lx, lz);
  }
  // Mobil pelanggan di lajur antara dua pulau
  const carZ = (P.islands[0] + P.islands[1]) / 2, carX = 5.2;
  box(statics, 4.1, 0.62, 1.72, X(carX), TOP + 0.7, Z(carZ), L.car, 0.16);
  box(statics, 2.2, 0.56, 1.5, X(carX + 0.25), TOP + 1.24, Z(carZ), L.dark, 0.16);
  for (const dx of [-1.3, 1.3]) for (const dz of [-0.84, 0.84]) cyl(statics, 0.34, 0.24, X(carX + dx), TOP + 0.34, Z(carZ + dz), M.rubber, 0.34, 14).rotation.x = Math.PI / 2;

  // ---------- Toko: dinding putih, pita biru bertulisan, pintu dan jendela ----------
  const S = P.shop, front = S.cz + S.d / 2;
  const shop = box(statics, S.w, 3.6, S.d, X(S.cx), TOP + 1.8, Z(S.cz), M.whiteSteel, 0.1);
  box(statics, S.w + 0.3, 0.8, S.d + 0.3, X(S.cx), TOP + 3.95, Z(S.cz), M.brandBlueDark, 0.05);
  box(statics, S.w + 0.5, 0.12, S.d + 0.5, X(S.cx), TOP + 4.41, Z(S.cz), M.whiteSteel, 0.03, false);
  box(statics, 1.3, 2.4, 0.08, X(S.cx + 3), TOP + 1.2, Z(front + 0.02), L.door, 0.02, false);
  for (const dx of [-3.4, -1.7, 0]) box(statics, 1.5, 1.8, 0.08, X(S.cx + dx), TOP + 1.75, Z(front + 0.02), L.pane, 0.02, false);
  box(statics, 0.08, 1.5, 3.2, X(S.cx - S.w / 2 - 0.02), TOP + 1.9, Z(S.cz), L.pane, 0.02, false);
  wallSign('TOKO  •  MUSHOLA', 6.2, 0.5, S.cx, TOP + 3.95, front + 0.17, 0);
  wallSign('TOKO  •  MUSHOLA', 6.2, 0.5, S.cx - S.w / 2 - 0.17, TOP + 3.95, S.cz, -Math.PI / 2);

  // ---------- Tiang papan nama: logo, panel merah "SPBU", tiga garis warna ----------
  const py = P.pylon;
  box(statics, 1.3, 0.3, 0.9, X(py.x), TOP + 0.15, Z(py.z), L.planter, 0.06);
  box(statics, 0.42, 5.3, 0.34, X(py.x), TOP + 2.9, Z(py.z), M.whiteSteel, 0.05);
  const pylon = box(statics, 2.7, 3.7, 0.4, X(py.x), 7.35, Z(py.z), M.whiteSteel, 0.06);
  box(statics, 2.9, 0.28, 0.52, X(py.x), 9.33, Z(py.z), M.brandRed, 0.05);
  for (const s of [1, -1]) {
    const ry = s > 0 ? 0 : Math.PI, z = py.z + s * 0.215;
    wallSign('SPBU', 2.2, 1.0, py.x, 7.35, z, ry, { bg: '#E1251B' });
    [M.brandRed, M.brandBlue, M.brandGreen].forEach((m, i) => box(statics, 0.5, 0.09, 0.03, X(py.x + (i - 1) * 0.66 * s), 6.2, Z(z), m, 0, false));
  }

  // ---------- Area bongkar: garis kuning, tutup tangki pendam, kerucut pengaman ----------
  const B = P.bay, bw = B.x1 - B.x0, bd = B.z1 - B.z0, bcx = (B.x0 + B.x1) / 2, bcz = (B.z0 + B.z1) / 2;
  flat(bw, 0.14, bcx, B.z0, L.yellow);
  flat(bw, 0.14, bcx, B.z1, L.yellow);
  flat(0.14, bd, B.x0, bcz, L.yellow);
  flat(0.14, bd, B.x1, bcz, L.yellow);
  [M.brandRed, M.brandGreen, M.brandBlue].forEach((m, i) => {
    cyl(statics, 0.52, 0.04, X(bcx + (i - 1) * 2.6), TOP + 0.03, Z(B.z0 - 1.5), L.lid, 0.52, 20, false);
    cyl(statics, 0.36, 0.05, X(bcx + (i - 1) * 2.6), TOP + 0.05, Z(B.z0 - 1.5), m, 0.36, 20, false);
  });
  for (const lx of [B.x0 + 0.6, bcx, B.x1 - 0.6]) {
    box(statics, 0.42, 0.04, 0.42, X(lx), TOP + 0.03, Z(B.z1 + 0.5), L.cone, 0.01, false);
    cyl(statics, 0.04, 0.62, X(lx), TOP + 0.35, Z(B.z1 + 0.5), L.cone, 0.19, 10);
  }
  floorSign('AREA BONGKAR BBM', 7.4, 0.7, bcx, B.z0 - 3.1, { color: '#93A1AF' });

  // ---------- Pohon ----------
  const tree = (lx, lz, k = 1) => {
    cyl(statics, 0.16 * k, 2.4 * k, X(lx), 1.2 * k, Z(lz), M.trunk, 0.2 * k, 6);
    blob(1.35 * k, lx, 3.3 * k, lz, L.leaf, 0.9);
    blob(1.0 * k, lx + 0.9 * k, 3.9 * k, lz - 0.4 * k, L.leaf, 0.9);
    blob(0.9 * k, lx - 0.8 * k, 3.0 * k, lz + 0.5 * k, L.leaf, 0.9);
  };
  for (const [lx, lz, k] of [[25, -24.5, 1.1], [21.5, -21, 0.95], [26, -19.5, 1], [-28.5, -24, 1.05], [33, -3.5, 1], [-36, -5, 1.1]]) tree(lx, lz, k);
  contactShadow(statics, sw + 8, sd + 8, X(scx), 0.02, Z(scz), 0.3);

  shop.userData.moving = true; // tetap sebagai mesh sendiri (tidak digabung) agar bisa diklik
  pylon.userData.moving = true;
  shop.userData.cardKey = 'spbu';
  pylon.userData.cardKey = 'spbu';
  compact(statics);
  // Stiker logo: tiga muka kanopi dan kedua sisi papan tiang
  group.add(logoMesh([
    { x: X(K.cx), y: 6.27, z: Z(K.cz + K.d / 2) + 0.02, width: 3.0 },
    { x: X(K.cx - K.w / 2) - 0.02, y: 6.27, z: Z(K.cz), width: 3.0, ry: -Math.PI / 2 },
    { x: X(K.cx + K.w / 2) + 0.02, y: 6.27, z: Z(K.cz), width: 3.0, ry: Math.PI / 2 },
    { x: X(py.x), y: 8.52, z: Z(py.z) + 0.215, width: 2.3 },
    { x: X(py.x), y: 8.52, z: Z(py.z) - 0.215, width: 2.3, ry: Math.PI },
  ]));

  // ---------- Truk perjalanan: dari gerbang keluar ke area bongkar ----------
  const product = config.products.pertalite;
  let truck = createTruck({ id: 'trip', label: 'TT-ITJ', productColor: product.color, M, renderer, modelId: 'gandeng' });
  truck.visible = false;
  group.add(truck);
  onTruckModelsReady(() => {
    if (truck.userData.model) return;
    const was = truck.visible;
    group.remove(truck);
    truck = createTruck({ id: 'trip', label: 'TT-ITJ', productColor: product.color, M, renderer, modelId: 'gandeng' });
    truck.visible = was;
    group.add(truck);
  });
  const wheels = new WheelPool(scene, M, 1);
  wheels.mesh.visible = false;
  const startX = -4, pts = [];
  for (let x = startX; x > X(P.stopX); x -= 2) pts.push(new THREE.Vector3(x, 0, Z(tripLateral(x - C.x, roadZ, startX - C.x))));
  pts.push(new THREE.Vector3(X(P.stopX), 0, Z(P.laneZ)));
  const path = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  path.arcLengthDivisions = 800;
  const length = path.getLength();
  const trip = { length, active: false, s: 0, done: false, speed: 7.5, pos: new THREE.Vector3(), start() { this.active = true; this.done = false; this.s = 0; truck.visible = true; wheels.mesh.visible = true; }, stop() { this.active = false; truck.visible = false; wheels.mesh.visible = false; } };
  const tangent = new THREE.Vector3();
  return {
    group,
    pickables: [shop, pylon],
    anchor: new THREE.Vector3(X(K.cx), 9.6, Z(K.cz)),
    trip,
    update(dt) {
      if (!trip.active) return;
      if (!trip.done) {
        // melambat menjelang akhir
        const remain = length - trip.s;
        const v = Math.min(trip.speed, Math.max(1.2, remain * 0.6));
        trip.s = Math.min(length, trip.s + v * dt);
        if (trip.s >= length - 0.01) trip.done = true;
      }
      const u = trip.s / length;
      path.getPointAt(u, trip.pos);
      path.getTangentAt(Math.min(0.999, u), tangent);
      truck.position.set(trip.pos.x, 0.1, trip.pos.z);
      truck.rotation.y = -Math.atan2(tangent.z, tangent.x);
      setTruckLights(truck, { brake: trip.done || trip.s > length - 25, reverse: false });
      wheels.update(truck.userData.model ? [] : [truck]);
    },
  };
}
