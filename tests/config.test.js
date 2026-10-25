import { describe, it, expect } from 'vitest';
import { createDefaultConfig, createPresetConfig } from '../src/config/index.js';
import { buildLayout } from '../src/geometry/layout.js';
import { validateConfig, validateBayProducts } from '../src/geometry/validation.js';
import { PRODUCT_IDS } from '../src/config/products.js';
import { rebalanceShares } from '../src/config/presets.js';

describe('Konfigurasi dan plot (Bagian 3)', () => {
  const cfg = createDefaultConfig();
  const layout = buildLayout(cfg);

  it('plot 136 x 100 m = 13.600 m2', () => {
    expect(layout.plot.width).toBe(136);
    expect(layout.plot.length).toBe(100);
    expect(layout.plot.area).toBe(13600);
  });

  it('dimensi dan luas zona sesuai Bagian 3', () => {
    expect(layout.zones.bayBlock).toMatchObject({ x0: 4, x1: 116, z0: 4, z1: 28, width: 112, length: 24, area: 2688 });
    expect(layout.zones.approach).toMatchObject({ x0: 4, x1: 116, z0: 28, z1: 60, width: 112, length: 32, area: 3584 });
    expect(layout.zones.waiting).toMatchObject({ x0: 20, x1: 100, z0: 68, z1: 92, width: 80, length: 24, area: 1920 });
    expect(layout.unallocatedArea).toBe(5408);
  });

  it('gerbang di batas barat', () => {
    expect(layout.gates.entrance).toEqual({ x: 0, z: 74 });
    expect(layout.gates.exit).toEqual({ x: 0, z: 44 });
  });
});

describe('Bay (Bagian 4.1 dan 5)', () => {
  const cfg = createDefaultConfig();
  const layout = buildLayout(cfg);

  it('tepat 14 bay pada posisi yang benar', () => {
    expect(layout.bays).toHaveLength(14);
    for (const b of layout.bays) {
      const i = b.number;
      expect(b.x0).toBe(4 + (i - 1) * 8);
      expect(b.x1).toBe(4 + i * 8);
      expect(b.cx).toBe(8 + (i - 1) * 8);
      expect(b.serviceAxle).toEqual({ x: b.cx, z: 17.5 });
      expect(b.serviceCenter.z).toBeCloseTo(16, 9);
      expect(b.z0).toBe(4);
      expect(b.z1).toBe(28);
    }
  });

  it('tepat 12 bay aktif awal, bay 13 dan 14 nonaktif', () => {
    const active = layout.bays.filter((b) => b.active);
    expect(active).toHaveLength(12);
    expect(layout.bays[12].active).toBe(false);
    expect(layout.bays[13].active).toBe(false);
  });

  it('setiap bay mendukung tepat tiga produk unik sesuai tabel', () => {
    const expected = {
      1: ['pertalite', 'pertamax', 'b50'],
      2: ['pertalite', 'pertamax', 'b50'],
      3: ['pertalite', 'pertamax', 'pertamaxTurbo'],
      4: ['pertalite', 'pertamax', 'pertadex'],
      5: ['pertamax', 'pertamaxTurbo', 'b50'],
      6: ['pertamax', 'pertamaxTurbo', 'pertadex'],
      7: ['pertalite', 'pertamax', 'pertamaxTurbo'],
      8: ['b50', 'pertadex', 'pertalite'],
      9: ['b50', 'pertadex', 'pertalite'],
      10: ['b50', 'pertadex', 'pertamax'],
      11: ['b50', 'pertalite', 'pertamax'],
      12: ['b50', 'pertadex', 'pertamaxTurbo'],
      13: ['pertalite', 'pertamax', 'pertamaxTurbo'],
      14: ['b50', 'pertadex', 'pertalite'],
    };
    for (const b of layout.bays) {
      expect(b.products).toEqual(expected[b.number]);
      expect(new Set(b.products).size).toBe(3);
      for (const p of b.products) expect(PRODUCT_IDS).toContain(p);
    }
  });

  it('kolom berada di batas bay dan di luar jejak truk servis', () => {
    expect(layout.columns.length).toBe(15 * 2);
    for (const c of layout.columns) expect((c.x - 4) % 8).toBe(0);
  });
});

