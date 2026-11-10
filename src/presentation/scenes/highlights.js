// Sorotan area terminal untuk bab 2 dan 4: bidang tint berdenyut di atas zona, cincin di sekeliling tangki,
// pita buffer zone, dan pipa penerimaan skematis (dekorasi permanen) dari arah timur laut ke tank farm.
import * as THREE from 'three';
import { BRAND, hexToInt } from '../../ui/theme.js';

export function buildHighlights({ layout, config, M }) {
  const group = new THREE.Group();
  const f = config.facility;
  const W = layout.plot.width, L = layout.plot.length;
  const mk = (color, opacity = 0.22) => new THREE.MeshBasicMaterial({ color: hexToInt(color), transparent: true, opacity, depthWrite: false });
  const items = {}; // key -> { group, anchor, mats }
  const add = (key, meshes, anchor) => {
    const g = new THREE.Group();
    for (const m of meshes) {
      m.renderOrder = 5;
      g.add(m);
    }
    g.visible = false;
    group.add(g);
    items[key] = { group: g, anchor, mats: meshes.map((m) => m.material) };
  };
  const plane = (x0, z0, x1, z1, mat, y = 0.45) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    return m;
  };
  const bb = layout.zones.bayBlock, wz = layout.zones.waiting;
  add('bays', [plane(bb.x0, bb.z0, bb.x1, bb.z1, mk(BRAND.blue), 7.6)], new THREE.Vector3((bb.x0 + bb.x1) / 2, 11, bb.z0 + 4));
  add('waiting', [plane(wz.x0, wz.z0, wz.x1, wz.z1, mk(BRAND.blue))], new THREE.Vector3((wz.x0 + wz.x1) / 2, 4, (wz.z0 + wz.z1) / 2));
  add('gate', [plane(-14, f.gates.exit.z - 6, 14, f.gates.entrance.z + 6, mk(BRAND.blue))], new THREE.Vector3(0, 9, (f.gates.exit.z + f.gates.entrance.z) / 2));
  const cr = f.context.buildings.find((b) => b.name === 'controlRoom');
  add('controlRoom', [plane(cr.x0 - 1, cr.z0 - 1, cr.x1 + 1, cr.z1 + 1, mk(BRAND.blue), cr.height + 0.6)], new THREE.Vector3((cr.x0 + cr.x1) / 2, cr.height + 4, (cr.z0 + cr.z1) / 2));
  add('plot', [plane(0, 0, W, L, mk(BRAND.blue, 0.1))], new THREE.Vector3(W / 2, 4, L - 6));
  const tankRings = f.context.tankGroups.map((t) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(t.radius + 1.5, t.radius + 4, 40), mk(BRAND.blue, 0.35));
    r.rotation.x = -Math.PI / 2;
    r.position.set(t.x, 0.5, t.z);
    return r;
  });
  const tk = f.context.tankGroups;
  const tankCenter = new THREE.Vector3(tk.reduce((s, t) => s + t.x, 0) / tk.length, 0, tk.reduce((s, t) => s + t.z, 0) / tk.length);
  add('tanks', tankRings, tankCenter.clone().setY(20));
  // Buffer zone: pita oranye di luar plot
  const bufferMat = mk(BRAND.orange, 0.16);
  // Shape di bidang XY dengan y = -z, lalu diputar ke XZ (rotateX(-90°) memetakan (x, y) → (x, 0, -y)).
  const outer = new THREE.Shape();
  outer.moveTo(-150, 360);
  outer.lineTo(320, 360);
  outer.lineTo(320, -410);
  outer.lineTo(-150, -410);
  outer.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-96, 304);
  hole.lineTo(266, 304);
  hole.lineTo(266, -356);
  hole.lineTo(-96, -356);
  hole.closePath();
  outer.holes.push(hole);
  const buffer = new THREE.Mesh(new THREE.ShapeGeometry(outer).rotateX(-Math.PI / 2), bufferMat);
  buffer.material.side = THREE.DoubleSide;
  buffer.position.y = 0.3;
  add('buffer', [buffer], new THREE.Vector3(W / 2, 5, 380));
  // Pipa penerimaan skematis (permanen) + sorotan
  const pipeMat = new THREE.MeshStandardMaterial({ color: hexToInt(BRAND.blue), roughness: 0.55, metalness: 0.1 });
  const first = tk[0];
  const pipePts = [new THREE.Vector3(W + 190, 1.6, -70), new THREE.Vector3(W + 120, 1.6, -40), new THREE.Vector3(first.x + 26, 1.6, -14), new THREE.Vector3(first.x + 26, 1.6, first.z - 2), new THREE.Vector3(first.x + first.radius + 1, 1.6, first.z)];
  const pipeCurve = new THREE.CatmullRomCurve3(pipePts, false, 'catmullrom', 0.05);
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 40, 0.9, 10, false), pipeMat);
  pipe.castShadow = true;
  group.add(pipe);
  for (let i = 0; i < 8; i++) {
    const p = pipeCurve.getPointAt(i / 8 + 0.05);
    const sup = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 1.2), M.concrete);
    sup.position.set(p.x, 0.8, p.z);
    group.add(sup);
  }
  const pipeGlow = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 40, 1.8, 10, false), mk(BRAND.blue, 0.3));
  add('pipeline', [pipeGlow], pipeCurve.getPointAt(0.45).clone().setY(8));
  items.pipeline.flow = { curve: pipeCurve };
  // Partikel aliran di pipa saat disorot
  const N = 14;
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N);
  dots.visible = false;
  group.add(dots);
  const m4 = new THREE.Matrix4(), tmp = new THREE.Vector3();
  let t = 0;
  // Jangkar untuk garis penunjuk BMC dan label
  const anchors = {
    bays: new THREE.Vector3((bb.x0 + bb.x1) / 2, 8, bb.z1 - 2),
    tanks: tankCenter.clone().setY(16),
    gate: new THREE.Vector3(2, 5, f.gates.entrance.z),
    exitGate: new THREE.Vector3(2, 5, f.gates.exit.z),
    controlRoom: new THREE.Vector3((cr.x0 + cr.x1) / 2, cr.height + 1, (cr.z0 + cr.z1) / 2),
    pipeline: pipeCurve.getPointAt(0.5).clone().setY(3),
    trucks: new THREE.Vector3((wz.x0 + wz.x1) / 2, 4, (wz.z0 + wz.z1) / 2),
    waiting: new THREE.Vector3((wz.x0 + wz.x1) / 2, 4, (wz.z0 + wz.z1) / 2),
    plot: new THREE.Vector3(W / 2, 2, L - 6),
    buffer: new THREE.Vector3(W / 2, 2, 380),
  };
  let active = new Set();
  return {
    group,
    anchors,
    labelAnchors: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.anchor])),
    show(keys = []) {
      active = new Set(keys);
      for (const [k, it] of Object.entries(items)) it.group.visible = active.has(k);
      dots.visible = active.has('pipeline');
    },
    update(dt) {
      const pulse = 0.65 + Math.sin(performance.now() / 500) * 0.35;
      for (const k of active) for (const m of items[k].mats) m.opacity = (k === 'plot' ? 0.08 : k === 'buffer' ? 0.14 : 0.2) * (0.6 + pulse * 0.6);
      if (dots.visible) {
        t += dt * 0.12;
        for (let i = 0; i < N; i++) {
          pipeCurve.getPointAt((t + i / N) % 1, tmp);
          m4.makeTranslation(tmp.x, tmp.y, tmp.z);
          dots.setMatrixAt(i, m4);
        }
        dots.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
