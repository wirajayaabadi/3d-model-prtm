// Presentasi: urutan bab/langkah, kelengkapan teks dua bahasa, dan matematika tangki untuk bab Truk.
import { describe, it, expect } from 'vitest';
import { STEPS, ACTIVE_CHAPTERS, chapterNo, stepsOfChapter } from '../src/presentation/story/steps.js';
import id from '../src/presentation/content/id.js';
import en from '../src/presentation/content/en.js';
import { HERO, CHAPTER_INTRO } from '../src/presentation/content/hero.js';
import { fractionAt, heightFor, solveSurface, sloshOmega, Slosh, G } from '../src/presentation/scenes/tankMath.js';

describe('langkah presentasi', () => {
  it('mengikuti urutan bab aktif tanpa bab yang terpecah', () => {
    const order = [];
    for (const s of STEPS) if (order[order.length - 1] !== s.ch) order.push(s.ch);
    expect(order).toEqual(ACTIVE_CHAPTERS);
    expect(ACTIVE_CHAPTERS.map(chapterNo)).toEqual(ACTIVE_CHAPTERS.map((_, i) => i));
  });
  it('punya teks, bab dan pengantar bab di kedua bahasa', () => {
    for (const c of [id, en]) {
      for (const s of STEPS) {
        expect(c.steps[s.id]?.title, `${c.code} ${s.id}`).toBeTruthy();
        expect(c.steps[s.id]?.notes, `${c.code} ${s.id} notes`).toBeTruthy();
      }
      for (const ch of ACTIVE_CHAPTERS) {
        expect(c.chapters[ch]?.title).toBeTruthy();
        expect(CHAPTER_INTRO[c.code][ch]).toBeTruthy();
        expect(CHAPTER_INTRO.photos[ch]).toBeTruthy();
        expect(stepsOfChapter(ch).length).toBeGreaterThan(0);
      }
    }
    for (const s of STEPS.filter((x) => x.truck)) for (const lang of ['id', 'en']) expect(HERO[lang][s.id]?.length).toBeGreaterThan(0);
  });
  it('total waktu bab aktif 15 menit', () => {
    for (const c of [id, en]) expect(ACTIVE_CHAPTERS.reduce((sum, ch) => sum + c.chapters[ch].minutes, 0)).toBe(15);
  });
  it('bab Truk punya teks panel untuk setiap bagian di kedua bahasa', () => {
    expect(Object.keys(en.truck).sort()).toEqual(Object.keys(id.truck).sort());
    expect(Object.keys(en.truck.parts).sort()).toEqual(Object.keys(id.truck.parts).sort());
  });
});

describe('matematika tangki', () => {
  it('isi penampang dan kebalikannya konsisten', () => {
    expect(fractionAt(-1)).toBe(0);
    expect(fractionAt(1)).toBe(1);
    expect(fractionAt(0)).toBeCloseTo(0.5, 6);
    for (const f of [0.05, 0.3, 0.5, 0.7, 0.9]) expect(fractionAt(heightFor(f))).toBeCloseTo(f, 5);
  });
  it('permukaan miring menjaga volume dan menggeser titik berat ke sisi yang naik', () => {
    const xs = Array.from({ length: 41 }, (_, i) => -4 + (8 * i) / 40);
    const flat = solveSurface(xs, 0, 0.6, []);
    expect(flat.shift).toBeCloseTo(0, 6);
    const tilted = solveSurface(xs, 0.5, 0.6, []);
    const mean = tilted.heights.reduce((s, h) => s + fractionAt(h), 0) / xs.length;
    expect(mean).toBeCloseTo(0.6, 3);
    expect(tilted.shift).toBeGreaterThan(0.5);
    expect(solveSurface(xs, -0.5, 0.6, []).shift).toBeCloseTo(-tilted.shift, 3);
  });
  it('tangki tanpa sekat bergeser jauh lebih besar daripada satu kompartemen', () => {
    const body = (len) => Array.from({ length: 41 }, (_, i) => -len / 2 + (len * i) / 40);
    const whole = solveSurface(body(8.4), 0.5, 0.63, []).shift;
    const comp = solveSurface(body(1.98), 0.5, 0.63, []).shift;
    expect(whole).toBeGreaterThan(comp * 4);
  });
  it('guncangan menuju kemiringan setimbang -a/g dan lebih lambat pada tangki panjang', () => {
    const s = new Slosh();
    for (let i = 0; i < 600; i++) s.step(1 / 60, -5, 2, 1.2, 0.3);
    expect(s.slope).toBeCloseTo(5 / G, 2);
    expect(sloshOmega(8.4, 1.2)).toBeLessThan(sloshOmega(2, 1.2));
  });
});


