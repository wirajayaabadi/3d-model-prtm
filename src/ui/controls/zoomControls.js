import { el } from '../dom.js';
import { ID } from '../i18n/en.js';

// Kolom kontrol tampilan: perbesar, perkecil, atur ulang, denah atas, fokus ke pilihan.
export function createZoomControls(container, app) {
  const btns = [
    el('button', { class: 'iconbtn', title: ID.tower.zoomIn, text: '+', onClick: () => app.zoom(-1) }),
    el('button', { class: 'iconbtn', title: ID.tower.zoomOut, text: '−', onClick: () => app.zoom(1) }),
    el('button', { class: 'iconbtn', title: ID.tower.resetView, text: '⟲', onClick: () => app.setCamera('overview') }),
    el('button', { class: 'iconbtn', title: ID.tower.topView, text: '▦', onClick: () => app.setCamera('top') }),
    el('button', { class: 'iconbtn', title: ID.tower.focus, text: '⌖', onClick: () => app.focusSelection() }),
  ];
  container.append(...btns);
  return { update() {} };
}
