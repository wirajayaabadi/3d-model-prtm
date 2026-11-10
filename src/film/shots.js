// Garis waktu halaman video sebagai data. Tiap "shot" punya panjang dalam birama musik latar (potongan jatuh tepat di
// ketukan pertama birama), jenis (foto atau adegan 3D), gerak kamera dari → ke, keadaan adegan (atap, sorotan, peta,
// truk), cahaya (pagi → siang → sore → senja) dan tag yang menempel pada objek.
// Beberapa shot berurutan bisa berbagi satu teks lewat `cap`, sehingga gambar berganti cepat tetapi teks tetap terbaca.
// Teks ada di content.js. Posisi kamera dihitung dari waktu, jadi video bisa digeser maju-mundur.
import { lonLat, MAP, TRUCK } from '../presentation/world.js';

// Musik latar (src/film/assets/background-music.mp3) diukur dari rekamannya: 120 BPM, jadi satu birama 4/4 = 2 detik.
// Waktu video = waktu rekaman. Nada pembuka berbunyi sebelum ketukan pertama, yang jatuh di detik ke-1,79 (LEAD);
// frame judul sudah tampil sejak detik 0 dan birama dihitung dari LEAD.
export const BPM = 120;
export const BAR = (60 / BPM) * 4;
export const LEAD = 1.79;
// Bagian lagu, dalam birama: pembuka piano (0), drum masuk (8), bagian tenang (32), menanjak (40), drum kembali (48),
// penutup tanpa drum (64), akor terakhir (72) yang berdengung sampai video selesai. Susunan shot mengikuti batas ini.
export const MUSIC = { drums: 8, calm: 32, build: 40, drums2: 48, outro: 64, final: 72 };
export const FADE = 0.8; // detik: foto melebur masuk/keluar
export const PARTS = ['itj', 'visit', 'closing'];

const C = [90, 0, 44]; // pusat terminal (plot 136 × 100 m, tangki di timur)
const ll = (lon, lat) => lonLat(lon, lat).toArray();
const stage = [TRUCK.cx + 0.2, TRUCK.y + 2.0, TRUCK.cz];
const wheel = [TRUCK.cx + 4.6, TRUCK.y + 0.9, TRUCK.cz - 0.6];

