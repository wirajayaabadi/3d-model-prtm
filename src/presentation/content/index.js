import id from './id.js';
import en from './en.js';
import { MEDIA } from './media.js';

export const CONTENT = { id, en };
export { MEDIA };

export function pickLanguage() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q && CONTENT[q]) return q;
  try {
    const saved = localStorage.getItem('itj-pres-lang');
    if (saved && CONTENT[saved]) return saved;
  } catch {}
  return 'id';
}

export function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
