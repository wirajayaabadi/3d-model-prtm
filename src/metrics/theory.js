// Kapasitas dan utilisasi teoretis dari konfigurasi saja (Bagian 12), independen dari run simulasi.
import { simulateTravel } from '../geometry/kinematics.js';
import { PRODUCT_IDS } from '../config/products.js';

// Waktu tempuh tanpa gangguan per bay: rata-rata dari semua stall layak ke bay + mundur sampai bay bersih.
export function computeTravelTimes(layout, network, config, feasibleStallIndices) {
  const v = config.vehicle;
  const ext = v.wheelbase + v.frontOverhang;
  const stalls = feasibleStallIndices.length ? feasibleStallIndices : layout.stalls.map((s) => s.index);
  return layout.bays.map((b) => {
    let sum = 0;
    const perStall = [];
    for (const k of stalls) {
      const r = network.routes.stallToBay(k, b.index);
      const t = simulateTravel(r.segments, v).time;
      perStall.push(t);
      sum += t;
    }
    const noseZ = b.serviceAxle.z - ext;
    const clearDist = config.facility.bays.clearZ - noseZ;
    const rev = simulateTravel(network.bayManeuvers[b.index].exit, v, { untilDistance: clearDist, stopAtEnd: false }).time;
    return { bay: b.number, approach: stalls.length ? sum / stalls.length : 0, reverseClear: rev, perStall };
  });
}

export function loadStatus(rho) {
  if (rho == null || !isFinite(rho)) return 'overloaded';
  if (rho < 0.85) return 'stable';
  if (rho < 1.0) return 'nearCapacity';
  return 'overloaded';
}

export function computeTheory({ travelTimes, bays, operations }) {
  const ops = operations;
  const loadSec = (ops.requestedVolumeL / ops.loadingRateLpm) * 60;
  const prepSec = ops.prepMinutes * 60;
  const compSec = ops.completionMinutes * 60;
  const perBay = bays.map((b) => {
    const tt = travelTimes[b.index];
    const tCommit = tt.approach + prepSec + loadSec + compSec + tt.reverseClear; // detik
    const active = b.active || b.pendingDeactivation;
    return {
      bay: b.number,
      active,
      products: [...b.products],
      travel: tt.approach,
      reverseClear: tt.reverseClear,
      tCommitSec: tCommit,
      tCommitMin: tCommit / 60,
      mu: active ? 3600 / tCommit : 0,
    };
  });
  const mu = perBay.reduce((s, b) => s + b.mu, 0);
  const lambda = ops.arrivalRatePerHour;
  const rho = mu > 0 ? lambda / mu : lambda > 0 ? Infinity : 0;

  // Semua 31 himpunan bagian produk tak kosong (kondisi Hall untuk penugasan bipartit).
  const subsets = [];
  for (let mask = 1; mask < 1 << PRODUCT_IDS.length; mask++) {
    const S = PRODUCT_IDS.filter((_, i) => mask & (1 << i));
    const share = S.reduce((s, p) => s + (ops.demandShares[p] || 0), 0);
    const cap = perBay.filter((b) => b.active && b.products.some((p) => S.includes(p))).reduce((s, b) => s + b.mu, 0);
    const demand = lambda * share;
    const ratio = cap > 0 ? demand / cap : demand > 0 ? Infinity : 0;
    subsets.push({ products: S, share, capacity: cap, demand, ratio });
  }
  subsets.sort((a, b) => b.ratio - a.ratio || a.products.length - b.products.length);
  const worst = subsets[0];
  const profilePeak = ops.hourlyProfileEnabled && Array.isArray(ops.hourlyProfile) ? Math.max(...ops.hourlyProfile) : 1;
  return {
    perBay,
    mu,
    lambda,
    rho,
    rhoPeak: rho * profilePeak,
    profilePeak,
    tCommitAvgMin: perBay.filter((b) => b.active).reduce((s, b, _, arr) => s + b.tCommitMin / arr.length, 0),
    subsets,
    worstSubset: worst,
    productMixBinding: worst.ratio > rho + 1e-9,
    status: loadStatus(rho),
    statusPeak: loadStatus(rho * profilePeak),
  };
}
