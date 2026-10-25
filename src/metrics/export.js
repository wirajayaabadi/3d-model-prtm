// Ekspor CSV: log truk, statistik per bay, deret waktu, ringkasan run dan tabel perbandingan.
function csvEscape(v) {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const cols = columns || (rows.length ? Object.keys(rows[0]) : []);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c])).join(','));
  return lines.join('\n');
}

export function truckLogCsv(engine) {
  const rows = [...engine.collector.truckLog, ...[...engine.trucks.values()].map((t) => engine.collector.record(t, engine.time, 'unfinished'))];
  const cols = [
    'id', 'label', 'product', 'status', 'afterHorizon', 'requestedVolume', 'loadedVolume', 'bay', 'stall',
    'arrival', 'facilityEntry', 'queueEntry', 'dispatch', 'bayArrival', 'loadingStart', 'loadingEnd', 'bayClear', 'exit',
    'entranceHolding', 'queueWait', 'facilityTime', 'systemTime', 'passedCount', 'protected',
  ];
  return toCsv(rows, cols);
}

export function bayStatsCsv(engine) {
  const rows = engine.bayStats().map((b) => ({
    bay: b.bay,
    state: b.state,
    active: b.active,
    products: b.products.join('|'),
    serviceCount: b.serviceCount,
    activeTimeSec: +b.activeTime.toFixed(1),
    loadingUtilization: b.loadingUtilization == null ? '' : +b.loadingUtilization.toFixed(4),
    commitment: b.commitment == null ? '' : +b.commitment.toFixed(4),
    committedTotalSec: +b.committedTotal.toFixed(1),
    theoreticalTCommitMin: +engine.theory.perBay[b.bay - 1].tCommitMin.toFixed(2),
    theoreticalMuPerHour: +engine.theory.perBay[b.bay - 1].mu.toFixed(3),
  }));
  return toCsv(rows);
}

export function seriesCsv(engine) {
  return toCsv(engine.collector.series.map((s) => ({ ...s, tMin: +(s.t / 60).toFixed(2) })));
}

export function summaryRows(summary) {
  const tm = summary.timeMetrics;
  const f = (x, d = 1) => (x == null ? '' : +(+x).toFixed(d));
  return {
    preset: summary.presetId,
    seed: summary.seed,
    simTimeHours: f(summary.time / 3600, 2),
    horizonReached: summary.horizonReached,
    effectiveCapacity: summary.effectiveCapacity,
    theoreticalCapacityPerHour: f(summary.theory.mu, 3),
    theoreticalRho: f(summary.theory.rho, 3),
    worstSubset: summary.theory.worstSubset.products.join('|'),
    worstSubsetRatio: f(summary.theory.worstSubset.ratio, 3),
    arrivals: summary.counts.arrivals,
    exitedWithinHorizon: summary.exitedWithinHorizon,
    unfinished: summary.unfinishedCount,
    throughputPerHour: f(summary.throughputPerHour, 2),
    observedCommitment: f(summary.observedCommitment, 3),
    maxQueue: summary.maxQueue,
    maxHolding: summary.maxHolding,
    queueWaitMeanMin: f(tm.queueWait.mean / 60),
    queueWaitP90Min: f(tm.queueWait.p90 / 60),
    queueWaitMaxMin: f(tm.queueWait.max / 60),
    facilityTimeMeanMin: f(tm.facilityTime.mean / 60),
    facilityTimeP90Min: f(tm.facilityTime.p90 / 60),
    systemTimeMeanMin: f(tm.systemTime.mean / 60),
    totalVolumeL: summary.totalVolume,
    littlesL: f(summary.littles.L, 2),
    littlesLambdaW: f(summary.littles.lambdaW, 2),
    littlesDiffPercent: f(summary.littles.diffPercent, 1),
    deadlock: !!summary.deadlock,
    arrivalRatePerHour: summary.config.operations.arrivalRatePerHour,
    loadingRateLpm: summary.config.operations.loadingRateLpm,
    requestedVolumeL: summary.config.operations.requestedVolumeL,
    prepMinutes: summary.config.operations.prepMinutes,
    completionMinutes: summary.config.operations.completionMinutes,
    activeBays: summary.config.bays.filter((b) => b.active).map((b) => b.number).join('|'),
    demandShares: Object.entries(summary.config.operations.demandShares).map(([k, v]) => `${k}:${(v * 100).toFixed(1)}%`).join('|'),
    logHash: summary.logHash,
  };
}

export function summaryCsv(summary) {
  const row = summaryRows(summary);
  return toCsv(Object.entries(row).map(([k, v]) => ({ parameter: k, value: v })), ['parameter', 'value']);
}

export function comparisonCsv(summaries) {
  return toCsv(summaries.map(summaryRows));
}
