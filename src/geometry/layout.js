// Menurunkan posisi zona, bay, stall, kolom dan peralatan dari konfigurasi. Tidak ada koordinat yang dikodekan keras di tempat lain.
import { vehicleExtents } from '../config/vehicles.js';

export function zoneArea(z) {
  return (z.x1 - z.x0) * (z.z1 - z.z0);
}

export function bayCenterX(facility, number) {
  return facility.bays.x0 + facility.bays.pitch / 2 + (number - 1) * facility.bays.pitch;
}

export function buildLayout(config) {
  const f = config.facility;
  const v = config.vehicle;
  const ext = vehicleExtents(v);
  const R = v.turningRadius;

  const plotArea = f.plot.width * f.plot.length;
  const zones = {};
  let allocated = 0;
  for (const [key, z] of Object.entries(f.zones)) {
    zones[key] = { ...z, width: z.x1 - z.x0, length: z.z1 - z.z0, area: zoneArea(z) };
    allocated += zones[key].area;
  }

  const bays = config.bays.map((b) => {
    const i = b.number;
    const x0 = f.bays.x0 + (i - 1) * f.bays.pitch;
    const cx = x0 + f.bays.pitch / 2;
    return {
      index: i - 1,
      number: i,
      x0,
      x1: x0 + f.bays.pitch,
      z0: f.zones.bayBlock.z0,
      z1: f.zones.bayBlock.z1,
      cx,
      serviceAxle: { x: cx, z: f.bays.serviceAxleZ },
      serviceCenter: { x: cx, z: f.bays.serviceAxleZ - ext.centerOffset },
      entryTurnCenter: { x: cx + R, z: f.roads.approachZ - R },
      reverseTurnCenter: { x: cx + R, z: f.roads.exitRoadZ - R },
      reverseStraightEndZ: f.roads.exitRoadZ - R,
      approachJoinX: cx + R, // titik di jalan pendekatan tempat truk mulai berbelok
      exitJoinX: cx + R, // titik di jalan keluar tempat truk selesai mundur
      products: [...b.products],
      active: !!b.active,
    };
  });

  // Kolom di setiap garis batas bay (count + 1 garis), dua kolom per garis.
  const columns = [];
  for (let k = 0; k <= f.bays.count; k++) {
    const x = f.bays.x0 + k * f.bays.pitch;
    for (const z of f.columns.zPositions) columns.push({ x, z, size: f.columns.size });
  }

  // Peralatan pengisian di sisi +X posisi servis setiap bay.
  const equipment = bays.map((b) => ({
    bay: b.number,
    x0: b.cx + f.equipment.offsetX,
    x1: b.cx + f.equipment.offsetX + f.equipment.width,
    z0: f.equipment.z0,
    z1: f.equipment.z1,
    height: f.equipment.height,
  }));

  // Stall: satu baris mundur-masuk / maju-keluar di sisi utara zona tunggu.
  const wz = f.zones.waiting;
  const pitch = v.width + v.lateralGap;
  const span = wz.x1 - wz.x0;
  const nStalls = Math.max(0, Math.floor(span / pitch));
  const offset = (span - nStalls * pitch) / 2;
  const stalls = [];
  for (let k = 0; k < nStalls; k++) {
    const x = wz.x0 + offset + pitch / 2 + k * pitch;
    stalls.push({
      index: k,
      number: k + 1,
      x,
      x0: x - pitch / 2,
      x1: x + pitch / 2,
      z0: f.stalls.z0,
      z1: f.stalls.z1,
      parkedAxle: { x, z: f.stalls.parkedAxleZ },
      reverseTurnCenter: { x: x + R, z: f.roads.entryLaneZ + R },
      pullOutTurnCenter: { x: x + R, z: f.roads.departureLaneZ + R },
      entryJoinX: x + R, // sumbu belakang di lajur masuk saat mulai mundur
      departureJoinX: x + R, // sumbu belakang di lajur keberangkatan saat selesai keluar
    });
  }
  const lastJoin = stalls.length ? stalls[stalls.length - 1].entryJoinX : f.roads.entryLaneEndX;
  const entryLaneEndX = Math.max(f.roads.entryLaneEndX, lastJoin);

  return {
    plot: { ...f.plot, area: plotArea },
    zones,
    allocatedArea: allocated,
    unallocatedArea: plotArea - allocated,
    gates: f.gates,
    bays,
    columns,
    equipment,
    stalls,
    stallPitch: pitch,
    entryLaneEndX,
    roads: { ...f.roads, entryLaneEndX },
    vehicleExtents: ext,
  };
}

// Jejak truk statis (poligon 4 titik) pada pose tertentu: x,z sumbu belakang; theta arah hidung (radian).
export function footprintAt(pose, vehicle) {
  const ext = vehicleExtents(vehicle);
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  const hx = c, hz = s; // arah hidung
  const nx = -s, nz = c; // arah lateral kiri
  const F = ext.front, B = ext.rear, W = ext.halfWidth;
  return [
    { x: pose.x + hx * F + nx * W, z: pose.z + hz * F + nz * W },
    { x: pose.x + hx * F - nx * W, z: pose.z + hz * F - nz * W },
    { x: pose.x - hx * B - nx * W, z: pose.z - hz * B - nz * W },
    { x: pose.x - hx * B + nx * W, z: pose.z - hz * B + nz * W },
  ];
}

export const HEADING = {
  east: 0,
  south: Math.PI / 2, // +Z
  west: Math.PI,
  north: -Math.PI / 2, // -Z
};
