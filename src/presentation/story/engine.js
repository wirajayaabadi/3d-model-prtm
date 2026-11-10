// Mesin cerita: indeks langkah aktif, maju/mundur, routing hash (#bab-2/3), tombol dan clicker, timer per bab,
// dan siaran status ke jendela catatan (BroadcastChannel). Penerapan langkah (kamera, lapisan, kartu) dilakukan
// oleh App lewat callback onApply.
import { STEPS, stepsOfChapter, ACTIVE_CHAPTERS, chapterNo } from './steps.js';

export const CHANNEL = 'itj-presentasi';

export class StoryEngine {
  constructor({ onApply, onChange, chapters }) {
    this.onApply = onApply;
    this.onChange = onChange;
    this.chapters = chapters; // [{ minutes }]
    this.index = 0;
    this.timer = { running: false, startedAt: 0, accumulated: 0, chapterStart: {} };
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
    this.channel?.addEventListener('message', (e) => {
      const m = e.data || {};
      if (m.type === 'cmd') {
        if (m.cmd === 'next') this.next();
        else if (m.cmd === 'prev') this.prev();
        else if (m.cmd === 'goto') this.goTo(m.index);
        else if (m.cmd === 'timer') this.toggleTimer();
        else if (m.cmd === 'hello') this.broadcast();
      }
    });
    window.addEventListener('hashchange', () => {
      const i = this.parseHash();
      if (i != null && i !== this.index) this.goTo(i, { fromHash: true });
    });
  }

  get step() {
    return STEPS[this.index];
  }
  get total() {
    return STEPS.length;
  }
  positionInChapter(i = this.index) {
    const s = STEPS[i];
    const list = stepsOfChapter(s.ch);
    return { n: list.indexOf(s) + 1, of: list.length };
  }

  parseHash() {
    const m = /#bab-(\d+)(?:\/(\d+))?/.exec(location.hash);
    if (!m) return null;
    const ch = ACTIVE_CHAPTERS[+m[1]], n = m[2] ? +m[2] : 1;
    if (ch == null) return null;
    const list = stepsOfChapter(ch);
    if (!list.length) return null;
    const s = list[Math.min(list.length, Math.max(1, n)) - 1];
    return STEPS.indexOf(s);
  }
  writeHash() {
    const { n } = this.positionInChapter();
    const h = `#bab-${chapterNo(this.step.ch)}/${n}`;
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  start() {
    const i = this.parseHash();
    this.goTo(i ?? 0, { immediate: true });
  }
  goTo(i, opts = {}) {
    const next = Math.max(0, Math.min(STEPS.length - 1, i));
    const prev = STEPS[this.index];
    const dir = next >= this.index ? 1 : -1;
    this.index = next;
    const step = STEPS[next];
    if (step.ch !== prev?.ch || opts.immediate) this.markChapter(step.ch);
    this.onApply(step, { prev, dir, immediate: !!opts.immediate });
    this.writeHash();
    this.onChange?.();
    this.broadcast();
  }
  next() {
    if (this.index === 0 && !this.timer.running && this.timer.accumulated === 0) this.toggleTimer(); // mulai waktu saat meninggalkan sampul
    if (this.index < STEPS.length - 1) this.goTo(this.index + 1);
  }
  prev() {
    if (this.index > 0) this.goTo(this.index - 1);
  }
  goToChapter(ch) {
    const list = stepsOfChapter(ch);
    if (list.length) this.goTo(STEPS.indexOf(list[0]));
  }

  // ---------- Timer ----------
  now() {
    return this.timer.accumulated + (this.timer.running ? (performance.now() - this.timer.startedAt) / 1000 : 0);
  }
  toggleTimer() {
    const t = this.timer;
    if (t.running) {
      t.accumulated += (performance.now() - t.startedAt) / 1000;
      t.running = false;
    } else {
      t.startedAt = performance.now();
      t.running = true;
    }
    this.onChange?.();
  }
  resetTimer() {
    this.timer = { running: false, startedAt: 0, accumulated: 0, chapterStart: {} };
    this.markChapter(this.step.ch);
    this.onChange?.();
  }
  markChapter(ch) {
    if (this.timer.chapterStart[ch] == null) this.timer.chapterStart[ch] = this.now();
  }
  timing() {
    const total = this.now();
    const ch = this.step.ch;
    const start = this.timer.chapterStart[ch] ?? total;
    const chapterElapsed = Math.max(0, total - start);
    const budget = (this.chapters[ch]?.minutes || 1) * 60;
    const planned = ACTIVE_CHAPTERS.slice(0, chapterNo(ch)).reduce((s, c) => s + (this.chapters[c]?.minutes || 0) * 60, 0);
    return { total, chapterElapsed, budget, over: chapterElapsed > budget, plannedStart: planned, running: this.timer.running };
  }

  // ---------- Siaran ke jendela catatan ----------
  broadcast(extra = {}) {
    if (!this.channel) return;
    const t = this.timing();
    this.channel.postMessage({ type: 'state', index: this.index, total: STEPS.length, timing: t, ...extra });
  }
  dispose() {
    this.channel?.close();
  }
}
