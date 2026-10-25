// Blok filling bay bergaya Pertamina: atap putih, fasia brand-blue, garis aksen merah dan hijau, plakat nomor
// (putih di atas biru), strip tiga produk dengan nama, pulau baja, lengan pengisian chrome, selang berkerah
// warna produk, dan kolom lampu status per bay. Atap memakai material yang dapat dipotong (mode "Tanpa atap").
import * as THREE from 'three';
import { box, cyl, tube, canvasTexture, print, screen, compact, rectOutline, mergeFlat } from '../materials.js';
import { BRAND, BAY_STATE_STYLE, hexToInt } from '../../ui/theme.js';

export function buildBayBlock({ layout, config, products, M, renderer, clipPlane }) {
  const group = new THREE.Group();
  const f = config.facility;
  const bb = layout.zones.bayBlock;
  const H = f.canopy.height;
  const ext = layout.vehicleExtents;

  // Material atap yang bisa dipotong oleh bidang klip (Bagian B: cutaway)
  const roofMat = M.whiteSteel.clone();
  roofMat.clippingPlanes = [clipPlane];
  roofMat.clipShadows = true;
  roofMat.side = THREE.DoubleSide;
  const fasciaMat = M.brandBlue.clone();
  fasciaMat.clippingPlanes = [clipPlane];
  fasciaMat.clipShadows = true;
  fasciaMat.side = THREE.DoubleSide;
  const accentRed = M.brandRed.clone();
  const accentGreen = M.brandGreen.clone();
  for (const m of [accentRed, accentGreen]) {
    m.clippingPlanes = [clipPlane];
    m.clipShadows = true;
  }

  const statics = new THREE.Group();
  group.add(statics);
  // Slab beton blok bay
  box(statics, bb.width + 1, 0.16, bb.length + 1, (bb.x0 + bb.x1) / 2, 0.08, (bb.z0 + bb.z1) / 2, M.concreteLight, 0.04);
  // Atap, fasia dan garis aksen di tepi depan (sisi +Z)
  box(statics, bb.width + 1.2, f.canopy.thickness, bb.length + 0.6, (bb.x0 + bb.x1) / 2, H, (bb.z0 + bb.z1) / 2, roofMat, 0.1);
  box(statics, bb.width + 1.2, 0.9, 0.35, (bb.x0 + bb.x1) / 2, H - 0.55, bb.z1 + 0.35, fasciaMat, 0.05);
  box(statics, bb.width + 1.2, 0.12, 0.36, (bb.x0 + bb.x1) / 2, H - 1.06, bb.z1 + 0.36, accentRed, 0.02);
  box(statics, bb.width + 1.2, 0.12, 0.36, (bb.x0 + bb.x1) / 2, H - 1.2, bb.z1 + 0.36, accentGreen, 0.02);
  // Balok memanjang di bawah atap
  for (const z of [bb.z0 + 1, (bb.z0 + bb.z1) / 2, bb.z1 - 1]) box(statics, bb.width + 0.6, 0.4, 0.3, (bb.x0 + bb.x1) / 2, H - 0.35, z, M.brushedSteel, 0.03);

  const m4 = new THREE.Matrix4();
  // Kolom: instanced
  const colGeo = new THREE.BoxGeometry(f.columns.size, H, f.columns.size);
  const cols = new THREE.InstancedMesh(colGeo, M.whiteSteel, layout.columns.length);
  layout.columns.forEach((c, i) => {
    m4.makeTranslation(c.x, H / 2, c.z);
    cols.setMatrixAt(i, m4);
  });
  cols.castShadow = true;
  cols.receiveShadow = true;
  group.add(cols);
  // Alas kolom (dirinci; disembunyikan pada jarak jauh)
  const details = new THREE.Group();
  group.add(details);
  for (const c of layout.columns) box(details, 0.9, 0.3, 0.9, c.x, 0.15, c.z, M.concrete, 0.03, false);

  const bays = [];
  const markGeos = [];
  for (const b of layout.bays) {
    const bg = new THREE.Group();
    group.add(bg);
    // Marka posisi servis
    const z0 = b.serviceAxle.z - ext.front, z1 = b.serviceAxle.z + ext.rear;
    markGeos.push(rectOutline(b.cx - 1.55, z0 - 0.3, b.cx + 1.55, z1 + 0.3, 0.16));
    // Pulau baja + lengan pengisian chrome + selang berkerah produk
    const eq = layout.equipment[b.index];
    const ex = (eq.x0 + eq.x1) / 2, ez = (eq.z0 + eq.z1) / 2;
    box(statics, eq.x1 - eq.x0 + 0.6, 0.25, eq.z1 - eq.z0 + 0.6, ex, 0.125, ez, M.concrete, 0.04);
    box(statics, eq.x1 - eq.x0, eq.height, eq.z1 - eq.z0, ex, eq.height / 2 + 0.25, ez, M.brushedSteel, 0.06);
    box(statics, eq.x1 - eq.x0 + 0.2, 0.3, eq.z1 - eq.z0 + 0.2, ex, eq.height + 0.4, ez, M.ink, 0.04);
    cyl(statics, 0.1, 2.6, eq.x0 - 1.2, eq.height - 0.3, ez, M.chrome, 0.1, 10).rotation.z = Math.PI / 2;
    cyl(statics, 0.1, 1.6, eq.x0 - 2.4, eq.height - 1.1, ez, M.chrome, 0.1, 10);
    cyl(statics, 0.2, 0.6, eq.x0 - 2.4, eq.height - 1.95, ez, M.brushedSteel, 0.2, 10);
    b.products.forEach((pid, k) => {
      const col = new THREE.MeshStandardMaterial({ color: hexToInt(products[pid].color), roughness: 0.5 });
      tube(details, [[ex, eq.height - 0.6, ez - 2.8 + k * 1.2], [ex - 1.6, eq.height - 1.4, ez - 2.6 + k * 1.2], [ex - 2.0, 1.4, ez - 2.4 + k * 1.2]], 0.07, M.rubber, 6);
      cyl(details, 0.14, 0.35, ex - 1.5, eq.height - 1.3, ez - 2.6 + k * 1.2, col, 0.14, 8, false);
    });
    // Tiang lampu status (lampunya sendiri adalah InstancedMesh dengan warna per instance, lihat di bawah)
    cyl(statics, 0.09, 3.2, b.cx + 3.2, 1.6, bb.z1 - 0.6, M.brushedSteel, 0.09, 8);
    // Satu tekstur per bay: plakat nomor (putih di atas brand-blue) + strip tiga produk dengan nama
    const sign = canvasTexture(768, 256, (c, w, h) => drawSign(c, w, h, b.number, b.products, products), renderer);
    const sg = screen(bg, 6.0, 2.0, b.cx, H - 1.25, bb.z1 + 0.54, sign);
    sg.userData.moving = true;
    bays.push({
      number: b.number,
      group: bg,
      sign,
      products: [...b.products],
      anchor: new THREE.Vector3(b.cx, H + 0.6, bb.z1 + 0.5),
      center: new THREE.Vector3(b.cx, 2, (b.z0 + b.z1) / 2),
      x0: b.x0,
      x1: b.x1,
      z0: b.z0,
      z1: b.z1,
      lightPos: new THREE.Vector3(b.cx + 3.2, 3.5, bb.z1 - 0.6),
    });
  }
  const marks = new THREE.Mesh(mergeFlat(markGeos), M.markingWhite);
  marks.position.y = 0.2;
  marks.renderOrder = 2;
  group.add(marks);
  // Lampu status: satu InstancedMesh, warna per instance (material tanpa tone mapping agar warna status tepat)
  const lights = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.6, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), bays.length);
  bays.forEach((b, i) => {
    m4.makeTranslation(b.lightPos.x, b.lightPos.y, b.lightPos.z);
    lights.setMatrixAt(i, m4);
    lights.setColorAt(i, new THREE.Color(hexToInt(BAY_STATE_STYLE.available.color)));
  });
  group.add(lights);
  // Sorotan bay terpilih: satu plane biru transparan yang dipindahkan ke bay terpilih
  const selMesh = new THREE.Mesh(new THREE.PlaneGeometry(f.bays.pitch - 0.2, bb.length), new THREE.MeshBasicMaterial({ color: hexToInt(BRAND.blue), transparent: true, opacity: 0.22, depthWrite: false }));
  selMesh.rotation.x = -Math.PI / 2;
  selMesh.position.y = 0.26;
  selMesh.renderOrder = 3;
  selMesh.visible = false;
  group.add(selMesh);
  compact(statics);
  compact(details);

  function drawSign(c, w, h, number, ids, prods) {
    c.clearRect(0, 0, w, h);
    // plakat nomor
    c.fillStyle = BRAND.blue;
    roundRect(c, w / 2 - 110, 6, 220, 112, 10);
    c.fill();
    print(c, String(number).padStart(2, '0'), w / 2, 94, 78, '#FFFFFF', 700, 'center');
    // strip produk
    const n = ids.length;
    ids.forEach((pid, k) => {
      const p = prods[pid];
      const x0 = (w / n) * k + 4, x1 = (w / n) * (k + 1) - 4;
      c.fillStyle = p.color;
      roundRect(c, x0, 134, x1 - x0, 112, 14);
      c.fill();
      print(c, p.name, (x0 + x1) / 2, 202, p.name.length > 9 ? 30 : 36, isLight(p.color) ? BRAND.ink : '#FFFFFF', 700, 'center');
    });
  }

  const tmpColor = new THREE.Color();
  function updateStatus(bayStats, productsCfg) {
    let changed = false;
    for (const st of bayStats) {
      const bay = bays[st.bay - 1];
      const style = BAY_STATE_STYLE[st.state] || BAY_STATE_STYLE.available;
      if (bay.state !== st.state) {
        bay.state = st.state;
        tmpColor.setHex(hexToInt(style.color));
        if (st.state === 'inactive') tmpColor.multiplyScalar(0.6);
        lights.setColorAt(bay.number - 1, tmpColor);
        changed = true;
      }
      if (st.products.join() !== bay.products.join()) {
        bay.products = [...st.products];
        bay.sign.redraw((c, w, h) => drawSign(c, w, h, st.bay, st.products, productsCfg));
      }
    }
    if (changed) lights.instanceColor.needsUpdate = true;
  }
  function setSelected(number) {
    const b = number ? bays[number - 1] : null;
    selMesh.visible = !!b;
    if (b) selMesh.position.set((b.x0 + b.x1) / 2, 0.26, (b.z0 + b.z1) / 2);
  }
  // Pemilihan bay: titik tanah (x,z) -> nomor bay di blok bay
  function bayAt(x, z) {
    if (z < bb.z0 || z > bb.z1 + 8) return null;
    const b = bays.find((q) => x >= q.x0 && x < q.x1);
    return b ? b.number : null;
  }
  function setDetailsVisible(v) {
    details.visible = v;
  }
  return { group, bays, updateStatus, setSelected, setDetailsVisible, bayAt, roofMaterials: [roofMat, fasciaMat, accentRed, accentGreen] };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function isLight(hex) {
  const n = hexToInt(hex);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}
