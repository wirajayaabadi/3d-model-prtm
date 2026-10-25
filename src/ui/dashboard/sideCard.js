import { el, clear, isLightColor } from '../dom.js';
import { ID, t, fmtNumber, fmtPercent, fmtLiter } from '../i18n/id.js';
import { formatDuration } from '../../sim/clock.js';
import { PRODUCT_IDS } from '../../config/products.js';
import { BAY_STATE_STYLE, LOAD_STATUS_STYLE } from '../theme.js';
import { TRUCK_STATES } from '../../sim/models/truck.js';

const pillClass = { stable: 'ok', nearCapacity: 'warn', overloaded: 'bad' };
const bayPill = { available: 'ok', reserved: 'info', prep: 'info', loading: 'info', completion: 'info', clearing: 'neutral', inactive: 'neutral', pendingDeactivation: 'warn' };
const truckPill = { holding: 'warn', toStall: 'info', waiting: 'neutral', toBay: 'info', prep: 'info', loading: 'info', completion: 'info', clearing: 'neutral', toExit: 'neutral', exited: 'ok' };

// Kartu kanan: kartu terminal (default) atau kartu detail truk/bay/stall sesuai pilihan.
export function createSideCard(container, app) {
  container.classList.add('card');
  let lastKey = '';
  const metric = (label, value, small, frac, cls = '') => el('div', { class: 'metric' }, el('div', { class: 'l', text: label }), el('div', { class: 'v' }, value, small ? el('small', { text: ' ' + small }) : null), el('div', { class: 'bar ' + cls }, el('div', { style: { width: `${Math.max(0, Math.min(100, (frac || 0) * 100))}%` } })));
  const kv = (pairs) => pairs.map(([k, v]) => el('div', { class: 'kv' }, el('div', { class: 'k', text: k }), el('div', { class: 'v' }, v)));

  function terminalCard() {
    const e = app.engine;
    const c = e.liveCounts();
    const th = e.theory;
    const prods = e.config.products;
    const statusPill = el('span', { class: `pill ${pillClass[th.status]}` }, el('i', { class: 'dot' }), ID.dash.status[th.status].split(' —')[0]);
    const obs = e.observedCommitment();
    const stallsUsed = e.stalls.filter((s) => s.truckId != null).length;
    const hours = Math.min(Math.max(e.time, 1), e.horizon) / 3600;
    const items = PRODUCT_IDS.map((pid) => {
      const nBays = e.bays.filter((b) => b.isActive && b.products.includes(pid)).length;
      const q = c.queueByProduct[pid] || 0;
      return el('div', { class: 'item', onClick: () => app.search(prods[pid].name) }, el('span', { class: 'sw', style: { background: prods[pid].color } }), el('span', {}, el('b', { text: prods[pid].name }), el('div', { class: 'small muted', text: `${fmtLiter(c.volumeByProduct[pid] || 0)} · ${t('tower.productAvail', { n: nBays })}` })), el('span', { class: 'n', text: fmtPercent(e.config.operations.demandShares[pid], 0) }), el('span', { class: `pill ${q > 2 ? 'warn' : q ? 'info' : 'ok'}`, text: q ? t('tower.productQueue', { n: q }) : ID.bay.states.available }));
    });
    const busy = e.bays.find((b) => b.state === 'loading') || e.bays.find((b) => b.committed);
    return [
      el('div', { class: 'head' }, el('div', { class: 'ico', text: '🏭' }), el('div', { class: 't' }, el('div', { class: 'caption', text: ID.tower.terminal }), el('strong', { text: ID.app.appName || 'ITJ Plumpang' }), el('div', { class: 'sub', text: t('tower.terminalSub', { w: fmtNumber(e.layout.plot.width), l: fmtNumber(e.layout.plot.length) }) })), el('div', { class: 'acts' }, el('button', { title: ID.tower.openDashboard, onClick: () => app.openDrawer('dashboard'), text: '⤢' }))),
      el('div', { class: 'statusline' }, statusPill, el('span', { text: t('tower.counts', { committed: c.committedBays, toBay: c.reserved, waiting: c.waiting }) })),
      el('div', { class: 'metrics' },
        metric(ID.tower.metrics.commitment, fmtPercent(obs, 0), `/ ${fmtPercent(th.rho, 0)} teori`, obs || 0),
        metric(ID.tower.metrics.capacity, `${stallsUsed}`, `/ ${e.effectiveCapacity}`, stallsUsed / Math.max(1, e.effectiveCapacity), stallsUsed / Math.max(1, e.effectiveCapacity) > 0.8 ? 'orange' : 'green'),
        metric(ID.tower.metrics.exited, fmtNumber(c.exited), `truk · ${fmtNumber((c.exited - c.exitedAfterHorizon) / hours, 1)}/jam`, Math.min(1, (c.exited - c.exitedAfterHorizon) / hours / Math.max(1, th.mu))),
        metric(ID.tower.metrics.volume, fmtNumber(c.totalVolume / 1000, 0), 'ribu liter', Math.min(1, c.totalVolume / (th.lambda * 24 * e.config.operations.requestedVolumeL || 1))),
      ),
      el('h4', { text: ID.tower.products }),
      el('div', { class: 'list' }, ...items),
      el('h4', { text: ID.tower.bayLine }),
      busy ? el('div', { class: 'item', onClick: () => app.select({ type: 'bay', number: busy.number }) }, el('span', { class: 'sw', style: { background: BAY_STATE_STYLE[busy.displayState].color } }), el('span', {}, el('b', { text: t('tower.bayLineSub', { n: String(busy.number).padStart(2, '0'), state: ID.bay.states[busy.displayState] }) }), el('div', { class: 'small muted', text: busy.truckId ? `TT-${String(busy.truckId).padStart(3, '0')}` : '' })), el('span'), el('span', { class: 'pill info', text: `${c.committedBays}/${e.bays.filter((b) => b.isActive).length}` })) : el('div', { class: 'small muted', text: ID.bay.none }),
      el('div', { class: 'row', style: { marginTop: '10px' } }, el('button', { class: 'linkish', style: { flex: '1' }, text: ID.tower.openParams, onClick: () => app.openDrawer('params') }), el('button', { class: 'linkish', style: { flex: '1' }, text: ID.tower.openGeometry, onClick: () => app.openDrawer('geometry') }), el('button', { class: 'linkish', style: { flex: '1' }, text: ID.tower.openCompare, onClick: () => app.openDrawer('compare') })),
    ];
  }

  function truckCard(tr) {
    const e = app.engine;
    const pr = e.config.products[tr.product];
    const frac = tr.requestedVolume ? tr.loadedVolume / tr.requestedVolume : 0;
    const wait = tr.timestamps.queueEntry != null ? (tr.timestamps.dispatch ?? e.time) - tr.timestamps.queueEntry : null;
    const remaining = tr.state === TRUCK_STATES.LOADING && tr.snapshot ? Math.max(0, tr.timestamps.loadingStart + tr.snapshot.loadSec - e.time) : null;
    const seg = tr.currentSegment;
    const routeText = seg ? (seg.lane === 'entry' ? ID.truck.states.toStall : seg.lane === 'loop' ? ID.truck.states.toBay : seg.lane === 'exit' ? ID.truck.states.toExit : seg.tag === 'bayOut' ? ID.truck.states.clearing : ID.truck.states[tr.state]) : ID.truck.states[tr.state];
    const next = { holding: ID.truck.states.toStall, toStall: ID.truck.states.waiting, waiting: ID.truck.states.toBay, toBay: ID.truck.states.prep, prep: ID.truck.states.loading, loading: ID.truck.states.completion, completion: ID.truck.states.clearing, clearing: ID.truck.states.toExit, toExit: ID.truck.states.exited }[tr.state] || '—';
    return [
      el('div', { class: 'head' }, el('div', { class: 'ico', text: '🚚' }), el('div', { class: 't' }, el('div', { class: 'caption', text: ID.tower.detailTruck }), el('strong', { text: tr.label }), el('div', { class: 'sub', text: `${pr.name} · ${fmtLiter(tr.requestedVolume)}` })), el('div', { class: 'acts' }, el('button', { title: ID.tower.focus, text: '⌖', onClick: () => app.focusSelection() }), el('button', { title: ID.panels.close, text: '✕', onClick: () => app.select(null) }))),
      el('div', { class: 'statusline' }, el('span', { class: `pill ${truckPill[tr.state]}` }, el('i', { class: 'dot' }), ID.truck.states[tr.state]), el('span', { text: tr.bay ? `Bay ${String(tr.bay).padStart(2, '0')}` : tr.stall != null ? `Stall ${tr.stall + 1}` : '' })),
      el('div', { class: 'progress-head' }, el('span', { text: ID.tower.progress }), el('span', { text: `${fmtNumber(Math.round(tr.loadedVolume))} / ${fmtNumber(tr.requestedVolume)} L` })),
      el('div', { class: 'bar' }, el('div', { style: { width: `${frac * 100}%` } })),
      ...kv([
        [ID.tower.shipment, `#${String(tr.id).padStart(4, '0')}`],
        [ID.truck.product, el('span', { class: 'chip' + (isLightColor(pr.color) ? ' light' : ''), style: { background: pr.color } }, pr.name)],
        [ID.tower.route, routeText],
        [ID.truck.waiting, wait == null ? '—' : formatDuration(wait)],
        [ID.tower.etaLoad, remaining == null ? '—' : formatDuration(remaining)],
        [ID.tower.speed, `${fmtNumber((tr.speed || 0) * 3.6, 1)} km/h`],
        [ID.tower.nextStep, next],
        [ID.truck.protected, tr.protected ? ID.common.yes : ID.common.no],
      ]),
      el('button', { class: 'linkish', text: ID.truck.follow, onClick: () => app.setMode('oneTruck') }),
    ];
  }

  function bayCard(b) {
    const e = app.engine;
    const st = e.bayStats()[b.number - 1];
    const truck = b.truckId ? e.trucks.get(b.truckId) : null;
    const style = BAY_STATE_STYLE[b.displayState];
    const th = e.theory.perBay[b.number - 1];
    const frac = truck && truck.requestedVolume ? truck.loadedVolume / truck.requestedVolume : 0;
    const prods = b.products.map((pid) => el('span', { class: 'chip' + (isLightColor(e.config.products[pid].color) ? ' light' : ''), style: { background: e.config.products[pid].color } }, e.config.products[pid].name));
    return [
      el('div', { class: 'head' }, el('div', { class: 'ico', text: '⛽' }), el('div', { class: 't' }, el('div', { class: 'caption', text: ID.tower.detailBay }), el('strong', { text: `Bay ${String(b.number).padStart(2, '0')}` }), el('div', { class: 'sub' }, ...prods)), el('div', { class: 'acts' }, el('button', { title: ID.tower.focus, text: '⌖', onClick: () => app.focusSelection() }), el('button', { title: ID.panels.close, text: '✕', onClick: () => app.select(null) }))),
      el('div', { class: 'statusline' }, el('span', { class: `pill ${bayPill[b.displayState]}`, style: { color: b.displayState === 'available' ? undefined : undefined } }, el('i', { class: 'dot', style: { background: style.color } }), `${style.icon} ${ID.bay.states[b.displayState]}`), el('span', { text: truck ? truck.label : ID.bay.none })),
      truck ? el('div', { class: 'progress-head' }, el('span', { text: ID.bay.loadingProgress }), el('span', { text: `${fmtNumber(Math.round(truck.loadedVolume))} / ${fmtNumber(truck.requestedVolume)} L` })) : null,
      truck ? el('div', { class: 'bar' }, el('div', { style: { width: `${frac * 100}%` } })) : null,
      el('div', { class: 'metrics' },
        metric(ID.bay.commitment, fmtPercent(st.commitment, 0), '', st.commitment || 0),
        metric(ID.bay.loadingUtil, fmtPercent(st.loadingUtilization, 0), '', st.loadingUtilization || 0, 'green'),
      ),
      ...kv([
        [ID.bay.completed, fmtNumber(st.serviceCount)],
        ['T_commit teoretis', `${fmtNumber(th.tCommitMin, 1)} mnt`],
        ['μ bay', `${fmtNumber(th.mu, 2)} truk/jam`],
        [ID.bay.active, b.active || b.pendingDeactivation ? ID.common.yes : ID.common.no],
        [ID.bay.pendingProducts, b.pendingProducts ? b.pendingProducts.map((p) => e.config.products[p].name).join(', ') : '—'],
      ]),
      el('div', { class: 'row', style: { marginTop: '8px' } },
        el('button', { class: 'linkish', style: { flex: 1, marginTop: 0 }, text: b.active || b.pendingDeactivation ? ID.bay.inactive : ID.bay.active, onClick: () => app.engine.setBayActive(b.number, !(b.active || b.pendingDeactivation)) }),
        el('button', { class: 'linkish', style: { flex: 1, marginTop: 0 }, text: ID.bay.editProducts, onClick: () => app.openDrawer('bays') }),
      ),
    ];
  }

  function stallCard(st) {
    const e = app.engine;
    const truck = st.truckId ? e.trucks.get(st.truckId) : null;
    return [
      el('div', { class: 'head' }, el('div', { class: 'ico', text: '🅿' }), el('div', { class: 't' }, el('div', { class: 'caption', text: ID.tower.detailStall }), el('strong', { text: `Stall ${st.number}` }), el('div', { class: 'sub', text: `X ${fmtNumber(st.x, 2)} m · ${st.feasible ? ID.geometry.feasible : ID.geometry.infeasible}` })), el('div', { class: 'acts' }, el('button', { title: ID.panels.close, text: '✕', onClick: () => app.select(null) }))),
      el('div', { class: 'statusline' }, el('span', { class: `pill ${truck ? 'info' : 'ok'}` }, el('i', { class: 'dot' }), truck ? ID.tower.stallOccupied : ID.tower.stallFree), el('span', { text: truck ? truck.label : '' })),
      ...kv(truck ? [[ID.truck.product, e.config.products[truck.product].name], [ID.truck.state, ID.truck.states[truck.state]], [ID.truck.waitingAge, truck.timestamps.queueEntry != null ? formatDuration(e.time - truck.timestamps.queueEntry) : '—']] : []),
    ];
  }

  return {
    update() {
      const e = app.engine;
      const sel = app.selection;
      let key, nodes;
      if (sel?.type === 'truck') {
        const tr = e.trucks.get(sel.id);
        if (!tr) {
          key = `gone${sel.id}`;
          nodes = () => [el('div', { class: 'head' }, el('div', { class: 'ico', text: '🚚' }), el('div', { class: 't' }, el('div', { class: 'caption', text: ID.tower.detailTruck }), el('strong', { text: sel.label || '' }), el('div', { class: 'sub', text: ID.truck.states.exited })), el('div', { class: 'acts' }, el('button', { text: '✕', onClick: () => app.select(null) })))];
        } else {
          key = `tr${tr.id}|${tr.state}|${Math.round(tr.loadedVolume / 300)}|${Math.round(e.time / 5)}`;
          nodes = () => truckCard(tr);
        }
      } else if (sel?.type === 'bay') {
        const b = e.bays[sel.number - 1];
        const truck = b.truckId ? e.trucks.get(b.truckId) : null;
        key = `bay${b.number}|${b.displayState}|${b.truckId}|${Math.round((truck?.loadedVolume || 0) / 300)}|${Math.round(e.time / 10)}`;
        nodes = () => bayCard(b);
      } else if (sel?.type === 'stall') {
        const st = e.stalls[sel.index];
        key = `st${st.number}|${st.truckId}|${Math.round(e.time / 10)}`;
        nodes = () => stallCard(st);
      } else {
        key = `term|${Math.round(e.time / 5)}|${e === app._sideEngine ? '' : 'new'}|${e.theory.rho.toFixed(3)}`;
        nodes = terminalCard;
      }
      if (key === lastKey) return;
      lastKey = key;
      app._sideEngine = e;
      clear(container);
      container.append(...nodes().filter(Boolean));
    },
  };
}
