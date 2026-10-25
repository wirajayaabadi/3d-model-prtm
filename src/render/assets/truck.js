// Truk tangki bergaya Pertamina: tangki putih membulat, kabin brand-blue, trim chrome, roda gelap, pita warna
// produk, plat ID dari tekstur kanvas, lampu rem merah dan lampu mundur putih yang digerakkan status engine.
// Satu geometri gabungan berwarna vertex per produk (cache) + satu mesh chrome + plat: ~3 draw call per truk.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxGeo, cylGeo, canvasTexture, print, screenMaterial } from '../materials.js';
import { BRAND, hexToInt } from '../../ui/theme.js';

const bodyCache = new Map(); // productColor -> BufferGeometry
let chromeGeo = null;

function colored(geo, matrix, hex) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
  const c = new THREE.Color(hexToInt(hex));
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  return g;
}
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

function bodyGeometry(productColor) {
  if (bodyCache.has(productColor)) return bodyCache.get(productColor);
  const parts = [
    colored(boxGeo(11.4, 0.45, 2.3, 0.05), M4(1.5, 0.95, 0), BRAND.ink), // sasis
    colored(boxGeo(2.4, 2.3, 2.4, 0.18), M4(6.25, 2.35, 0), BRAND.blue), // kabin
    colored(boxGeo(2.0, 0.22, 2.2, 0.06), M4(6.2, 3.56, 0), BRAND.blue), // atap kabin
    colored(boxGeo(0.12, 1.0, 2.0, 0.03), M4(7.37, 2.65, 0), '#2F5F86'), // kaca depan
    colored(boxGeo(0.9, 0.9, 0.06, 0.02), M4(6.3, 2.5, 1.22), '#2F5F86'), // kaca samping
    colored(boxGeo(0.9, 0.9, 0.06, 0.02), M4(6.3, 2.5, -1.22), '#2F5F86'),
    colored(cylGeo(1.15, 8.4, 1.15, 24), M4(0.5, 2.3, 0, 0, 0, Math.PI / 2), '#F6F7F8'), // tangki
    colored(new THREE.SphereGeometry(1.15, 18, 12), M4(4.7, 2.3, 0), '#F6F7F8'), // ujung tangki depan
    colored(new THREE.SphereGeometry(1.15, 18, 12), M4(-3.7, 2.3, 0), '#F6F7F8'),
    colored(cylGeo(1.17, 1.1, 1.17, 24), M4(0.5, 2.3, 0, 0, 0, Math.PI / 2), productColor), // pita produk
    colored(cylGeo(0.45, 0.3, 0.45, 12), M4(0.5, 3.55, 0), '#C9CED3'), // manhole
    colored(cylGeo(0.45, 0.3, 0.45, 12), M4(-2.6, 3.55, 0), '#C9CED3'),
    colored(boxGeo(0.8, 0.5, 2.2, 0.04), M4(-3.9, 1.35, 0), BRAND.ink), // bemper belakang gelap
  ];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  bodyCache.set(productColor, merged);
  return merged;
}

function chromeGeometry() {
  if (chromeGeo) return chromeGeo;
  const parts = [
    boxGeo(0.25, 0.3, 2.5, 0.05).clone().applyMatrix4(M4(7.45, 1.05, 0)), // bemper depan
    cylGeo(0.07, 1.9, 0.07, 8).clone().applyMatrix4(M4(0.5, 3.62, 0, 0, 0, Math.PI / 2)), // rel atas
    boxGeo(0.15, 0.15, 2.5, 0.03).clone().applyMatrix4(M4(-4.45, 1.05, 0)), // bemper belakang
    cylGeo(0.2, 0.6, 0.2, 8).clone().applyMatrix4(M4(5.2, 3.9, 0.8)), // knalpot
  ].map((g) => (g.index ? g.toNonIndexed() : g));
  chromeGeo = mergeGeometries(parts, false);
  return chromeGeo;
}

