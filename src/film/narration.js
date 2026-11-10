// Narasi (voice-over) video: naskah di narration.json, berkas suara dan durasinya di assets/voice/ (dibuat oleh
// scripts/make-voice.py). Di sini tiap kalimat diberi waktu mulai dan selesai pada garis waktu video.
// Narasi hanya tersedia dalam bahasa Indonesia; pada tampilan bahasa Inggris video berjalan dengan teks saja.
import script from './narration.json';
import index from './assets/voice/index.json';
import { SHOTS } from './shots.js';

const files = import.meta.glob('./assets/voice/*.m4a', { eager: true, query: '?url', import: 'default' });
const shot = (id) => SHOTS.find((s) => s.id === id);

export const NARRATION_LANG = script.lang;
export const NARRATION = script.segments.map((seg) => {
  const start = shot(seg.shot).start + seg.delay, dur = index.seconds[seg.id];
  const last = shot(seg.until);
  return { id: seg.id, text: seg.text, start, dur, end: start + dur, slotEnd: last.start + last.dur, url: files[`./assets/voice/${seg.id}.m4a`] };
});

// Kalimat yang sedang diucapkan pada waktu video t (dengan kelonggaran `pad` detik di kedua sisi), atau undefined.
export function spokenAt(t, pad = 0) {
  return NARRATION.find((n) => t >= n.start - pad && t < n.end + pad);
}
