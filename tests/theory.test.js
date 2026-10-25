import { describe, it, expect } from 'vitest';
import { createDefaultConfig, createPresetConfig } from '../src/config/index.js';
import { PRESETS } from '../src/config/presets.js';
import { Engine } from '../src/sim/engine.js';
import { loadStatus } from '../src/metrics/theory.js';
import { rebalanceShares } from '../src/config/presets.js';

describe('Kapasitas dan utilisasi teoretis (Bagian 12)', () => {
  const e = new Engine(createDefaultConfig());
  const th = e.theory;

  it('T_commit per bay = tempuh + persiapan + pengisian + penyelesaian + mundur sampai bersih', () => {
    for (const b of th.perBay) {
      const tt = e.travelTimes[b.bay - 1];
      expect(b.tCommitSec).toBeCloseTo(tt.approach + 180 + 1200 + 180 + tt.reverseClear, 6);
      if (b.active) expect(b.mu).toBeCloseTo(3600 / b.tCommitSec, 9);
      else expect(b.mu).toBe(0);
    }
    expect(th.tCommitAvgMin).toBeGreaterThan(28);
    expect(th.tCommitAvgMin).toBeLessThan(30.5);
  });

  it('mu = jumlah mu_j bay aktif; rho = lambda / mu', () => {
    const mu = th.perBay.filter((b) => b.active).reduce((s, b) => s + b.mu, 0);
    expect(th.mu).toBeCloseTo(mu, 9);
    expect(th.rho).toBeCloseTo(18 / mu, 9);
    expect(th.mu).toBeGreaterThan(23.5);
    expect(th.mu).toBeLessThan(26);
  });

  it('memeriksa semua 31 himpunan bagian produk dan melaporkan rasio tertinggi', () => {
    expect(th.subsets).toHaveLength(31);
    const full = th.subsets.find((s) => s.products.length === 5);
    expect(full.ratio).toBeCloseTo(th.rho, 9);
    expect(th.worstSubset.ratio).toBeGreaterThanOrEqual(th.rho - 1e-9);
    for (const s of th.subsets) {
      expect(s.share).toBeGreaterThanOrEqual(0);
      expect(s.capacity).toBeGreaterThan(0);
    }
  });

  it('status beban mengikuti ambang rho', () => {
    expect(loadStatus(0.5)).toBe('stable');
    expect(loadStatus(0.849)).toBe('stable');
    expect(loadStatus(0.85)).toBe('nearCapacity');
    expect(loadStatus(0.999)).toBe('nearCapacity');
    expect(loadStatus(1.0)).toBe('overloaded');
    expect(loadStatus(Infinity)).toBe('overloaded');
  });

  it('diperbarui saat laju kedatangan, pangsa, parameter servis, aktivasi dan produk bay berubah', () => {
    const f = new Engine(createDefaultConfig());
    const rho0 = f.theory.rho;
    f.setArrivalRate(27);
    expect(f.theory.rho).toBeCloseTo(rho0 * 1.5, 9);
    f.setArrivalRate(18);
    f.setBayActive(13, true);
    f.setBayActive(14, true);
    expect(f.theory.rho).toBeLessThan(rho0);
    expect(Math.abs(f.theory.rho - 0.63)).toBeLessThanOrEqual(0.03);
    f.setBayActive(13, false);
    f.setBayActive(14, false);
    f.setServiceParams({ loadingRateLpm: 900 });
    expect(Math.abs(f.theory.rho - 0.9)).toBeLessThanOrEqual(0.03);
    f.setServiceParams({ loadingRateLpm: 1200 });
    f.setDemandShares({ pertalite: 0.1, pertamax: 0.1, b50: 0.1, pertadex: 0.1, pertamaxTurbo: 0.6 });
    expect(f.theory.productMixBinding).toBe(true);
    expect(f.theory.worstSubset.products).toEqual(['pertamaxTurbo']);
    expect(f.theory.worstSubset.ratio).toBeGreaterThan(1);
    f.setBayProducts(1, ['pertamaxTurbo', 'pertamax', 'b50']);
    expect(f.theory.worstSubset.ratio).toBeLessThan(1.01);
  });

  it('pergeseran permintaan ke Pertamax Turbo: pengikat di atas ~42%, kelebihan beban di atas ~57%', () => {
    const f = new Engine(createDefaultConfig());

    const shares0 = createDefaultConfig().operations.demandShares;
    f.setDemandShares(rebalanceShares(shares0, 'pertamaxTurbo', 0.4));
    expect(f.theory.productMixBinding).toBe(false);
    const turbo40 = f.theory.subsets.find((s) => s.products.length === 1 && s.products[0] === 'pertamaxTurbo');
    expect(Math.abs(turbo40.ratio - 0.7)).toBeLessThan(0.05);
    f.setDemandShares(rebalanceShares(shares0, 'pertamaxTurbo', 0.45));
    expect(f.theory.productMixBinding).toBe(true);
    expect(Math.abs(f.theory.rho - 0.73)).toBeLessThanOrEqual(0.03);
    f.setDemandShares(rebalanceShares(shares0, 'pertamaxTurbo', 0.6));
    expect(f.theory.worstSubset.ratio).toBeGreaterThan(1);
  });
});

describe('Preset (Bagian 14)', () => {
  it.each(PRESETS.map((p) => [p.id, p.approxRho]))('rho %s dalam ±0,03 dari nilai acuan %s', (id, approx) => {
    const e = new Engine(createPresetConfig(id), { presetId: id });
    expect(Math.abs(e.theory.rho - approx)).toBeLessThanOrEqual(0.03);
  });
  it('preset dengan seed sama mereproduksi hasil yang sama', () => {
    const a = new Engine(createPresetConfig('oneBayOff'));
    const b = new Engine(createPresetConfig('oneBayOff'));
    a.runUntil(3 * 3600);
    b.runUntil(3 * 3600);
    expect(a.logHashUntil(3 * 3600)).toBe(b.logHashUntil(3 * 3600));
  });
});
