import { el, clear } from '../dom.js';
import { ID, t, fmtNumber, fmtPercent } from '../i18n/en.js';
import { PLAYBACK_SPEEDS } from '../../config/operations.js';
import { PRESETS } from '../../config/presets.js';
import { formatSimTime } from '../../sim/clock.js';

// Bilah aplikasi: tanda + nama, pencarian global, pemilih skenario, pil Live + jam, kontrol run, notifikasi, pengguna.
export function createAppBar(container, app) {
  const mark = el('span', { class: 'mark', html: '<svg width="16" height="16" viewBox="0 0 32 32" fill="none"><path d="M16 6l9 5v10l-9 5-9-5V11z" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M7 11l9 5 9-5M16 16v10" stroke="#fff" stroke-width="2.4"/></svg>' });
  const logo = el('div', { class: 'logo' }, mark, el('div', {}, el('strong', { text: ID.tower.appName }), el('small', { text: ID.tower.appSub })));
  const input = el('input', { type: 'search', placeholder: ID.tower.searchPlaceholder, 'aria-label': ID.tower.searchPlaceholder });
  const search = el('div', { class: 'search' }, '🔍', input, el('kbd', { text: '/' }));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      app.search(input.value);
      input.blur();
    }
    if (e.key === 'Escape') input.blur();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });
  const siteTag = el('span', { class: 'tag', text: 'ITJ' });
  const siteName = el('strong');
  const siteSub = el('small');
  const presetSel = el('select', { 'aria-label': ID.run.preset, onChange: () => app.applyPreset(presetSel.value) }, ...PRESETS.map((p) => el('option', { value: p.id, text: ID.presets[p.id] })));
  const site = el('div', { class: 'site' }, siteTag, el('div', {}, siteName, siteSub), el('span', { class: 'muted', text: '▾' }), presetSel);
  const liveDot = el('i');
  const liveText = el('span');
  const live = el('div', { class: 'live' }, liveDot, liveText);
  const playBtn = el('button', { class: 'primary', onClick: () => (app.running ? app.pause() : app.start()) });
  const speedBtns = PLAYBACK_SPEEDS.map((k) => el('button', { text: `${k}×`, onClick: () => app.setSpeed(k) }));
  const resetBtn = el('button', { text: ID.run.reset, onClick: () => app.reset() });
  const run = el('div', { class: 'run' }, playBtn, ...speedBtns, resetBtn);
  const bellN = el('span', { class: 'n', hidden: true });
  const bell = el('button', { class: 'iconbtn bell', title: ID.tower.notifications, onClick: () => app.toggleNotifications() }, '🔔', bellN);
  const menu = el('button', { class: 'iconbtn', title: ID.panels.about, onClick: () => app.showAbout() }, 'ⓘ');
  const drawerBtns = [
    el('button', { class: 'iconbtn', title: ID.tower.drawers.params, onClick: () => app.openDrawer('params') }, '⚙'),
    el('button', { class: 'iconbtn', title: ID.tower.drawers.dashboard, onClick: () => app.openDrawer('dashboard') }, '📊'),
  ];
  const user = el('div', { class: 'user' }, el('span', { class: 'avatar', text: 'M' }), el('div', {}, el('strong', { text: ID.tower.user }), el('small', { text: ID.tower.userRole })));
  container.append(logo, search, el('span', { class: 'spacer' }), site, live, run, ...drawerBtns, bell, menu, user);

  return {
    update() {
      const e = app.engine;
      const preset = PRESETS.find((p) => p.id === app.presetId) || PRESETS[0];
      siteName.textContent = ID.presets[preset.id];
      siteSub.textContent = `ρ ${fmtPercent(e.theory.rho)} · ${e.bays.filter((b) => b.active).length} active bays · seed ${e.config.operations.seed}`;
      if (presetSel.value !== app.presetId) presetSel.value = app.presetId;
      live.classList.toggle('paused', !app.running);
      liveText.textContent = `${app.running ? ID.tower.live : ID.tower.paused} ${formatSimTime(e.time, e.config.operations.calendar).replace(' WIB', '')}`;
      playBtn.textContent = app.running ? '❚❚' : '▶';
      playBtn.title = app.running ? ID.run.pause : ID.run.start;
      speedBtns.forEach((b, i) => b.classList.toggle('active', PLAYBACK_SPEEDS[i] === app.speed));
      const unread = app.notifications.filter((n) => !n.read).length;
      bellN.hidden = unread === 0;
      bellN.textContent = String(Math.min(99, unread));
    },
  };
}
