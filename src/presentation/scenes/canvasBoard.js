// Papan Business Model Canvas: sembilan panel bertekstur kanvas dalam tata letak BMC baku, melayang di
// timur laut terminal dan menghadap kamera isometrik. Panel aktif diperbesar; garis penunjuk dari panel ke objek
// nyata (bay, tangki, gerbang, SPBU, pipa) hanya tampil untuk panel aktif.
import * as THREE from 'three';
import { canvasTexture, print, FONT } from '../../render/materials.js';
import { BRAND, hexToInt } from '../../ui/theme.js';
import { BMC } from '../world.js';

// Kolom (0..4) dan baris dalam satuan grid: [col, row, colSpan, rowSpan]
const LAYOUT = {
  keyPartners: [0, 0, 1, 2],
  keyActivities: [1, 0, 1, 1],
  keyResources: [1, 1, 1, 1],
  valueProposition: [2, 0, 1, 2],
  customerRelationships: [3, 0, 1, 1],
  channels: [3, 1, 1, 1],
  customerSegments: [4, 0, 1, 2],
  costStructure: [0, 2, 2.5, 1],
  revenueStreams: [2.5, 2, 2.5, 1],
};
const CW = 30, RH = 18, GAP = 1.6, BOTTOM_H = 13;
export const BMC_KEYS = Object.keys(LAYOUT);

function drawPanel(c, w, h, lines, active) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = active ? '#FFFFFF' : 'rgba(255,255,255,0.93)';
  const r = 28;
  c.beginPath();
  c.roundRect(4, 4, w - 8, h - 8, r);
  c.fill();
  c.lineWidth = active ? 10 : 4;
  c.strokeStyle = active ? BRAND.blue : '#D6DEE6';
  c.stroke();
  c.fillStyle = active ? BRAND.blue : '#E6F0F8';
  c.beginPath();
  c.roundRect(4, 4, w - 8, 98, [r, r, 0, 0]);
  c.fill();
  print(c, lines[0], 30, 72, 60, active ? '#FFFFFF' : BRAND.blueDark, 800);
  // Isi: bungkus kata agar muat lebar panel; maksimal baris mengikuti tinggi panel.
  c.font = `600 40px ${FONT}`;
  const maxW = w - 64, maxLines = Math.max(2, Math.floor((h - 150) / 50));
  const wrapped = [];
  for (const ln of lines.slice(1)) {
    let cur = '';
    for (const word of String(ln).split(' ')) {
      const test = cur ? `${cur} ${word}` : word;
      if (c.measureText(test).width > maxW && cur) {
        wrapped.push(cur);
        cur = word;
      } else cur = test;
    }
    if (cur) wrapped.push(cur);
  }
  wrapped.slice(0, maxLines).forEach((ln, i) => print(c, ln, 30, 170 + i * 50, 40, BRAND.ink, 600));
}

export function buildCanvasBoard({ renderer, texts }) {
  const group = new THREE.Group();
  const board = new THREE.Group();
  group.add(board);
  board.position.set(BMC.cx, BMC.cy, BMC.cz);
  board.rotation.y = -Math.PI / 4; // normal menghadap barat daya (kamera)
  const panels = {};
  const totalW = 5 * CW + 4 * GAP;
  const totalH = 2 * RH + GAP + BOTTOM_H + GAP;
  for (const [key, [col, row, cs, rs]] of Object.entries(LAYOUT)) {
    const w = cs * CW + (cs - 1) * GAP;
    const h = row === 2 ? BOTTOM_H : rs * RH + (rs - 1) * GAP;
    const x = -totalW / 2 + col * (CW + GAP) + w / 2;
    const yTop = totalH / 2 - (row === 2 ? 2 * RH + 2 * GAP : row * (RH + GAP));
    const y = yTop - h / 2;
    const px = Math.round(w * 24), py = Math.round(h * 24);
    const tex = canvasTexture(px, py, (c, cw, ch) => drawPanel(c, cw, ch, texts[key] || [key], false), renderer);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex.texture, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    mesh.position.set(x, y, 0);
    mesh.userData.cardKey = `bmc.${key}`;
    board.add(mesh);
    panels[key] = { mesh, tex, w, h, active: false, lines: texts[key] };
  }
  // Latar papan tipis (kaca) agar terbaca di atas adegan
  const back = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 6, totalH + 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  back.position.z = -0.4;
  board.add(back);

  // Garis penunjuk dan titik jangkar
  const lineMat = new THREE.LineBasicMaterial({ color: hexToInt(BRAND.blue), transparent: true, opacity: 0.9 });
  const anchorMat = new THREE.MeshBasicMaterial({ color: hexToInt(BRAND.blue), toneMapped: false });
  const pointers = new THREE.Group();
  group.add(pointers);
  const tmpA = new THREE.Vector3();
  let anchors = {};
  const POINT_TO = {
    valueProposition: ['bays'],
    customerSegments: ['exitGate'],
    channels: ['gate'],
    keyPartners: ['pipeline', 'tanks'],
    keyResources: ['tanks'],
    keyActivities: ['bays', 'controlRoom'],
    revenueStreams: ['exitGate'],
    costStructure: ['tanks', 'trucks'],
    customerRelationships: ['gate'],
  };

  function redraw(key) {
    const p = panels[key];
    p.tex.redraw((c, w, h) => drawPanel(c, w, h, p.lines || [key], p.active));
  }
  function rebuildPointers() {
    while (pointers.children.length) {
      const c = pointers.children.pop();
      c.geometry?.dispose();
    }
    board.updateMatrixWorld(true);
    for (const [key, p] of Object.entries(panels)) {
      if (!p.active) continue;
      p.mesh.getWorldPosition(tmpA);
      const from = tmpA.clone().add(new THREE.Vector3(0, -p.h / 2 + 1, 0));
      for (const ak of POINT_TO[key] || []) {
        const to = anchors[ak];
        if (!to) continue;
        const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, 6, 0));
        const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
        pointers.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)), lineMat));
        const dot = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), anchorMat);
        dot.position.copy(to);
        pointers.add(dot);
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 28), anchorMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(to).setY(0.5);
        pointers.add(ring);
      }
    }
  }

  group.visible = false;
  return {
    group,
    pickables: Object.values(panels).map((p) => p.mesh),
    setAnchors(a) {
      anchors = a;
      rebuildPointers();
    },
    setActive(keys = []) {
      const set = new Set(keys);
      for (const [key, p] of Object.entries(panels)) {
        const on = set.has(key);
        if (on !== p.active) {
          p.active = on;
          p.mesh.scale.setScalar(on ? 1.12 : 1);
          p.mesh.position.z = on ? 1.5 : 0;
          p.mesh.renderOrder = on ? 2 : 1;
          redraw(key);
        }
      }
      rebuildPointers();
    },
    relabel(newTexts) {
      for (const [key, p] of Object.entries(panels)) {
        p.lines = newTexts[key];
        redraw(key);
      }
    },
    center: () => board.position.clone(),
    update(dt) {
      // napas ringan pada panel aktif
      const s = 1.12 + Math.sin(performance.now() / 700) * 0.01;
      for (const p of Object.values(panels)) if (p.active) p.mesh.scale.setScalar(s);
    },
  };
}
