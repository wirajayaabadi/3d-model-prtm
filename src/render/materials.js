// Pustaka material bersama, cache geometri, tekstur kanvas dan penggabungan mesh statis per material.
// Teknik diadaptasi dari kode referensi Bagian B; palet mengikuti sistem desain Bagian 19.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRAND, hexToInt } from '../ui/theme.js';

const std = (color, metalness = 0.1, roughness = 0.4, extra = {}) =>
  new THREE.MeshStandardMaterial({ color: typeof color === 'string' ? hexToInt(color) : color, metalness, roughness, ...extra });

export function createMaterialLibrary() {
  // Gaya "miniatur mainan": material matte (tanpa kilau logam), tanah dan jalan terang, biru brand jenuh.
  return {
    whiteSteel: std('#FFFFFF', 0.05, 0.75),
    brushedSteel: std('#B8C2CC', 0.25, 0.6),
    chrome: std('#D9DEE3', 0.45, 0.35),
    steel: std(BRAND.steel, 0.15, 0.7),
    concrete: std('#D9DEE3', 0, 0.95),
    concreteLight: std('#E6EAEE', 0, 0.95),
    asphalt: std('#C7D0D9', 0, 0.98),
    asphaltLight: std('#D3DAE2', 0, 0.98),
    glass: std('#7FB3DC', 0.1, 0.2, { transparent: true, opacity: 0.35, depthWrite: false }),
    rubber: std('#2B3138', 0.05, 0.85),
    ink: std(BRAND.ink, 0.05, 0.8),
    brandBlue: std('#1F6FD6', 0.05, 0.7),
    brandBlueDark: std(BRAND.blue, 0.05, 0.7),
    brandRed: std(BRAND.red, 0.05, 0.7),
    brandGreen: std(BRAND.green, 0.05, 0.75),
    markingWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }),
    markingYellow: new THREE.MeshStandardMaterial({ color: hexToInt(BRAND.markingYellow), roughness: 0.95, metalness: 0 }),
    hedge: std('#6CC07A', 0, 0.95),
    leaf: std('#5BB46A', 0, 0.95),
    trunk: std('#8C6A4F', 0, 0.9),
    ground: std('#E9EEF3', 0, 1),
    plot: std('#F3F6F9', 0, 1),
    zoneBay: std('#E8EDF2', 0, 1),
    zoneApproach: std('#E1E7ED', 0, 1),
    zoneWaiting: std('#DDE9F6', 0, 1),
    brakeLight: std('#E31E2D', 0.1, 0.4, { emissive: 0xe31e2d, emissiveIntensity: 1.6 }),
    reverseLight: std('#FFFFFF', 0.1, 0.4, { emissive: 0xffffff, emissiveIntensity: 1.2 }),
    pin: new THREE.MeshStandardMaterial({ color: 0x1f6fd6, roughness: 0.5, metalness: 0, emissive: 0x0a3f8a, emissiveIntensity: 0.25 }),
    pinWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    contactShadow: null,
  };
}

// Cache geometri dengan kunci dimensi.
const geometries = new Map();
export function boxGeo(w, h, d, r = 0.08) {
  const k = `b${w},${h},${d},${r}`;
  if (!geometries.has(k)) {
    geometries.set(k, r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d));
  }
  return geometries.get(k);
}
export function cylGeo(r, h, r2 = r, segments = 24) {
  const k = `c${r},${r2},${h},${segments}`;
  if (!geometries.has(k)) geometries.set(k, new THREE.CylinderGeometry(r, r2, h, segments));
  return geometries.get(k);
}
export function sphereGeo(r) {
  const k = `s${r}`;
  if (!geometries.has(k)) geometries.set(k, new THREE.SphereGeometry(r, 12, 8));
  return geometries.get(k);
}
export function disposeGeometryCache() {
  for (const g of geometries.values()) g.dispose();
  geometries.clear();
}

