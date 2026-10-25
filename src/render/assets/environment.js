// Lingkungan: tanah dan plot, zona (tint), jalan dari jaringan, marka dan panah (instanced), stall, gerbang
// dengan palang yang terangkat, tangki penyimpanan putih dengan pita biru di atas bund beton, ruang kontrol
// dengan dinding layar kanvas, lanskap (pagar tanaman dan pohon membulat), bayangan kontak, overlay kelayakan.
import * as THREE from 'three';
import { box, cyl, canvasTexture, print, screen, compact, stripGeometry, segmentPoints, polygonGeometry, rectOutline, mergeFlat, contactShadow, FONT } from '../materials.js';
import { BRAND, hexToInt } from '../../ui/theme.js';
import { fmtNumber, fmtPercent, ID } from '../../ui/i18n/en.js';

function flat(geom, material, y, order = 0) {
  const m = new THREE.Mesh(geom, material);
  m.position.y = y;
  m.receiveShadow = true;
  m.renderOrder = order;
  return m;
}

export function buildEnvironment({ layout, network, config, M, renderer }) {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  const details = new THREE.Group();
  group.add(statics, details);
  const f = config.facility;
  const W = layout.plot.width, L = layout.plot.length;
  const m4 = new THREE.Matrix4();

  // Tanah, plot dan zona (plane datar; tidak ada tekstur)
  const ground = flat(new THREE.PlaneGeometry(640, 460).rotateX(-Math.PI / 2), M.ground, -0.1);
  ground.position.set(W / 2 + 30, -0.1, L / 2);
  group.add(ground);
  const plot = flat(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), M.plot, 0);
  plot.position.set(W / 2, 0, L / 2);
  group.add(plot);
  group.add(flat(rectOutline(0, 0, W, L, 0.35), M.markingWhite, 0.12, 2));
  const zoneMats = { bayBlock: M.zoneBay, approach: M.zoneApproach, waiting: M.zoneWaiting };
  const zoneTints = new THREE.Group();
  group.add(zoneTints);
  const zoneAnchors = [];
  const zoneNames = ID.geometry.zones;
  for (const [k, z] of Object.entries(layout.zones)) {
    const m = flat(new THREE.PlaneGeometry(z.width, z.length).rotateX(-Math.PI / 2), zoneMats[k], 0.03);
    m.position.set((z.x0 + z.x1) / 2, 0.03, (z.z0 + z.z1) / 2);
    group.add(m);
    // Tint tegas untuk mode Zona
    const tint = flat(new THREE.PlaneGeometry(z.width, z.length).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: k === 'waiting' ? hexToInt(BRAND.blue) : k === 'bayBlock' ? hexToInt(BRAND.green) : hexToInt(BRAND.red), transparent: true, opacity: 0.14, depthWrite: false }), 0.4, 3);
    tint.position.set((z.x0 + z.x1) / 2, 0.4, (z.z0 + z.z1) / 2);
    zoneTints.add(tint);
    zoneAnchors.push({ key: k, name: zoneNames[k], pos: new THREE.Vector3((z.x0 + z.x1) / 2, 1, (z.z0 + z.z1) / 2), text: `${fmtNumber(z.width)} × ${fmtNumber(z.length)} m · ${fmtNumber(z.area)} m²` });
  }
  zoneAnchors.push({ key: 'plot', name: ID.geometry.plot, pos: new THREE.Vector3(W / 2, 1, L - 4), text: `${fmtNumber(W)} × ${fmtNumber(L)} m · ${fmtNumber(layout.plot.area)} m² · ${ID.geometry.unallocated} ${fmtNumber(layout.unallocatedArea)} m²` });
  zoneTints.visible = false;

  // Jalan dari jaringan + garis tepi putih + garis tengah kuning putus-putus + panah arah (instanced)
  const roadGeos = [], edgeGeos = [], centerGeos = [];
  const lanes = [...network.entryLine, ...network.loop, ...network.exitLine];
  const arrowPoses = [];
  for (const seg of lanes) {
    const pts = segmentPoints(seg, seg.kind === 'arc' ? 1 : seg.length);
    roadGeos.push(stripGeometry(pts, f.roads.width));
    const half = f.roads.width / 2 - 0.15;
    for (const side of [-1, 1]) {
      const off = pts.map((p, i) => {
        const q = pts[Math.min(i + 1, pts.length - 1)], r = pts[Math.max(i - 1, 0)];
        const dx = q.x - r.x, dz = q.z - r.z, len = Math.hypot(dx, dz) || 1;
        return { x: p.x + (-dz / len) * half * side, z: p.z + (dx / len) * half * side };
      });
      edgeGeos.push(stripGeometry(off, 0.16));
    }
    if (seg.kind === 'straight') {
      for (let s = 2; s < seg.length - 1; s += 4) {
        const p = seg.poseAt(s);
        const q = seg.poseAt(Math.min(seg.length, s + 1.6));
        centerGeos.push(stripGeometry([{ x: p.x, z: p.z }, { x: q.x, z: q.z }], 0.12));
      }
      if (seg.length >= 7) {
        const p = seg.poseAt(seg.length / 2);
        arrowPoses.push(p);
      }
    }
  }
  // Area manuver bay/stall (beton lebih terang) dan garis henti kuning di area konflik
  const manGeos = [];
  for (const m of network.bayManeuvers) for (const seg of m.entry) manGeos.push(stripGeometry(segmentPoints(seg, 1), 4.6));
  for (const m of network.stallManeuvers) for (const seg of m.pullOut) manGeos.push(stripGeometry(segmentPoints(seg, 1), 4.6));
  group.add(flat(mergeFlat(manGeos), M.asphaltLight, 0.06));
  group.add(flat(mergeFlat(roadGeos), M.asphalt, 0.09));
  group.add(flat(mergeFlat(edgeGeos), M.markingWhite, 0.13, 2));
  group.add(flat(mergeFlat(centerGeos), M.markingYellow, 0.13, 2));
  const stopGeos = [];
  for (const b of layout.bays) stopGeos.push(stripGeometry([{ x: b.cx - 1.6, z: f.roads.exitRoadZ + 3.4 }, { x: b.cx + 1.6, z: f.roads.exitRoadZ + 3.4 }], 0.3));
  group.add(flat(mergeFlat(stopGeos), M.markingYellow, 0.14, 2));
  // Panah arah: InstancedMesh satu geometri segitiga
  const arrowGeo = polygonGeometry([{ x: 1.4, z: 0 }, { x: -0.9, z: -1.0 }, { x: -0.9, z: 1.0 }]);
  const arrows = new THREE.InstancedMesh(arrowGeo, M.markingWhite, arrowPoses.length);
  arrowPoses.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 0.15, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -p.theta, 0)), new THREE.Vector3(1, 1, 1));
    arrows.setMatrixAt(i, m4);
  });
  arrows.renderOrder = 2;
  group.add(arrows);
  // Panah rute besar untuk mode Zona (lebih rapat, berwarna biru)
  const routeArrowMat = new THREE.MeshBasicMaterial({ color: hexToInt(BRAND.blue) });
  const routePoses = [];
  for (const seg of lanes) for (let s = 1.5; s < seg.length; s += 6) routePoses.push(seg.poseAt(s));
  const routeArrows = new THREE.InstancedMesh(polygonGeometry([{ x: 2.0, z: 0 }, { x: -1.2, z: -1.3 }, { x: -1.2, z: 1.3 }]), routeArrowMat, routePoses.length);
  routePoses.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 0.35, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -p.theta, 0)), new THREE.Vector3(1, 1, 1));
    routeArrows.setMatrixAt(i, m4);
  });
  routeArrows.renderOrder = 4;
  routeArrows.visible = false;
  group.add(routeArrows);

  // Stall: garis (instanced) dan nomor (kanvas)
  const stallLine = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, f.stalls.z1 - f.stalls.z0).rotateX(-Math.PI / 2), M.markingWhite, layout.stalls.length + 1);
  layout.stalls.forEach((st, i) => {
    m4.makeTranslation(st.x0, 0.13, (st.z0 + st.z1) / 2);
    stallLine.setMatrixAt(i, m4);
    if (i === layout.stalls.length - 1) {
      m4.makeTranslation(st.x1, 0.13, (st.z0 + st.z1) / 2);
      stallLine.setMatrixAt(i + 1, m4);
    }
  });
  stallLine.renderOrder = 2;
  group.add(stallLine);
  if (layout.stalls.length) {
    const st0 = layout.stalls[0], stN = layout.stalls[layout.stalls.length - 1];
    group.add(flat(stripGeometry([{ x: st0.x0, z: f.stalls.z1 }, { x: stN.x1, z: f.stalls.z1 }], 0.16), M.markingWhite, 0.13, 2));
    const numTex = canvasTexture(64 * layout.stalls.length, 64, (c, w, h) => {
      layout.stalls.forEach((st, i) => print(c, String(st.number), 32 + i * 64, 46, 34, BRAND.markingWhite, 700, 'center'));
    }, renderer);
    const nums = new THREE.Mesh(new THREE.PlaneGeometry(layout.stalls.length * 4.5, 4.5), new THREE.MeshBasicMaterial({ map: numTex.texture, transparent: true, depthWrite: false, toneMapped: false }));
    nums.rotation.x = -Math.PI / 2;
    nums.position.set((st0.x0 + stN.x1) / 2, 0.16, f.stalls.z1 - 2.5);
    nums.renderOrder = 3;
    group.add(nums);
  }

  // Gerbang: tiang, rumah jaga kecil, palang yang terangkat, rambu MASUK / KELUAR
  const gates = [];
  for (const [name, g] of Object.entries(layout.gates)) {
    const gg = new THREE.Group();
    group.add(gg);
    const zA = g.z - f.roads.width / 2 - 1.2, zB = g.z + f.roads.width / 2 + 1.2;
    box(gg, 0.5, 4.8, 0.5, g.x + 0.5, 2.4, zA, M.brushedSteel, 0.04);
    box(gg, 0.5, 4.8, 0.5, g.x + 0.5, 2.4, zB, M.brushedSteel, 0.04);
    box(gg, 0.6, 0.6, zB - zA + 0.5, g.x + 0.5, 4.9, g.z, M.whiteSteel, 0.06);
    box(gg, 0.6, 0.12, zB - zA + 0.5, g.x + 0.5, 4.55, g.z, M.brandRed, 0.02);
    box(gg, 0.6, 0.12, zB - zA + 0.5, g.x + 0.5, 4.42, g.z, M.brandGreen, 0.02);
    box(gg, 3, 3, 2.4, g.x + 3, 1.5, zB + 2.2, M.brandBlue, 0.2);
    box(gg, 3.3, 0.4, 2.7, g.x + 3, 3.15, zB + 2.2, M.whiteSteel, 0.08);
    box(gg, 3.1, 0.8, 2.5, g.x + 3, 2.1, zB + 2.2, M.whiteSteel, 0.02, false);
    // Palang: pivot di tiang, berayun ke atas
    const pivot = new THREE.Group();
    pivot.position.set(g.x + 0.5, 1.1, zA + 0.35);
    pivot.userData.moving = true;
    gg.add(pivot);
    const armLen = zB - zA - 0.7;
    const arm = box(pivot, 0.12, 0.12, armLen, 0, 0, armLen / 2, M.whiteSteel, 0.02);
    for (let i = 0; i < 4; i++) box(pivot, 0.13, 0.13, 0.5, 0, 0, 0.6 + i * 1.3, M.brandRed, 0.02);
    compact(pivot);
    for (const c of pivot.children) c.userData.moving = true;
    cyl(gg, 0.18, 0.5, g.x + 0.5, 1.1, zA + 0.35, M.ink, 0.18, 10).rotation.x = Math.PI / 2;
    const sign = canvasTexture(256, 96, (c, w, h) => {
      c.fillStyle = BRAND.blue;
      c.fillRect(0, 0, w, h);
      print(c, name === 'entrance' ? ID.labels.gateIn : ID.labels.gateOut, w / 2, 64, 44, '#FFFFFF', 700, 'center');
    }, renderer);
    const s1 = screen(gg, 3.2, 1.2, g.x + 0.8, 6.1, g.z, sign);
    s1.rotation.y = Math.PI / 2;
    s1.userData.moving = true;
    const s2 = screen(gg, 3.2, 1.2, g.x + 0.2, 6.1, g.z, sign);
    s2.rotation.y = -Math.PI / 2;
    s2.userData.moving = true;
    gates.push({ name, pivot, x: g.x, z: g.z, open: 0 });
  }

  // Tangki penyimpanan: silinder putih, pita biru di atas, cincin pagar, tangga spiral, di atas bund beton
  const tk = f.context.tankGroups;
  const bx0 = Math.min(...tk.map((t) => t.x - t.radius)) - 6, bx1 = Math.max(...tk.map((t) => t.x + t.radius)) + 6;
  const bz0 = Math.min(...tk.map((t) => t.z - t.radius)) - 6, bz1 = Math.max(...tk.map((t) => t.z + t.radius)) + 6;
  box(statics, bx1 - bx0, 0.5, bz1 - bz0, (bx0 + bx1) / 2, 0.25, (bz0 + bz1) / 2, M.concrete, 0.05);
  box(statics, bx1 - bx0, 1.6, 0.8, (bx0 + bx1) / 2, 0.8, bz0, M.concreteLight, 0.05);
  box(statics, bx1 - bx0, 1.6, 0.8, (bx0 + bx1) / 2, 0.8, bz1, M.concreteLight, 0.05);
  box(statics, 0.8, 1.6, bz1 - bz0, bx0, 0.8, (bz0 + bz1) / 2, M.concreteLight, 0.05);
  box(statics, 0.8, 1.6, bz1 - bz0, bx1, 0.8, (bz0 + bz1) / 2, M.concreteLight, 0.05);
  const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6);
  const rails = [];
  for (const t of tk) {
    cyl(statics, t.radius, t.height, t.x, t.height / 2 + 0.5, t.z, M.whiteSteel, t.radius, 40);
    cyl(statics, t.radius + 0.06, 1.4, t.x, t.height - 0.9 + 0.5, t.z, M.brandBlue, t.radius + 0.06, 40);
    cyl(statics, t.radius, 0.5, t.x, t.height + 0.6, t.z, M.whiteSteel, t.radius * 0.1, 40);
    // Cincin pagar atas: tiang instanced + ring
    const n = Math.max(16, Math.round(t.radius * 2.2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      rails.push(new THREE.Vector3(t.x + Math.cos(a) * (t.radius - 0.2), t.height + 1.05, t.z + Math.sin(a) * (t.radius - 0.2)));
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(t.radius - 0.2, 0.05, 6, 48), M.brushedSteel);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(t.x, t.height + 1.55, t.z);
    details.add(ring);
    // Tangga spiral: anak tangga instanced di sekitar tangki
    const steps = Math.round(t.height / 0.3);
    const stair = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.06, 0.3), M.brushedSteel, steps);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 1.4 + 0.3;
      const r = t.radius + 0.6;
      m4.compose(new THREE.Vector3(t.x + Math.cos(a) * r, 0.5 + i * 0.3, t.z + Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), new THREE.Vector3(1, 1, 1));
      stair.setMatrixAt(i, m4);
    }
    stair.castShadow = true;
    details.add(stair);
    contactShadow(group, t.radius * 2.6, t.radius * 2.6, t.x, 0.52, t.z, 0.35);
  }
  const railMesh = new THREE.InstancedMesh(railGeo, M.brushedSteel, rails.length);
  rails.forEach((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    railMesh.setMatrixAt(i, m4);
  });
  details.add(railMesh);

  // Bangunan: ruang kontrol dengan pita kaca biru dan dinding layar; kantor dan bengkel
  const names = { controlRoom: ID.labels.controlRoom, office: ID.labels.office, workshop: ID.labels.workshop };
  let display = null;
  for (const b of f.context.buildings) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    box(statics, w, b.height, d, cx, b.height / 2, cz, M.brandBlue, 0.25);
    box(statics, w + 0.5, 0.5, d + 0.5, cx, b.height + 0.15, cz, M.whiteSteel, 0.12);
    box(statics, w + 0.1, 1.3, d + 0.1, cx, b.height * 0.55, cz, M.whiteSteel, 0.02, false);
    box(statics, w + 0.16, 0.9, d + 0.16, cx, b.height * 0.55, cz, M.glass, 0.02, false);
    contactShadow(group, w + 6, d + 6, cx, 0.2, cz, 0.4);
    const lab = canvasTexture(512, 96, (c, ww, hh) => {
      c.fillStyle = '#FFFFFF';
      c.fillRect(0, 0, ww, hh);
      print(c, names[b.name] || b.name, ww / 2, 64, 40, BRAND.ink, 700, 'center');
    }, renderer);
    const lb = screen(details, 6, 1.1, cx, b.height - 1.2, b.z1 + 0.06, lab);
    lb.userData.moving = true;
    if (b.name === 'controlRoom') {
      // Dinding layar menghadap plot (sisi +X), dilukis ulang maksimal 4 kali per detik
      display = canvasTexture(768, 384, (c, ww, hh) => drawDisplay(c, ww, hh, null), renderer);
      const scr = screen(details, 9, 4.5, b.x1 + 0.08, b.height / 2 + 0.3, cz, display);
      scr.rotation.y = Math.PI / 2;
      scr.userData.moving = true;
      box(statics, 0.3, 5.2, 9.8, b.x1 + 0.1, b.height / 2 + 0.3, cz, M.whiteSteel, 0.04);
    }
  }
  function drawDisplay(c, w, h, stats) {
    c.fillStyle = BRAND.ink;
    c.fillRect(0, 0, w, h);
    c.fillStyle = BRAND.blue;
    c.fillRect(0, 0, w, 12);
    c.fillStyle = BRAND.red;
    c.fillRect(0, 12, w / 3, 6);
    c.fillStyle = BRAND.green;
    c.fillRect((w / 3) * 2, 12, w / 3, 6);
    print(c, ID.labels.controlRoom.toUpperCase(), 32, 70, 30, '#CFE3F5', 600);
    const rows = [
      [ID.labels.queue, stats ? fmtNumber(stats.queue) : '—'],
      [ID.labels.committed, stats ? `${fmtNumber(stats.committed)} / ${fmtNumber(stats.totalBays)}` : '—'],
      [ID.labels.rho, stats ? fmtPercent(stats.rho) : '—'],
    ];
    rows.forEach(([k, v], i) => {
      print(c, k, 32, 150 + i * 72, 28, '#9FB8CC', 500);
      print(c, v, w - 32, 150 + i * 72, 48, '#FFFFFF', 700, 'right');
    });
    if (stats) print(c, stats.clock, 32, h - 28, 26, '#CFE3F5', 500);
  }

  // Lanskap: pagar tanaman rendah di tepi dan pohon membulat (instanced), semua bebas dari lintasan sapuan
  const hedgeGeo = new THREE.BoxGeometry(3.4, 0.9, 1.0);
  const hedgeSpots = [];
  for (let x = 8; x < 128; x += 3.6) hedgeSpots.push({ x, z: 95.5, ry: 0 });
  for (let z = 6; z < 40; z += 3.6) hedgeSpots.push({ x: 134.6, z, ry: Math.PI / 2 });
  const hedges = new THREE.InstancedMesh(hedgeGeo, M.hedge, hedgeSpots.length);
  hedgeSpots.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 0.45, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.ry, 0)), new THREE.Vector3(1, 1, 1));
    hedges.setMatrixAt(i, m4);
  });
  hedges.castShadow = true;
  group.add(hedges);
  const treeSpots = [];
  for (let x = 10; x < 128; x += 9) treeSpots.push({ x, z: 98.5 });
  for (let z = 80; z < 98; z += 7) treeSpots.push({ x: 131, z }, { x: 134.5, z: z + 3.5 });
  for (let x = -44; x < -6; x += 7) treeSpots.push({ x, z: 14 }, { x, z: 30 }, { x, z: 100 });
  for (let z = 104; z < 118; z += 8) treeSpots.push({ x: 20, z }, { x: 80, z }, { x: 110, z });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6), M.trunk, treeSpots.length);
  const crowns = new THREE.InstancedMesh(new THREE.SphereGeometry(2.0, 10, 8), M.leaf, treeSpots.length);
  treeSpots.forEach((p, i) => {
    m4.makeTranslation(p.x, 1.1, p.z);
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, 3.6, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1.15, 1));
    crowns.setMatrixAt(i, m4);
  });
  crowns.castShadow = true;
  group.add(trunks, crowns);

  // Grid 5 m (opsional)
  const grid = new THREE.GridHelper(Math.max(W, L), Math.max(W, L) / 5, 0x6b7a8c, 0x9aa7b6);
  grid.position.set(W / 2, 0.05, L / 2);
  grid.scale.set(W / Math.max(W, L), 1, L / Math.max(W, L));
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.visible = false;
  group.add(grid);

  // Overlay kelayakan
  const feasibility = new THREE.Group();
  group.add(feasibility);
  const infeasibleMat = new THREE.MeshBasicMaterial({ color: hexToInt(BRAND.red), transparent: true, opacity: 0.45, depthWrite: false });
  const feasibleMat = new THREE.MeshBasicMaterial({ color: hexToInt(BRAND.green), transparent: true, opacity: 0.18, depthWrite: false });
  function setFeasibility(report, show) {
    feasibility.clear();
    feasibility.visible = show;
    if (!show) return;
    const add = (segs, ok) => {
      for (const seg of segs) {
        const m = new THREE.Mesh(polygonGeometry(seg.poly, 0.25), ok ? feasibleMat : infeasibleMat);
        m.renderOrder = 4;
        feasibility.add(m);
      }
    };
    report.bays.forEach((b, j) => {
      add(network.bayManeuvers[j].entry, b.entry.feasible);
      add(network.bayManeuvers[j].exit, b.exit.feasible);
    });
    report.stalls.stalls.forEach((s, k) => {
      add(network.stallManeuvers[k].reverseIn, s.reverseIn.feasible);
      add(network.stallManeuvers[k].pullOut, s.pullOut.feasible);
    });
    add(network.uTurn, report.uTurn.feasible);
    const marker = new THREE.SphereGeometry(0.7, 10, 10);
    const violations = [...report.bays.flatMap((b) => [...b.entry.worst, ...b.exit.worst]), ...report.stalls.stalls.flatMap((s) => [...s.reverseIn.worst, ...s.pullOut.worst]), ...report.uTurn.worst];
    for (const v of violations) {
      if (v.x == null) continue;
      const m = new THREE.Mesh(marker, new THREE.MeshBasicMaterial({ color: hexToInt(BRAND.red) }));
      m.position.set(v.x, 1.4, v.z);
      feasibility.add(m);
    }
  }

  compact(statics);
  compact(details);

  return {
    group,
    grid,
    zoneTints,
    routeArrows,
    zoneAnchors,
    gates,
    details,
    setFeasibility,
    setZoneMode(on) {
      zoneTints.visible = on;
      routeArrows.visible = on;
    },
    setDetailsVisible(v) {
      details.visible = v;
    },
    updateDisplay(stats) {
      if (display) display.redraw((c, w, h) => drawDisplay(c, w, h, stats));
    },
  };
}
