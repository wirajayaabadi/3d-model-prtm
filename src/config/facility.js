// Dimensi fasilitas (lokal, 1 unit = 1 meter). X = lebar plot, Z = panjang plot, Y = elevasi.
// Semua dimensi bersifat sementara dan dapat diedit; belum berdasarkan pengukuran lapangan.
export const DEFAULT_FACILITY = {
  plot: { width: 136, length: 100 },
  zones: {
    bayBlock: { x0: 4, x1: 116, z0: 4, z1: 28 },
    approach: { x0: 4, x1: 116, z0: 28, z1: 60 },
    waiting: { x0: 20, x1: 100, z0: 68, z1: 92 },
  },
  gates: {
    entrance: { x: 0, z: 74 },
    exit: { x: 0, z: 44 },
  },
  bays: {
    count: 14,
    pitch: 8, // 8 m sudah termasuk lebar bay, tanpa celah tambahan
    x0: 4,
    serviceAxleZ: 17.5, // sumbu belakang saat servis (badan truk terpusat di Z = 16, menghadap -Z)
    clearZ: 28.5, // bay dinyatakan bersih saat bumper depan truk yang mundur mencapai Z ini
  },
  roads: {
    width: 6,
    entryLaneZ: 74,
    departureLaneZ: 68,
    approachZ: 52, // jalan distribusi pendekatan (belokan masuk bay berpusat di (cx + R, approachZ - R))
    exitRoadZ: 44, // jalan pengumpul keluar (belokan mundur keluar berpusat di (cx + R, exitRoadZ - R))
    entranceConnectorEndX: 20,
    entryLaneEndX: 110,
    departureLaneEndX: 100, // awal konektor keberangkatan
    uTurnCenter: { x: 122, z: 60 },
    approachEndX: 16,
    exitRoadStartX: 126,
    gateApproachLength: 50, // lajur konseptual di luar plot untuk antrean gerbang
    exitRunoffLength: 30, // lajur konseptual di luar plot setelah gerbang keluar
  },
  stalls: {
    z0: 80,
    z1: 92,
    depth: 12,
    parkedAxleZ: 87.5, // hidung di Z = 80; pusat putaran mundur masuk = (stall X + R, entryLaneZ + R), keluar = (stall X + R, departureLaneZ + R)
  },
  // Kolom di batas bay, di luar semua lintasan sapuan. Dua kolom per garis batas.
  columns: { size: 0.5, zPositions: [6, 26] },
  // Peralatan pengisian sederhana di sisi +X posisi servis.
  equipment: { offsetX: 2.6, width: 0.8, z0: 11, z1: 19, height: 4.5 },
  canopy: { height: 7, thickness: 0.4 },
  // Konteks dekoratif di luar plot (bukan data fasilitas).
  context: {
    tankGroups: [
      { x: 160, z: 20, radius: 11, height: 14 },
      { x: 186, z: 20, radius: 11, height: 14 },
      { x: 160, z: 50, radius: 9, height: 12 },
      { x: 186, z: 50, radius: 9, height: 12 },
      { x: 173, z: 82, radius: 13, height: 16 },
    ],
    buildings: [
      { name: 'controlRoom', x0: -24, x1: -8, z0: 50, z1: 62, height: 6 },
      { name: 'office', x0: -26, x1: -8, z0: 84, z1: 96, height: 5 },
      { name: 'workshop', x0: 40, x1: 70, z0: 104, z1: 114, height: 6 },
    ],
  },
};

// Konfigurasi produk bay awal (Bagian 5). Tiga produk adalah opsi yang dapat dimuat, bukan tiga posisi truk.
export const DEFAULT_BAY_CONFIG = [
  { number: 1, products: ['pertalite', 'pertamax', 'b50'], active: true },
  { number: 2, products: ['pertalite', 'pertamax', 'b50'], active: true },
  { number: 3, products: ['pertalite', 'pertamax', 'pertamaxTurbo'], active: true },
  { number: 4, products: ['pertalite', 'pertamax', 'pertadex'], active: true },
  { number: 5, products: ['pertamax', 'pertamaxTurbo', 'b50'], active: true },
  { number: 6, products: ['pertamax', 'pertamaxTurbo', 'pertadex'], active: true },
  { number: 7, products: ['pertalite', 'pertamax', 'pertamaxTurbo'], active: true },
  { number: 8, products: ['b50', 'pertadex', 'pertalite'], active: true },
  { number: 9, products: ['b50', 'pertadex', 'pertalite'], active: true },
  { number: 10, products: ['b50', 'pertadex', 'pertamax'], active: true },
  { number: 11, products: ['b50', 'pertalite', 'pertamax'], active: true },
  { number: 12, products: ['b50', 'pertadex', 'pertamaxTurbo'], active: true },
  { number: 13, products: ['pertalite', 'pertamax', 'pertamaxTurbo'], active: false },
  { number: 14, products: ['b50', 'pertadex', 'pertalite'], active: false },
];
