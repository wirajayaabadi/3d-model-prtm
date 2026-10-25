import { describe, it, expect } from 'vitest';
import { createDefaultConfig } from '../src/config/index.js';
import { Engine } from '../src/sim/engine.js';
import { TRUCK_STATES } from '../src/sim/models/truck.js';
import { BAY_STATES } from '../src/sim/models/bay.js';
import { Rng, deriveStreams } from '../src/sim/rng.js';
import { EventQueue } from '../src/sim/events.js';
import { formatSimTime, formatDuration } from '../src/sim/clock.js';

const H = 24 * 3600;

describe('Jam, kejadian dan RNG (Bagian 7-8)', () => {
  it('antrean kejadian deterministik: urut waktu lalu nomor urut', () => {
    const q = new EventQueue();
    q.schedule(5, 'b');
    q.schedule(5, 'c');
    q.schedule(1, 'a');
    expect(q.pop().type).toBe('a');
    expect(q.pop().type).toBe('b');
    expect(q.pop().type).toBe('c');
  });
  it('aliran acak terpisah: mengubah aliran produk tidak mengubah kedatangan', () => {
    const a = deriveStreams(20261025, ['arrivals', 'products']);
    const b = deriveStreams(20261025, ['arrivals', 'products']);
    b.products.uniform();
    expect(a.arrivals.uniform()).toBe(b.arrivals.uniform());
  });
  it('eksponensial dan lognormal memiliki rata-rata yang benar', () => {
    const r = new Rng(7);
    let s = 0;
    for (let i = 0; i < 20000; i++) s += r.exponential(1 / 200);
    expect(s / 20000).toBeGreaterThan(190);
    expect(s / 20000).toBeLessThan(210);
    let l = 0;
    for (let i = 0; i < 20000; i++) l += r.lognormal(180, 0.3);
    expect(l / 20000).toBeGreaterThan(172);
    expect(l / 20000).toBeLessThan(188);
  });
  it('clock and duration format', () => {
    const cal = { startHour: 6, timezone: 'WIB' };
    expect(formatSimTime(0, cal)).toBe('Day 1, 06:00 WIB');
    expect(formatSimTime(H, cal)).toBe('Day 2, 06:00 WIB');
    expect(formatDuration(750)).toBe('12 min 30 s');
    expect(formatDuration(5400)).toBe('1 h 30 min');
  });
});

describe('Engine headless: run dasar 24 jam', () => {
  const e = new Engine(createDefaultConfig());
  e.runUntil(H);
  const s = e.summary();

  it('dimulai kosong di Hari 1 06:00 dan berhenti otomatis pada horizon', () => {
    const f = new Engine(createDefaultConfig());
    expect(f.time).toBe(0);
    expect(f.trucks.size).toBe(0);
    expect(f.bays.filter((b) => b.state === BAY_STATES.AVAILABLE)).toHaveLength(12);
    expect(e.horizonReached).toBe(true);
    expect(e.autoPaused).toBe(true);
  });

  it('rho teoretis dekat 0,73 dan antrean stabil', () => {
    expect(Math.abs(e.theory.rho - 0.73)).toBeLessThanOrEqual(0.03);
    expect(s.maxQueue).toBeLessThan(e.effectiveCapacity);
    expect(s.maxHolding).toBe(0);
    expect(s.exitedWithinHorizon).toBeGreaterThan(400);
    expect(s.deadlock).toBeNull();
  });

  it('truk belum selesai dilaporkan terpisah dan tidak dihitung sebagai selesai', () => {
    expect(s.unfinishedCount).toBe(e.trucks.size);
    expect(s.exitedWithinHorizon + s.unfinishedCount).toBe(s.counts.arrivals);
  });

  it('volume dashboard = jumlah volume yang benar-benar dimuat', () => {
    const loaded = e.log.filter((l) => l.type === 'loadingEnd').reduce((a, l) => a + l.volume, 0);
    expect(s.totalVolume).toBe(loaded);
    expect(Object.values(s.volumeByProduct).reduce((a, b) => a + b, 0)).toBe(loaded);
  });

  it('durasi pengisian = volume / laju yang di-snapshot saat dispatch', () => {
    const starts = new Map(e.log.filter((l) => l.type === 'loadingStart').map((l) => [l.truck, l.t]));
    const ends = e.log.filter((l) => l.type === 'loadingEnd');
    expect(ends.length).toBeGreaterThan(100);
    for (const l of ends) expect(l.t - starts.get(l.truck)).toBeCloseTo((24000 / 1200) * 60, 2);
  });

  it('bay tetap berkomitmen sampai truk benar-benar bersih dan tidak ada dua truk di satu bay', () => {
    const held = new Map();
    for (const l of e.log) {
      if (l.type === 'dispatch') {
        expect(held.has(l.bay)).toBe(false);
        held.set(l.bay, l.truck);
      } else if (l.type === 'bayClear') {
        expect(held.get(l.bay)).toBe(l.truck);
        held.delete(l.bay);
      }
    }
  });

  it('semua truk ditugaskan hanya ke bay yang kompatibel', () => {
    const product = new Map(e.log.filter((l) => l.type === 'arrival').map((l) => [l.truck, l.product]));
    const cfg = createDefaultConfig();
    for (const l of e.log.filter((x) => x.type === 'dispatch')) {
      expect(cfg.bays[l.bay - 1].products).toContain(product.get(l.truck));
      expect(cfg.bays[l.bay - 1].active).toBe(true);
    }
  });

  it('waktu tempuh berbeda antar bay', () => {
    const tt = e.travelTimes.map((t) => t.approach);
    expect(new Set(tt.map((x) => x.toFixed(1))).size).toBeGreaterThan(5);
    expect(tt[0]).toBeGreaterThan(tt[13]); // bay 1 paling jauh dari putar balik
  });
});

