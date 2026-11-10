// Matematika tangki untuk bab "Truk" (tanpa Three.js agar bisa diuji): isi tabung berbaring, permukaan cairan yang
// miring saat truk mengerem, dan osilasi guncangan (sloshing). Tinggi dinormalkan ke jari-jari: h = -1 dasar, +1 puncak.
// Semua ini ilustrasi kuasi-statis untuk presentasi, bukan perhitungan teknis kendaraan.
export const G = 9.81;

// Bagian luas penampang (0..1) yang terendam bila permukaan setinggi h. Berlaku untuk lingkaran maupun elips.
export function fractionAt(h) {
  if (h <= -1) return 0;
  if (h >= 1) return 1;
  const phi = Math.acos(-h);
  return (phi - Math.sin(phi) * Math.cos(phi)) / Math.PI;
}

// Kebalikan fractionAt: tinggi permukaan untuk bagian isi f.
export function heightFor(f) {
  if (f <= 0) return -1;
  if (f >= 1) return 1;
  let lo = -1, hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (fractionAt(mid) < f) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Permukaan miring dengan volume tetap. xs: posisi irisan (m) relatif pusat badan cairan; slope: kenaikan tinggi
// ternormalkan per meter. Mengembalikan tinggi tiap irisan (dijepit ke dinding tangki) dan pergeseran titik berat (m).
export function solveSurface(xs, slope, fraction, out = []) {
  const n = xs.length;
  const f = Math.min(1, Math.max(0, fraction));
  let span = 0;
  for (let i = 0; i < n; i++) span = Math.max(span, Math.abs(xs[i]));
  let lo = -1 - Math.abs(slope) * span, hi = 1 + Math.abs(slope) * span;
  const mean = (h0) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += fractionAt(h0 + slope * xs[i]);
    return s / n;
  };
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (mean(mid) < f) lo = mid;
    else hi = mid;
  }
  const h0 = (lo + hi) / 2;
  let vol = 0, moment = 0;
  for (let i = 0; i < n; i++) {
    const h = Math.min(1, Math.max(-1, h0 + slope * xs[i]));
    out[i] = h;
    const a = fractionAt(h);
    vol += a;
    moment += a * xs[i];
  }
  out.length = n;
  return { heights: out, shift: vol > 1e-9 ? moment / vol : 0, h0 };
}

// Frekuensi sudut mode guncangan pertama pada tangki sepanjang L (m) dengan kedalaman cairan depth (m).
export function sloshOmega(L, depth) {
  const k = Math.PI / Math.max(0.1, L);
  return Math.sqrt(G * k * Math.tanh(k * Math.max(0.02, depth)));
}

// Kemiringan permukaan (tan θ) sebagai osilator teredam yang mengejar kemiringan setimbang -a/g.
export class Slosh {
  constructor() {
    this.slope = 0;
    this.vel = 0;
  }
  reset() {
    this.slope = 0;
    this.vel = 0;
  }
  step(dt, accel, L, depth, zeta = 0.12) {
    const w = sloshOmega(L, depth);
    const target = -accel / G;
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 240);
      this.vel += (w * w * (target - this.slope) - 2 * zeta * w * this.vel) * h;
      this.slope += this.vel * h;
      left -= h;
    }
    return this.slope;
  }
}
