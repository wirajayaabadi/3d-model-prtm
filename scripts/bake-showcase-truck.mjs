// Pipeline offline untuk bab "Truk" di presentasi: docs/truk/truk_2_empat_kompartemen.glb → dua berkas kecil.
//   truck-showcase-body.glb  : sasis, kabin, manhole, katup, tangga, pagar (tanpa cangkang tangki dan tanpa roda)
//   truck-showcase-wheel.glb : satu roda di posisi aslinya; pusatnya ada di extras.wheel (digeser ke titik asal,
//                              digandakan dan diputar saat runtime)
// Cangkang tangki, kompartemen dan dinding sekat sengaja dibuang: ketiganya digambar ulang secara prosedural di
// src/presentation/scenes/truckShow.js agar bisa tembus pandang, diisi cairan dan dilepas sekatnya.
// Logo, wordmark dan teks produk pada model tidak dibawa. Kerangka sumber dipertahankan (maju = +X, tanah y = 0).
// Jalankan: npm run bake:showcase [targetTrisBadan]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, weld, simplify, dedup, prune, getBounds, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';

await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const SRC = new URL('../docs/truk/truk_2_empat_kompartemen.glb', import.meta.url).pathname;
const OUT = new URL('../src/presentation/assets/', import.meta.url).pathname;
const BODY_TRIS = +(process.argv[2] || 60000);
const WHEEL_TRIS = 1800;

const STRIP = /^(Brand symbol|Tank brand|Front emblem|Cab operator|Product label|Compartment volume)/; // logo, wordmark, teks produk
const TANK = /^(Compartment \d|Internal dividing bulkhead|Tank end plate|Cutaway )/; // digambar ulang saat runtime
const WHEEL = /^(Tread ring|Tire|Sidewall|Alloy wheel|Rim vent|Wheel inset|Wheel bolt|Hub)/;
const PARTS = ['Manhole cover', 'Discharge valve', 'Discharge pipe', 'Flammable diamond', 'Ladder', 'Top walkway', 'Top handrail', 'Cab upper body', 'Cab lower body', 'Fifth wheel', 'Trailer landing leg', 'Equipment locker', 'Amber beacon', 'Tank saddle'];

const r3 = (v) => +v.toFixed(3);
const centre = (b) => [0, 1, 2].map((i) => r3((b.min[i] + b.max[i]) / 2));
function union(nodes) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const n of nodes) {
    const b = getBounds(n);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], b.min[i]); max[i] = Math.max(max[i], b.max[i]); }
  }
  return { min: min.map(r3), max: max.map(r3) };
}

// Warna vertex dari baseColorFactor, satu material, satu mesh, lalu sederhanakan.
async function bakeMesh(doc, targetTris, error) {
  const root = doc.getRoot();
  const body = doc.createMaterial('Baked').setMetallicFactor(0.15).setRoughnessFactor(0.5);
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    const c = mat ? mat.getBaseColorFactor() : [0.8, 0.8, 0.8, 1];
    const n = prim.getAttribute('POSITION').getCount();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(root.listBuffers()[0]));
    for (const k of ['TEXCOORD_0', 'TEXCOORD_1', 'TANGENT']) if (prim.getAttribute(k)) prim.setAttribute(k, null);
    prim.setMaterial(body);
  }
  await doc.transform(flatten(), join({ keepNamed: false, keepMeshes: false }), weld({ tolerance: 0.0005 }));
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, targetTris / tris), error, lockBorder: false }), dedup(), prune());
  let out = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) out += (p.getIndices()?.getCount() ?? 0) / 3;
  return { src: Math.round(tris), out: Math.round(out) };
}

fs.mkdirSync(OUT, { recursive: true });

// ---------- Ukuran dan titik acuan dari node bernama ----------
const probe = await io.read(SRC);
const named = (re) => probe.getRoot().listNodes().filter((n) => n.getMesh() && re.test(n.getName()));
const comps = named(/^Compartment \d/).map((n) => ({ name: n.getName(), b: getBounds(n) })).sort((a, b) => a.b.min[0] - b.b.min[0]);
const ends = union(named(/^Tank end plate/));
const c0 = comps[0].b;
const tank = { x0: ends.min[0], x1: ends.max[0], y: r3((c0.min[1] + c0.max[1]) / 2), ry: r3((c0.max[1] - c0.min[1]) / 2), rz: r3((ends.max[2] - ends.min[2]) / 2) };
const compartments = comps.map((c) => ({ x0: r3(c.b.min[0]), x1: r3(c.b.max[0]) })); // urut dari belakang ke depan
const bulkheads = named(/^Internal dividing bulkhead/).map((n) => centre(getBounds(n))[0]).sort((a, b) => a - b);
const tires = named(/^Tire/).map((n) => getBounds(n));
const wheels = tires.map((b) => centre(b)).sort((a, b) => b[0] - a[0] || b[2] - a[2]);
const wheelRadius = r3((tires[0].max[1] - tires[0].min[1]) / 2);
const parts = {};
for (const p of PARTS) {
  const list = named(new RegExp('^' + p));
  if (!list.length) continue;
  parts[p] = { ...union(list), items: list.map((n) => centre(getBounds(n))).sort((a, b) => a[0] - b[0]) };
}
const all = getBounds(probe.getRoot().listScenes()[0]);
const extras = { source: 'truk_2_empat_kompartemen', bounds: { min: all.min.map(r3), max: all.max.map(r3) }, tank, compartments, bulkheads, wheels, wheelRadius, parts };

// ---------- Badan ----------
{
  const doc = await io.read(SRC);
  let removed = 0;
  for (const n of doc.getRoot().listNodes()) if (STRIP.test(n.getName()) || TANK.test(n.getName()) || WHEEL.test(n.getName())) { n.dispose(); removed++; }
  const t = await bakeMesh(doc, BODY_TRIS, 0.004);
  doc.getRoot().getAsset().extras = extras;
  doc.getRoot().getAsset().generator = 'ITJ showcase truck bake';
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(OUT + 'truck-showcase-body.glb', doc);
  console.log('body', { removed, ...t, kb: Math.round(fs.statSync(OUT + 'truck-showcase-body.glb').size / 1024) });
}

// ---------- Satu roda (roda depan kanan) ----------
{
  const doc = await io.read(SRC);
  const w = wheels[0];
  for (const n of doc.getRoot().listNodes()) {
    if (!n.getMesh()) continue;
    const c = WHEEL.test(n.getName()) ? centre(getBounds(n)) : null;
    if (!c || Math.abs(c[0] - w[0]) > 0.7 || Math.abs(c[2] - w[2]) > 0.5) n.dispose();
  }
  const t = await bakeMesh(doc, WHEEL_TRIS, 0.006);
  doc.getRoot().getAsset().extras = { source: extras.source, wheel: w, radius: wheelRadius };
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(OUT + 'truck-showcase-wheel.glb', doc);
  console.log('wheel', { ...t, kb: Math.round(fs.statSync(OUT + 'truck-showcase-wheel.glb').size / 1024) });
}
console.log(JSON.stringify(extras, null, 1));