describe('Rekonsiliasi kedatangan di setiap langkah', () => {
  it('kedatangan = antre gerbang + dalam fasilitas + keluar', () => {
    const cfg = createDefaultConfig();
    cfg.operations.arrivalRatePerHour = 30;
    const e = new Engine(cfg);
    for (let i = 0; i < 40000; i++) {
      e.step();
      const c = e.collector;
      expect(c.arrivals).toBe(e.holding.length + c.nFacility + c.exited);
    }
  });
});

describe('Determinisme', () => {
  it('log kejadian identik untuk 1x, 5x, 20x dan 60x (batch langkah berbeda)', () => {
    const hashes = [1, 5, 20, 60].map((k) => {
      const e = new Engine(createDefaultConfig());
      while (e.time < 4 * 3600) e.stepMany(k);
      return e.logHashUntil(4 * 3600);
    });
    expect(new Set(hashes).size).toBe(1);
  });
  it('reset memulihkan keadaan kosong dan menghasilkan run yang sama', () => {
    const e = new Engine(createDefaultConfig());
    e.runUntil(3600);
    const h1 = e.logHashUntil(3600);
    expect(e.trucks.size).toBeGreaterThan(0);
    e.reset();
    expect(e.time).toBe(0);
    expect(e.trucks.size).toBe(0);
    expect(e.log).toHaveLength(0);
    expect(e.bays.every((b) => !b.committed)).toBe(true);
    expect(e.network.allSegments.every((s) => s.occupants.size === 0)).toBe(true);
    e.runUntil(3600);
    expect(e.logHashUntil(3600)).toBe(h1);
  });
  it('seed berbeda menghasilkan log berbeda', () => {
    const a = new Engine(createDefaultConfig());
    const cfg = createDefaultConfig();
    cfg.operations.seed = 1;
    const b = new Engine(cfg);
    a.runUntil(3600);
    b.runUntil(3600);
    expect(a.logHashUntil(3600)).not.toBe(b.logHashUntil(3600));
  });
});

