import { el, panel, clear, table, downloadText, toast } from '../dom.js';
import { ID, fmtNumber, fmtPercent } from '../i18n/en.js';
import { comparisonCsv } from '../../metrics/export.js';
import { formatDuration } from '../../sim/clock.js';

// Tabel perbandingan hingga enam run tersimpan (konfigurasi, seed, kapasitas, rho, antrean, waktu tunggu, volume, bay).
export function createComparePanel(container, app) {
  const p = panel(ID.panels.compare, { collapsed: true });
  container.append(p.root);
  const tbl = el('div', { style: { overflowX: 'auto' } });
  p.body.append(
    el('p', { class: 'note', text: ID.compare.fairNote }),
    el('div', { class: 'row' },
      el('button', { class: 'small primary', text: ID.compare.store, onClick: () => app.storeRun() }),
      el('button', { class: 'small', text: ID.compare.export, onClick: () => (app.storedRuns.length ? downloadText('compare-scenarios.csv', comparisonCsv(app.storedRuns)) : toast(ID.compare.empty)) }),
      el('button', { class: 'small', text: ID.compare.clear, onClick: () => app.clearRuns() }),
    ),
    el('p', { class: 'note', text: ID.compare.maxNote }),
    tbl,
  );
  let lastN = -1;
  return {
    update() {
      if (app.storedRuns.length === lastN) return;
      lastN = app.storedRuns.length;
      clear(tbl);
      if (!app.storedRuns.length) return tbl.append(el('div', { class: 'muted small', text: ID.compare.empty }));
      const C = ID.compare.cols;
      const runs = app.storedRuns.slice(-6);
      const rows = [
        [C.preset, ...runs.map((r) => ID.presets[r.presetId] || r.presetId)],
        [C.seed, ...runs.map((r) => r.seed)],
        [C.capacity, ...runs.map((r) => r.effectiveCapacity)],
        [C.rho, ...runs.map((r) => fmtPercent(r.theory.rho))],
        [C.maxQueue, ...runs.map((r) => r.maxQueue)],
        [C.maxHolding, ...runs.map((r) => r.maxHolding)],
        [C.waitMean, ...runs.map((r) => formatDuration(r.timeMetrics.queueWait.mean))],
        [C.waitP90, ...runs.map((r) => formatDuration(r.timeMetrics.queueWait.p90))],
        [C.waitMax, ...runs.map((r) => formatDuration(r.timeMetrics.queueWait.max))],
        [C.exited, ...runs.map((r) => r.exitedWithinHorizon)],
        [C.unfinished, ...runs.map((r) => r.unfinishedCount)],
        [C.volume, ...runs.map((r) => fmtNumber(r.totalVolume))],
        [C.commitment, ...runs.map((r) => fmtPercent(r.observedCommitment))],
      ];
      tbl.append(table(['', ...runs.map((_, i) => `Run ${i + 1}`)], rows));
    },
  };
}
