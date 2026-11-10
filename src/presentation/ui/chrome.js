// Kerangka antarmuka: bilah atas (program, pelacak bab, waktu, tombol), bilah bawah (navigasi, disclaimer,
// petunjuk), menu daftar bab, dan bantuan tombol. Semua teks dari content.ui; update() dipanggil saat state berubah.
import { el, clear } from '../../ui/dom.js';
import { STEPS, stepsOfChapter, ACTIVE_CHAPTERS, chapterNo } from '../story/steps.js';
import { fmtClock } from '../content/index.js';

export function buildChrome(app) {
  const top = app.$('topbar'), bottom = app.$('bottombar'), menu = app.$('menu'), help = app.$('help');
  const refs = {};

  function buildTop() {
    clear(top);
    const ui = app.content.ui;
    const brand = el('div', { class: 'brand' }, el('span', { class: 'prog', text: ui.program }), el('strong', { text: ui.title }));
    const tracker = el('nav', { class: 'tracker', 'aria-label': ui.menu });
    refs.chapterBtns = [];
    for (const ch of ACTIVE_CHAPTERS) {
      const c = app.content.chapters[ch];
      const b = el('button', { type: 'button', 'data-ch': ch, title: c.title, onClick: () => app.story.goToChapter(ch) }, el('i', { text: String(chapterNo(ch)) }), el('span', { text: c.short }));
      refs.chapterBtns.push(b);
      tracker.append(b);
    }
    refs.progress = el('div', { class: 'progress' }, el('div'));
    refs.timer = el('button', { type: 'button', class: 'timer', title: ui.timer, onClick: () => app.story.toggleTimer(), onDblclick: () => app.story.resetTimer() }, el('b', { text: '00:00' }), el('small', { text: '' }));
    const right = el('div', { class: 'actions' },
      refs.timer,
      el('button', { type: 'button', class: 'ib', title: ui.language, onClick: () => app.toggleLanguage() }, app.lang === 'id' ? 'ID' : 'EN'),
      el('button', { type: 'button', class: 'ib', title: ui.openNotes, onClick: () => app.openNotes() }, 'N'),
      el('button', { type: 'button', class: 'ib', title: ui.help, onClick: () => app.toggleHelp() }, '?'),
      el('button', { type: 'button', class: 'ib', title: ui.fullscreen, onClick: () => app.toggleFullscreen() }, '⛶'),
      el('button', { type: 'button', class: 'ib menu-btn', title: ui.menu, onClick: () => app.toggleMenu() }, '☰'),
    );
    top.append(brand, tracker, right, refs.progress);
  }

  function buildBottom() {
    clear(bottom);
    const ui = app.content.ui;
    refs.prev = el('button', { type: 'button', class: 'nav prev', title: ui.prev, onClick: () => app.story.prev() }, '←');
    refs.next = el('button', { type: 'button', class: 'nav next primary', title: ui.next, onClick: () => app.story.next() }, '→');
    refs.pos = el('div', { class: 'pos' }, el('b'), el('span'));
    refs.mode = el('button', { type: 'button', class: 'modebtn', onClick: () => app.toggleMode() });
    refs.hint = el('div', { class: 'hint' });
    refs.detail = el('button', { type: 'button', class: 'modebtn detailbtn', title: ui.detailHint, onClick: () => app.toggleDetail() }, `☰ ${ui.detail}`);
    bottom.append(
      el('div', { class: 'disclaimer', text: ui.disclaimer }),
      el('div', { class: 'navpill card' }, refs.prev, refs.pos, refs.next),
      el('div', { class: 'right' }, refs.detail, refs.mode, el('button', { type: 'button', class: 'ib', title: ui.reapplyCamera, onClick: () => app.reapplyCamera() }, '⌖'), refs.hint),
    );
  }

  function buildMenu() {
    clear(menu);
    const ui = app.content.ui;
    const box = el('div', { class: 'menubox' });
    box.append(el('div', { class: 'row between' }, el('h2', { text: ui.menu }), el('button', { type: 'button', onClick: () => app.toggleMenu(false), text: ui.close })));
    const grid = el('div', { class: 'chapters' });
    for (const ch of ACTIVE_CHAPTERS) {
      const c = app.content.chapters[ch];
      const list = el('ol');
      for (const s of stepsOfChapter(ch)) {
        const d = app.content.steps[s.id];
        list.append(el('li', {}, el('button', { type: 'button', 'data-step': s.id, onClick: () => { app.story.goTo(STEPS.indexOf(s)); app.toggleMenu(false); } }, d?.title || s.id)));
      }
      grid.append(el('section', {}, el('h3', {}, el('i', { text: String(chapterNo(ch)) }), ` ${c.title}`, el('small', { text: ` · ${c.minutes} ${app.lang === 'id' ? 'mnt' : 'min'}` })), list));
    }
    box.append(grid);
    box.append(el('div', { class: 'row menufoot' },
      el('button', { type: 'button', onClick: () => app.toggleMode(), text: app.mode === 'explore' ? ui.presenter : ui.explore }),
      el('button', { type: 'button', onClick: () => app.openNotes(), text: ui.openNotes }),
      el('button', { type: 'button', onClick: () => app.toggleLanguage(), text: `${ui.language}: ${app.lang === 'id' ? 'Indonesia' : 'English'}` }),
      el('a', { href: '../', target: '_blank', rel: 'noopener', class: 'linkbtn', text: ui.openVideo }),
      el('a', { href: '../simulasi/', target: '_blank', rel: 'noopener', class: 'linkbtn', text: ui.openSim }),
    ));
    menu.append(box);
    menu.onclick = (e) => {
      if (e.target === menu) app.toggleMenu(false);
    };
  }

  function buildHelp() {
    clear(help);
    const ui = app.content.ui;
    const box = el('div', { class: 'menubox small' });
    box.append(el('div', { class: 'row between' }, el('h2', { text: ui.help }), el('button', { type: 'button', onClick: () => app.toggleHelp(false), text: ui.close })));
    const t = el('table', { class: 'keys' });
    for (const [k, v] of ui.keys) t.append(el('tr', {}, el('td', {}, el('kbd', { text: k })), el('td', { text: v })));
    box.append(t, el('p', { class: 'muted small', text: ui.exploreHint }));
    help.append(box);
    help.onclick = (e) => {
      if (e.target === help) app.toggleHelp(false);
    };
  }

  function rebuild() {
    buildTop();
    buildBottom();
    buildMenu();
    buildHelp();
    update();
  }

  function update() {
    const ui = app.content.ui;
    const story = app.story;
    const step = story.step;
    const { n, of } = story.positionInChapter();
    refs.chapterBtns.forEach((b, i) => {
      const ch = ACTIVE_CHAPTERS[i];
      b.classList.toggle('active', ch === step.ch);
      b.classList.toggle('done', i < chapterNo(step.ch));
    });
    refs.progress.firstChild.style.width = `${((story.index + 1) / story.total) * 100}%`;
    refs.pos.firstChild.textContent = `${ui.chapter} ${chapterNo(step.ch)} · ${n}/${of}`;
    refs.pos.lastChild.textContent = app.content.steps[step.id]?.title || '';
    refs.prev.disabled = story.index === 0;
    refs.next.disabled = story.index === story.total - 1;
    refs.mode.textContent = app.mode === 'explore' ? ui.presenter : ui.explore;
    refs.detail.classList.toggle('on', app.detailOpen);
    refs.mode.classList.toggle('on', app.mode === 'explore');
    refs.hint.textContent = app.mode === 'explore' ? ui.exploreHint : ui.presenterHint;
    menu.querySelectorAll('button[data-step]').forEach((b) => b.classList.toggle('active', b.dataset.step === step.id));
    tick(true);
  }

  let lastTick = 0;
  function tick(force = false) {
    const now = performance.now();
    if (!force && now - lastTick < 500) return;
    lastTick = now;
    const t = app.story.timing();
    const ui = app.content.ui;
    refs.timer.firstChild.textContent = fmtClock(t.total);
    refs.timer.lastChild.textContent = `${fmtClock(t.chapterElapsed)} / ${fmtClock(t.budget)}`;
    refs.timer.classList.toggle('running', t.running);
    refs.timer.classList.toggle('over', t.over);
    refs.timer.title = t.over ? `${ui.timer} · ${ui.overBudget}` : ui.timer;
  }

  rebuild();
  return { rebuild, update, tick };
}
