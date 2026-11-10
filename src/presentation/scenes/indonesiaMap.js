// Peta Indonesia sebagai "pemilih wilayah" (mengikuti pola peta provinsi–distrik): 33 provinsi dari batas Natural
// Earth yang disederhanakan, diwarnai per kelompok pulau, batas putih tipis, label di tengah wilayah. Hover menyala,
// provinsi terpilih terangkat, pencarian meredupkan yang tidak cocok. Di atasnya: pin kilang, lapangan hulu,
// terminal BBM ilustratif, ITJ Plumpang, rute impor, dan titik BBM Satu Harga ilustratif.
import * as THREE from 'three';
import { BRAND, hexToInt } from '../../ui/theme.js';
import { MAP, GEO, lonLat } from '../world.js';
import { PROVINCES, REGIONS } from '../data/indonesiaProvinces.js';

export const REGION_COLORS = { sumatra: '#3F9152', jawa: '#5A5FB0', kalimantan: '#8E9A2F', sulawesi: '#D9577A', balinusra: '#3FA587', maluku: '#AA5EB0', papua: '#3E7C8C' };
const H = 2.4;

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function provinceAt(lon, lat) {
  return PROVINCES.find((p) => lon >= p.bbox[0] && lon <= p.bbox[2] && lat >= p.bbox[1] && lat <= p.bbox[3] && p.polys.some((r) => pointInRing(lon, lat, r))) || null;
}
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export function bboxToWorld(bbox) {
  const a = lonLat(bbox[0], bbox[1]), b = lonLat(bbox[2], bbox[3]);
  return { min: new THREE.Vector3(Math.min(a.x, b.x), 0, Math.min(a.z, b.z)), max: new THREE.Vector3(Math.max(a.x, b.x), 0, Math.max(a.z, b.z)), center: a.clone().add(b).multiplyScalar(0.5) };
}

