// Diorama holding dan subholding: menara holding di tengah plinth, enam gedung unit di sekelilingnya dengan
// balok penghubung; pelat "pemilik" melayang di atas. Garis putus menandai konsolidasi 2026 (kilang dan armada
// captive ke Patra Niaga). Mode aliran menggerakkan titik di sepanjang tautan (bab 4).
import * as THREE from 'three';
import { box, cyl, compact, contactShadow } from '../../render/materials.js';
import { BRAND, hexToInt } from '../../ui/theme.js';
import { HOLDING } from '../world.js';

const UNIT_ORDER = ['upstream', 'refining', 'commercial', 'gas', 'power', 'marine'];

export function buildHolding({ M }) {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const C = new THREE.Vector3(HOLDING.cx, 0, HOLDING.cz);
  // Plinth
  box(statics, HOLDING.w, 0.6, HOLDING.d, C.x, 0.3, C.z, M.plot, 0.1, false).receiveShadow = true;
  box(statics, HOLDING.w + 1.2, 0.2, HOLDING.d + 1.2, C.x, 0.1, C.z, M.concrete, 0.05, false);

  const pickables = [];
  const anchors = {}; // key -> Vector3 (label)
  const positions = {};
  const addPick = (mesh, key) => {
    mesh.userData.cardKey = key;
    pickables.push(mesh);
  };

  // Menara holding (tengah) dengan pita biru-merah-hijau
  const hold = new THREE.Group();
  hold.position.set(C.x, 0.6, C.z);
  const tower = box(hold, 22, 22, 18, 0, 11, 0, M.whiteSteel, 0.4);
  box(hold, 22.4, 1.4, 18.4, 0, 20.3, 0, M.brandBlueDark, 0.1);
  box(hold, 22.4, 0.35, 18.4, 0, 19.3, 0, M.brandRed, 0.05);
  box(hold, 22.4, 0.35, 18.4, 0, 18.7, 0, M.brandGreen, 0.05);
  for (let y = 3; y < 18; y += 3.2) for (const x of [-7, -2.3, 2.3, 7]) box(hold, 2.4, 1.6, 0.3, x, y, 9.1, M.glass, 0.02, false);
  contactShadow(hold, 30, 26, 0, 0.02, 0, 0.45);
  addPick(tower, 'sub.holding');
  group.add(hold);
  anchors.holding = new THREE.Vector3(C.x, 25, C.z);
  positions.holding = new THREE.Vector3(C.x, 10, C.z);
  // Pelat pemilik melayang
  const plate = box(group, 26, 1.2, 8, C.x, 30, C.z, M.brandBlue, 0.3, false);
  plate.userData.moving = true;
  anchors.owner = new THREE.Vector3(C.x, 33, C.z);

  // Enam unit dalam busur menghadap kamera (barat daya: -X, +Z)
  const R = 58;
  const angles = { upstream: 215, refining: 255, commercial: 290, gas: 325, power: 355, marine: 180 };
  const unitMesh = {};
  for (const key of UNIT_ORDER) {
    const a = THREE.MathUtils.degToRad(angles[key]);
    const x = C.x + Math.cos(a) * R, z = C.z - Math.sin(a) * R * 0.78;
    const g = new THREE.Group();
    g.position.set(x, 0.6, z);
    let main;
    if (key === 'upstream') {
      main = box(g, 10, 4, 10, 0, 2, 0, M.steel, 0.2);
      const der = new THREE.Mesh(new THREE.ConeGeometry(2.6, 14, 4, 1, true), M.ink);
      der.position.y = 11;
      der.castShadow = true;
      g.add(der);
      cyl(g, 0.5, 6, 3.5, 7, 3.5, M.brushedSteel, 0.5, 8);
    } else if (key === 'refining') {
      main = box(g, 14, 5, 10, 0, 2.5, 0, M.whiteSteel, 0.25);
      cyl(g, 1.2, 14, -4, 12, -2, M.brushedSteel, 1.2, 12);
      cyl(g, 1.0, 11, -1.2, 10.5, -2.5, M.brushedSteel, 1.0, 12);
      cyl(g, 2.6, 4, 4, 7, 2, M.whiteSteel, 2.6, 16);
      box(g, 14.4, 0.5, 10.4, 0, 5.2, 0, M.brandBlueDark, 0.05);
    } else if (key === 'commercial') {
      main = box(g, 14, 4.5, 11, 0, 2.25, -3, M.whiteSteel, 0.3);
      box(g, 14.4, 0.5, 11.4, 0, 4.7, -3, M.brandBlueDark, 0.05);
      // kanopi SPBU mini di depan
      box(g, 12, 0.5, 6, 0, 5.2, 6, M.whiteSteel, 0.1);
      box(g, 12.2, 0.5, 0.3, 0, 4.9, 9.1, M.brandBlue, 0.05);
      for (const x of [-5, 5]) cyl(g, 0.25, 5, x, 2.5, 6, M.whiteSteel, 0.25, 8);
      for (const x of [-2.5, 2.5]) box(g, 1.0, 1.6, 0.8, x, 0.8, 6, M.brandBlue, 0.05);
    } else if (key === 'gas') {
      main = box(g, 10, 3.5, 10, 0, 1.75, 0, M.whiteSteel, 0.25);
      const sph = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), M.whiteSteel);
      sph.position.set(0, 8, 0);
      sph.castShadow = true;
      g.add(sph);
      for (const x of [-2.6, 2.6]) cyl(g, 0.3, 4.6, x, 5.8, 0, M.brushedSteel, 0.3, 8);
      cyl(g, 0.4, 14, 0, 1.2, 7, M.brandBlueDark, 0.4, 8).rotation.z = Math.PI / 2;
    } else if (key === 'power') {
      main = box(g, 10, 4, 10, 0, 2, 0, M.whiteSteel, 0.25);
      cyl(g, 3.2, 9, -2, 8.5, -1, M.concreteLight, 2.3, 18); // menara pendingin
      box(g, 6, 0.3, 4, 3.5, 4.6, 3, M.brandBlueDark, 0.03).rotation.x = -0.35; // panel surya
    } else {
      main = box(g, 18, 3, 6, 0, 1.5, 0, M.brandBlueDark, 0.3); // lambung kapal
      box(g, 18.4, 0.5, 6.4, 0, 3.2, 0, M.whiteSteel, 0.1);
      box(g, 5, 4, 4.5, -5, 5.4, 0, M.whiteSteel, 0.2);
      cyl(g, 0.5, 2.2, -5, 8.5, 0, M.brandRed, 0.5, 10);
      for (let i = -1; i <= 1; i++) cyl(g, 1.0, 1.0, 3 + i * 3.6, 4.0, 0, M.whiteSteel, 1.0, 12);
    }
    contactShadow(g, 20, 16, 0, 0.02, 0, 0.4);
    addPick(main, `sub.${key}`);
    unitMesh[key] = g;
    group.add(g);
    anchors[key] = new THREE.Vector3(x, 17, z);
    positions[key] = new THREE.Vector3(x, 4, z);
  }

  // Balok penghubung holding → unit (biru muda), di ketinggian 2 m; putus-putus untuk konsolidasi 2026
  const linkMat = new THREE.MeshStandardMaterial({ color: hexToInt(BRAND.lightBlue), roughness: 0.7, transparent: true, opacity: 0.85 });
  const links = [];
  const linkBetween = (a, b, dashed = false) => {
    const from = a.clone().setY(1.4), to = b.clone().setY(1.4);
    const len = from.distanceTo(to);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dir = to.clone().sub(from).normalize();
    const segs = dashed ? Math.max(3, Math.floor(len / 6)) : 1;
    for (let i = 0; i < segs; i++) {
      const segLen = dashed ? len / segs / 2 : len - 24;
      const p = dashed ? from.clone().addScaledVector(dir, (i + 0.5) * (len / segs)) : mid;
      const m = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.5, dashed ? 0.6 : 1.4), dashed ? M.brandRed : linkMat);
      m.position.copy(p);
      m.rotation.y = -Math.atan2(dir.z, dir.x);
      m.receiveShadow = true;
      statics.add(m);
    }
    links.push({ from, to });
  };
  for (const key of UNIT_ORDER) linkBetween(positions.holding, positions[key]);
  linkBetween(positions.refining, positions.commercial, true);
  linkBetween(positions.marine, positions.commercial, true);
  anchors.merger = positions.refining.clone().add(positions.commercial).multiplyScalar(0.5).setY(4);
  compact(statics);

  // Aliran transaksi (bab 4): titik bergerak hulu → kilang → niaga, kilang → niaga, holding ↔ unit
  const flowPaths = [
    { from: positions.upstream, to: positions.refining, color: BRAND.ink },
    { from: positions.refining, to: positions.commercial, color: BRAND.blue },
    { from: positions.marine, to: positions.commercial, color: BRAND.lightBlue },
    { from: positions.upstream, to: positions.gas, color: BRAND.teal },
    { from: positions.commercial, to: positions.holding, color: BRAND.green },
    { from: positions.upstream, to: positions.holding, color: BRAND.green },
  ];
  const N = 10;
  const flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), flowPaths.length * N);
  flowPaths.forEach((p, pi) => {
    const c = new THREE.Color(hexToInt(p.color));
    for (let i = 0; i < N; i++) flow.setColorAt(pi * N + i, c);
  });
  flow.visible = false;
  group.add(flow);
  const halo = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), flowPaths.length * N);
  flowPaths.forEach((p, pi) => {
    const c = new THREE.Color(hexToInt(p.color));
    for (let i = 0; i < N; i++) halo.setColorAt(pi * N + i, c);
  });
  halo.visible = false;
  group.add(halo);
  const m4 = new THREE.Matrix4();
  let t = 0;
  const tmp = new THREE.Vector3();

  return {
    group,
    pickables,
    anchors,
    positions,
    setFlow(on) {
      flow.visible = on;
      halo.visible = on;
    },
    update(dt) {
      // pelat pemilik melayang pelan; aliran bergerak
      plate.position.y = 30 + Math.sin(performance.now() / 900) * 0.4;
      if (!flow.visible) return;
      t += dt * 0.12;
      flowPaths.forEach((p, pi) => {
        for (let i = 0; i < N; i++) {
          const u = (t + i / N) % 1;
          tmp.lerpVectors(p.from, p.to, u).setY(3.5 + Math.sin(u * Math.PI) * 6);
          m4.makeTranslation(tmp.x, tmp.y, tmp.z);
          flow.setMatrixAt(pi * N + i, m4);
          halo.setMatrixAt(pi * N + i, m4);
        }
      });
      flow.instanceMatrix.needsUpdate = true;
      halo.instanceMatrix.needsUpdate = true;
    },
  };
}