describe('SPBU: truk tidak menabrak apa pun saat masuk', () => {
  it('badan truk bebas dari pulau pompa, toko, tiang dan pagar semak, dan berhenti di dalam area bongkar', async () => {
    const { PLAN: P, TRUCK_BODY: T, tripLateral } = await import('../src/presentation/scenes/spbuPlan.js');
    const roadZ = 4, startX = 258; // jalan keluar terminal 4 m di selatan pusat SPBU; gerbang 258 m di timurnya
    const rect = (x0, x1, z0, z1) => ({ x0, x1, z0, z1 });
    const obstacles = [
      ...P.islands.map((z) => rect(P.island.x0 - 0.7, P.island.x1 + 0.7, z - P.island.halfWidth - 0.15, z + P.island.halfWidth + 0.15)),
      rect(P.shop.cx - P.shop.w / 2, P.shop.cx + P.shop.w / 2, P.shop.cz - P.shop.d / 2, P.shop.cz + P.shop.d / 2),
      rect(P.pylon.x - 0.7, P.pylon.x + 0.7, P.pylon.z - 0.5, P.pylon.z + 0.5),
      rect(P.hedge.x0, P.hedge.x1, P.hedge.z - P.hedge.halfDepth, P.hedge.z + P.hedge.halfDepth),
    ];
    const z = (lx) => tripLateral(lx, roadZ, startX);
    let maxTurn = 0;
    for (let lx = 80; lx >= P.stopX; lx -= 0.25) {
      const heading = Math.atan2(z(lx - 0.1) - z(lx + 0.1), -0.2); // arah gerak: ke barat
      const fx = Math.cos(heading), fz = Math.sin(heading);
      maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(fz, -fx)));
      for (let a = -T.rear; a <= T.front; a += 0.5) for (const side of [-T.halfWidth, 0, T.halfWidth]) {
        const px = lx + fx * a - fz * side, pz = z(lx) + fz * a + fx * side;
        for (const o of obstacles) expect(px > o.x0 && px < o.x1 && pz > o.z0 && pz < o.z1, `truk menyentuh benda di lx ${px.toFixed(1)}, lz ${pz.toFixed(1)}`).toBe(false);
        // di utara tepi jalan, truk hanya boleh berada di bukaan masuk atau di pelataran di belakang pagar semak
        if (pz < P.slab.z1 && pz > P.hedge.z - P.hedge.halfDepth) expect(px > P.entry.x0 && px < P.entry.x1, `truk memotong tepi di lx ${px.toFixed(1)}`).toBe(true);
      }
    }
    expect(maxTurn).toBeLessThan((25 * Math.PI) / 180); // belokan landai untuk truk 12 m
    expect(z(P.stopX)).toBeCloseTo(P.laneZ, 6);
    expect(P.stopX - T.front).toBeGreaterThan(P.bay.x0);
    expect(P.stopX + T.rear).toBeLessThan(P.bay.x1);
    expect(P.laneZ - T.halfWidth).toBeGreaterThan(P.bay.z0);
    expect(P.laneZ + T.halfWidth).toBeLessThan(P.bay.z1);
    expect(P.bay.z0).toBeGreaterThan(P.canopy.cz + P.canopy.d / 2); // area bongkar di luar kanopi
  });
});
