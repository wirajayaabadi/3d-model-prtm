// Preset skenario (Bagian 14). Setiap preset adalah fungsi yang mengubah konfigurasi dasar.
export const PRESETS = [
  {
    id: 'baseline',
    labelKey: 'preset.baseline',
    approxRho: 0.73,
    apply: (cfg) => cfg,
  },
  {
    id: 'arrivalPlus50',
    labelKey: 'preset.arrivalPlus50',
    approxRho: 1.1,
    apply: (cfg) => {
      cfg.operations.arrivalRatePerHour = 27;
      return cfg;
    },
  },
  {
    id: 'allBays',
    labelKey: 'preset.allBays',
    approxRho: 0.63,
    apply: (cfg) => {
      for (const b of cfg.bays) b.active = true;
      return cfg;
    },
  },
  {
    id: 'oneBayOff',
    labelKey: 'preset.oneBayOff',
    approxRho: 0.8,
    params: { bayNumber: 6 },
    apply: (cfg, params = {}) => {
      const n = params.bayNumber ?? 6;
      const b = cfg.bays.find((x) => x.number === n);
      if (b) b.active = false;
      return cfg;
    },
  },
  {
    id: 'loadingMinus25',
    labelKey: 'preset.loadingMinus25',
    approxRho: 0.9,
    apply: (cfg) => {
      cfg.operations.loadingRateLpm = 900;
      return cfg;
    },
  },
  {
    id: 'turboShift',
    labelKey: 'preset.turboShift',
    approxRho: 0.73,
    params: { turboShare: 0.4 },
    apply: (cfg, params = {}) => {
      const share = params.turboShare ?? 0.4;
      cfg.operations.demandShares = rebalanceShares(cfg.operations.demandShares, 'pertamaxTurbo', share);
      return cfg;
    },
  },
];

// Mengubah satu pangsa dan menyeimbangkan sisanya secara proporsional sehingga total tetap 1.
export function rebalanceShares(shares, changedId, newValue) {
  const out = { ...shares };
  const v = Math.min(1, Math.max(0, newValue));
  const othersTotal = Object.keys(out)
    .filter((k) => k !== changedId)
    .reduce((s, k) => s + out[k], 0);
  const remaining = 1 - v;
  for (const k of Object.keys(out)) {
    if (k === changedId) continue;
    out[k] = othersTotal > 0 ? (out[k] / othersTotal) * remaining : remaining / (Object.keys(out).length - 1);
  }
  out[changedId] = v;
  return out;
}

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}
