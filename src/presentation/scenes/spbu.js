// SPBU kecil di ujung jalan keluar terminal (ujung rantai nilai), jalan penghubung, dan truk "perjalanan"
// untuk bab 6: keluar gerbang, menyusuri jalan, berhenti di pompa. Tanpa logo atau wordmark; identitas lewat warna.
import * as THREE from 'three';
import { box, cyl, compact, contactShadow, stripGeometry } from '../../render/materials.js';
import { createTruck, setTruckLights, WheelPool } from '../../render/assets/truck.js';
import { getTruckModel, onTruckModelsReady } from '../../render/assets/truckModels.js';
import { BRAND } from '../../ui/theme.js';
import { SPBU } from '../world.js';

export function buildSpbu({ M, renderer, layout, config, scene }) {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const C = new THREE.Vector3(SPBU.cx, 0, SPBU.cz);
  const exitZ = config.facility.gates.exit.z;
  // Jalan dari ujung runoff gerbang keluar ke SPBU, lalu cabang masuk ke pelataran
  const roadPts = [{ x: -config.facility.roads.exitRunoffLength + 2, z: exitZ }, { x: C.x + 26, z: exitZ }];
  const road = new THREE.Mesh(stripGeometry(roadPts, config.facility.roads.width), M.asphalt);
  road.position.y = 0.09;
  road.receiveShadow = true;
  statics.add(road);
  const edge = (side) => new THREE.Mesh(stripGeometry(roadPts.map((p) => ({ x: p.x, z: p.z + side * (config.facility.roads.width / 2 - 0.15) })), 0.16), M.markingWhite);
  for (const s of [-1, 1]) {
    const e = edge(s);
    e.position.y = 0.13;
    e.renderOrder = 2;
    statics.add(e);
  }
  const branch = new THREE.Mesh(stripGeometry([{ x: C.x + 24, z: exitZ }, { x: C.x + 12, z: C.z + 2 }, { x: C.x - 6, z: C.z - 4 }], 6), M.asphaltLight);
  branch.position.y = 0.08;
  statics.add(branch);
  // Pelataran, kanopi, pulau pompa, toko, pylon
  box(statics, 36, 0.3, 26, C.x, 0.15, C.z - 4, M.concreteLight, 0.05, false).receiveShadow = true;
  box(statics, 24, 0.5, 12, C.x - 2, 6.6, C.z - 6, M.whiteSteel, 0.1);
  box(statics, 24.4, 0.9, 0.35, C.x - 2, 6.05, C.z, M.brandBlue, 0.05);
  box(statics, 24.4, 0.12, 0.36, C.x - 2, 5.55, C.z + 0.01, M.brandRed, 0.02);
  box(statics, 24.4, 0.12, 0.36, C.x - 2, 5.4, C.z + 0.02, M.brandGreen, 0.02);
  for (const x of [-10, 0, 10]) for (const z of [-10, -2]) cyl(statics, 0.3, 6.4, C.x - 2 + x, 3.2, C.z + z, M.whiteSteel, 0.3, 10);
  for (const x of [-7, 1, 9]) {
    box(statics, 1.2, 0.25, 5, C.x - 2 + x, 0.42, C.z - 6, M.concrete, 0.03);
    box(statics, 0.9, 1.9, 1.1, C.x - 2 + x, 1.5, C.z - 7.4, M.whiteSteel, 0.08);
    box(statics, 0.92, 0.5, 1.12, C.x - 2 + x, 2.0, C.z - 7.4, M.brandBlueDark, 0.03);
    box(statics, 0.9, 1.9, 1.1, C.x - 2 + x, 1.5, C.z - 4.6, M.whiteSteel, 0.08);
    box(statics, 0.92, 0.5, 1.12, C.x - 2 + x, 2.0, C.z - 4.6, M.brandBlueDark, 0.03);
  }
  const shop = box(statics, 14, 4, 6, C.x - 2, 2.3, C.z - 14, M.whiteSteel, 0.2);
  box(statics, 14.4, 0.6, 6.4, C.x - 2, 4.4, C.z - 14, M.brandBlueDark, 0.05);
  for (const x of [-4, 0, 4]) box(statics, 2.6, 1.8, 0.3, C.x - 2 + x, 2.2, C.z - 10.9, M.glass, 0.02, false);
  const pylon = box(statics, 1.8, 9, 0.5, C.x + 15, 4.8, C.z - 12, M.brandBlue, 0.1);
  box(statics, 1.9, 2.2, 0.55, C.x + 15, 8.0, C.z - 12, M.whiteSteel, 0.05);
  box(statics, 1.9, 0.2, 0.56, C.x + 15, 6.9, C.z - 12, M.brandRed, 0.02);
  box(statics, 1.9, 0.2, 0.56, C.x + 15, 6.6, C.z - 12, M.brandGreen, 0.02);
  contactShadow(statics, 40, 30, C.x, 0.02, C.z - 4, 0.35);
  // pohon kecil di sekitar
  for (const [dx, dz] of [[-20, -16], [-20, 6], [20, 6], [22, -18]]) {
    cyl(statics, 0.35, 2.2, C.x + dx, 1.1, C.z + dz, M.trunk, 0.35, 6);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), M.leaf);
    leaf.position.set(C.x + dx, 3.6, C.z + dz);
    leaf.castShadow = true;
    statics.add(leaf);
  }
  compact(statics);
  shop.userData.cardKey = 'spbu';
  pylon.userData.cardKey = 'spbu';

  // Truk perjalanan: dari gerbang keluar ke pompa
  const product = config.products.pertalite;
  let truck = createTruck({ id: 'trip', label: 'TT-ITJ', productColor: product.color, M, renderer, modelId: 'gandeng' });
  truck.visible = false;
  group.add(truck);
  onTruckModelsReady(() => {
    if (truck.userData.model) return;
    const was = truck.visible;
    group.remove(truck);
    truck = createTruck({ id: 'trip', label: 'TT-ITJ', productColor: product.color, M, renderer, modelId: 'gandeng' });
    truck.visible = was;
    group.add(truck);
  });
  const wheels = new WheelPool(scene, M, 1);
  wheels.mesh.visible = false;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4, 0, exitZ),
    new THREE.Vector3(-40, 0, exitZ),
    new THREE.Vector3(C.x + 40, 0, exitZ),
    new THREE.Vector3(C.x + 24, 0, exitZ),
    new THREE.Vector3(C.x + 12, 0, C.z + 1),
    new THREE.Vector3(C.x + 2, 0, C.z - 6),
    new THREE.Vector3(C.x - 6, 0, C.z - 6),
  ], false, 'catmullrom', 0.1);
  const length = path.getLength();
  const trip = { length, active: false, s: 0, done: false, speed: 7.5, pos: new THREE.Vector3(), start() { this.active = true; this.done = false; this.s = 0; truck.visible = true; wheels.mesh.visible = true; }, stop() { this.active = false; truck.visible = false; wheels.mesh.visible = false; } };
  const tangent = new THREE.Vector3();
  return {
    group,
    pickables: [shop, pylon],
    anchor: new THREE.Vector3(C.x - 2, 9, C.z - 6),
    trip,
    update(dt) {
      if (!trip.active) return;
      if (!trip.done) {
        // melambat menjelang akhir
        const remain = length - trip.s;
        const v = Math.min(trip.speed, Math.max(1.2, remain * 0.6));
        trip.s = Math.min(length, trip.s + v * dt);
        if (trip.s >= length - 0.01) trip.done = true;
      }
      const u = trip.s / length;
      path.getPointAt(u, trip.pos);
      path.getTangentAt(Math.min(0.999, u), tangent);
      truck.position.set(trip.pos.x, 0, trip.pos.z);
      truck.rotation.y = -Math.atan2(tangent.z, tangent.x);
      setTruckLights(truck, { brake: trip.done || trip.s > length - 25, reverse: false });
      wheels.update(truck.userData.model ? [] : [truck]);
    },
  };
}