export function buildIndonesiaMap({ M, renderer }) {
  const group = new THREE.Group();
  const sea = new THREE.MeshStandardMaterial({ color: hexToInt('#6FA6D6'), roughness: 1, metalness: 0 });
  const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1500, 1000).rotateX(-Math.PI / 2), sea);
  seaMesh.position.set(MAP.cx + 40, -0.06, MAP.cz - 60);
  seaMesh.receiveShadow = true;
  group.add(seaMesh);

  // Provinsi: satu mesh per provinsi (warna kelompok pulau, sisi lebih gelap), batas putih di atasnya
  const white = new THREE.Color(0xffffff);
  const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const borders = new THREE.Group();
  const provinces = PROVINCES.map((p) => {
    const shapes = p.polys.map((ring) => {
      const sh = new THREE.Shape();
      ring.forEach(([lon, lat], i) => {
        const v = lonLat(lon, lat);
        if (i === 0) sh.moveTo(v.x, -v.z);
        else sh.lineTo(v.x, -v.z);
      });
      sh.closePath();
      const pts = ring.map(([lon, lat]) => lonLat(lon, lat, H + 0.1));
      pts.push(pts[0].clone());
      borders.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), borderMat));
      return sh;
    });
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: H, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const base = new THREE.Color(hexToInt(REGION_COLORS[p.region])).lerp(white, 0.08);
    const top = new THREE.MeshStandardMaterial({ color: base.clone(), roughness: 1, metalness: 0, transparent: true });
    const side = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color(0x000000), 0.28), roughness: 1, transparent: true });
    const mesh = new THREE.Mesh(geo, [top, side]);
    mesh.receiveShadow = true;
    mesh.userData.cardKey = `prov:${p.id}`;
    group.add(mesh);
    return { ...p, mesh, top, side, base, center: lonLat(p.label[0], p.label[1], H + 2), world: bboxToWorld(p.bbox) };
  });
  group.add(borders);
  const regions = Object.fromEntries(Object.entries(REGIONS).map(([k, r]) => [k, { ...r, color: REGION_COLORS[k], center: lonLat(r.label[0], r.label[1], H + 6), world: bboxToWorld(r.bbox) }]));

  const state = { hover: null, selected: null, filter: null };
  const refresh = () => {
    for (const p of provinces) {
      const dim = state.filter && !state.filter.has(p.id);
      const sel = state.selected === p.id, hov = state.hover === p.id;
      const c = p.base.clone();
      if (hov && !sel) c.lerp(white, 0.22);
      if (sel) c.lerp(white, 0.36);
      p.top.color.copy(c);
      p.top.emissive.setHex(sel ? 0x222222 : 0x000000);
      p.top.opacity = p.side.opacity = dim ? 0.22 : 1;
      p.mesh.position.y = sel ? 1.6 : hov ? 0.6 : 0;
    }
  };

  const pins = {};
  const pickables = provinces.map((p) => p.mesh);
  const addPick = (mesh, cardKey) => {
    mesh.userData.cardKey = cardKey;
    pickables.push(mesh);
  };
  // Kilang: menara silinder putih + dua tangki kecil
  for (const [key, [lon, lat]] of Object.entries(GEO.refineries)) {
    const p = lonLat(lon, lat, H);
    const g = new THREE.Group();
    g.position.copy(p);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 9, 14), M.whiteSteel);
    tower.position.y = 4.5;
    tower.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.2, 14), M.brandBlueDark);
    band.position.y = 7.2;
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12), M.whiteSteel);
    t1.position.set(3.6, 1.2, 1.2);
    const t2 = t1.clone();
    t2.position.set(-3.4, 1.2, 2.2);
    g.add(tower, band, t1, t2);
    group.add(g);
    addPick(tower, `pin.${key}`);
    pins[key] = { pos: p.clone().setY(12), cardKey: `pin.${key}`, kind: 'refinery', lonLat: [lon, lat] };
  }
  // Lapangan hulu: menara bor ramping
  for (const [key, [lon, lat]] of Object.entries(GEO.fields)) {
    const p = lonLat(lon, lat, H);
    const derrick = new THREE.Mesh(new THREE.ConeGeometry(2.0, 10, 4, 1, true), M.ink);
    derrick.position.copy(p).add(new THREE.Vector3(0, 5, 0));
    derrick.castShadow = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.6, 12), M.steel);
    base.position.copy(p).add(new THREE.Vector3(0, 0.3, 0));
    group.add(derrick, base);
    addPick(derrick, `pin.${key}`);
    pins[key] = { pos: p.clone().setY(12), cardKey: `pin.${key}`, kind: 'field', lonLat: [lon, lat] };
  }
  // Terminal BBM ilustratif: cakram biru kecil (instanced)
  const m4 = new THREE.Matrix4();
  const terms = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.6, 1.6, 1.2, 10), M.brandBlue, GEO.terminals.length);
  GEO.terminals.forEach(([lon, lat], i) => {
    const p = lonLat(lon, lat, H + 0.6);
    m4.makeTranslation(p.x, p.y, p.z);
    terms.setMatrixAt(i, m4);
  });
  group.add(terms);
  // ITJ Plumpang: pin merah (kerucut + bola) yang lebih besar
  const itjPos = lonLat(GEO.itj[0], GEO.itj[1], H);
  const pinMat = new THREE.MeshStandardMaterial({ color: hexToInt(BRAND.red), roughness: 0.5, emissive: hexToInt('#7A0E16'), emissiveIntensity: 0.25 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 16), pinMat);
  cone.rotation.x = Math.PI;
  cone.position.copy(itjPos).add(new THREE.Vector3(0, 3.5, 0));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(2.8, 20, 14), pinMat);
  ball.position.copy(itjPos).add(new THREE.Vector3(0, 8.4, 0));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), M.pinWhite);
  dot.position.copy(itjPos).add(new THREE.Vector3(0, 8.4, 2.4));
  group.add(cone, ball, dot);
  addPick(ball, 'pin.itj');
  addPick(cone, 'pin.itj');
  pins.itj = { pos: itjPos.clone().setY(14), cardKey: 'pin.itj', kind: 'itj', lonLat: GEO.itj };

  // Rute impor bensin (garis putus-putus oranye) dari Singapura dan Malaysia ke Jakarta
  const imports = new THREE.Group();
  const dashMat = new THREE.LineDashedMaterial({ color: hexToInt(BRAND.orange), dashSize: 6, gapSize: 4 });
  const arc = (a, b, lift) => {
    const pa = lonLat(a[0], a[1], H + 1), pb = lonLat(b[0], b[1], H + 1);
    const mid = pa.clone().add(pb).multiplyScalar(0.5).add(new THREE.Vector3(0, lift, 0));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(pa, mid, pb).getPoints(48)), dashMat);
    line.computeLineDistances();
    return line;
  };
  imports.add(arc(GEO.singapore, GEO.itj, 26), arc(GEO.melaka, GEO.itj, 34));
  const portMat = new THREE.MeshStandardMaterial({ color: hexToInt(BRAND.orange), roughness: 0.6 });
  const sgPort = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 1.4, 10), portMat);
  sgPort.position.copy(lonLat(GEO.singapore[0], GEO.singapore[1], 0.7));
  const myPort = sgPort.clone();
  myPort.position.copy(lonLat(GEO.melaka[0], GEO.melaka[1], 0.7));
  imports.add(sgPort, myPort);
  addPick(sgPort, 'pin.singapore');
  imports.visible = false;
  group.add(imports);
  pins.singapore = { pos: lonLat(GEO.singapore[0], GEO.singapore[1], 8), cardKey: 'pin.singapore', kind: 'import' };
  pins.melaka = { pos: lonLat(GEO.melaka[0], GEO.melaka[1], 8), kind: 'import' };

  // Titik BBM Satu Harga ilustratif: titik hijau acak-deterministik di darat, jarang di Jawa (sasaran daerah 3T)
  const rnd = lcg(20261025);
  const outletPts = [];
  let guard = 0;
  while (outletPts.length < 90 && guard++ < 8000) {
    const lon = 95 + rnd() * 46, lat = -11 + rnd() * 17;
    const prov = provinceAt(lon, lat);
    if (!prov) continue;
    if (prov.region === 'jawa' && rnd() < 0.85) continue;
    outletPts.push(lonLat(lon, lat, H + 0.5));
  }
  const outlets = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 8, 6), M.brandGreen, outletPts.length);
  outletPts.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    outlets.setMatrixAt(i, m4);
  });
  outlets.visible = false;
  group.add(outlets);

  // Wilayah layanan ITJ (titik hijau), pipa Balongan–Plumpang, kapal di Tanjung Priok (zoom Jawa)
  const java = new THREE.Group();
  const svc = {};
  for (const [key, [lon, lat]] of Object.entries(GEO.serviceArea)) {
    const p = lonLat(lon, lat, H + 0.5);
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), M.brandGreen);
    d.position.copy(p);
    java.add(d);
    svc[key] = p.clone().setY(H + 3);
  }
  const pb = lonLat(GEO.refineries.balongan[0], GEO.refineries.balongan[1], H + 0.5), pj = lonLat(GEO.itj[0], GEO.itj[1], H + 0.5);
  java.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(pb, pj), 1, 0.45, 8, false), new THREE.MeshStandardMaterial({ color: hexToInt(BRAND.blue), roughness: 0.6 })));
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 1.6), M.brandBlueDark);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.2), M.whiteSteel);
  deck.position.set(-1.4, 1.1, 0);
  ship.add(hull, deck);
  const portPos = lonLat(106.9, -6.02, 0.6);
  ship.position.copy(portPos);
  ship.rotation.y = 0.5;
  java.add(ship);
  java.visible = false;
  group.add(java);
  pins.port = { pos: portPos.clone().setY(5), kind: 'port' };
  pins.pipeline = { pos: pb.clone().add(pj).multiplyScalar(0.5).setY(5), kind: 'pipeline' };
  pins.serviceArea = svc;

  const layers = { imports, outlets, java };
  refresh();
  return {
    group,
    pins,
    pickables,
    provinces,
    regions,
    itjPos,
    provinceAt,
    setHover(id) {
      if (state.hover === id) return;
      state.hover = id;
      refresh();
    },
    setSelected(id) {
      state.selected = id;
      refresh();
    },
    setFilter(set) {
      state.filter = set;
      refresh();
    },
    setLayer(name, on) {
      if (layers[name]) layers[name].visible = on;
    },
    setAllLayers(on) {
      for (const l of Object.values(layers)) l.visible = on;
    },
  };
}
