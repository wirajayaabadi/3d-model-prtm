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
    // Tank farm dua kolom mengikuti citra satelit ITJ Plumpang: blok selatan 4×2 tangki besar, blok utara 7×2,
    // dua tangki tambahan dan dua tangki kecil di ujung selatan. Tangki pertama adalah ujung pipa penerimaan.
    tankGroups: [
      { x: 172, z: 76, radius: 23, height: 16 },
      { x: 230, z: 76, radius: 23, height: 16 },
      { x: 172, z: 130, radius: 23, height: 16 },
      { x: 230, z: 130, radius: 23, height: 16 },
      { x: 172, z: 184, radius: 23, height: 16 },
      { x: 230, z: 184, radius: 23, height: 16 },
      { x: 172, z: 238, radius: 23, height: 16 },
      { x: 230, z: 238, radius: 23, height: 16 },
      { x: 172, z: -268, radius: 18, height: 14 },
      { x: 230, z: -268, radius: 18, height: 14 },
      { x: 172, z: -222, radius: 18, height: 14 },
      { x: 230, z: -222, radius: 18, height: 14 },
      { x: 172, z: -176, radius: 18, height: 14 },
      { x: 230, z: -176, radius: 18, height: 14 },
      { x: 172, z: -130, radius: 18, height: 14 },
      { x: 230, z: -130, radius: 18, height: 14 },
      { x: 172, z: -84, radius: 18, height: 14 },
      { x: 230, z: -84, radius: 18, height: 14 },
      { x: 172, z: -38, radius: 18, height: 14 },
      { x: 230, z: -38, radius: 18, height: 14 },
      { x: 172, z: 8, radius: 18, height: 14 },
      { x: 230, z: 8, radius: 18, height: 14 },
      { x: 172, z: 294, radius: 18, height: 14 },
      { x: 230, z: 294, radius: 18, height: 14 },
      { x: 222, z: 334, radius: 6, height: 9 },
      { x: 240, z: 334, radius: 6, height: 9 },
    ],
    // Tapak keliling (dekoratif, tidak dibaca engine): perkerasan, halaman armada utara, kanal barat/utara,
    // tembok keliling, gudang, area hijau, deretan pohon, dan permukiman padat di luar tembok.
    site: {
      x0: -92, z0: -300, x1: 262, z1: 352,
      yard: { x0: -4, x1: 140, z0: -292, z1: -6 },
      canal: { x0: -112, x1: -100, z0: -300, z1: 362, gaps: [[36, 52], [66, 82]] },
      gateGaps: [[38, 50], [68, 80]],
      buildings: [
        { x0: -86, x1: -64, z0: -280, z1: -96, h: 8, roof: 'blue' },
        { x0: -58, x1: -40, z0: -280, z1: -130, h: 8, roof: 'blue' },
        { x0: -34, x1: -18, z0: -250, z1: -110, h: 7, roof: 'white' },
        { x0: -86, x1: -16, z0: 118, z1: 208, h: 10, roof: 'blue' },
        { x0: 20, x1: 72, z0: 252, z1: 276, h: 7, roof: 'white' },
        { x0: 90, x1: 130, z0: 256, z1: 272, h: 5, roof: 'white' },
      ],
      parking: { x0: 12, x1: 128, z0: -262, z1: -40, pitchX: 10, pitchZ: 16 },
      greens: [
        { x0: -80, x1: 150, z0: 226, z1: 344, trees: 60 },
        { x0: -86, x1: -10, z0: -80, z1: 100, trees: 18 },
      ],
      treeRows: [
        { x0: -96, z0: -290, x1: -96, z1: 340, n: 40 },
        { x0: 150, z0: -290, x1: 150, z1: 340, n: 44 },
      ],
      housing: [
        { x0: 280, x1: 470, z0: -340, z1: 400, cell: 11 },
        { x0: -120, x1: 470, z0: 386, z1: 520, cell: 11 },
        { x0: -300, x1: -126, z0: -330, z1: 520, cell: 12, density: 0.85, avoid: [{ x0: -310, x1: -120, z0: 18, z1: 70 }, { x0: -300, x1: -220, z0: 0, z1: 80 }] },
      ],
    },
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
