// Pipeline offline: GLB referensi tim (docs/truk/*.glb, 200–400 ribu segitiga, 600–900 node per truk) → satu mesh
// berwarna vertex per model (±40 ribu segitiga, meshopt), logo/wordmark dan detail sub-5 cm dibuang, diorientasikan ke
// kerangka engine (maju = +X, tanah y = 0, pusat badan di x = centerOffset). Jalankan: npm run bake:trucks [targetTris].
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, weld, simplify, dedup, prune, getBounds, transformPrimitive, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { mat4 } from 'gl-matrix';
import fs from 'node:fs';

await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const SRC = new URL('../docs/truk/', import.meta.url).pathname;
const OUT = new URL('../src/render/assets/models/', import.meta.url).pathname;
const STRIP = /^(Brand symbol|Tank brand|Front emblem)/; // logo/wordmark tidak direproduksi di aplikasi
const TINY = /^(Wheel bolt|Rim vent|Hatch handle|Door seam|Door handle|Windshield wiper|Rear red reflector|Valve handle|Valve cap)/; // detail sub-5 cm: tak terlihat pada skala simulasi
const ENV = { length: 12.0, width: 2.5, centerOffset: 1.5 };
const TARGET_TRIS = +(process.argv[2] || 22000);

for (const [file, out] of [['truk_1_tangki_gandeng', 'gandeng'], ['truk_2_empat_kompartemen', 'kompartemen'], ['truk_3_tangki_rigid', 'rigid']]) {
  const doc = await io.read(SRC + file + '.glb');
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  // 1. Orientasi dari node bernama sebelum diratakan
  const cab = root.listNodes().find((n) => n.getName().startsWith('Cab lower body'));
  const all = getBounds(scene);
  const cabB = getBounds(cab);
  const centerX = (all.min[0] + all.max[0]) / 2, cabX = (cabB.min[0] + cabB.max[0]) / 2;
  const forward = cabX > centerX ? 1 : -1;
  const tank = root.listNodes().find((n) => /^Tank main shell/.test(n.getName())) || root.listNodes().find((n) => /^Compartment volume/.test(n.getName()));
  const tankB = tank ? getBounds(tank) : all;
  const tankNodes = root.listNodes().filter((n) => /^(Tank main shell|Compartment \d|Tank dished end|Tank end plate)/.test(n.getName()));
  let tMin = [1e9, 1e9, 1e9], tMax = [-1e9, -1e9, -1e9];
  for (const n of tankNodes) { const bb = getBounds(n); for (let i = 0; i < 3; i++) { tMin[i] = Math.min(tMin[i], bb.min[i]); tMax[i] = Math.max(tMax[i], bb.max[i]); } }
  if (!tankNodes.length) { tMin = tankB.min; tMax = tankB.max; }
  // 2. Buang logo/wordmark
  let stripped = 0;
  for (const n of root.listNodes()) if (STRIP.test(n.getName()) || TINY.test(n.getName())) { n.dispose(); stripped++; }
  // 3. Warna vertex dari baseColorFactor, lalu satu material
  const body = doc.createMaterial('TruckBody').setMetallicFactor(0.15).setRoughnessFactor(0.5);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    const c = mat ? mat.getBaseColorFactor() : [0.8, 0.8, 0.8, 1];
    const pos = prim.getAttribute('POSITION');
    const n = pos.getCount();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
    const col = doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(root.listBuffers()[0]);
    prim.setAttribute('COLOR_0', col);
    for (const k of ['TEXCOORD_0', 'TEXCOORD_1', 'TANGENT']) if (prim.getAttribute(k)) prim.setAttribute(k, null);
    prim.setMaterial(body);
  }
  await doc.transform(flatten(), join({ keepNamed: false, keepMeshes: false }), weld({ tolerance: 0.0005 }));
  // 4. Sederhanakan ke target segitiga
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  const ratio = Math.min(1, TARGET_TRIS / tris);
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.03, lockBorder: false }), dedup(), prune());
  // 5. Kerangka engine: maju +X, tanah y=0, pusat badan di x=centerOffset, skala agar muat envelope
  const b = getBounds(scene);
  const len = b.max[0] - b.min[0], wid = b.max[2] - b.min[2], hgt = b.max[1] - b.min[1];
  const scale = Math.min(ENV.length / len, 1.05); // skala dari panjang; kaca spion boleh sedikit melebihi lebar envelope
  const m = mat4.create();
  mat4.scale(m, m, [scale, scale, scale]);
  if (forward < 0) mat4.rotateY(m, m, Math.PI);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  // setelah rotasi (bila perlu) pusat x tetap pada -cx*forward; geser ke centerOffset/scale
  const pre = mat4.create();
  mat4.fromTranslation(pre, [-cx, -b.min[1], -cz]);
  const full = mat4.create();
  mat4.multiply(full, m, pre);
  const post = mat4.create();
  mat4.fromTranslation(post, [ENV.centerOffset, 0, 0]);
  mat4.multiply(full, post, full);
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) transformPrimitive(p, full);
  for (const n of root.listNodes()) n.setMatrix(mat4.create());
  // Koreksi kedua dari pengukuran sesungguhnya: dasar ban tepat di y = 0, badan terpusat di x = centerOffset
  const fb0 = getBounds(scene);
  const fix = mat4.create();
  mat4.fromTranslation(fix, [ENV.centerOffset - (fb0.min[0] + fb0.max[0]) / 2, -fb0.min[1], -(fb0.min[2] + fb0.max[2]) / 2]);
  for (const mesh of root.listMeshes()) for (const pr of mesh.listPrimitives()) transformPrimitive(pr, fix);
  const fb = getBounds(scene);
  let outTris = 0;
  for (const mm of root.listMeshes()) for (const p of mm.listPrimitives()) outTris += (p.getIndices()?.getCount() ?? 0) / 3;
  const dy = -fb0.min[1], dx = ENV.centerOffset - (fb0.min[0] + fb0.max[0]) / 2;
  const tankCenterX = forward * ((tMin[0] + tMax[0]) / 2 - cx) * scale + ENV.centerOffset + dx;
  root.getAsset().extras = { front: +fb.max[0].toFixed(3), rear: +(-fb.min[0]).toFixed(3), halfWidth: +Math.max(-fb.min[2], fb.max[2]).toFixed(3), height: +fb.max[1].toFixed(3), tank: { x0: +((forward > 0 ? (tMin[0] - cx) * scale : -(tMax[0] - cx) * scale) + ENV.centerOffset + dx).toFixed(3), x1: +((forward > 0 ? (tMax[0] - cx) * scale : -(tMin[0] - cx) * scale) + ENV.centerOffset + dx).toFixed(3), cx: +tankCenterX.toFixed(3), y: +(((tMin[1] + tMax[1]) / 2 - b.min[1]) * scale).toFixed(3), top: +((tMax[1] - b.min[1]) * scale).toFixed(3), halfWidth: +(((tMax[2] - tMin[2]) / 2) * scale).toFixed(3) }, source: file, scale: +scale.toFixed(3) };
  root.getAsset().generator = 'ITJ sim truck bake';
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(OUT + out + '.glb', doc);
  const size = fs.statSync(OUT + out + '.glb').size;
  console.log(out, { forward, stripped, srcTris: Math.round(tris), outTris: Math.round(outTris), ratio: +ratio.toFixed(3), len: +len.toFixed(2), wid: +wid.toFixed(2), hgt: +hgt.toFixed(2), scale: +scale.toFixed(3), extras: root.getAsset().extras, kb: Math.round(size / 1024) });
}