export function box(parent, w, h, d, x, y, z, m, r = 0.08, shadows = true) {
  const o = new THREE.Mesh(boxGeo(w, h, d, r), m);
  o.position.set(x, y, z);
  o.castShadow = shadows;
  o.receiveShadow = shadows;
  parent.add(o);
  return o;
}
export function cyl(parent, r, h, x, y, z, m, r2 = r, segments = 24, shadows = true) {
  const o = new THREE.Mesh(cylGeo(r, h, r2, segments), m);
  o.position.set(x, y, z);
  o.castShadow = shadows;
  o.receiveShadow = shadows;
  parent.add(o);
  return o;
}
export function tube(parent, pts, r, m, segments = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const o = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, pts.length * 7), r, segments, false), m);
  o.castShadow = true;
  parent.add(o);
  return o;
}

// Tekstur kanvas untuk teks dan layar di dalam adegan. Dilukis setelah font siap (lihat scene.js).
export function canvasTexture(w, h, draw, renderer) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (renderer) t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return { texture: t, canvas: c, ctx, redraw: (fn) => { (fn || draw)(ctx, w, h); t.needsUpdate = true; } };
}
export const FONT = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
export function print(ctx, txt, x, y, size = 20, color = BRAND.ink, weight = 600, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(txt, x, y);
}
export function screenMaterial(texture, extra = {}) {
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, ...extra });
}
export function screen(parent, w, h, x, y, z, tex, extra) {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMaterial(tex.texture || tex, extra));
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

// Bayangan kontak radial lembut (satu tekstur bersama).
let shadowTex = null;
export function contactShadowMaterial(opacity = 0.5) {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.75)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity, toneMapped: false });
}
export function contactShadow(parent, w, d, x, y, z, opacity = 0.5) {
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), contactShadowMaterial(opacity));
  o.rotation.x = -Math.PI / 2;
  o.position.set(x, y, z);
  o.renderOrder = 1;
  parent.add(o);
  return o;
}

// Gabungkan mesh statis per material (pola Bagian B). Mesh bergerak (userData.moving) dan instanced dilewati.
export function compact(group) {
  for (const child of [...group.children]) if (child.isGroup) compact(child);
  const buckets = new Map();
  for (const child of group.children) {
    if (!child.isMesh || child.isInstancedMesh || child.userData.moving || Array.isArray(child.material)) continue;
    const key = child.material.uuid;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(child);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g.applyMatrix4(m.matrix);
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list.some((x) => x.castShadow);
    mesh.receiveShadow = list.some((x) => x.receiveShadow);
    mesh.renderOrder = list[0].renderOrder;
    mesh.position.set(0, 0, 0);
    for (const m of list) group.remove(m);
    group.add(mesh);
  }
}

// Geometri strip datar (y = 0) sepanjang titik tengah {x,z}; dipakai untuk jalan dan marka.
export function stripGeometry(points, width) {
  const half = width / 2;
  const pos = [], idx = [], uv = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[Math.min(i + 1, points.length - 1)];
    const r = points[Math.max(i - 1, 0)];
    const dx = q.x - r.x, dz = q.z - r.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    pos.push(p.x + nx * half, 0, p.z + nz * half, p.x - nx * half, 0, p.z - nz * half);
    uv.push(0, i, 1, i);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function segmentPoints(seg, ds = 1) {
  const n = Math.max(1, Math.ceil(seg.length / ds));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const p = seg.poseAt((seg.length * i) / n);
    pts.push({ x: p.x, z: p.z });
  }
  return pts;
}
export function polygonGeometry(poly, y = 0) {
  const pos = [], uv = [];
  for (const p of poly) {
    pos.push(p.x, y, p.z);
    uv.push(0, 0);
  }
  const idx = [];
  for (let i = 1; i < poly.length - 1; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function rectOutline(x0, z0, x1, z1, lineWidth = 0.15) {
  return stripGeometry([{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 }], lineWidth);
}
export function mergeFlat(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(geos, false);
}
