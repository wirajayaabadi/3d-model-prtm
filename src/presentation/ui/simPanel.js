// Panel simulasi di dalam kartu bab 5: ubin angka hidup dari engine dan tabel perbandingan tiga preset
// (teori vs pengamatan 6 jam yang dihitung di latar belakang).
import { el, clear } from '../../ui/dom.js';
import { formatDuration, formatSimTime } from '../../sim/clock.js';
import { LOAD_STATUS_STYLE } from '../../ui/theme.js';

const fmt = (lang) => (n, d = 1) => (n == null || Number.isNaN(n) ? '—' : new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n));

export function createSimPanel({ content, mode, lang, getEngine, getRuns }) {
  const ui = content.sim;
  const f = fmt(lang);
  const root = el('div', { class: 'simpanel' });
  root.append(el('div', { class: 'sp-head' }, el('span', { class: 'live-dot' }), el('span', { text: ui.live }), el('span', { class: 'pill warn', text: content.ui.hypothetical })));
  const tiles = {};
  const tileKeys = ['inTerminal', 'committed', 'lambda', 'mu', 'rho', 'wait'];
  const grid = el('div', { class: 'tiles' });
  for (const k of tileKeys) {
    const v = el('div', { class: 'v' }), s = el('div', { class: 's' });
    tiles[k] = { v, s, root: el('div', { class: 'tile' }, el('div', { class: 'l', text: ui.tiles[k] }), v, s) };
    grid.append(tiles[k].root);
  }
  root.append(grid);
  const formula = el('div', { class: 'formula' });
  root.append(formula);
  let table = null, body = null;
  if (mode === 'compare') {
    root.append(el('div', { class: 'sp-sub', text: ui.compare }));
    table = el('table', { class: 'cmp' }, el('thead', {}, el('tr', {}, ...ui.cols.map((c, i) => el('th', { class: i ? 'num' : '', text: c })))));
    body = el('tbody');
    table.append(body);
    root.append(table);
  }
  let lastAt = 0;
  return {
    root,
    update(force = false) {
      const now = performance.now();
      if (!force && now - lastAt < 250) return;
      lastAt = now;
      const e = getEngine();
      if (!e) return;
      const c = e.liveCounts();
      const th = e.theory;
      const tm = e.collector.timeMetrics(e, { withinHorizon: false });
      const active = e.bays.filter((b) => b.isActive).length;
      tiles.inTerminal.v.textContent = String(c.inFacility);
      tiles.inTerminal.s.textContent = `${ui.tiles.waiting} ${c.waiting}${c.holding ? ` · +${c.holding}` : ''}`;
      tiles.committed.v.textContent = `${c.committedBays} / ${active}`;
      tiles.committed.s.textContent = formatSimTime(e.time, e.config.operations.calendar);
      tiles.lambda.v.textContent = f(th.lambda, 0);
      tiles.lambda.s.textContent = ui.perHour;
      tiles.mu.v.textContent = f(th.mu, 1);
      tiles.mu.s.textContent = ui.perHour;
      tiles.rho.v.textContent = f(th.rho, 2);
      const st = LOAD_STATUS_STYLE[th.status] || LOAD_STATUS_STYLE.stable;
      tiles.rho.s.textContent = ui.status[th.status] || th.status;
      tiles.rho.s.style.color = st.text;
      tiles.rho.root.style.borderColor = st.color;
      tiles.wait.v.textContent = tm.queueWait.n ? formatDuration(tm.queueWait.mean) : '—';
      tiles.wait.s.textContent = tm.queueWait.n ? `P90 ${formatDuration(tm.queueWait.p90)}` : '';
      const ws = th.worstSubset;
      formula.textContent = `${ui.formula} = ${f(th.lambda, 0)} ÷ ${f(th.mu, 1)} = ${f(th.rho, 2)}` + (ws && ws.products?.length < Object.keys(e.config.products).length ? ` · ${ui.tightest}: ${ws.products.map((p) => e.config.products[p]?.name || p).join(' + ')} ρ ${f(ws.ratio, 2)}` : '');
      if (body) {
        clear(body);
        const runs = getRuns();
        for (const id of ['baseline', 'arrivalPlus50', 'turboShift']) {
          const r = runs[id];
          const stt = r?.theory ? LOAD_STATUS_STYLE[r.theory.status] : null;
          body.append(el('tr', {},
            el('td', {}, el('span', { class: 'sw', style: stt ? { background: stt.color } : {} }), ui.presets[id]),
            el('td', { class: 'num', text: r?.theory ? f(r.theory.mu, 1) : '…' }),
            el('td', { class: 'num', text: r?.theory ? f(r.theory.rho, 2) : '…' }),
            el('td', { class: 'num', text: r?.summary ? f(r.summary.throughputPerHour, 1) : r ? `${Math.round((r.progress || 0) * 100)}%` : ui.computing }),
            el('td', { class: 'num', text: r?.summary?.timeMetrics?.queueWait?.n ? formatDuration(r.summary.timeMetrics.queueWait.mean) : r?.summary ? '—' : '…' }),
            el('td', { class: 'num', text: r?.summary ? String(r.summary.maxQueue) : '…' }),
          ));
        }
      }
    },
  };
}
