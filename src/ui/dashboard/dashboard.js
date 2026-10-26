import { el, panel, clear, kv, tile, table, downloadText } from '../dom.js';
import { ID, fmtNumber, fmtPercent, fmtLiter } from '../i18n/en.js';
import { formatDuration } from '../../sim/clock.js';
import { createLineChart, CHART_COLORS } from './charts.js';
import { truckLogCsv, bayStatsCsv, seriesCsv, summaryCsv } from '../../metrics/export.js';
import { PRODUCT_IDS } from '../../config/products.js';
import { BAY_STATE_STYLE, LOAD_STATUS_STYLE } from '../theme.js';
import { isLightColor } from '../dom.js';
const mnt = (s) => (s == null ? '—' : formatDuration(s));

// Dashboard kinerja: hitungan langsung, metrik waktu, utilisasi, teoretis vs teramati, Little's Law, grafik, ekspor.
export function createDashboard(container, app) {
  const p = panel(ID.panels.dashboard);
  container.append(p.root);
  const live = el('div', { class: 'stat-tiles' });
  const perProduct = el('div', { class: 'small' });
  const status = el('div', { class: 'status stable' });
  const theory = el('div');
  const timeTable = el('div');
  const ages = el('div', { class: 'small' });
  const util = el('div');
  const littles = el('div');
  const horizonNote = el('div', { class: 'small warn' });
  const unfinished = el('div', { class: 'small' });

  const chartDefs = [
    ['queue', ID.dash.chartQueue, CHART_COLORS.queue],
    ['holding', ID.dash.chartHolding, CHART_COLORS.holding],
    ['committedBays', ID.dash.chartCommitted, CHART_COLORS.committed],
    ['exited', ID.dash.chartExited, CHART_COLORS.exited],
  ];
  const charts = chartDefs.map(([key, label, color]) => {
    const c = el('canvas', { class: 'chart' });
    const chart = createLineChart(c, { color, formatX: (x) => `${fmtNumber(x / 3600, 0)} j`, formatY: (y) => fmtNumber(y, 0), horizonX: app.engine.horizon, stepped: key !== 'exited' });
    return { key, label, canvas: c, chart, wrap: el('div', {}, el('div', { class: 'small muted', text: label }), c) };
  });

  const exportRow = el('div', { class: 'row' },
    el('button', { class: 'small', text: ID.dash.exportTrucks, onClick: () => downloadText(`${app.presetId}-truck-log.csv`, truckLogCsv(app.engine)) }),
    el('button', { class: 'small', text: ID.dash.exportBays, onClick: () => downloadText(`${app.presetId}-bay-stats.csv`, bayStatsCsv(app.engine)) }),
    el('button', { class: 'small', text: ID.dash.exportSeries, onClick: () => downloadText(`${app.presetId}-time-series.csv`, seriesCsv(app.engine)) }),
    el('button', { class: 'small', text: ID.dash.exportSummary, onClick: () => downloadText(`${app.presetId}-summary.csv`, summaryCsv(app.engine.summary())) }),
  );

  p.body.append(
    horizonNote,
    el('h3', { text: ID.dash.live }), live, perProduct,
    el('h3', { text: ID.dash.theoryVsObserved }), status, theory,
    el('h3', { text: ID.dash.timeMetrics }), timeTable, el('p', { class: 'note', text: ID.dash.averagesNote }), ages,
    el('h3', { text: ID.dash.littles }), littles, el('p', { class: 'note', text: ID.dash.littlesNote }),
    el('h3', { text: ID.dash.utilization }), util,
    el('h3', { text: ID.dash.charts }), ...charts.map((c) => c.wrap),
    el('h3', { text: ID.dash.export }), exportRow,
    unfinished,
  );

  let lastTime = -1, lastEngine = null, lastSeriesLen = -1;
  return {
    update() {
      const e = app.engine;
      if (e === lastEngine && Math.abs(e.time - lastTime) < 1 && !app.forceDash) return;
      lastTime = e.time;
      app.forceDash = false;
      const c = e.liveCounts();
      const th = e.theory;
      const prods = e.config.products;
      if (lastEngine !== e) {
        charts.forEach((ch) => ch.chart.setHorizon(e.horizon));
        lastSeriesLen = -1;
      }
      lastEngine = e;

      clear(horizonNote);
      if (e.horizonReached) horizonNote.append(el('div', { class: 'notice', text: ID.run.horizonReached }));

      clear(live);
      live.append(
        tile(ID.dash.holding, `🚚 ${fmtNumber(c.holding)}`),
        tile(ID.dash.queue, fmtNumber(c.waiting), `${ID.dash.capacity}: ${c.effectiveCapacity}`),
        tile(ID.dash.reserved, fmtNumber(c.reserved), `${ID.dash.travelling}: ${c.travellingToBay}`),
        tile(ID.dash.availableBays, fmtNumber(c.availableBays), `${ID.dash.committedBays}: ${c.committedBays}`),
        tile(ID.dash.exited, fmtNumber(c.exited - c.exitedAfterHorizon), c.exitedAfterHorizon ? `+${c.exitedAfterHorizon} ${ID.dash.exitedAfter}` : ''),
        tile(ID.dash.totalVolume, fmtLiter(c.totalVolume)),
      );
      clear(perProduct);
      perProduct.append(
        el('div', { class: 'muted', text: ID.dash.queueByProduct + ' / ' + ID.dash.volumeByProduct }),
        el('div', { class: 'row' }, ...PRODUCT_IDS.map((pid) => el('span', { class: 'chip' + (isLightColor(prods[pid].color) ? ' light' : ''), style: { background: prods[pid].color } }, `${prods[pid].name}: ${fmtNumber(c.queueByProduct[pid] || 0)} · ${fmtLiter(c.volumeByProduct[pid] || 0)}`))),
        el('div', { class: 'note', text: ID.dash.volumeNote }),
      );

      status.className = `status ${th.status}`;
      status.textContent = `${LOAD_STATUS_STYLE[th.status].icon} ${ID.dash.status[th.status]} (ρ = ${fmtPercent(th.rho)})`;
      clear(theory);
      const obsC = e.observedCommitment();
      const hours = Math.min(e.time, e.horizon) / 3600;
      const thr = hours > 0 ? (c.exited - c.exitedAfterHorizon) / hours : null;
      const lt0 = e.collector.littlesLaw(e, e.time);
      const worstNames = th.worstSubset.products.map((pid) => prods[pid].name).join(' + ');
      const rows = [
        [ID.dash.rowCapacity, `μ = ${fmtNumber(th.mu, 2)}`, thr == null ? '—' : fmtNumber(thr, 2)],
        [ID.dash.rowUtilization, `ρ = ${fmtPercent(th.rho)}`, `${fmtPercent(obsC)} ${ID.dash.commitment.toLowerCase()}`],
        [ID.dash.rowArrival, fmtNumber(th.lambda, 1), `${fmtNumber(lt0.lambdaPerHour, 2)} ${ID.dash.admittedRate}`],
        [el('span', {}, ID.dash.rowWorstSubset, el('div', { class: 'small muted', text: worstNames })), fmtPercent(th.worstSubset.ratio), '—'],
        [ID.dash.rowStatus, el('span', { class: `pill ${{ stable: 'ok', nearCapacity: 'warn', overloaded: 'bad' }[th.status]}`, text: ID.dash.status[th.status].split(' —')[0] }), c.holding > 0 || c.waiting >= e.effectiveCapacity ? el('span', { class: 'pill bad', text: `${ID.dash.queue}: ${c.waiting} · ${ID.dash.holding}: ${c.holding}` }) : el('span', { class: 'pill ok', text: `${ID.dash.queue}: ${c.waiting}` })],
      ];
      if (e.config.operations.hourlyProfileEnabled) rows.push([ID.dash.rowPeak, `ρ = ${fmtPercent(th.rhoPeak)}`, '—']);
      const tbl = table([ID.dash.colMetric, ID.dash.colTheory, ID.dash.colObserved], rows, [1, 2]);
      tbl.querySelectorAll('td, th').forEach((cell) => (cell.style.whiteSpace = 'normal'));
      theory.append(tbl, el('div', { class: 'small ' + (th.productMixBinding ? 'warn' : 'muted'), style: { marginTop: '6px' }, text: th.productMixBinding ? ID.dash.mixBinding : ID.dash.mixNotBinding }), el('p', { class: 'note', text: ID.dash.observedNote }));

      const tm = e.collector.timeMetrics(e, { withinHorizon: !app.includeAfterHorizon });
      clear(timeTable);
      const row = (label, s) => [label, fmtNumber(s.n), mnt(s.mean), mnt(s.p90), mnt(s.max)];
      timeTable.append(table([ID.dash.metric, ID.dash.n, ID.dash.mean, ID.dash.p90, ID.dash.max], [row(ID.dash.queueWait, tm.queueWait), row(ID.dash.entranceHolding, tm.entranceHolding), row(ID.dash.facilityTime, tm.facilityTime), row(ID.dash.systemTime, tm.systemTime)], [1, 2, 3, 4]));
      clear(ages);
      const wa = e.collector.waitingAges(e, e.time);
      ages.append(el('div', { class: 'muted', text: `${ID.dash.waitingAges} (${wa.length})` }), el('div', { class: 'row' }, ...wa.slice(0, 12).map((a) => el('span', { class: 'badge', text: `${a.label} ${formatDuration(a.age)}${a.protected ? ' 🛡' : ''}` }))));

      const lt = e.collector.littlesLaw(e, e.time);
      clear(littles);
      littles.append(kv([[ID.dash.littlesL, fmtNumber(lt.L, 2)], [ID.dash.littlesLambdaW, lt.lambdaW == null ? '—' : fmtNumber(lt.lambdaW, 2)], [ID.dash.littlesDiff, lt.diffPercent == null ? '—' : fmtPercent(lt.diffPercent / 100, 1)]]));

      clear(util);
      util.append(table([ID.dash.bay, ID.bay.status, ID.dash.services, ID.dash.loadingUtil, ID.dash.commitment], e.bayStats().map((b) => [
        String(b.bay).padStart(2, '0'),
        el('span', {}, el('span', { class: `dot ${BAY_STATE_STYLE[b.state].shape}`, style: { background: BAY_STATE_STYLE[b.state].color, color: BAY_STATE_STYLE[b.state].color, marginRight: '4px' } }), `${ID.bay.icons[b.state]} ${ID.bay.states[b.state]}`),
        fmtNumber(b.serviceCount), fmtPercent(b.loadingUtilization), fmtPercent(b.commitment),
      ]), [2, 3, 4]));

      const series = e.collector.series;
      if (series.length !== lastSeriesLen) {
        lastSeriesLen = series.length;
        for (const ch of charts) ch.chart.update(series.map((s) => ({ x: s.t, y: s[ch.key] })));
      }
      clear(unfinished);
      if (e.horizonReached) unfinished.append(el('div', {}, el('b', { text: `${ID.dash.unfinished}: ${fmtNumber(e.trucks.size)}` }), ` — ${ID.dash.unfinishedNote}`));
    },
  };
}
