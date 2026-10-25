import { el, clear } from '../dom.js';
import { ID, fmtLiter } from '../i18n/en.js';
import { formatSimTime, formatDuration } from '../../sim/clock.js';
import { TRUCK_STATES } from '../../sim/models/truck.js';

// Kartu perjalanan truk (kiri bawah): stepper dengan stempel waktu nyata + kartu mini truk.
export function createJourneyCard(container, app) {
  container.classList.add('card');
  let lastKey = '';
  const stepKeys = ['arrival', 'facilityEntry', 'queueEntry', 'dispatch', 'bayArrival', 'loadingStart', 'bayClear'];
  return {
    update() {
      const e = app.engine;
      let tr = app.selection?.type === 'truck' ? e.trucks.get(app.selection.id) : null;
      if (!tr) tr = app.lastTracked ? e.trucks.get(app.lastTracked) : null;
      if (!tr) {
        // truk paling maju yang masih di sistem
        const order = Object.fromEntries(Object.values(TRUCK_STATES).map((s, i) => [s, i]));
        tr = [...e.trucks.values()].filter((t) => t.spawned).sort((a, b) => order[b.state] - order[a.state])[0] || null;
      }
      if (tr) app.lastTracked = tr.id;
      const key = tr ? `${tr.id}|${tr.state}|${Math.round(tr.loadedVolume / 500)}` : 'none';
      if (key === lastKey) return;
      lastKey = key;
      clear(container);
      const head = el('div', { class: 'jhead' }, el('span', { class: 'ico', text: '🧭' }), el('strong', { text: ID.tower.journey }), el('span', { class: 'who', text: tr ? `${tr.label} · ${e.config.products[tr.product].name}` : '' }));
      container.append(head);
      if (!tr) return container.append(el('div', { class: 'small muted', text: ID.tower.journeyNone }));
      const cal = e.config.operations.calendar;
      let now = 0;
      stepKeys.forEach((k, i) => { if (tr.timestamps[k] != null) now = i; });
      const steps = el('div', { class: 'steps' }, ...ID.tower.journeySteps.map((name, i) => {
        const ts = tr.timestamps[stepKeys[i]];
        const cls = i < now ? 'done' : i === now ? 'now' : '';
        return el('div', { class: `step ${cls}` }, el('i', { text: i < now ? '✓' : '' }), el('div', { class: 'n', text: name }), el('div', { class: 't', text: ts != null ? formatSimTime(ts, cal).replace(/Day \d, /, '').replace(' WIB', '') : i === now + 1 && tr.state === TRUCK_STATES.LOADING && tr.snapshot ? `~${formatDuration(Math.max(0, tr.timestamps.loadingStart + tr.snapshot.loadSec - e.time))}` : '' }));
      }));
      const mini = el('div', { class: 'mini', onClick: () => app.select({ type: 'truck', id: tr.id }) }, el('span', { class: 'ico', text: '🚚' }), el('div', {}, el('strong', { text: `#${String(tr.id).padStart(4, '0')} · ${tr.label}` }), el('small', { text: `${e.config.products[tr.product].name} · ${fmtLiter(tr.requestedVolume)}` })), el('div', { class: 'right' }, el('span', { class: 'pill info', text: ID.truck.states[tr.state] }), el('small', { text: tr.bay ? `Bay ${String(tr.bay).padStart(2, '0')}` : tr.stall != null ? `Stall ${tr.stall + 1}` : '' })));
      container.append(steps, mini);
    },
  };
}
