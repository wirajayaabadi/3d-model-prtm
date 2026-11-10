// Koordinat dunia presentasi (1 unit = 1 m di terminal). Terminal simulasi tetap di plot (0..136, 0..100);
// dunia lain diletakkan di sebelah barat: SPBU, diorama grup, lalu peta Indonesia stilistik.
import * as THREE from 'three';

export const MAP = { cx: -1250, cz: 40, scale: 15, lon0: 118, lat0: -2.5 }; // 15 unit per derajat
export const HOLDING = { cx: -420, cz: 50, w: 170, d: 120 };
export const SPBU = { cx: -262, cz: 40 };
export const BMC = { cx: 150, cy: 33, cz: -30 };
export const TRUCK = { cx: 1350, y: -0.1, cz: 60 }; // panggung bab Truk: tanah kosong jauh di timur terminal; kamera memandang ke selatan

export const ISO = new THREE.Vector3(-1, 1.05, 1).normalize(); // arah kamera isometrik simulasi (barat daya)
export const MAP_DIR = new THREE.Vector3(0, 1.0, 0.72).normalize(); // peta: dari selatan, utara di atas layar
export const SKY_DIR = new THREE.Vector3(-0.75, 1.35, 0.75).normalize();

export function lonLat(lon, lat, y = 0) {
  return new THREE.Vector3(MAP.cx + (lon - MAP.lon0) * MAP.scale, y, MAP.cz - (lat - MAP.lat0) * MAP.scale);
}

export function terminalCenter(layout) {
  return new THREE.Vector3(layout.plot.width / 2 + 22, 0, layout.plot.length / 2 - 6);
}

// Titik acuan geografis yang dipakai peta, rantai nilai dan kartu (lon, lat).
export const GEO = {
  refineries: {
    dumai: [101.45, 1.68],
    plaju: [104.78, -2.98],
    cilacap: [109.0, -7.72],
    balikpapan: [116.83, -1.27],
    balongan: [108.38, -6.37],
    kasim: [131.0, -1.3],
  },
  fields: {
    rokan: [101.3, 1.0],
    cepu: [111.6, -7.15],
    mahakam: [117.3, -0.4],
  },
  itj: [106.9, -6.13],
  singapore: [103.82, 1.3],
  melaka: [102.25, 2.2],
  terminals: [
    [98.7, 3.8], [100.4, -0.95], [104.75, -2.99], [105.3, -5.45], [110.4, -6.95], [112.7, -7.25], [119.4, -5.15],
    [114.6, -3.3], [109.3, -0.03], [125.2, 1.45], [128.2, -3.7], [131.25, -0.88], [140.7, -2.53], [123.6, -10.17], [115.2, -8.65],
    [117.15, 0.5], [119.85, -0.9], [122.5, -3.95], [136.1, -1.2], [106.1, -2.1],
  ],
  serviceArea: { jakarta: [106.85, -6.2], bekasi: [107.0, -6.25], tangerang: [106.63, -6.18], bogor: [106.8, -6.6], bandung: [107.6, -6.9], garut: [107.9, -7.22] },
};
