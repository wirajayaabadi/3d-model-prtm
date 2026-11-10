// Aliran rantai nilai di peta (partikel di sepanjang kurva skematis) dan cincin stakeholder di sekitar terminal.
import * as THREE from 'three';
import { BRAND, hexToInt } from '../../ui/theme.js';
import { GEO, lonLat } from '../world.js';

const GROUP_COLOR = { owner: BRAND.red, regulator: BRAND.blueDark, customer: BRAND.green, partner: BRAND.lightBlue, internal: BRAND.steel, community: BRAND.orange };

function pathCurve(points, lift) {
  const pts = points.map(([lon, lat]) => lonLat(lon, lat, 3));
  // angkat titik tengah agar partikel melengkung di atas laut
  const out = [];
  pts.forEach((p, i) => {
    out.push(p.clone());
    if (i < pts.length - 1) out.push(p.clone().add(pts[i + 1]).multiplyScalar(0.5).add(new THREE.Vector3(0, lift, 0)));
  });
  return new THREE.CatmullRomCurve3(out, false, 'catmullrom', 0.2);
}

export function buildValueChainFlow() {
  const group = new THREE.Group();
  const R = GEO.refineries, F = GEO.fields;
  const paths = [
    { curve: pathCurve([F.rokan, R.dumai], 2), color: BRAND.ink, n: 10, speed: 0.08 },
    { curve: pathCurve([R.dumai, [104.0, -0.5], GEO.itj], 14), color: BRAND.blue, n: 26, speed: 0.07 },
    { curve: pathCurve([F.cepu, R.balongan], 4), color: BRAND.ink, n: 10, speed: 0.08 },
    { curve: pathCurve([R.balongan, GEO.itj], 3), color: BRAND.blue, n: 10, speed: 0.1 },
    { curve: pathCurve([F.mahakam, R.balikpapan], 2), color: BRAND.ink, n: 6, speed: 0.08 },
    { curve: pathCurve([R.balikpapan, [113.5, -4.5], GEO.itj], 16), color: BRAND.blue, n: 24, speed: 0.06 },
    { curve: pathCurve([GEO.singapore, GEO.itj], 12), color: BRAND.orange, n: 18, speed: 0.07 },
    { curve: pathCurve([GEO.itj, GEO.serviceArea.bandung], 2), color: BRAND.green, n: 8, speed: 0.12 },
    { curve: pathCurve([GEO.itj, GEO.serviceArea.garut], 2), color: BRAND.green, n: 8, speed: 0.12 },
    { curve: pathCurve([GEO.itj, GEO.serviceArea.tangerang], 1), color: BRAND.green, n: 5, speed: 0.14 },
  ];
  const total = paths.reduce((s, p) => s + p.n, 0);
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), total);
  let idx = 0;
  for (const p of paths) {
    p.start = idx;
    const c = new THREE.Color(hexToInt(p.color));
    for (let i = 0; i < p.n; i++) mesh.setColorAt(idx++, c);
  }
  // Jejak garis tipis di bawah partikel
  const lineMat = new THREE.LineBasicMaterial({ color: hexToInt('#FFFFFF'), transparent: true, opacity: 0.85 });
  for (const p of paths) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(p.curve.getPoints(40).map((v) => v.clone().setY(3.2))), lineMat);
    group.add(line);
  }
  group.add(mesh);
  // Halo bercahaya (aditif) mengikuti partikel
  const halo = new THREE.InstancedMesh(new THREE.SphereGeometry(4.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), total);
  for (let i = 0; i < total; i++) halo.setColorAt(i, mesh.instanceColor ? new THREE.Color().fromArray(mesh.instanceColor.array, i * 3) : new THREE.Color(0xffffff));
  halo.renderOrder = 6;
  group.add(halo);
  // Cincin tahap (di bawah pin) — jangkar label tahap
  const stageAt = { upstream: lonLat(F.mahakam[0], F.mahakam[1], 16), refinery: lonLat(R.plaju[0], R.plaju[1], 16), import: lonLat(GEO.singapore[0], GEO.singapore[1], 12), shipping: lonLat(112.5, -3.8, 18), terminal: lonLat(GEO.itj[0], GEO.itj[1], 22), station: lonLat(108.9, -7.9, 8) };
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  let t = 0;
  group.visible = false;
  return {
    group,
    stageAnchors: stageAt,
    update(dt) {
      if (!group.visible) return;
      t += dt;
      for (const p of paths) {
        for (let i = 0; i < p.n; i++) {
          const u = (t * p.speed + i / p.n) % 1;
          p.curve.getPointAt(u, tmp);
          m4.makeTranslation(tmp.x, tmp.y + 1.5, tmp.z);
          mesh.setMatrixAt(p.start + i, m4);
          halo.setMatrixAt(p.start + i, m4);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      halo.instanceMatrix.needsUpdate = true;
    },
  };
}

// Cincin stakeholder: cakram per stakeholder, radius menurut pengaruh, tinggi menurut kepentingan.
export function buildStakeholderRing({ center, radius, stakeholders }) {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: hexToInt(BRAND.blue), transparent: true, opacity: 0.28, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 1.2, radius + 1.2, 96), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(center).setY(0.4);
  ring.renderOrder = 3;
  group.add(ring);
  const pickables = [];
  const anchors = {};
  const n = stakeholders.length;
  stakeholders.forEach((s, i) => {
    // sebar di separuh lingkaran yang menghadap kamera (barat daya) agar label tidak tertutup tangki
    const a = Math.PI * 0.55 + (i / (n - 1)) * Math.PI * 1.15;
    const x = center.x + Math.cos(a) * radius, z = center.z + Math.sin(a) * radius;
    const r = 4 + s.influence * 7, h = 1.5 + s.interest * 5;
    const mat = new THREE.MeshStandardMaterial({ color: hexToInt(GROUP_COLOR[s.group] || BRAND.steel), roughness: 0.6 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), mat);
    disc.position.set(x, h / 2, z);
    disc.castShadow = true;
    disc.userData.cardKey = `stk.${s.key}`;
    group.add(disc);
    pickables.push(disc);
    anchors[s.key] = new THREE.Vector3(x, h + 3, z);
  });
  group.visible = false;
  return { group, pickables, anchors };
}