// kb (Ken Burns): fokus [x%, y%] dan skala awal → akhir. pos: object-position agar wajah tidak terpotong.
// labels: [kunci teks, posisi dunia, jeda muncul (opsional), arah tag (opsional)]. Arah: 'l' ke kiri, 'd' ke bawah;
// dipakai agar tag yang berdekatan tidak saling menimpa.
export const SHOTS = [
  // ---------- Bagian 1: mengenal ITJ Plumpang ----------
  { id: 'title', part: 0, kind: 'photo', layout: 'title', bars: 4, photo: 'bab0-gerbang-itj', pos: '50% 46%', kb: { focus: [50, 52], s: [1.16, 1.04] } }, // frame pembuka: judul di atas foto bersama di gerbang
  {
    id: 'where', part: 0, kind: '3d', bars: 4, world: 'map', light: 'dawn', ease: 'inOut',
    cam: { from: { tgt: [MAP.cx + 20, 0, MAP.cz + 30], dir: [0, 1, 0.72], dist: 1060 }, to: { tgt: ll(107.9, -6.75), dir: [0, 1, 0.72], dist: 235 } },
    labels: [['itj', (c) => c.map.pins.itj.pos, 0.5]],
  },
  {
    id: 'supply', part: 0, kind: '3d', bars: 4, world: 'map', light: 'dawn', routes: true,
    cam: { from: { tgt: ll(107.75, -6.6), dir: [0, 1, 0.72], dist: 150 }, to: { tgt: ll(107.55, -6.72), dir: [0.12, 1, 0.8], dist: 118 } },
    labels: [
      ['itj', (c) => c.map.pins.itj.pos, undefined, 'l'],
      ['balongan', (c) => c.map.pins.balongan.pos],
      ['pipeline', (c) => c.map.pins.pipeline.pos, undefined, 'd'],
      ['bandung', (c) => c.map.pins.serviceArea.bandung, undefined, 'l d'],
      ['garut', (c) => c.map.pins.serviceArea.garut, undefined, 'd'],
    ],
  },
  {
    id: 'aerial', part: 0, kind: '3d', bars: 4, light: 'day',
    cam: { from: { tgt: C, dir: [-0.75, 1.35, 0.75], dist: 900 }, to: { tgt: [96, 0, 40], dir: [-0.42, 1.15, 0.98], dist: 650 } },
  },
  {
    id: 'storage', part: 0, kind: '3d', bars: 2, light: 'day', highlight: ['tanks', 'pipeline'],
    cam: { from: { tgt: [200, 8, 130], dir: [-1, 0.62, 0.5], dist: 300 }, to: { tgt: [203, 8, 60], dir: [-1, 0.57, 0.36], dist: 268 } },
    labels: [['tanks', () => [201, 22, 76]], ['pipe', (c) => c.hl.anchors.pipeline]],
  },
  {
    id: 'storageLow', cap: 'storage', part: 0, kind: '3d', bars: 2, light: 'day', highlight: ['pipeline'],
    cam: { from: { tgt: [200, 9, 96], dir: [-0.5, 0.16, 1], dist: 96 }, to: { tgt: [202, 9, 70], dir: [-0.25, 0.2, 1], dist: 84 } },
  },
  {
    id: 'gate', part: 0, kind: '3d', bars: 2, light: 'day',
    cam: { from: { tgt: [2, 2, 62], dir: [-0.95, 0.5, 1], dist: 128 }, to: { tgt: [26, 2, 70], dir: [-0.76, 0.54, 1], dist: 108 } },
    labels: [['gateIn', () => [0, 9, 74], undefined, 'd'], ['gateOut', () => [0, 9, 44], undefined, 'l'], ['waiting', () => [60, 5, 80]]],
  },
  {
    id: 'gateLow', cap: 'gate', part: 0, kind: '3d', bars: 2, light: 'day',
    cam: { from: { tgt: [6, 2.6, 60], dir: [-1, 0.13, 0.3], dist: 44 }, to: { tgt: [12, 2.6, 60], dir: [-1, 0.15, 0.55], dist: 40 } },
  },
  {
    id: 'bays', part: 0, kind: '3d', bars: 2, light: 'day', mode: 'roofsOff',
    cam: { from: { tgt: [58, 2, 26], dir: [-0.5, 1.05, 0.8], dist: 200 }, to: { tgt: [61, 2, 22], dir: [-0.05, 0.98, 0.84], dist: 162 } },
    labels: [['bays', () => [60, 9, 6]]],
  },
  {
    id: 'baysLow', cap: 'bays', part: 0, kind: '3d', bars: 2, light: 'day',
    cam: { from: { tgt: [40, 3, 22], dir: [-1, 0.14, 0.62], dist: 62 }, to: { tgt: [58, 3, 22], dir: [-1, 0.16, 0.8], dist: 56 } },
  },
  {
    id: 'bayClose', part: 0, kind: '3d', bars: 2, light: 'day',
    cam: { from: { tgt: [26, 3, 18], dir: [-0.25, 0.3, 1], dist: 64 }, to: { tgt: [80, 3, 18], dir: [0.2, 0.26, 1], dist: 58 } },
  },
  {
    id: 'wheel', cap: 'truck', part: 0, kind: '3d', bars: 2, world: 'truck', light: 'gold',
    cam: { from: { tgt: wheel, dir: [0.75, 0.1, -1], dist: 9 }, to: { tgt: wheel, dir: [0.35, 0.12, -1], dist: 8 } },
  },
  {
    id: 'truck', part: 0, kind: '3d', bars: 4, world: 'truck', light: 'gold', xrayFrom: 0.3,
    cam: { from: { tgt: stage, dir: [0.9, 0.26, -1], dist: 36 }, to: { tgt: stage, dir: [0.12, 0.34, -1], dist: 30 } },
  },
  {
    id: 'tripExit', cap: 'trip', part: 0, kind: '3d', bars: 2, light: 'gold', trip: [0.0, 0.14], follow: 'trip',
    cam: { from: { dir: [-1, 0.2, -0.3], dist: 40 }, to: { dir: [-1, 0.24, -0.7], dist: 46 } },
  },
  {
    id: 'tripRoad', cap: 'trip', part: 0, kind: '3d', bars: 2, light: 'gold', trip: [0.3, 0.6], follow: 'trip',
    cam: { from: { dir: [-0.9, 0.85, 1], dist: 92 }, to: { dir: [-0.7, 0.7, 1], dist: 80 } },
  },
  {
    id: 'trip', part: 0, kind: '3d', bars: 2, light: 'gold', trip: [0.72, 1], tripEase: true, follow: 'trip',
    cam: { from: { dir: [-0.8, 0.5, 1], dist: 74 }, to: { dir: [-0.5, 0.3, 1], dist: 54 } },
  },

  // ---------- Bagian 2: kunjungan kami ----------
  { id: 'visit', part: 1, kind: 'photo', layout: 'section', bars: 2, photo: 'bab0-pembukaan', pos: '50% 30%', kb: { focus: [50, 40], s: [1.04, 1.1] } },
  { id: 'v.opening', part: 1, kind: 'photo', bars: 2, photo: 'bab0-pembukaan', pos: '50% 32%', kb: { focus: [45, 45], s: [1.1, 1.18] } },
  { id: 'v.briefing', part: 1, kind: 'photo', bars: 2, photo: 'bab0-briefing', pos: '50% 55%', kb: { focus: [70, 45], s: [1.14, 1.04] } },
  { id: 'v.health', part: 1, kind: 'photo', bars: 2, photo: 'bab2-cek-kesehatan', pos: '50% 100%', kb: { focus: [50, 85], s: [1.0, 1.08] } }, // manset tensimeter ada di tepi bawah foto
  { id: 'v.induction', part: 1, kind: 'photo', bars: 2, photo: 'bab2-safety-induction', pos: '50% 35%', kb: { focus: [25, 40], s: [1.14, 1.04] } },
  { id: 'v.ppe', part: 1, kind: 'photo', bars: 2, photo: 'bab2-peserta-apd', pos: '50% 40%', kb: { focus: [50, 50], s: [1.04, 1.14] } },
  { id: 'v.field', part: 1, kind: 'photo', bars: 2, photo: 'bab2-briefing-lapangan', pos: '50% 35%', kb: { focus: [62, 30], s: [1.16, 1.05] } },
  { id: 'v.walk', part: 1, kind: 'photo', bars: 2, photo: 'bab2-area-terminal', pos: '50% 55%', kb: { focus: [45, 55], s: [1.04, 1.14] } },
  { id: 'v.discussion', part: 1, kind: 'photo', bars: 2, photo: 'bab2-diskusi-kantor', pos: '50% 50%', kb: { focus: [50, 45], s: [1.13, 1.04] } },
  { id: 'v.presentation', part: 1, kind: 'photo', bars: 2, photo: 'bab5-presentasi-tradeoff', pos: '50% 45%', kb: { focus: [48, 60], s: [1.04, 1.13] } },
  { id: 'v.closing', part: 1, kind: 'photo', bars: 2, photo: 'bab6-diskusi-manajemen', pos: '50% 45%', kb: { focus: [60, 50], s: [1.13, 1.04] } },

  // ---------- Bagian 3: penutup ----------
  { id: 'thanks', part: 2, kind: 'photo', bars: 4, photo: 'bab0-gerbang-itj', pos: '50% 46%', kb: { focus: [50, 55], s: [1.05, 1.18] } },
  {
    id: 'end', part: 2, kind: '3d', layout: 'end', bars: 6, light: 'dusk',
    cam: { from: { tgt: C, dir: [-0.25, 0.7, 1], dist: 560 }, to: { tgt: C, dir: [-0.62, 1.0, 0.92], dist: 940 } },
  },
];