describe('Kendaraan (Bagian 6)', () => {
  it('overhang depan + wheelbase + overhang belakang = panjang total', () => {
    const cfg = createDefaultConfig();
    const v = cfg.vehicle;
    expect(v.frontOverhang + v.wheelbase + v.rearOverhang).toBeCloseTo(v.length, 9);
    expect(validateConfig(cfg)).toEqual([]);
  });

  it('menolak ketidaksesuaian panjang kendaraan', () => {
    const cfg = createDefaultConfig();
    cfg.vehicle.wheelbase = 5;
    expect(validateConfig(cfg).some((e) => e.code === 'vehicleLengthMismatch')).toBe(true);
  });
});

describe('Validasi parameter operasi (Bagian 8)', () => {
  it('pangsa permintaan default berjumlah 100%', () => {
    const cfg = createDefaultConfig();
    const total = Object.values(cfg.operations.demandShares).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(0.0001);
  });

  it('menolak pangsa yang tidak berjumlah 100%', () => {
    const cfg = createDefaultConfig();
    cfg.operations.demandShares.pertalite = 0.5;
    expect(validateConfig(cfg).some((e) => e.code === 'sharesNotOne')).toBe(true);
  });

  it('menolak nilai negatif, laju pengisian <= 0 dan volume <= 0', () => {
    const cfg = createDefaultConfig();
    cfg.operations.arrivalRatePerHour = -1;
    cfg.operations.loadingRateLpm = 0;
    cfg.operations.requestedVolumeL = -5;
    const codes = validateConfig(cfg).map((e) => e.code);
    expect(codes).toContain('negativeValue');
    expect(codes).toContain('loadingRateNonPositive');
    expect(codes).toContain('volumeNonPositive');
  });

  it('profil per jam harus rata-rata 1,0', () => {
    const cfg = createDefaultConfig();
    cfg.operations.hourlyProfileEnabled = true;
    cfg.operations.hourlyProfile = Array(24).fill(1.2);
    expect(validateConfig(cfg).some((e) => e.code === 'profileAverage')).toBe(true);
  });

  it('penyeimbangan pangsa proporsional menjaga total 1', () => {
    const cfg = createDefaultConfig();
    const s = rebalanceShares(cfg.operations.demandShares, 'pertamaxTurbo', 0.4);
    const total = Object.values(s).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(s.pertamaxTurbo).toBeCloseTo(0.4, 9);
    expect(s.pertalite / s.pertamax).toBeCloseTo(1, 9);
  });

  it('editor produk bay menuntut tiga produk unik', () => {
    expect(validateBayProducts(['pertalite', 'pertamax', 'b50'])).toBe(true);
    expect(validateBayProducts(['pertalite', 'pertalite', 'b50'])).toBe(false);
    expect(validateBayProducts(['pertalite', 'pertamax'])).toBe(false);
  });
});

describe('Preset', () => {
  it('semua 14 bay aktif pada preset allBays', () => {
    const cfg = createPresetConfig('allBays');
    expect(cfg.bays.every((b) => b.active)).toBe(true);
  });
  it('preset oneBayOff menonaktifkan bay 06', () => {
    const cfg = createPresetConfig('oneBayOff');
    expect(cfg.bays.find((b) => b.number === 6).active).toBe(false);
    expect(cfg.bays.filter((b) => b.active)).toHaveLength(11);
  });
});

describe('Stall (Bagian 4.3)', () => {
  it('pitch stall = lebar truk + celah lateral = 4,5 m, sekitar 17 stall', () => {
    const layout = buildLayout(createDefaultConfig());
    expect(layout.stallPitch).toBe(4.5);
    expect(layout.stalls.length).toBe(17);
    for (const s of layout.stalls) {
      expect(s.x0).toBeGreaterThanOrEqual(20);
      expect(s.x1).toBeLessThanOrEqual(100);
      expect(s.parkedAxle.z).toBe(87.5);
    }
  });
});
