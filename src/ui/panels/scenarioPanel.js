import { el, panel, field, numberInput, toast, isLightColor } from '../dom.js';
import { ID, fmtNumber } from '../i18n/en.js';
import { PRODUCT_IDS } from '../../config/products.js';
import { rebalanceShares } from '../../config/presets.js';

// Parameter operasi: laju kedatangan, pangsa, volume, laju pengisian, waktu, perlindungan, ekstensi.
export function createScenarioPanel(container, app) {
  const p = panel(ID.panels.scenario);
  container.append(p.root);
  const ops = () => app.engine.config.operations;

  const arrival = numberInput(ops().arrivalRatePerHour, { min: 0, step: 1, onChange: (v, i) => (app.engine.setArrivalRate(v) ? app.refreshTheory() : (toast(ID.params.invalid), (i.value = ops().arrivalRatePerHour))) });
  const volume = numberInput(ops().requestedVolumeL, { min: 1, step: 1000, onChange: (v, i) => (app.engine.setServiceParams({ requestedVolumeL: v }) ? app.refreshTheory() : (toast(ID.params.invalid), (i.value = ops().requestedVolumeL))) });
  const rate = numberInput(ops().loadingRateLpm, { min: 1, step: 50, onChange: (v, i) => (app.engine.setServiceParams({ loadingRateLpm: v }) ? app.refreshTheory() : (toast(ID.params.invalid), (i.value = ops().loadingRateLpm))) });
  const prep = numberInput(ops().prepMinutes, { min: 0, step: 0.5, onChange: (v, i) => (app.engine.setServiceParams({ prepMinutes: v }) ? app.refreshTheory() : (toast(ID.params.invalid), (i.value = ops().prepMinutes))) });
  const comp = numberInput(ops().completionMinutes, { min: 0, step: 0.5, onChange: (v, i) => (app.engine.setServiceParams({ completionMinutes: v }) ? app.refreshTheory() : (toast(ID.params.invalid), (i.value = ops().completionMinutes))) });
  const passCount = numberInput(ops().protection.passCount, { min: 0, step: 1, onChange: (v) => app.engine.setProtection({ passCount: v }) });
  const waitMin = numberInput(ops().protection.waitMinutes, { min: 0, step: 1, onChange: (v) => app.engine.setProtection({ waitMinutes: v }) });

  // Pangsa permintaan: mengubah satu menyeimbangkan lainnya secara proporsional.
  const shareInputs = {};
  const shareGrid = el('div', { class: 'grid2' });
  for (const pid of PRODUCT_IDS) {
    const inp = numberInput(+(ops().demandShares[pid] * 100).toFixed(1), { min: 0, max: 100, step: 0.5 });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (isNaN(v) || v < 0 || v > 100) return toast(ID.params.sharesInvalid);
      const shares = rebalanceShares(ops().demandShares, pid, v / 100);
      if (!app.engine.setDemandShares(shares)) return toast(ID.params.sharesInvalid);
      app.refreshTheory();
      syncShares();
    });
    shareInputs[pid] = inp;
    const prod = app.engine.config.products[pid];
    shareGrid.append(field('', el('span', { class: 'chip' + (isLightColor(prod.color) ? ' light' : ''), style: { background: prod.color } }, prod.name)), field('%', inp));
  }
  function syncShares() {
    for (const pid of PRODUCT_IDS) if (document.activeElement !== shareInputs[pid]) shareInputs[pid].value = +(ops().demandShares[pid] * 100).toFixed(1);
  }

  // Ekstensi opsional
  const profEnable = el('input', { type: 'checkbox' });
  const profText = el('textarea', { rows: 2, placeholder: '1, 1, 1, … (24 angka)' });
  profText.value = ops().hourlyProfile.join(', ');
  const applyProf = () => {
    const arr = profText.value.split(/[,\s]+/).filter(Boolean).map(Number);
    if (!app.engine.setHourlyProfile(profEnable.checked, arr)) {
      toast(ID.params.profileInvalid);
      profEnable.checked = ops().hourlyProfileEnabled;
      return;
    }
    app.refreshTheory();
  };
  profEnable.addEventListener('change', applyProf);
  profText.addEventListener('change', applyProf);
  const cv = numberInput(ops().serviceCV, { min: 0, step: 0.05, onChange: (v, i) => (app.engine.setServiceCV(v) ? null : (toast(ID.params.invalid), (i.value = ops().serviceCV))) });

  p.body.append(
    el('div', { class: 'grid2' }, field(ID.params.arrivalRate, arrival), field(ID.params.requestedVolume, volume), field(ID.params.loadingRate, rate), field(ID.params.prep, prep), field(ID.params.completion, comp)),
    el('h3', { text: ID.params.demandShares }),
    shareGrid,
    el('h3', { text: ID.params.protection }),
    el('div', { class: 'grid2' }, field(ID.params.passCount, passCount), field(ID.params.waitMinutes, waitMin)),
    el('p', { class: 'note', text: ID.params.dispatchPolicyNote }),
    el('h3', { text: ID.params.extensions }),
    el('label', { class: 'row' }, profEnable, el('span', { text: ID.params.hourlyProfileEnable })),
    field(ID.params.hourlyProfile, profText),
    field(ID.params.serviceCV, cv),
    el('p', { class: 'note', text: ID.run.newRunNote }),
  );

  return {
    update() {
      const o = ops();
      const sync = (inp, v) => {
        if (document.activeElement !== inp && String(inp.value) !== String(v)) inp.value = v;
      };
      sync(arrival, o.arrivalRatePerHour);
      sync(volume, o.requestedVolumeL);
      sync(rate, o.loadingRateLpm);
      sync(prep, o.prepMinutes);
      sync(comp, o.completionMinutes);
      sync(passCount, o.protection.passCount);
      sync(waitMin, o.protection.waitMinutes);
      sync(cv, o.serviceCV);
      if (document.activeElement !== profText) profText.value = o.hourlyProfile.map((x) => +x.toFixed(2)).join(', ');
      profEnable.checked = o.hourlyProfileEnabled;
      syncShares();
    },
  };
}
