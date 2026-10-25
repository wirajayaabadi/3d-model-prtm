import { el, panel, field, numberInput, clear, toast } from '../dom.js';
import { ID, t, fmtNumber } from '../i18n/id.js';
import { deepClone } from '../../config/index.js';

// Geometri dan alat ukur: grid, label, kelayakan, dimensi plot/zona/jalan/kendaraan yang dapat diedit (hanya saat jeda).
export function createGeometryPanel(container, app) {
  const p = panel(ID.panels.geometry, { collapsed: true });
  container.append(p.root);

  const grid = el('input', { type: 'checkbox', onChange: () => app.view.setGrid(grid.checked) });
  const labels = el('input', { type: 'checkbox', onChange: () => app.view.setLabels(labels.checked) });
  const feas = el('input', { type: 'checkbox', onChange: () => app.view.setFeasibility(feas.checked) });

  let draft = deepClone(app.engine.config);
  const form = el('div', { class: 'grid2' });
  const summary = el('div');
  const feasList = el('div', { class: 'list' });
  const applyBtn = el('button', { class: 'primary', text: ID.geometry.applyGeometry, onClick: () => {
    if (app.running) return toast(ID.geometry.pausedOnly);
    const ok = app.applyGeometry(draft);
    if (ok) {
      draft = deepClone(app.engine.config);
      buildForm();
    }
  } });

  function num(obj, key, label, step = 1) {
    return field(label, numberInput(obj[key], { step, onChange: (v) => (obj[key] = v) }));
  }

  function buildForm() {
    clear(form);
    const f = draft.facility;
    form.append(num(f.plot, 'width', ID.geometry.plotWidth), num(f.plot, 'length', ID.geometry.plotLength));
    for (const [k, z] of Object.entries(f.zones)) {
      form.append(el('h3', { text: ID.geometry.zones[k], style: { gridColumn: '1 / -1' } }), num(z, 'x0', 'X0'), num(z, 'x1', 'X1'), num(z, 'z0', 'Z0'), num(z, 'z1', 'Z1'));
    }
    form.append(el('h3', { text: ID.geometry.roads, style: { gridColumn: '1 / -1' } }));
    for (const k of ['entryLaneZ', 'departureLaneZ', 'approachZ', 'exitRoadZ', 'departureLaneEndX', 'approachEndX', 'exitRoadStartX']) form.append(num(f.roads, k, k));
    form.append(num(f.roads.uTurnCenter, 'x', 'uTurnCenter.x'), num(f.roads.uTurnCenter, 'z', 'uTurnCenter.z'), num(f.gates.entrance, 'z', 'gerbang masuk Z'), num(f.gates.exit, 'z', 'gerbang keluar Z'));
    form.append(el('h3', { text: ID.geometry.vehicle, style: { gridColumn: '1 / -1' } }));
    for (const k of ['length', 'width', 'height', 'frontOverhang', 'wheelbase', 'rearOverhang', 'turningRadius', 'accel', 'decel', 'stationaryGap', 'headwaySeconds', 'clearance', 'lateralGap']) form.append(num(draft.vehicle, k, k, 0.1));
  }
  buildForm();

  p.body.append(
    el('div', { class: 'row' }, el('label', { class: 'row' }, grid, ID.geometry.grid), el('label', { class: 'row' }, labels, ID.geometry.labels), el('label', { class: 'row' }, feas, ID.geometry.feasibility)),
    summary,
    el('h3', { text: ID.geometry.feasible + ' / ' + ID.geometry.infeasible }),
    feasList,
    el('p', { class: 'note', text: ID.geometry.stallsNote }),
    el('p', { class: 'note', text: ID.geometry.pausedOnly + ' ' + ID.geometry.bayCountFixed }),
    form,
    applyBtn,
  );

  let lastEngine = null;
  function fixText(v) {
    const d = fmtNumber(Math.ceil(v.depth * 100) / 100, 2);
    if (v.kind === 'boundary') return t('geometry.fixBoundary', { axis: v.axis, d });
    return t('geometry.fixObstacle', { obstacle: v.obstacle, d });
  }
  function renderReport() {
    const e = app.engine;
    const L = e.layout;
    clear(summary);
    const zoneRows = Object.entries(L.zones).map(([k, z]) => `${ID.geometry.zones[k]}: ${fmtNumber(z.width)} × ${fmtNumber(z.length)} m = ${fmtNumber(z.area)} m²`);
    summary.append(
      el('div', { class: 'small', text: `${ID.geometry.plot}: ${fmtNumber(L.plot.width)} × ${fmtNumber(L.plot.length)} m = ${fmtNumber(L.plot.area)} m²` }),
      ...zoneRows.map((r) => el('div', { class: 'small', text: r })),
      el('div', { class: 'small', text: `${ID.geometry.unallocated}: ${fmtNumber(L.unallocatedArea)} m²` }),
      el('div', { class: 'small' }, el('b', { text: `${ID.geometry.effectiveCapacity}: ${e.effectiveCapacity}` }), ` (${ID.geometry.targetCapacity} ${e.config.operations.targetWaitingCapacity})`),
    );
    clear(feasList);
    const rep = e.geometryReport;
    const items = [];
    rep.bays.forEach((b) => {
      items.push({ name: t('geometry.routeBayEntry', { n: b.bay }), ok: b.entry.feasible, worst: b.entry.worst, clr: b.entry.minClearance });
      items.push({ name: t('geometry.routeBayExit', { n: b.bay }), ok: b.exit.feasible, worst: b.exit.worst, clr: b.exit.minClearance });
    });
    rep.stalls.stalls.forEach((s) => items.push({ name: t('geometry.routeStall', { n: s.stall }), ok: s.feasible, worst: [...s.reverseIn.worst, ...s.pullOut.worst], clr: s.minClearance }));
    items.push({ name: ID.geometry.uTurn, ok: rep.uTurn.feasible, worst: rep.uTurn.worst, clr: rep.uTurn.minClearance });
    const bad = items.filter((i) => !i.ok);
    feasList.append(el('div', { class: bad.length ? 'bad' : 'ok', text: bad.length ? t('geometry.someInfeasible', { n: bad.length }) : ID.geometry.allFeasible }));
    for (const err of rep.errors) feasList.append(el('div', { class: 'bad small', text: `${ID.geometry.uTurn}: ${t('geometry.fixUTurn', { d: fmtNumber((err.detail.required - err.detail.available) * 2, 2) })}` }));
    for (const i of items) {
      const row = el('div', { class: 'small' }, el('span', { class: i.ok ? 'ok' : 'bad', text: i.ok ? '✓ ' : '✗ ' }), `${i.name}`, i.clr != null && isFinite(i.clr) ? el('span', { class: 'muted', text: ` (jarak min ${fmtNumber(i.clr, 2)} m)` }) : null);
      if (!i.ok) {
        for (const v of i.worst) row.append(el('div', { class: 'muted', style: { paddingLeft: '14px' }, text: t('geometry.violation', { obstacle: v.obstacle, depth: fmtNumber(v.depth, 2), x: fmtNumber(v.x ?? 0, 1), z: fmtNumber(v.z ?? 0, 1) }) + ' — ' + t('geometry.fix', { fix: fixText(v) }) }));
      }
      feasList.append(row);
    }
  }

  return {
    update() {
      if (lastEngine !== app.engine) {
        lastEngine = app.engine;
        draft = deepClone(app.engine.config);
        buildForm();
        renderReport();
        feas.checked = false;
      }
      applyBtn.disabled = app.running;
    },
    refresh: renderReport,
  };
}
