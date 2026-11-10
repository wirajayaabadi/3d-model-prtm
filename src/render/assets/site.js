// Konteks tapak mengikuti citra satelit ITJ Plumpang (video docs/depo.mp4): tapak memanjang utara–selatan,
// tank farm dua kolom di timur dengan bund per tangki, gudang beratap biru di barat laut, bangunan gantry panjang,
// halaman parkir armada di utara, gudang besar di barat daya, area kantor berpohon di selatan, kanal di sisi barat
// dan utara, tembok keliling, serta permukiman padat di timur dan selatan (konteks buffer zone).
// Semua dekoratif: tidak dibaca engine (hanya `tankGroups` dan `buildings` yang menjadi obstacle).
import * as THREE from 'three';
import { box, compact, contactShadow } from '../materials.js';
import { hexToInt } from '../../ui/theme.js';

const std = (color, roughness = 0.95) => new THREE.MeshStandardMaterial({ color: hexToInt(color), roughness, metalness: 0 });

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildSite({ site, M }) {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const S = site;
  const mats = {
    water: std('#5F9BD6', 0.3),
    bank: std('#9AA896'),
    wall: std('#D9D4CB'),
    roofBlue: std('#2F6DB5', 0.8),
    roofWhite: std('#EEF0F2', 0.85),
    wallWh: std('#E9E6DF'),
    yard: std('#C7CBCF'),
    paving: std('#D3D0C8'),
    grass: std('#8DBE7E'),
    lane: std('#B9B5AD'),
  };
  const m4 = new THREE.Matrix4();

  // Perkerasan tapak (di bawah plot dan tank farm), halaman armada di utara.
  // Semua permukaan tapak berada di bawah y = 0 (bidang plot) dan di bawah jalan (0,09) agar tidak z-fighting.
  const pav = box(statics, S.x1 - S.x0, 0.12, S.z1 - S.z0, (S.x0 + S.x1) / 2, -0.1, (S.z0 + S.z1) / 2, mats.paving, 0, false);
  pav.receiveShadow = true;
  const y = S.yard;
  box(statics, y.x1 - y.x0, 0.08, y.z1 - y.z0, (y.x0 + y.x1) / 2, -0.06, (y.z0 + y.z1) / 2, mats.yard, 0, false).receiveShadow = true;

  // Kanal barat dan utara dengan tanggul; celah jembatan di persilangan jalan
  const c = S.canal;
  const canalSeg = (x0, z0, x1, z1) => {
    box(statics, x1 - x0 + 4, 0.6, z1 - z0 + 4, (x0 + x1) / 2, 0.1, (z0 + z1) / 2, mats.bank, 0.1, false);
    box(statics, x1 - x0, 0.4, z1 - z0, (x0 + x1) / 2, -0.1, (z0 + z1) / 2, mats.water, 0, false);
  };
  let zc = c.z0;
  for (const gap of [...c.gaps, [c.z1, c.z1]]) {
    if (gap[0] > zc) canalSeg(c.x0, zc, c.x1, gap[0]);
    // dek jembatan
    if (gap[1] > gap[0]) box(statics, c.x1 - c.x0 + 6, 0.3, gap[1] - gap[0], (c.x0 + c.x1) / 2, -0.11, (gap[0] + gap[1]) / 2, M.asphalt, 0.05, false); // atas di 0,04: di bawah jalan
    zc = gap[1];
  }
  canalSeg(c.x0, c.z0 - 12, S.x1 + 8, c.z0);

  // Tembok keliling dengan celah gerbang di sisi barat
  const wall = (x0, z0, x1, z1) => box(statics, Math.max(0.6, x1 - x0), 2.6, Math.max(0.6, z1 - z0), (x0 + x1) / 2, 1.3, (z0 + z1) / 2, mats.wall, 0.05);
  wall(S.x0, S.z0, S.x1, S.z0);
  wall(S.x0, S.z1, S.x1, S.z1);
  wall(S.x1, S.z0, S.x1, S.z1);
  let zw = S.z0;
  for (const g of [...S.gateGaps, [S.z1, S.z1]]) {
    if (g[0] > zw) wall(S.x0, zw, S.x0, g[0]);
    zw = g[1];
  }

  // Gudang dan bangunan panjang (atap biru / putih), kantor selatan
  for (const b of S.buildings) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    box(statics, w, b.h, d, cx, b.h / 2, cz, mats.wallWh, 0.2);
    const roof = b.roof === 'blue' ? mats.roofBlue : mats.roofWhite;
    box(statics, w + 0.8, 0.5, d + 0.8, cx, b.h + 0.2, cz, roof, 0.1);
    // bubungan atap pelana sederhana
    if (b.roof === 'blue') box(statics, w * 0.6, 1.2, d + 0.6, cx, b.h + 0.9, cz, roof, 0.3);
    box(statics, w + 0.2, 1.1, d + 0.2, cx, b.h * 0.6, cz, M.brandBlueDark, 0.02, false);
    contactShadow(group, w + 6, d + 6, cx, 0.03, cz, 0.35);
  }

  // Armada parkir di halaman utara (statis, instanced: kabin biru + tangki putih)
  const park = S.parking;
  const spots = [];
  for (let z = park.z0; z <= park.z1; z += park.pitchZ) for (let x = park.x0; x <= park.x1; x += park.pitchX) spots.push({ x, z });
  const cabGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
  const tankGeo = new THREE.CylinderGeometry(1.15, 1.15, 8.6, 14).rotateZ(Math.PI / 2);
  const cabs = new THREE.InstancedMesh(cabGeo, M.brandRed, spots.length);
  const tanks = new THREE.InstancedMesh(tankGeo, M.whiteSteel, spots.length);
  spots.forEach((p, i) => {
    m4.makeTranslation(p.x + 5.6, 1.7, p.z);
    cabs.setMatrixAt(i, m4);
    m4.makeTranslation(p.x, 1.9, p.z);
    tanks.setMatrixAt(i, m4);
  });
  cabs.castShadow = tanks.castShadow = true;
  group.add(cabs, tanks);

  // Area hijau kantor selatan + pohon tambahan di sekeliling tapak
  for (const g of S.greens) box(statics, g.x1 - g.x0, 0.08, g.z1 - g.z0, (g.x0 + g.x1) / 2, -0.06, (g.z0 + g.z1) / 2, mats.grass, 0, false);
  const rnd = lcg(7);
  const trees = [];
  for (const g of S.greens) for (let i = 0; i < g.trees; i++) trees.push({ x: g.x0 + 3 + rnd() * (g.x1 - g.x0 - 6), z: g.z0 + 3 + rnd() * (g.z1 - g.z0 - 6), s: 0.8 + rnd() * 0.6 });
  for (const row of S.treeRows) for (let t = 0; t <= 1; t += 1 / row.n) trees.push({ x: row.x0 + (row.x1 - row.x0) * t, z: row.z0 + (row.z1 - row.z0) * t, s: 0.9 + rnd() * 0.4 });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), M.trunk, trees.length);
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 10, 8), M.leaf, trees.length);
  trees.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 1.2 * p.s, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.s, 1));
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, 3.8 * p.s, p.z), new THREE.Quaternion(), new THREE.Vector3(p.s, p.s * 1.1, p.s));
    crowns.setMatrixAt(i, m4);
  });
  crowns.castShadow = true;
  group.add(trunks, crowns);

  // Permukiman padat (instanced, warna per instance) di luar tembok: timur, selatan, barat kanal
  const houses = [];
  const palette = ['#B8A58F', '#8C7B6B', '#C9B49A', '#A3574B', '#7E8A94', '#D9CFC2', '#9C8878', '#B06A5A'].map((h) => new THREE.Color(hexToInt(h)));
  const hr = lcg(20261110);
  for (const area of S.housing) {
    const cell = area.cell || 11;
    let row = 0;
    for (let z = area.z0; z < area.z1; z += cell, row++) {
      if (row % 7 === 6) continue; // gang
      let col = 0;
      for (let x = area.x0; x < area.x1; x += cell, col++) {
        if (col % 9 === 8) continue;
        if (area.avoid?.some((a) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1)) continue;
        if (hr() < (area.density ?? 0.92) === false) continue;
        houses.push({ x: x + (hr() - 0.5) * 2, z: z + (hr() - 0.5) * 2, w: cell * (0.55 + hr() * 0.3), d: cell * (0.55 + hr() * 0.3), h: 3 + hr() * 4.5, c: palette[Math.floor(hr() * palette.length)] });
      }
    }
  }
  const hGeo = new THREE.BoxGeometry(1, 1, 1);
  const hMesh = new THREE.InstancedMesh(hGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), houses.length);
  const rMesh = new THREE.InstancedMesh(hGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), houses.length);
  const wallC = new THREE.Color(0xE7E2D8);
  houses.forEach((h, i) => {
    m4.compose(new THREE.Vector3(h.x, h.h / 2, h.z), new THREE.Quaternion(), new THREE.Vector3(h.w, h.h, h.d));
    hMesh.setMatrixAt(i, m4);
    hMesh.setColorAt(i, wallC);
    m4.compose(new THREE.Vector3(h.x, h.h + 0.2, h.z), new THREE.Quaternion(), new THREE.Vector3(h.w + 0.8, 0.4, h.d + 0.8));
    rMesh.setMatrixAt(i, m4);
    rMesh.setColorAt(i, h.c);
  });
  hMesh.castShadow = rMesh.castShadow = true;
  hMesh.receiveShadow = true;
  group.add(hMesh, rMesh);
  // Tanah permukiman (lebih gelap dari rumput) di bawah tiap area
  for (const area of S.housing) box(statics, area.x1 - area.x0 + 6, 0.06, area.z1 - area.z0 + 6, (area.x0 + area.x1) / 2, -0.07, (area.z0 + area.z1) / 2, mats.lane, 0, false);

  compact(statics);
  return { group, houseCount: houses.length, parkedCount: spots.length };
}