let bar = 0;
for (const s of SHOTS) {
  s.bar = bar;
  s.start = bar ? LEAD + bar * BAR : 0; // shot pertama juga memuat nada pembuka sebelum birama 0
  bar += s.bars;
  s.dur = LEAD + bar * BAR - s.start;
  s.cap = s.cap || s.id;
}
export const TOTAL_BARS = bar;
export const TOTAL = LEAD + bar * BAR;
// Rentang waktu satu kelompok teks (shot berurutan dengan `cap` yang sama)
SHOTS.forEach((s, i) => {
  let a = i, b = i;
  while (a > 0 && SHOTS[a - 1].cap === s.cap) a--;
  while (b < SHOTS.length - 1 && SHOTS[b + 1].cap === s.cap) b++;
  s.capStart = SHOTS[a].start;
  s.capEnd = SHOTS[b].start + SHOTS[b].dur;
});
export const VISIT_STEPS = SHOTS.filter((s) => s.id.startsWith('v.')).map((s) => s.id);

// Shot yang aktif pada waktu t, waktu lokalnya, dan kemajuan 0..1.
export function locate(t) {
  const time = Math.min(Math.max(0, t), TOTAL - 1e-4);
  let i = SHOTS.findIndex((s) => time < s.start + s.dur);
  if (i < 0) i = SHOTS.length - 1;
  const shot = SHOTS[i], local = time - shot.start;
  return { i, shot, local, p: local / shot.dur };
}
// Saat tag ke-n pada sebuah shot muncul (detik sejak shot dimulai); dipakai tampilan dan denting suaranya.
export const labelDelay = (n, delay) => delay ?? 0.8 + n * 0.3;
export function partStart(part) {
  return SHOTS.find((s) => s.part === part).start;
}
export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
