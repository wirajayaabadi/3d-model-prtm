import { el, panel, clear, kv, isLightColor } from '../dom.js';
import { ID, fmtNumber, fmtPercent, fmtLiter } from '../i18n/id.js';
import { formatDuration } from '../../sim/clock.js';
import { TRUCK_STATES } from '../../sim/models/truck.js';

// Inspeksi bay/truk terpilih dan tombol kamera.
export function createInspectPanel(container, app) {
  const insp = panel(ID.panels.inspect);
  const body = el('div');
  insp.body.append(body);
  container.append(insp.root);
  let lastKey = '';

  return {
    update() {
      const sel = app.selection;
      const e = app.engine;
      let key = 'none';
      if (sel?.type === 'bay') {
        const b = e.bays[sel.number - 1];
        const st = e.bayStats()[sel.number - 1];
        const truck = b.truckId ? e.trucks.get(b.truckId) : null;
        key = `bay${b.number}|${b.displayState}|${b.truckId}|${Math.round((truck?.loadedVolume || 0) / 500)}|${st.serviceCount}|${Math.round((st.commitment || 0) * 100)}|${Math.round((st.loadingUtilization || 0) * 100)}`;
        if (key !== lastKey) {
          clear(body);
          const prods = b.products.map((pid) => el('span', { class: 'chip' + (isLightColor(e.config.products[pid].color) ? ' light' : ''), style: { background: e.config.products[pid].color } }, e.config.products[pid].name));
          body.append(
            el('div', { class: 'row between' }, el('b', { text: `Bay ${String(b.number).padStart(2, '0')}` }), el('span', { class: 'badge', text: `${ID.bay.icons[b.displayState]} ${ID.bay.states[b.displayState]}` })),
            el('div', { class: 'row' }, ...prods),
            kv([
              [ID.bay.assignedTruck, truck ? truck.label : ID.bay.none],
              [ID.bay.completed, fmtNumber(st.serviceCount)],
              [ID.bay.loadingUtil, fmtPercent(st.loadingUtilization)],
              [ID.bay.commitment, fmtPercent(st.commitment)],
            ]),
          );
          if (truck) {
            const frac = truck.requestedVolume ? truck.loadedVolume / truck.requestedVolume : 0;
            body.append(el('div', { class: 'small muted', text: `${ID.bay.loadingProgress}: ${fmtLiter(Math.round(truck.loadedVolume))} / ${fmtLiter(truck.requestedVolume)}` }), el('div', { class: 'bar' }, el('div', { style: { width: `${frac * 100}%` } })));
          }
        }
      } else if (sel?.type === 'truck') {
        const tr = e.trucks.get(sel.id);
        if (!tr) {
          key = 'gone';
          if (key !== lastKey) {
            clear(body);
            body.append(el('div', { class: 'muted', text: `${sel.label || ''} ${ID.truck.states.exited}` }));
          }
        } else {
          const wait = tr.timestamps.dispatch != null ? tr.timestamps.dispatch - tr.timestamps.queueEntry : tr.timestamps.queueEntry != null ? e.time - tr.timestamps.queueEntry : null;
          key = `tr${tr.id}|${tr.state}|${Math.round(tr.loadedVolume / 400)}|${Math.round((wait || 0) / 5)}|${tr.bay}|${tr.protected}`;
          if (key !== lastKey) {
            clear(body);
            const pr = e.config.products[tr.product];
            body.append(
              el('div', { class: 'row between' }, el('b', { text: tr.label }), el('span', { class: 'chip' + (isLightColor(pr.color) ? ' light' : ''), style: { background: pr.color } }, pr.name), el('span', { class: 'badge', text: ID.truck.states[tr.state] })),
              kv([
                [ID.truck.requested, fmtLiter(tr.requestedVolume)],
                [ID.truck.loaded, fmtLiter(Math.round(tr.loadedVolume))],
                [tr.state === TRUCK_STATES.WAITING ? ID.truck.waitingAge : ID.truck.waiting, wait == null ? '—' : formatDuration(wait)],
                [ID.truck.bay, tr.bay ? `Bay ${String(tr.bay).padStart(2, '0')}` : '—'],
                [ID.truck.stall, tr.stall != null ? String(tr.stall + 1) : '—'],
                [ID.truck.protected, tr.protected ? ID.common.yes : ID.common.no],
                [ID.truck.passed, fmtNumber(tr.passedCount)],
              ]),
              el('div', { class: 'bar' }, el('div', { style: { width: `${(tr.loadedVolume / tr.requestedVolume) * 100}%` } })),
              el('button', { class: 'small', text: ID.truck.follow, onClick: () => app.setMode('oneTruck') }),
            );
          }
        }
      } else if (key !== lastKey) {
        clear(body);
        body.append(el('div', { class: 'muted', text: ID.truck.none }));
      }
      lastKey = key;
    },
  };
}
