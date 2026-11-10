// Model truk tangki dari referensi tim (docs/truk/*.glb), dibakar offline menjadi satu geometri berwarna vertex
// per model (±25 ribu segitiga, meshopt) dan diorientasikan ke kerangka engine: maju = +X, tanah y = 0, pusat badan
// di x = centerOffset. Dimuat sekali secara asinkron; sebelum siap, truk prosedural lama dipakai sebagai cadangan.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import gandengUrl from './models/gandeng.glb?url';

// Satu model seragam untuk seluruh armada: tangki gandeng (docs/truk/truk_1_tangki_gandeng.png).
// Dua model lain tetap dibakar dan tersedia (`kompartemen`, `rigid`) bila ingin dipakai lagi lewat PRODUCT_MODEL.
export const TRUCK_MODELS = {
  gandeng: { url: gandengUrl, name: 'Tangki gandeng' },
};
// Model lain yang tersedia di ./models/: kompartemen.glb, rigid.glb (tambahkan impor `?url` dan entri TRUCK_MODELS bila dipakai).
const PRODUCT_MODEL = {}; // kosong = semua produk memakai DEFAULT_MODEL; produk dibedakan lewat placard berwarna
const DEFAULT_MODEL = 'gandeng';

const loaded = {};
let promise = null;
const listeners = [];

// Salinan float32 dari atribut (denormalisasi); applyMatrix4 pada atribut ternormalisasi akan menjepit ke [-1, 1].
function toFloat(attr) {
  if (attr.array instanceof Float32Array && !attr.normalized) return attr;
  const n = attr.count, sz = attr.itemSize;
  const out = new Float32Array(n * sz);
  for (let i = 0; i < n; i++) for (let c = 0; c < sz; c++) out[i * sz + c] = attr.getComponent(i, c);
  return new THREE.BufferAttribute(out, sz);
}

export function modelForProduct(productId) {
  return PRODUCT_MODEL[productId] || DEFAULT_MODEL;
}
export function getTruckModel(id) {
  return loaded[id] || null;
}
export function truckModelsReady() {
  return Object.keys(loaded).length === Object.keys(TRUCK_MODELS).length;
}
export function onTruckModelsReady(fn) {
  if (truckModelsReady()) fn();
  else listeners.push(fn);
  loadTruckModels();
}

export function loadTruckModels() {
  if (promise) return promise;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  promise = Promise.all(
    Object.entries(TRUCK_MODELS).map(
      ([id, m]) =>
        new Promise((resolve) => {
          loader.load(
            m.url,
            (gltf) => {
              const geos = [];
              gltf.scene.updateMatrixWorld(true);
              gltf.scene.traverse((o) => {
                if (!o.isMesh) return;
                const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
                for (const name of Object.keys(g.attributes)) {
                  if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
                  else g.setAttribute(name, toFloat(g.getAttribute(name))); // atribut terkuantisasi (int16/int8 ternormalisasi) → float sebelum ditransformasi
                }
                g.applyMatrix4(o.matrixWorld);
                geos.push(g);
              });
              const geometry = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
              if (!geometry.attributes.normal) geometry.computeVertexNormals();
              geometry.computeBoundingBox();
              geometry.computeBoundingSphere();
              const extras = gltf.parser.json.asset?.extras || {};
              loaded[id] = { id, geometry, extras };
              resolve(loaded[id]);
            },
            undefined,
            (err) => {
              console.warn(`Model truk ${id} gagal dimuat; memakai truk prosedural.`, err);
              resolve(null);
            },
          );
        }),
    ),
  ).then((list) => {
    if (truckModelsReady()) for (const fn of listeners.splice(0)) fn();
    return list;
  });
  return promise;
}
