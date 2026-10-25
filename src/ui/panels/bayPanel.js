import { el, panel, clear, toast } from '../dom.js';
import { ID, t } from '../i18n/en.js';
import { PRODUCT_IDS } from '../../config/products.js';
import { BAY_STATE_STYLE } from '../theme.js';
import { isLightColor } from '../dom.js';

// Daftar 14 bay: toggle aktif/nonaktif, editor produk (tepat tiga unik), status dengan warna + teks + ikon.
export function createBayPanel(container, app) {
  const p = panel(ID.panels.bays, { collapsed: true });
  container.append(p.root);
  const rows = new Map();
  let editing = null;

  function productChip(pid) {
    const pr = app.engine.config.products[pid];
    return el('span', { class: 'chip' + (isLightColor(pr.color) ? ' light' : ''), style: { background: pr.color } }, pr.name);
  }

  function buildRows() {
    clear(p.body);
    rows.clear();
    p.body.append(el('p', { class: 'note', text: ID.bay.reactivatedNote }));
    for (const b of app.engine.bays) {
      const toggle = el('button', { class: 'toggle', title: ID.bay.toggle, onClick: () => app.engine.setBayActive(b.number, !(b.active || b.pendingDeactivation)) });
      const prods = el('div', { class: 'prods' });
      const state = el('div', { class: 'state' });
      const editBtn = el('button', { class: 'small', text: '✎', title: ID.bay.editProducts, onClick: () => (editing = editing === b.number ? null : b.number) });
      const row = el('div', { class: 'bay-row', onClick: (e) => { if (e.target === row || e.target === prods) app.select({ type: 'bay', number: b.number }); } },
        el('div', {}, el('b', { text: String(b.number).padStart(2, '0') }), el('div', {}, toggle)),
        el('div', {}, prods, state),
        editBtn,
      );
      const editor = el('div', { class: 'grid3', style: { gridColumn: '1 / -1', display: 'none' } });
      row.append(editor);
      p.body.append(row);
      rows.set(b.number, { row, toggle, prods, state, editor });
    }
  }
  buildRows();

  function renderEditor(b, r) {
    clear(r.editor);
    const sels = b.products.map((pid) => el('select', {}, ...PRODUCT_IDS.map((id) => el('option', { value: id, text: app.engine.config.products[id].name, selected: id === pid }))));
    const save = el('button', { class: 'small primary', text: ID.common.save, onClick: () => {
      const vals = sels.map((s) => s.value);
      if (new Set(vals).size !== 3) return toast(ID.bay.productsError);
      if (!app.engine.setBayProducts(b.number, vals)) return toast(ID.bay.productsError);
      editing = null;
      app.refreshTheory();
    } });
    r.editor.append(...sels, save);
  }

  return {
    update() {
      if (rows.size !== app.engine.bays.length) buildRows();
      for (const b of app.engine.bays) {
        const r = rows.get(b.number);
        r.toggle.classList.toggle('on', b.active || b.pendingDeactivation);
        const key = b.products.join('|') + (b.pendingProducts ? '>' + b.pendingProducts.join('|') : '');
        if (r.prods.dataset.key !== key) {
          clear(r.prods);
          r.prods.append(...b.products.map(productChip));
          if (b.pendingProducts) r.prods.append(el('span', { class: 'muted small', text: '→ ' + ID.bay.pendingProducts }));
          r.prods.dataset.key = key;
        }
        const st = b.displayState;
        const label = `${ID.bay.icons[st]} ${ID.bay.states[st]}` + (b.truckId ? ` · TT-${String(b.truckId).padStart(3, '0')}` : '');
        if (r.state.dataset.label !== label) {
          clear(r.state);
          const sty = BAY_STATE_STYLE[st];
          r.state.append(el('span', { class: `dot ${sty.shape}`, style: { background: sty.color, color: sty.color } }), el('span', { text: label }));
          r.state.dataset.label = label;
        }
        const show = editing === b.number;
        if (show && !r.editor.dataset.open) renderEditor(b, r);
        r.editor.style.display = show ? 'grid' : 'none';
        r.editor.dataset.open = show ? '1' : '';
        r.row.style.background = app.selection?.type === 'bay' && app.selection.number === b.number ? 'var(--blue-tint)' : '';
      }
    },
  };
}
