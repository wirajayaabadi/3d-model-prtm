// Verifikasi semua preset 24 jam: tanpa tumpang tindih, tanpa kebuntuan, rho dalam ±0,03, determinisme batching.
import { createPresetConfig } from '../src/config/index.js';
import { PRESETS } from '../src/config/presets.js';
import { Engine } from '../src/sim/engine.js';
import { polygonsOverlap, bboxOverlap, bbox } from '../src/geometry/sweptPath.js';

function checkOverlaps(engine) {
  const trucks = [...engine.trucks.values()].filter((t) => t.spawned && t.footprint);
  const polys = trucks.map((t) => ({ t, poly: t.footprint, bb: bbox(t.footprint) }));
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (bboxOverlap(polys[i].bb, polys[j].bb) && polygonsOverlap(polys[i].poly, polys[j].poly)) {
        return { a: polys[i].t.label, b: polys[j].t.label, t: engine.time, pa: polys[i].t.pose, pb: polys[j].t.pose };
      }
    }
  }
  return null;
}

const results = [];
for (const p of PRESETS) {
  const t0 = Date.now();
  const e = new Engine(createPresetConfig(p.id), { presetId: p.id });
  let overlap = null, checks = 0;
  while (e.time < 24 * 3600) {
    e.step();
    if (e.stepCount % 5 === 0) {
      checks++;
      const o = checkOverlaps(e);
      if (o && !overlap) overlap = o;
    }
  }
  const s = e.summary();
  // determinisme: ulangi dengan stepMany batch berbeda
  const e2 = new Engine(createPresetConfig(p.id), { presetId: p.id });
  while (e2.time < 24 * 3600) e2.stepMany(600);
  results.push({
    preset: p.id,
    rhoTheory: +e.theory.rho.toFixed(3),
    rhoExpected: p.approxRho,
    rhoOk: Math.abs(e.theory.rho - p.approxRho) <= 0.03,
    worstSubset: e.theory.worstSubset.products.join('+') + ' ' + e.theory.worstSubset.ratio.toFixed(3),
    arrivals: s.counts.arrivals,
    exited: s.exitedWithinHorizon,
    unfinished: s.unfinishedCount,
    maxQueue: s.maxQueue,
    maxHolding: s.maxHolding,
    commitment: +s.observedCommitment.toFixed(3),
    throughput: +s.throughputPerHour.toFixed(2),
    waitMean: +(s.timeMetrics.queueWait.mean / 60).toFixed(1),
    waitP90: +(s.timeMetrics.queueWait.p90 / 60).toFixed(1),
    littlesDiff: s.littles.diffPercent == null ? null : +s.littles.diffPercent.toFixed(1),
    deadlock: !!s.deadlock,
    overlap,
    hashesEqual: e.logHashUntil(24 * 3600) === e2.logHashUntil(24 * 3600),
    ms: Date.now() - t0,
  });
  console.log(JSON.stringify(results[results.length - 1]));
}
const allOk = results.every((r) => r.rhoOk && !r.deadlock && !r.overlap && r.hashesEqual);
console.log(allOk ? 'SEMUA PRESET LOLOS' : 'ADA PRESET GAGAL');
process.exit(allOk ? 0 : 1);
