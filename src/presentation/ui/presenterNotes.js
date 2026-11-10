// Jendela catatan pembicara (?notes=1): tanpa WebGL. Mengikuti langkah jendela presentasi lewat BroadcastChannel,
// menampilkan catatan, langkah berikutnya, dan waktu per bab; tombol maju/mundur mengirim perintah balik.
import { el, clear } from '../../ui/dom.js';
import { STEPS, chapterNo } from '../story/steps.js';
import { CHANNEL } from '../story/engine.js';
import { CONTENT, fmtClock } from '../content/index.js';

export function startNotesView(root, lang) {
  let content = CONTENT[lang] || CONTENT.id;
  document.documentElement.lang = content.code;
  document.title = content.ui.notesWindowTitle;
  root.hidden = false;
  document.body.classList.add('notes-mode');
  const channel = new BroadcastChannel(CHANNEL);
  let state = null;
  const send = (cmd, extra = {}) => channel.postMessage({ type: 'cmd', cmd, ...extra });
  const render = () => {
    clear(root);
    const ui = content.ui;
    if (!state) {
      root.append(el('div', { class: 'n-wait', text: ui.notesWaiting }));
      return;
    }
    const step = STEPS[state.index];
    const data = content.steps[step.id] || {};
    const nextStep = STEPS[state.index + 1];
    const nextData = nextStep ? content.steps[nextStep.id] : null;
    const ch = content.chapters[step.ch];
    const t = state.timing;
    root.append(
      el('div', { class: 'n-top' },
        el('div', { class: 'n-kicker', text: `${ui.chapter} ${chapterNo(step.ch)} · ${ch.title} · ${state.index + 1}/${state.total}` }),
        el('div', { class: 'n-timers' },
          el('span', { class: 'n-timer' + (t.running ? ' on' : ''), text: `${ui.elapsed} ${fmtClock(t.total)}` }),
          el('span', { class: 'n-timer' + (t.over ? ' over' : ''), text: `${ui.chapterTime} ${fmtClock(t.chapterElapsed)} / ${fmtClock(t.budget)}` }),
        ),
      ),
      el('h1', { text: data.title || step.id }),
      el('div', { class: 'n-notes', text: data.notes || ui.notesEmpty }),
      nextData ? el('div', { class: 'n-next' }, el('b', { text: `${ui.nextUp}: ` }), nextData.title) : null,
      el('div', { class: 'n-actions' },
        el('button', { type: 'button', onClick: () => send('prev'), text: `← ${ui.prev}` }),
        el('button', { type: 'button', class: 'primary', onClick: () => send('next'), text: `${ui.next} →` }),
        el('button', { type: 'button', onClick: () => send('timer'), text: t.running ? ui.timerPause : ui.timerStart }),
      ),
    );
  };
  channel.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'state') {
      state = m;
      if (m.lang && CONTENT[m.lang] && m.lang !== content.code) {
        content = CONTENT[m.lang];
        document.documentElement.lang = content.code;
      }
      render();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') send('next');
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') send('prev');
  });
  // Timer lokal berjalan di antara siaran
  setInterval(() => {
    if (state?.timing?.running) {
      state.timing.total += 1;
      state.timing.chapterElapsed += 1;
      state.timing.over = state.timing.chapterElapsed > state.timing.budget;
      render();
    }
  }, 1000);
  send('hello');
  render();
}
