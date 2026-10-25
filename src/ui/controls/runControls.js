import { el } from '../dom.js';
import { ID, fmtNumber } from '../i18n/id.js';
import { PLAYBACK_SPEEDS } from '../../config/operations.js';
import { PRESETS } from '../../config/presets.js';
import { formatSimTime } from '../../sim/clock.js';

// Bilah atas (judul, pil status berdenyut, jam, kontrol run), bilah mode tersegmentasi, baris kamera dan footer.
export function createRunControls({ topbar, controls, footer }, app) {
  const identity = el('div', { class: 'identity' }, el('strong', { text: ID.app.title }), el('small', { text: ID.app.subtitle }));
  const pillDot = el('i');
  const pillText = el('span', { text: ID.app.pausedPill });
  const pill = el('div', { class: 'pill paused', id: 'status' }, pillDot, pillText);
  const startBtn = el('button', { class: 'primary', onClick: () => (app.running ? app.pause() : app.start()) });
  const resetBtn = el('button', { text: ID.run.reset, onClick: () => app.reset() });
  const defaultsBtn = el('button', { text: ID.run.restoreDefaults, class: 'small', onClick: () => app.restoreDefaults() });
  const speedBtns = PLAYBACK_SPEEDS.map((k) => el('button', { class: 'small', text: `${k}×`, onClick: () => app.setSpeed(k) }));
  const actual = el('span', { class: 'muted optional' });
  const clock = el('span', { class: 'clock' });
  const progFill = el('div');
  const prog = el('div', { class: 'progress', title: ID.run.progress }, progFill);
  const presetSel = el('select', { title: ID.run.preset, onChange: () => app.applyPreset(presetSel.value) }, ...PRESETS.map((p) => el('option', { value: p.id, text: ID.presets[p.id] })));
  const seedInput = el('input', { type: 'number', value: String(app.engine.config.operations.seed), title: ID.run.seed, style: { width: '104px' } });
  seedInput.addEventListener('change', () => app.setSeed(parseInt(seedInput.value, 10)));
  const fps = el('span', { class: 'muted optional' });
  const aboutBtn = el('button', { class: 'small', text: ID.panels.about, onClick: () => app.showAbout() });
  const presBtn = el('button', { class: 'small', text: ID.app.presentation, 'aria-pressed': 'false', onClick: () => app.togglePresentation() });
  topbar.append(identity, pill, startBtn, resetBtn, ...speedBtns, actual, el('span', { class: 'spacer' }), clock, prog, presetSel, seedInput, defaultsBtn, presBtn, aboutBtn, fps);

  // Bilah mode dan baris kamera
  const modes = ['operation', 'zones', 'roofsOff', 'oneTruck'];
  const modeBar = el('nav', { class: 'mode-bar', 'aria-label': ID.app.mode }, ...modes.map((m) => el('button', { 'data-mode': m, 'aria-pressed': String(m === 'operation'), text: ID.modes[m], onClick: () => app.setMode(m) })));
  const cams = ['overview', 'side', 'top', 'bay', 'flight', 'free'];
  const camRow = el('nav', { class: 'camera-row', 'aria-label': ID.app.view }, el('span', { class: 'caption', text: ID.app.view }), ...cams.map((c) => el('button', { 'data-camera': c, 'aria-pressed': String(c === 'overview'), text: ID.cameras[c], onClick: () => app.setCamera(c) })));
  controls.append(modeBar, camRow);
  footer.append(el('span', { text: ID.app.footerNote }), el('span', { class: 'hint' }, '🖱', ID.app.hint));

  return {
    update() {
      const e = app.engine;
      startBtn.textContent = app.running ? ID.run.pause : e.time > 0 ? ID.run.resume : ID.run.start;
      pill.classList.toggle('paused', !app.running);
      pillText.textContent = app.running ? ID.app.running : ID.app.pausedPill;
      speedBtns.forEach((b, i) => b.classList.toggle('active', PLAYBACK_SPEEDS[i] === app.speed));
      actual.textContent = `${ID.run.actualSpeed}: ${fmtNumber(app.actualSpeed, 1)}×`;
      clock.textContent = formatSimTime(e.time, e.config.operations.calendar);
      progFill.style.width = `${Math.min(100, (e.time / e.horizon) * 100)}%`;
      progFill.style.background = e.time > e.horizon ? 'var(--orange)' : '';
      fps.textContent = `${fmtNumber(app.view?.fps ?? 0, 0)} fps`;
      if (presetSel.value !== app.presetId) presetSel.value = app.presetId;
      if (document.activeElement !== seedInput) seedInput.value = String(e.config.operations.seed);
      presBtn.setAttribute('aria-pressed', String(!!app.presentation));
      presBtn.classList.toggle('active', !!app.presentation);
      modeBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === app.mode)));
      const cam = app.view?.rig.mode === 'follow' ? 'bay' : app.view?.rig.mode;
      camRow.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.camera === cam && app.view?.rig.mode !== 'follow')));
    },
  };
}