describe('Kebijakan dispatch dan status bay (Bagian 9)', () => {

  it('bay nonaktif dan menunggu-nonaktif tidak menerima penugasan baru', () => {
    const e = new Engine(createDefaultConfig());
    e.runUntil(1800);
    // nonaktifkan bay yang sedang berkomitmen -> menunggu nonaktif
    const busy = e.bays.find((b) => b.committed);
    expect(busy).toBeDefined();
    e.setBayActive(busy.number, false);
    expect(busy.pendingDeactivation).toBe(true);
    expect(busy.displayState).toBe('pendingDeactivation');
    const before = e.log.length;
    e.runUntil(e.time + 3 * 3600);
    const assignedAfter = e.log.slice(before).filter((l) => l.type === 'dispatch' && l.bay === busy.number);
    expect(assignedAfter).toHaveLength(0);
    expect(busy.active).toBe(false);
    expect(busy.state).toBe(BAY_STATES.INACTIVE);
    expect(busy.pendingDeactivation).toBe(false);
    // bay 13 nonaktif tidak pernah ditugaskan
    expect(e.log.some((l) => l.type === 'dispatch' && (l.bay === 13 || l.bay === 14))).toBe(false);
  });

  it('mengaktifkan bay 13 membuatnya dapat ditugaskan', () => {
    const e = new Engine(createDefaultConfig());
    e.setBayActive(13, true);
    e.runUntil(6 * 3600);
    expect(e.log.some((l) => l.type === 'dispatch' && l.bay === 13)).toBe(true);
  });

  it('edit produk pada bay sibuk ditunda sampai truk bersih', () => {
    const e = new Engine(createDefaultConfig());
    e.runUntil(1800);
    const busy = e.bays.find((b) => b.committed);
    const ok = e.setBayProducts(busy.number, ['pertalite', 'pertamax', 'pertadex']);
    expect(ok).toBe(true);
    expect(busy.pendingProducts).toEqual(['pertalite', 'pertamax', 'pertadex']);
    e.runUntil(e.time + 3600);
    expect(busy.pendingProducts).toBeNull();
    expect(busy.products).toEqual(['pertalite', 'pertamax', 'pertadex']);
    expect(e.setBayProducts(1, ['pertalite', 'pertalite', 'b50'])).toBe(false);
  });

  it('aturan perlindungan mencegah truk belakangan mengambil bay yang kompatibel dengan truk terlindungi', () => {
    // Semua bay hanya melayani produk yang tidak diminta siapa pun -> truk pertama menunggu dan menjadi terlindungi.
    const cfg = createDefaultConfig();
    cfg.operations.arrivalRatePerHour = 60;
    cfg.operations.protection.waitMinutes = 5;
    cfg.operations.protection.passCount = 2;
    // Pertadex hanya di bay 4, 6, 8, 9, 10, 12 -> paksa dominasi pertadex vs pertamaxTurbo
    cfg.operations.demandShares = { pertalite: 0.0, pertamax: 0.0, b50: 0.0, pertadex: 0.5, pertamaxTurbo: 0.5 };
    const e = new Engine(cfg);
    e.runUntil(6 * 3600);
    const protectedEvents = e.log.filter((l) => l.type === 'protected');
    expect(protectedEvents.length).toBeGreaterThan(0);
    // Verifikasi: setelah truk P terlindungi dan masih menunggu, tidak ada truk yang antre setelah P
    // mendapat bay yang kompatibel dengan P.
    const product = new Map(e.log.filter((l) => l.type === 'arrival').map((l) => [l.truck, l.product]));
    const parkT = new Map(e.log.filter((l) => l.type === 'park').map((l) => [l.truck, l.t]));
    const dispatched = new Set();
    const protectedNow = new Set();
    let violations = 0;
    for (const l of e.log) {
      if (l.type === 'protected') protectedNow.add(l.truck);
      if (l.type === 'dispatch') {
        for (const p of protectedNow) {
          if (p === l.truck || dispatched.has(p)) continue;
          const bayProducts = e.bays[l.bay - 1].products;
          if (parkT.get(l.truck) > parkT.get(p) && bayProducts.includes(product.get(p))) violations++;
        }
        dispatched.add(l.truck);
        protectedNow.delete(l.truck);
      }
    }
    expect(violations).toBe(0);
  });

  it('snapshot parameter servis: perubahan laju pengisian hanya berlaku untuk dispatch berikutnya', () => {
    const e = new Engine(createDefaultConfig());
    e.runUntil(1500);
    const loadingTruck = [...e.trucks.values()].find((t) => t.state === TRUCK_STATES.LOADING || t.state === TRUCK_STATES.PREP);
    expect(loadingTruck).toBeDefined();
    e.setServiceParams({ loadingRateLpm: 2400 });
    expect(loadingTruck.snapshot.loadingRateLpm).toBe(1200);
    e.runUntil(e.time + 2 * 3600);
    const afterStarts = new Map(e.log.filter((l) => l.type === 'loadingStart' && l.t > 1500 + 1200).map((l) => [l.truck, l.t]));
    const ends = e.log.filter((l) => l.type === 'loadingEnd' && afterStarts.has(l.truck) && l.t > 4000);
    expect(ends.length).toBeGreaterThan(0);
    const durations = ends.map((l) => l.t - afterStarts.get(l.truck));
    expect(durations.some((d) => Math.abs(d - 600) < 0.01)).toBe(true);
  });

  it('perubahan laju kedatangan mengambil ulang kedatangan berikutnya; laju nol menghentikan kedatangan', () => {
    const e = new Engine(createDefaultConfig());
    e.runUntil(600);
    e.setArrivalRate(0);
    const n = e.collector.arrivals;
    e.runUntil(e.time + 3600);
    expect(e.collector.arrivals).toBe(n);
    e.setArrivalRate(60);
    e.runUntil(e.time + 1800);
    expect(e.collector.arrivals).toBeGreaterThan(n + 5);
  });

  it('menolak pangsa yang tidak berjumlah 1 dan nilai tidak valid', () => {
    const e = new Engine(createDefaultConfig());
    expect(e.setDemandShares({ pertalite: 0.5, pertamax: 0.3, b50: 0.25, pertadex: 0.1, pertamaxTurbo: 0.05 })).toBe(false);
    expect(e.setServiceParams({ loadingRateLpm: 0 })).toBe(false);
    expect(e.setServiceParams({ requestedVolumeL: -1 })).toBe(false);
    expect(e.setArrivalRate(-3)).toBe(false);
    expect(() => {
      const cfg = createDefaultConfig();
      cfg.vehicle.wheelbase = 5;
      new Engine(cfg);
    }).toThrow();
  });
});

