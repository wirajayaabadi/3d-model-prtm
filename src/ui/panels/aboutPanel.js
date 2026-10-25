import { el, clear } from '../dom.js';
import { ID } from '../i18n/en.js';

// Panel "Tentang Simulasi" sebagai modal: persyaratan, asumsi, asumsi direvisi, keterbatasan, catatan teori.
export function showAbout(modal, extra = {}) {
  clear(modal);
  const list = (items) => el('ul', {}, ...items.map((x) => el('li', { text: x })));
  const box = el(
    'div',
    { class: 'box' },
    el('div', { class: 'row between' }, el('h2', { text: ID.panels.about }), el('button', { text: ID.panels.close, onClick: () => (modal.hidden = true) })),
    el('div', { class: 'row' }, ...ID.app.notices.map((n) => el('span', { class: 'notice', text: n }))),
    el('h3', { text: ID.about.requirements }),
    list(ID.about.requirementsList),
    el('h3', { text: ID.about.assumptions }),
    list([...ID.about.assumptionsList, ...(extra.assumptions || [])]),
    el('h3', { text: ID.about.revised }),
    el('ul', {}, ...ID.about.revisedList.map((r) => el('li', {}, el('b', { text: r.change + '. ' }), el('span', { class: 'muted', text: r.reason })))),
    el('h3', { text: ID.about.limitations }),
    list([...ID.about.limitationsList, ...(extra.limitations || [])]),
    el('h3', { text: ID.about.theoryNotes }),
    list(ID.about.theoryList),
    el('p', { class: 'note', text: ID.params.dispatchPolicyNote }),
  );
  modal.append(box);
  modal.hidden = false;
  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };
}
