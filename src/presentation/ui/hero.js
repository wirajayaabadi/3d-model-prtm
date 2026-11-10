// Lapisan hero: kicker bab, judul besar, satu kalimat, angka raksasa, dan strip foto besar; sampul memakai
// varian layar penuh. Transisi bab: foto kunjungan layar penuh dengan zoom pelan, nomor dan judul bab.
import { el, clear } from '../../ui/dom.js';
import { MEDIA } from '../content/index.js';
import { HERO, CHAPTER_INTRO } from '../content/hero.js';
import { chapterNo } from '../story/steps.js';

function firstSentence(text = '') {
  const m = /^(.+?[.!?])(\s|$)/.exec(text);
  return m ? m[1] : text;
}

export function renderHero(root, { content, lang, step, data, position, onPhoto }) {
  clear(root);
  if (!data) return;
  const ui = content.ui;
  const isCover = step.id === 'b0.cover';
  root.className = isCover ? 'cover' : '';
  root.classList.remove('in');
  void root.offsetWidth; // mulai ulang animasi masuk
  root.classList.add('in');
  const chapter = content.chapters[step.ch];
  if (isCover) {
    root.append(
      el('div', { class: 'h-kicker' }, el('span', { class: 'dot' }), ui.programLong),
      el('h1', { text: data.title }),
      el('p', { class: 'h-lead', text: content.meta.unit }),
      el('div', { class: 'h-meta' }, el('span', { text: `${lang === 'id' ? 'Kunjungan' : 'Visit'} ${content.meta.visitDate}` }), el('span', { text: content.meta.presentationDate }), el('span', { text: content.meta.duration })),
    );
  } else {
    root.append(
      el('div', { class: 'h-kicker' }, el('b', { text: String(chapterNo(step.ch)).padStart(2, '0') }), ` ${chapter.title}`, el('span', { class: 'h-pos', text: `${position.n}/${position.of}` })),
      el('h1', { text: data.title }),
      data.lead ? el('p', { class: 'h-lead', text: firstSentence(data.lead) }) : null,
    );
  }
  const stats = HERO[lang]?.[step.id] || [];
  if (stats.length) {
    root.append(el('div', { class: 'h-stats' }, ...stats.map(([v, l, c], i) => el('div', { class: 'h-stat', style: { animationDelay: `${0.15 + i * 0.12}s` } }, el('div', { class: 'v', text: v }), el('div', { class: 'l' }, l, c ? el('i', { class: 'chk', title: ui.checkTitle, text: ui.check }) : null)))));
  }
  const media = (data.media || []).filter((k) => MEDIA[k]);
  if (media.length && !isCover) {
    root.append(el('div', { class: 'h-photos' }, ...media.slice(0, 3).map((k) => el('button', { type: 'button', class: 'h-photo', title: content.media[k] || '', onClick: () => onPhoto(k, media) }, el('img', { src: MEDIA[k], alt: content.media[k] || '' })))));
  }
  if (isCover) root.append(el('div', { class: 'h-start' }, el('kbd', { text: '→' }), lang === 'id' ? ' untuk memulai' : ' to begin'));
}

export function renderCoverBackdrop(root, show) {
  if (show && !root.firstChild) root.append(el('div', { class: 'cb-img', style: { backgroundImage: `url(${MEDIA['bab0-gerbang-itj']})` } }));
  root.classList.toggle('show', show);
}

export function showChapterIntro(root, { content, lang, ch, onDone }) {
  clear(root);
  const photo = MEDIA[CHAPTER_INTRO.photos[ch]];
  const chapter = content.chapters[ch];
  root.append(
    el('div', { class: 'ci-img', style: { backgroundImage: `url(${photo})` } }),
    el('div', { class: 'ci-shade' }),
    el('div', { class: 'ci-text' },
      el('div', { class: 'ci-no', text: String(chapterNo(ch)).padStart(2, '0') }),
      el('div', { class: 'ci-label', text: `${content.ui.chapter} ${chapterNo(ch)}` }),
      el('h2', { text: chapter.title }),
      el('p', { text: CHAPTER_INTRO[lang][ch] }),
    ),
  );
  root.hidden = false;
  root.classList.remove('out');
  clearTimeout(root._t);
  root._t = setTimeout(() => hideChapterIntro(root, onDone), 3000);
  root.onclick = () => hideChapterIntro(root, onDone);
}

export function hideChapterIntro(root, onDone) {
  if (root.hidden || root.classList.contains('out')) return false;
  clearTimeout(root._t);
  root.classList.add('out');
  setTimeout(() => {
    root.hidden = true;
    root.classList.remove('out');
    onDone?.();
  }, 450);
  return true;
}
