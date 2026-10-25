import { el, clear } from '../dom.js';
import { ID, fmtNumber } from '../i18n/id.js';
import { formatDuration } from '../../sim/clock.js';
import { BAY_STATE_STYLE } from '../theme.js';
import { TRUCK_STATES } from '../../sim/models/truck.js';

const bayPill = { available: 'ok', reserved: 'info', prep: 'info', loading: 'info', completion: 'info', clearing: 'neutral', inactive: 'neutral', pendingDeactivation: 'warn' };
const truckPill = { holding: 'warn', toStall: 'info', waiting: 'neutral', toBay: 'info', prep: 'info', loading: 'info', completion: 'info', clearing: 'neutral', toExit: 'neutral' };

// Daftar bertab kanan bawah: Bay / Truk / Stall dengan pil status, bar kemajuan dan ETA; klik memilih objek.
export function createListTabs(container, app) {
  container.classList.add('card');
  let tab = 'trucks';
  const tabBtns = {};
  const tabs = el('div', { class: 'tabs' });
  for (const k of ['bays', 'trucks', 'stalls']) {
    tabBtns[k] = el('button', { onClick: () => { tab = k; lastKey = ''; } }, ID.tower.tabs[k], el('span', { class: 'n' }));
    tabs.append(tabBtns[k]);
  }
  tabs.append(el('span', { class: 'site', text: 'ITJ Plumpang' }));
  const rows = el('div', { class: 'rows' });
  container.append(tabs, rows);
  let lastKey = '';

  function truckRows() {
    const e = app.engine;
    const trucks = [...e.trucks.values()].filter((t) => t.state !== TRUCK_STATES.EXITED).sort((a, b) => (a.state === 'loading' ? -1 : 0) - (b.state === 'loading' ? -1 : 0) || a.id - b.id).slice(0, 40);
    return trucks.map((tr) => {
      const pr = e.config.products[tr.product];
      const frac = tr.requestedVolume ? tr.loadedVolume / tr.requestedVolume : 0;
      const where = tr.bay ? `Bay ${String(tr.bay).padStart(2, '0')}` : tr.stall != null ? `Stall ${tr.stall + 1}` : tr.state === 'holding' ? ID.labels.gateIn : ID.labels.gateOut;
      const eta = tr.state === 'loading' && tr.snapshot ? formatDuration(Math.max(0, tr.timestamps.loadingStart + tr.snapshot.loadSec - e.time)) : tr.state === 'waiting' && tr.timestamps.queueEntry != null ? formatDuration(e.time - tr.timestamps.queueEntry) : '';
      return el('div', { class: 'r' + (app.selection?.type === 'truck' && app.selection.id === tr.id ? ' sel' : ''), onClick: () => app.select({ type: 'truck', id: tr.id }) },
        el('div', {}, el('strong', { text: tr.label }), el('small', { text: pr.name })),
        el('div', { class: 'sub' }, el('span', { class: 'sw', style: { background: pr.color } }), where),
        el('div', {}, el('span', { class: `pill ${truckPill[tr.state] || 'neutral'}`, text: ID.truck.states[tr.state] }), tr.state === 'loading' ? el('div', { class: 'bar' }, el('div', { style: { width: `${frac * 100}%` } })) : null),
        el('div', { class: 'num', text: eta }),
        el('div', { class: 'chev', text: '›' }));
    });
  }
  function bayRows() {
    const e = app.engine;
    const stats = e.bayStats();
    return e.bays.map((b) => {
      const st = stats[b.number - 1];
      const truck = b.truckId ? e.trucks.get(b.truckId) : null;
      const frac = truck && truck.requestedVolume ? truck.loadedVolume / truck.requestedVolume : 0;
      const style = BAY_STATE_STYLE[b.displayState];
      return el('div', { class: 'r' + (app.selection?.type === 'bay' && app.selection.number === b.number ? ' sel' : ''), onClick: () => app.select({ type: 'bay', number: b.number }) },
        el('div', {}, el('strong', { text: `Bay ${String(b.number).padStart(2, '0')}` }), el('small', { text: b.products.map((p) => e.config.products[p].name).join(' · ') })),
        el('div', { class: 'sub' }, el('span', { class: 'sw', style: { background: style.color } }), truck ? truck.label : ID.bay.none),
        el('div', {}, el('span', { class: `pill ${bayPill[b.displayState]}`, text: `${style.icon} ${ID.bay.states[b.displayState]}` }), b.state === 'loading' ? el('div', { class: 'bar' }, el('div', { style: { width: `${frac * 100}%` } })) : null),
        el('div', { class: 'num', text: `${fmtNumber(st.serviceCount)}×` }),
        el('div', { class: 'chev', text: '›' }));
    });
  }
  function stallRows() {
    const e = app.engine;
    return [...e.stalls].reverse().map((st) => {
      const truck = st.truckId ? e.trucks.get(st.truckId) : null;
      return el('div', { class: 'r' + (app.selection?.type === 'stall' && app.selection.index === st.index ? ' sel' : ''), onClick: () => app.select({ type: 'stall', index: st.index }) },
        el('div', {}, el('strong', { text: `Stall ${st.number}` }), el('small', { text: st.feasible ? ID.geometry.feasible : ID.geometry.infeasible })),
        el('div', { class: 'sub' }, el('span', { class: 'sw', style: { background: truck ? '#0067B3' : '#A3C93A' } }), truck ? truck.label : ID.tower.stallFree),
        el('div', {}, el('span', { class: `pill ${truck ? 'info' : 'ok'}`, text: truck ? (truck.state === 'toBay' ? ID.truck.states.toBay : ID.truck.states.waiting) : ID.tower.stallFree })),
        el('div', { class: 'num', text: truck && truck.timestamps.queueEntry != null ? formatDuration(e.time - truck.timestamps.queueEntry) : '' }),
        el('div', { class: 'chev', text: '›' }));
    });
  }

  return {
    update() {
      const e = app.engine;
      const c = e.liveCounts();
      tabBtns.bays.querySelector('.n').textContent = `${c.committedBays}/${e.bays.filter((b) => b.isActive).length}`;
      tabBtns.trucks.querySelector('.n').textContent = String(c.inSystem);
      tabBtns.stalls.querySelector('.n').textContent = `${e.stalls.filter((s) => s.truckId != null).length}/${e.effectiveCapacity}`;
      for (const k of Object.keys(tabBtns)) tabBtns[k].classList.toggle('active', k === tab);
      const key = `${tab}|${Math.round(e.time / 3)}|${JSON.stringify(app.selection)}|${c.inSystem}|${c.committedBays}`;
      if (key === lastKey) return;
      lastKey = key;
      clear(rows);
      rows.append(...(tab === 'trucks' ? truckRows() : tab === 'bays' ? bayRows() : stallRows()));
    },
  };
}
