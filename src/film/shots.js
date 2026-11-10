// Garis waktu halaman video sebagai data: tiap "shot" punya durasi, jenis (foto atau adegan 3D), gerak kamera dari
// → ke, keadaan adegan (atap, sorotan, peta, truk), dan label yang menempel pada objek. Teks ada di content.js dengan
// kunci yang sama (id). Posisi kamera dihitung dari waktu, jadi video bisa digeser maju-mundur.
import { lonLat, MAP, TRUCK } from '../presentation/world.js';

export const FADE = 0.8; // detik: foto melebur masuk/keluar
export const DIP = 0.4; // detik: gelap sesaat di antara dua adegan 3D
export const PARTS = ['itj', 'visit', 'closing'];

const C = [90, 0, 44]; // pusat terminal (plot 136 × 100 m, tangki di timur)
const ll = (lon, lat) => lonLat(lon, lat).toArray();
const stage = [TRUCK.cx + 0.2, TRUCK.y + 2.0, TRUCK.cz];

// kb (Ken Burns): fokus [x%, y%] dan skala awal → akhir. pos: object-position agar wajah tidak terpotong di 16:9.
export const SHOTS = [
  // ---------- Bagian 1: mengenal ITJ Plumpang ----------
  { id: 'title', part: 0, kind: 'photo', layout: 'title', dur: 7, photo: 'bab0-gerbang-itj', pos: '50% 46%', kb: { focus: [50, 52], s: [1.16, 1.04] } },
  {
    id: 'where', part: 0, kind: '3d', dur: 8, world: 'map', ease: 'inOut',
    cam: { from: { tgt: [MAP.cx + 20, 0, MAP.cz + 30], dir: [0, 1, 0.72], dist: 1060 }, to: { tgt: ll(107.9, -6.75), dir: [0, 1, 0.72], dist: 235 } },
    labels: [['itj', (c) => c.map.pins.itj.pos, 0.55]],
  },
  {
    id: 'supply', part: 0, kind: '3d', dur: 9, world: 'map',
    cam: { from: { tgt: ll(107.75, -6.6), dir: [0, 1, 0.72], dist: 150 }, to: { tgt: ll(107.55, -6.72), dir: [0.12, 1, 0.8], dist: 118 } },
    labels: [
      ['itj', (c) => c.map.pins.itj.pos],
      ['balongan', (c) => c.map.pins.balongan.pos],
      ['pipeline', (c) => c.map.pins.pipeline.pos],
      ['bandung', (c) => c.map.pins.serviceArea.bandung],
      ['garut', (c) => c.map.pins.serviceArea.garut],
    ],
  },
  {
    id: 'aerial', part: 0, kind: '3d', dur: 9,
    cam: { from: { tgt: C, dir: [-0.75, 1.35, 0.75], dist: 900 }, to: { tgt: [96, 0, 40], dir: [-0.42, 1.15, 0.98], dist: 650 } },
  },
  {
    id: 'storage', part: 0, kind: '3d', dur: 9, highlight: ['tanks', 'pipeline'],
    cam: { from: { tgt: [200, 8, 130], dir: [-1, 0.62, 0.5], dist: 300 }, to: { tgt: [204, 8, -10], dir: [-1, 0.55, 0.28], dist: 250 } },
    labels: [['tanks', () => [201, 22, 76]], ['pipe', (c) => c.hl.anchors.pipeline]],
  },
  {
    id: 'gate', part: 0, kind: '3d', dur: 8,
    cam: { from: { tgt: [2, 2, 62], dir: [-0.95, 0.5, 1], dist: 128 }, to: { tgt: [34, 2, 72], dir: [-0.7, 0.55, 1], dist: 104 } },
    labels: [['gateIn', () => [0, 9, 74]], ['gateOut', () => [0, 9, 44]], ['waiting', () => [60, 5, 80]]],
  },
  {
    id: 'bays', part: 0, kind: '3d', dur: 9, mode: 'roofsOff',
    cam: { from: { tgt: [58, 2, 26], dir: [-0.5, 1.05, 0.8], dist: 200 }, to: { tgt: [62, 2, 20], dir: [0.18, 0.95, 0.85], dist: 150 } },
    labels: [['bays', () => [60, 9, 6]]],
  },
  {
    id: 'bayClose', part: 0, kind: '3d', dur: 7,
    cam: { from: { tgt: [26, 3, 18], dir: [-0.25, 0.3, 1], dist: 64 }, to: { tgt: [84, 3, 18], dir: [0.22, 0.26, 1], dist: 58 } },
  },
  {
    id: 'truck', part: 0, kind: '3d', dur: 8, world: 'truck', xrayFrom: 0.38,
    cam: { from: { tgt: stage, dir: [0.9, 0.26, -1], dist: 36 }, to: { tgt: stage, dir: [0.12, 0.34, -1], dist: 30 } },
  },
  {
    id: 'trip', part: 0, kind: '3d', dur: 10, trip: [0.04, 1], follow: 'trip',
    cam: { from: { dir: [-1, 0.8, 0.9], dist: 96 }, to: { dir: [-0.5, 0.3, 1], dist: 54 } },
  },

  // ---------- Bagian 2: kunjungan kami ----------
  { id: 'visit', part: 1, kind: 'photo', layout: 'section', dur: 4.5, photo: 'bab0-pembukaan', pos: '50% 30%', kb: { focus: [50, 40], s: [1.04, 1.12] } },
  { id: 'v.opening', part: 1, kind: 'photo', dur: 5.5, photo: 'bab0-pembukaan', pos: '50% 30%', kb: { focus: [45, 45], s: [1.12, 1.2] } },
  { id: 'v.briefing', part: 1, kind: 'photo', dur: 5.5, photo: 'bab0-briefing', pos: '50% 55%', kb: { focus: [70, 45], s: [1.14, 1.04] } },
  { id: 'v.health', part: 1, kind: 'photo', dur: 5.5, photo: 'bab2-cek-kesehatan', pos: '50% 100%', kb: { focus: [50, 85], s: [1.0, 1.08] } }, // manset tensimeter ada di tepi bawah foto
  { id: 'v.induction', part: 1, kind: 'photo', dur: 5.5, photo: 'bab2-safety-induction', pos: '50% 35%', kb: { focus: [25, 40], s: [1.14, 1.04] } },
  { id: 'v.ppe', part: 1, kind: 'photo', dur: 5.5, photo: 'bab2-peserta-apd', pos: '50% 40%', kb: { focus: [50, 50], s: [1.04, 1.14] } },
  { id: 'v.field', part: 1, kind: 'photo', dur: 5.5, photo: 'bab2-briefing-lapangan', pos: '50% 35%', kb: { focus: [62, 30], s: [1.16, 1.05] } },
  { id: 'v.walk', part: 1, kind: 'photo', dur: 5.5, photo: 'bab2-area-terminal', pos: '50% 55%', kb: { focus: [45, 55], s: [1.04, 1.14] } },
  { id: 'v.discussion', part: 1, kind: 'photo', dur: 5.5, photo: 'bab2-diskusi-kantor', pos: '50% 50%', kb: { focus: [50, 45], s: [1.13, 1.04] } },
  { id: 'v.presentation', part: 1, kind: 'photo', dur: 5.5, photo: 'bab5-presentasi-tradeoff', pos: '50% 45%', kb: { focus: [48, 60], s: [1.04, 1.13] } },
  { id: 'v.closing', part: 1, kind: 'photo', dur: 5.5, photo: 'bab6-diskusi-manajemen', pos: '50% 45%', kb: { focus: [60, 50], s: [1.13, 1.04] } },

  // ---------- Bagian 3: penutup ----------
  { id: 'thanks', part: 2, kind: 'photo', dur: 7, photo: 'bab0-gerbang-itj', pos: '50% 46%', kb: { focus: [50, 55], s: [1.05, 1.18] } },
  {
    id: 'end', part: 2, kind: '3d', layout: 'end', dur: 9,
    cam: { from: { tgt: C, dir: [-0.25, 0.7, 1], dist: 560 }, to: { tgt: C, dir: [-0.62, 1.0, 0.92], dist: 940 } },
  },
];

let acc = 0;
for (const s of SHOTS) {
  s.start = acc;
  acc += s.dur;
}
export const TOTAL = acc;
export const VISIT_STEPS = SHOTS.filter((s) => s.id.startsWith('v.')).map((s) => s.id);

// Shot yang aktif pada waktu t, waktu lokalnya, dan kemajuan 0..1.
export function locate(t) {
  const time = Math.min(Math.max(0, t), TOTAL - 1e-4);
  let i = SHOTS.findIndex((s) => time < s.start + s.dur);
  if (i < 0) i = SHOTS.length - 1;
  const shot = SHOTS[i], local = time - shot.start;
  return { i, shot, local, p: local / shot.dur };
}
// Saat label ke-n pada sebuah shot muncul (detik sejak shot dimulai); dipakai tampilan dan denting suaranya.
export const labelDelay = (n, delay) => delay ?? 0.9 + n * 0.35;
export function partStart(part) {
  return SHOTS.find((s) => s.part === part).start;
}
export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
