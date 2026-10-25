// Model truk tangki kaku yang disederhanakan. Nilai ini adalah asumsi prototipe, bukan dimensi tersertifikasi.
// Semua panjang dalam meter, kecepatan dalam m/s (dikonversi dari km/h), waktu dalam detik.
export const DEFAULT_VEHICLE = {
  length: 12.0,
  width: 2.5,
  height: 3.5,
  frontOverhang: 1.5, // bumper depan ke sumbu depan
  wheelbase: 6.0,
  rearOverhang: 4.5, // referensi sumbu belakang ke bumper belakang
  turningRadius: 8.0, // radius putar minimum pada sumbu belakang
  accel: 0.5, // m/s^2
  decel: 1.0, // m/s^2
  stationaryGap: 3.0, // jarak minimum bumper ke bumper saat berhenti
  headwaySeconds: 2.0, // tambahan waktu antara saat bergerak
  clearance: 0.5, // margin dari hambatan tetap
  lateralGap: 2.0, // jarak lateral antar truk parkir
};

export const KMH = 1 / 3.6;

// Batas kecepatan per segmen (km/h). Dikonversi ke m/s oleh speedLimitsMs().
export const DEFAULT_SPEED_LIMITS_KMH = {
  entranceConnector: 10,
  waitingAisle: 5, // lajur area tunggu dan manuver stall
  departureConnector: 10,
  uTurn: 5,
  approach: 5,
  bayManeuver: 3, // masuk bay dan mundur keluar bay
  exitRoad: 5,
  reversing: 3, // setiap gerakan mundur
};

export function speedLimitsMs(kmh = DEFAULT_SPEED_LIMITS_KMH) {
  const out = {};
  for (const k of Object.keys(kmh)) out[k] = kmh[k] * KMH;
  return out;
}

// Posisi geometri turunan dari sumbu belakang (titik referensi pose kendaraan).
export function vehicleExtents(v = DEFAULT_VEHICLE) {
  return {
    front: v.wheelbase + v.frontOverhang, // sumbu belakang -> bumper depan
    rear: v.rearOverhang, // sumbu belakang -> bumper belakang
    halfWidth: v.width / 2,
    centerOffset: (v.wheelbase + v.frontOverhang - v.rearOverhang) / 2, // sumbu belakang -> titik tengah badan
  };
}