describe('Ekstensi opsional', () => {
  it('profil per jam menghasilkan kedatangan yang mengikuti pengali', () => {
    const cfg = createDefaultConfig();
    const prof = Array(24).fill(1);
    for (let h = 0; h < 12; h++) prof[h] = 1.8; // 00-11
    for (let h = 12; h < 24; h++) prof[h] = 0.2; // 12-23
    cfg.operations.hourlyProfileEnabled = true;
    cfg.operations.hourlyProfile = prof;
    const e = new Engine(cfg);
    e.runUntil(H);
    // Run mulai 06:00 -> jam 06-11 (6 jam) tinggi, 12-23 rendah, 00-05 tinggi
    const arr = e.log.filter((l) => l.type === 'arrival').map((l) => l.t);
    const high = arr.filter((t) => t < 6 * 3600 || t >= 18 * 3600).length;
    const low = arr.filter((t) => t >= 6 * 3600 && t < 18 * 3600).length;
    expect(high).toBeGreaterThan(low * 4);
    expect(e.theory.rhoPeak).toBeCloseTo(e.theory.rho * 1.8, 6);
  });
  it('variabilitas servis mengubah durasi tetapi tetap deterministik', () => {
    const cfg = createDefaultConfig();
    cfg.operations.serviceCV = 0.3;
    const a = new Engine(cfg);
    const b = new Engine(cfg);
    a.runUntil(4 * 3600);
    b.runUntil(4 * 3600);
    expect(a.logHashUntil(4 * 3600)).toBe(b.logHashUntil(4 * 3600));
    const starts = new Map(a.log.filter((l) => l.type === 'loadingStart').map((l) => [l.truck, l.t]));
    const durs = a.log.filter((l) => l.type === 'loadingEnd').map((l) => l.t - starts.get(l.truck));
    expect(new Set(durs.map((d) => d.toFixed(1))).size).toBeGreaterThan(3);
  });
});
