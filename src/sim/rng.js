// Generator pseudoacak berbasis seed dengan aliran terpisah (arrivals, products, service).
// Mengubah satu parameter tidak mengacak ulang aliran lain.

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.state = (seed >>> 0) || 0x9e3779b9;
    // pemanasan agar seed kecil tersebar
    for (let i = 0; i < 4; i++) this.nextU32();
  }
  nextU32() {
    // mulberry32
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  // U(0,1) tanpa 0 dan 1
  uniform() {
    return (this.nextU32() + 0.5) / 4294967296;
  }
  exponential(rate) {
    if (!(rate > 0)) return Infinity;
    return -Math.log(1 - this.uniform()) / rate;
  }
  normal() {
    const u1 = this.uniform();
    const u2 = this.uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  // Lognormal dengan rata-rata mean dan koefisien variasi cv.
  lognormal(mean, cv) {
    if (!(cv > 0)) return mean;
    const sigma2 = Math.log(1 + cv * cv);
    const mu = Math.log(mean) - sigma2 / 2;
    return Math.exp(mu + Math.sqrt(sigma2) * this.normal());
  }
  // Pilih indeks berdasarkan bobot (bobot tidak perlu ternormalisasi).
  weightedIndex(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.uniform() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
}

export function deriveStreams(masterSeed, names) {
  const out = {};
  for (const n of names) out[n] = new Rng(hashString(`${masterSeed}:${n}`));
  return out;
}

export { hashString };
