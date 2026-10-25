import { el } from '../dom.js';
import { ID, t, fmtNumber, fmtPercent } from '../i18n/en.js';
import { formatDuration } from '../../sim/clock.js';

// Kartu KPI melayang di kiri atas: truk di terminal, bay berkomitmen, throughput, utilisasi teoretis.
export function createKpiCards(container, app) {
  const make = (icon) => {
    const v = el('span'), delta = el('span', { class: 'delta' }), l = el('div', { class: 'l' }), s = el('div', { class: 's' });
    const card = el('div', { class: 'card kpi' }, el('div', { class: 'ico', text: icon }), el('div', {}, l, el('div', { class: 'v' }, v, delta), s));
    container.append(card);
    return { v, delta, l, s, card };
  };
  const k1 = make('🚚'), k2 = make('⛽'), k3 = make('↗'), k4 = make('◔');
  let lastExited = 0, lastT = 0, deltaExited = 0;
  return {
    update() {
      const e = app.engine;
      const c = e.liveCounts();
      const th = e.theory;
      const tm = e.collector.timeMetrics(e, { withinHorizon: false });
      k1.l.textContent = ID.tower.kpi.inTerminal;
      k1.v.textContent = fmtNumber(c.inFacility);
      k1.delta.textContent = c.holding ? `+${c.holding}` : '';
      k1.delta.className = 'delta' + (c.holding ? ' bad' : '');
      k1.delta.hidden = !c.holding;
      k1.s.textContent = t('tower.kpi.inTerminalSub', { waiting: c.waiting, gate: c.holding });
      const active = e.bays.filter((b) => b.isActive).length;
      k2.l.textContent = ID.tower.kpi.bays;
      k2.v.textContent = `${c.committedBays} / ${active}`;
      k2.delta.hidden = true;
      k2.s.textContent = t('tower.kpi.baysSub', { active, avail: c.availableBays });
      const hours = Math.max(e.time, 1) / 3600;
      const thr = (c.exited - c.exitedAfterHorizon) / Math.min(hours, e.horizon / 3600);
      if (e.time - lastT > 600) {
        deltaExited = c.exited - lastExited;
        lastExited = c.exited;
        lastT = e.time;
      }
      k3.l.textContent = ID.tower.kpi.throughput;
      k3.v.textContent = e.time > 600 ? fmtNumber(thr, 1) : '—';
      k3.delta.textContent = deltaExited ? `+${deltaExited}` : '';
      k3.delta.hidden = !deltaExited;
      k3.delta.className = 'delta';
      k3.s.textContent = t('tower.kpi.throughputSub', { lambda: fmtNumber(th.lambda, 0) });
      k4.l.textContent = ID.tower.kpi.rho;
      k4.v.textContent = fmtPercent(th.rho, 1);
      k4.delta.textContent = ID.dash.status[th.status].split(' —')[0];
      k4.delta.className = 'delta' + (th.status === 'overloaded' ? ' bad' : '');
      k4.delta.hidden = false;
      k4.s.textContent = tm.queueWait.n ? `${ID.tower.kpi.wait} ${formatDuration(tm.queueWait.mean)}` : t('tower.kpi.rhoSub', { mu: fmtNumber(th.mu, 1) });
    },
  };
}
