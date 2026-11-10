// Denah SPBU dan lintasan truk di dalamnya, tanpa Three.js agar bisa diuji (tests/presentation.test.js).
// Koordinat lokal dalam meter: lx ke timur, lz ke selatan, dihitung dari SPBU.cx / SPBU.cz.
// Jalan satu arah dua lajur melintas di selatan pelataran; truk datang dari timur.
export const PLAN = {
  slab: { x0: -32, x1: 29, z0: -28, z1: 1 }, // pelataran
  entry: { x0: 9, x1: 28 }, // bukaan MASUK (timur); lebar karena moncong truk 12 m menyapu lebih dulu
  exit: { x0: -31, x1: -21 }, // bukaan KELUAR (barat)
  hedge: { x0: -19.8, x1: 6.6, z: -0.2, halfDepth: 0.75 }, // pagar semak di antara dua bukaan
  laneZ: -4.1, // lajur depan, sejajar jalan: jalur truk di dalam SPBU
  bay: { x0: -20, x1: -6, z0: -5.95, z1: -2.25 }, // area bongkar
  canopy: { cx: 6, cz: -14.25, w: 18, d: 12.5 },
  islands: [-11.2, -17.3], // lz tiap pulau pompa
  island: { x0: -1, x1: 13, halfWidth: 0.75 },
  pumps: [3.2, 8.8], // lx dispenser pada tiap pulau
  shop: { cx: -19.5, cz: -22.5, w: 10, d: 8 },
  pylon: { x: 7.9, z: -0.2 },
  stopX: -11.2, // titik acuan truk saat berhenti
  curve: { from: 31, to: 4 }, // lx awal dan akhir belokan masuk
};
// Badan truk terhadap titik acuannya (diukur dari model): 7,9 m ke depan, 4,4 m ke belakang, setengah lebar 1,25 m.
export const TRUCK_BODY = { front: 7.9, rear: 4.4, halfWidth: 1.25 };
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Lintasan truk: lz sebagai fungsi lx. `roadZ` = lz garis tengah jalan, `startX` = lx gerbang keluar terminal.
// Setelah gerbang truk pindah ke lajur kanan (sisi SPBU), lalu membelok landai lewat bukaan MASUK ke lajur depan
// dan berhenti di area bongkar. Truk tidak pernah melewati pulau pompa.
export function tripLateral(lx, roadZ, startX) {
  const lane = roadZ - 1.5;
  if (lx > PLAN.curve.from) return roadZ + (lane - roadZ) * smooth((startX - 26 - lx) / 40);
  return lane + (PLAN.laneZ - lane) * smooth((PLAN.curve.from - lx) / (PLAN.curve.from - PLAN.curve.to));
}
