#!/usr/bin/env node
// Menjalankan engine headless untuk satu skenario 24 jam dan mencetak ringkasan.
// Pemakaian: node scripts/run-headless.js [presetId] [--seed N] [--hours H] [--rate L] [--csv dir]
import fs from 'node:fs';
import path from 'node:path';
import { createPresetConfig } from '../src/config/index.js';
import { PRESETS } from '../src/config/presets.js';
import { Engine } from '../src/sim/engine.js';
import { truckLogCsv, bayStatsCsv, seriesCsv, summaryCsv } from '../src/metrics/export.js';

const args = process.argv.slice(2);
const presetId = args.find((a) => !a.startsWith('--')) || 'baseline';
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
if (!PRESETS.some((p) => p.id === presetId)) {
  console.error(`Unknown preset: ${presetId}. Options: ${PRESETS.map((p) => p.id).join(', ')}`);
  process.exit(1);
}
const cfg = createPresetConfig(presetId);
if (opt('seed')) cfg.operations.seed = Number(opt('seed'));
if (opt('rate')) cfg.operations.arrivalRatePerHour = Number(opt('rate'));
const hours = Number(opt('hours', cfg.operations.calendar.horizonHours));
cfg.operations.calendar.horizonHours = hours;

const t0 = Date.now();
const engine = new Engine(cfg, { presetId });
engine.runUntil(hours * 3600);
const s = engine.summary();
const pct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');
const mins = (x) => (x == null ? '—' : (x / 60).toFixed(1) + ' min');

console.log(`Scenario            : ${presetId} (seed ${cfg.operations.seed}, ${hours} simulated hours, ${Date.now() - t0} ms compute)`);
console.log(`Waiting capacity    : ${s.effectiveCapacity} effective stalls (target ${cfg.operations.targetWaitingCapacity})`);
console.log(`Geometry feasibility: ${engine.geometryReport.allFeasible ? 'all routes and stalls feasible' : 'SOME ROUTES/STALLS INFEASIBLE'}`);
console.log(`Theoretical capacity: ${s.theory.mu.toFixed(2)} trucks/h; theoretical utilization ${pct(s.theory.rho)} (${s.theory.status})`);
console.log(`Product group       : ${s.theory.worstSubset.products.join('+')} ratio ${s.theory.worstSubset.ratio.toFixed(3)}`);
console.log(`Arrivals            : ${s.counts.arrivals}; completed within horizon ${s.exitedWithinHorizon}; unfinished ${s.unfinishedCount}`);
console.log(`Observed throughput : ${s.throughputPerHour.toFixed(2)} trucks/h; observed bay commitment ${pct(s.observedCommitment)}`);
console.log(`Max queues          : shared ${s.maxQueue}, gate ${s.maxHolding}`);
console.log(`Queue wait          : mean ${mins(s.timeMetrics.queueWait.mean)}, p90 ${mins(s.timeMetrics.queueWait.p90)}, max ${mins(s.timeMetrics.queueWait.max)}`);
console.log(`Facility time       : mean ${mins(s.timeMetrics.facilityTime.mean)}, p90 ${mins(s.timeMetrics.facilityTime.p90)}`);
console.log(`Volume loaded       : ${s.totalVolume.toLocaleString('en-US')} liters`);
console.log(`Little's Law        : L=${s.littles.L.toFixed(2)} vs λW=${(s.littles.lambdaW ?? 0).toFixed(2)} (${s.littles.diffPercent == null ? '—' : s.littles.diffPercent.toFixed(1) + '%'})`);
console.log(`Deadlock            : ${s.deadlock ? 'YES' : 'no'}; log hash ${s.logHash}`);

const csvDir = opt('csv');
if (csvDir) {
  fs.mkdirSync(csvDir, { recursive: true });
  fs.writeFileSync(path.join(csvDir, `${presetId}-trucks.csv`), truckLogCsv(engine));
  fs.writeFileSync(path.join(csvDir, `${presetId}-bays.csv`), bayStatsCsv(engine));
  fs.writeFileSync(path.join(csvDir, `${presetId}-series.csv`), seriesCsv(engine));
  fs.writeFileSync(path.join(csvDir, `${presetId}-summary.csv`), summaryCsv(s));
  console.log(`CSV written to ${csvDir}`);
}