let bodyMat = null, chromeMat = null;
function mats(M) {
  if (!bodyMat) bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.45 });
  if (!chromeMat) chromeMat = M.chrome;
  return { bodyMat, chromeMat };
}
const highlightMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.45, emissive: 0x2a5c8a, emissiveIntensity: 0.6 });

export function createTruck({ id, label, productColor, M, renderer }) {
  const { bodyMat, chromeMat } = mats(M);
  const g = new THREE.Group();
  g.userData = { type: 'truck', id };
  const body = new THREE.Mesh(bodyGeometry(productColor), bodyMat);
  body.castShadow = true;
  body.userData = g.userData;
  g.add(body);
  const chrome = new THREE.Mesh(chromeGeometry(), chromeMat);
  chrome.castShadow = true;
  chrome.userData = g.userData;
  g.add(chrome);
  // Plat ID (kanvas) di kedua sisi tangki dan di pintu kabin
  const plate = canvasTexture(256, 96, (c, w, h) => {
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, w, h);
    c.fillStyle = BRAND.blue;
    c.fillRect(0, 0, w, 14);
    print(c, label, w / 2, 70, 44, BRAND.ink, 700, 'center');
  }, renderer);
  const pm = screenMaterial(plate.texture);
  const pA = new THREE.PlaneGeometry(2.4, 0.9).applyMatrix4(M4(-1.6, 2.1, 1.19));
  const pB = new THREE.PlaneGeometry(2.4, 0.9).applyMatrix4(M4(-1.6, 2.1, -1.19, 0, Math.PI, 0));
  const plates = new THREE.Mesh(mergeGeometries([pA, pB], false), pm);
  plates.userData = g.userData;
  g.add(plates);
  // Lampu rem (merah) dan lampu mundur (putih): tampak hanya saat aktif.
  const brake = new THREE.Mesh(boxGeo(0.08, 0.22, 0.5, 0.02), M.brakeLight);
  brake.position.set(-4.5, 1.25, 0);
  brake.visible = false;
  const brakeR = brake.clone();
  brake.position.z = 0.85;
  brakeR.position.z = -0.85;
  const rev = new THREE.Mesh(boxGeo(0.08, 0.18, 0.3, 0.02), M.reverseLight);
  rev.position.set(-4.5, 1.0, 0.45);
  rev.visible = false;
  const revR = rev.clone();
  revR.position.z = -0.45;
  g.add(brake, brakeR, rev, revR);
  g.userData.lights = { brake: [brake, brakeR], reverse: [rev, revR] };
  g.userData.body = body;
  g.userData.plate = plate;
  return g;
}

export function setTruckLights(group, { brake, reverse }) {
  for (const m of group.userData.lights.brake) m.visible = !!brake;
  for (const m of group.userData.lights.reverse) m.visible = !!reverse;
}

export function setTruckHighlight(group, on) {
  group.userData.body.material = on ? highlightMat : bodyMat;
}

// Semua roda truk dalam satu InstancedMesh; matriks diperbarui tiap frame dari grup truk.
const WHEEL_OFFSETS = [];
for (const x of [6.0, 0.0, -1.3]) for (const z of [-1.1, 1.1]) WHEEL_OFFSETS.push([x, 0.52, z]);
export class WheelPool {
  constructor(scene, M, maxTrucks = 80) {
    this.mesh = new THREE.InstancedMesh(cylGeo(0.52, 0.4, 0.52, 14), M.rubber, maxTrucks * WHEEL_OFFSETS.length);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.tmp = new THREE.Matrix4();
    this.local = WHEEL_OFFSETS.map(([x, y, z]) => M4(x, y, z, Math.PI / 2, 0, 0));
  }
  update(groups) {
    let i = 0;
    for (const g of groups) {
      g.updateMatrixWorld();
      for (const l of this.local) {
        if (i >= this.mesh.instanceMatrix.count) break;
        this.tmp.multiplyMatrices(g.matrixWorld, l);
        this.mesh.setMatrixAt(i++, this.tmp);
      }
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.dispose();
  }
}
