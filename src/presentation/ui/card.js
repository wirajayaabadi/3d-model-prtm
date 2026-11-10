// Kartu cerita di sisi kanan: kicker bab, judul, lead, butir, fakta (dengan chip "cek"), media, sumber.
// Juga dipakai untuk kartu objek (klik gedung/panel/pin) dengan tombol kembali ke langkah.
import { el, clear } from '../../ui/dom.js';
import { MEDIA } from '../content/index.js';
import { chapterNo } from '../story/steps.js';

export function renderCard(container, { content, step, data, chapter, position, simPanel, panelFirst, onPhoto, objectMode, onBack, lang }) {
  clear(container);
  const ui = content.ui;
  if (!data) return;
  const head = el('div', { class: 'chead' });
  if (objectMode) {
    head.append(el('button', { class: 'back', type: 'button', onClick: onBack }, '← ', ui.backToStep), el('span', { class: 'kicker', text: ui.objectCard }));
  } else {
    head.append(el('span', { class: 'kicker' }, el('b', { text: `${ui.chapter} ${chapterNo(step.ch)}` }), ` · ${chapter.title}`), el('span', { class: 'pos', text: `${position.n}/${position.of}` }));
  }
  container.append(head);
  container.append(el('h2', { text: data.title }));
  if (data.lead) container.append(el('p', { class: 'lead', text: data.lead }));
  if (simPanel && panelFirst) container.append(simPanel); // panel interaktif tepat di bawah kalimat pembuka
  if (data.bullets?.length) container.append(el('ul', { class: 'bullets' }, ...data.bullets.map((b) => el('li', { text: b }))));
  if (data.facts?.length) {
    const grid = el('dl', { class: 'facts' });
    for (const f of data.facts) {
      const dt = el('dt', { text: f.k });
      const dd = el('dd', {}, el('span', { text: f.v }));
      if (f.c) dd.append(el('i', { class: 'chk', title: ui.checkTitle, text: ui.check }));
      if (f.s) dd.append(el('small', { text: f.s }));
      grid.append(dt, dd);
    }
    container.append(grid);
  }
  if (simPanel && !panelFirst) container.append(simPanel);
  if (data.media?.length) {
    const strip = el('div', { class: 'media' });
    for (const key of data.media) {
      const src = MEDIA[key];
      if (!src) continue;
      const cap = content.media[key] || '';
      strip.append(el('button', { class: 'thumb', type: 'button', title: cap, onClick: () => onPhoto(key, data.media) }, el('img', { src, alt: cap, loading: 'lazy' })));
    }
    container.append(el('div', { class: 'mhead', text: ui.media }), strip);
  }
  if (data.sources?.length) container.append(el('p', { class: 'sources' }, el('b', { text: `${ui.sources}: ` }), data.sources.join(' · ')));
}

export function renderLightbox(box, { content, key, list, onClose, onNav }) {
  clear(box);
  const ui = content.ui;
  const i = list.indexOf(key);
  const cap = content.media[key] || '';
  box.append(
    el('div', { class: 'lb-inner' },
      el('img', { src: MEDIA[key], alt: cap }),
      el('div', { class: 'lb-bar' },
        el('span', { class: 'cap', text: cap }),
        el('span', { class: 'nav' },
          list.length > 1 ? el('button', { type: 'button', onClick: () => onNav(list[(i - 1 + list.length) % list.length]), text: '←' }) : null,
          el('span', { class: 'muted', text: `${ui.photoOf} ${i + 1}/${list.length}` }),
          list.length > 1 ? el('button', { type: 'button', onClick: () => onNav(list[(i + 1) % list.length]), text: '→' }) : null,
          el('button', { type: 'button', onClick: onClose, text: ui.close }),
        ),
      ),
    ),
  );
  box.hidden = false;
  box.onclick = (e) => {
    if (e.target === box) onClose();
  };
}
