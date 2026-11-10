// Halaman video: garis waktu utuh, teks dua bahasa lengkap, dan foto yang dirujuk memang ada.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SHOTS, TOTAL, TOTAL_BARS, BAR, BPM, LEAD, MUSIC, PARTS, VISIT_STEPS, locate, partStart, fmtTime } from '../src/film/shots.js';
import { CONTENT } from '../src/film/content.js';
import { bedLevels, Soundtrack } from '../src/film/audio.js';
import { NARRATION, NARRATION_LANG, spokenAt } from '../src/film/narration.js';

describe('garis waktu video', () => {
  it('shot bersambung tanpa celah dan bagian berurutan', () => {
    let at = 0, part = 0;
    for (const s of SHOTS) {
      expect(s.start).toBeCloseTo(at, 6);
      expect(s.dur).toBeGreaterThan(3);
      expect(s.part).toBeGreaterThanOrEqual(part);
      part = s.part;
      at += s.dur;
    }
    expect(TOTAL).toBeCloseTo(at, 6);
    expect(TOTAL).toBeCloseTo(LEAD + TOTAL_BARS * BAR, 6);
    expect(PARTS.map((_, i) => partStart(i))).toEqual([...PARTS.map((_, i) => partStart(i))].sort((a, b) => a - b));
  });
  it('setiap potongan jatuh di awal birama musik latar (120 BPM, ketukan pertama di detik 1,79)', () => {
    expect(BPM).toBe(120);
    expect(BAR).toBe(2);
    expect(LEAD).toBeCloseTo(1.79, 6);
    expect(SHOTS[0].start).toBe(0); // frame judul tampil sejak nada pembuka
    for (const s of SHOTS.slice(1)) {
      expect(Number.isInteger(s.bars) && s.bars >= 2).toBe(true);
      expect((s.start - LEAD) / BAR).toBeCloseTo(s.bar, 6);
    }
  });
  it('video selesai bersama lagu dan bagian video berganti di batas bagian lagu', () => {
    const TRACK_SECONDS = 153.88, LAST_SOUND = 149.7; // panjang berkas dan saat gema terakhir padam (diukur dari rekaman)
    expect(TOTAL).toBeLessThan(TRACK_SECONDS);
    expect(Math.abs(TOTAL - LAST_SOUND)).toBeLessThan(1);
    const bar = (id) => SHOTS.find((s) => s.id === id).bar;
    expect(bar('supply')).toBe(MUSIC.drums); // drum masuk saat garis rute digambar
    expect(bar('truck')).toBe(MUSIC.calm); // bagian tenang: truk tembus pandang
    expect(bar('trip')).toBe(MUSIC.build);
    expect(bar('v.health')).toBe(MUSIC.drums2); // drum kembali di tengah foto kunjungan
    expect(bar('thanks')).toBe(MUSIC.outro);
    expect(bar('end')).toBeLessThan(MUSIC.final);
    expect(TOTAL_BARS).toBeGreaterThan(MUSIC.final); // akor terakhir berdengung di kartu penutup
  });
  it('kelompok teks berurutan dan mencakup seluruh shot anggotanya', () => {
    const seen = new Set();
    let last = null;
    for (const s of SHOTS) {
      if (s.cap !== last) {
        expect(seen.has(s.cap), `kelompok ${s.cap} terpecah`).toBe(false);
        seen.add(s.cap);
        last = s.cap;
      }
      expect(s.capStart).toBeLessThanOrEqual(s.start + 1e-9);
      expect(s.capEnd).toBeGreaterThanOrEqual(s.start + s.dur - 1e-9);
    }
  });
  it('locate mengembalikan shot dan kemajuan yang benar di tepi garis waktu', () => {
    expect(locate(-5).i).toBe(0);
    expect(locate(TOTAL + 5).i).toBe(SHOTS.length - 1);
    const s = SHOTS[4];
    const mid = locate(s.start + s.dur / 2);
    expect(mid.shot.id).toBe(s.id);
    expect(mid.p).toBeCloseTo(0.5, 6);
    expect(locate(s.start).i).toBe(4);
    expect(fmtTime(125)).toBe('2:05');
  });
  it('setiap shot 3D punya gerak kamera, setiap shot foto punya foto yang ada', () => {
    for (const s of SHOTS) {
      if (s.kind === '3d') {
        for (const end of [s.cam.from, s.cam.to]) {
          expect(end.dist).toBeGreaterThan(0);
          expect(end.dir).toHaveLength(3);
          if (!s.follow) expect(end.tgt).toHaveLength(3);
        }
      } else {
        expect(fs.existsSync(new URL(`../src/presentation/content/media/${s.photo}.webp`, import.meta.url))).toBe(true);
        expect(s.kb.s).toHaveLength(2);
      }
    }
    expect(VISIT_STEPS.length).toBe(10);
  });
  it('teks tersedia di kedua bahasa untuk setiap shot, label dan bagian', () => {
    for (const c of Object.values(CONTENT)) {
      for (const s of SHOTS) {
        expect(c.shots[s.cap]?.title, `${c.code} ${s.cap}`).toBeTruthy();
        for (const [key] of s.labels || []) expect(c.labels[key]?.[0], `${c.code} label ${key}`).toBeTruthy();
      }
      for (const p of PARTS) expect(c.ui.parts[p]).toBeTruthy();
      expect(c.ui.disclaimer).toBeTruthy();
    }
    expect(Object.keys(CONTENT.en.shots).sort()).toEqual(Object.keys(CONTENT.id.shots).sort());
    expect(Object.keys(CONTENT.en.ui).sort()).toEqual(Object.keys(CONTENT.id.ui).sort());
  });
});

describe('suara video', () => {
  it('deru mesin hanya pada adegan truk dan mereda saat truk tiba di SPBU', () => {
    const at = (id, p) => { const s = SHOTS.find((x) => x.id === id); return bedLevels(s.start + s.dur * p); };
    expect(at('truck', 0.5).engine).toBe(1);
    expect(at('trip', 0.3).engine).toBe(1);
    expect(at('trip', 0.98).engine).toBeLessThan(0.4);
    expect(at('v.opening', 0.5).engine).toBe(0);
    expect(at('where', 0.5).engine).toBe(0);
    expect(at('storage', 0.5)).toEqual({ engine: 0, pitch: 0.62 }); // adegan 3D tanpa truk: tidak ada derau latar
  });
  it('tanpa Web Audio (mis. di Node) soundtrack diam tanpa galat', () => {
    const s = new Soundtrack();
    expect(s.available).toBe(false);
    expect(() => { s.unlock(); s.update(10, true); s.setMuted(true); }).not.toThrow();
  });
});

describe('narasi video', () => {
  it('setiap kalimat punya naskah, berkas suara dan durasi', () => {
    expect(NARRATION_LANG).toBe('id');
    expect(NARRATION.length).toBeGreaterThan(10);
    for (const n of NARRATION) {
      expect(n.text.length, n.id).toBeGreaterThan(10);
      expect(n.url, n.id).toBeTruthy();
      expect(fs.existsSync(new URL(`../src/film/assets/voice/${n.id}.m4a`, import.meta.url)), n.id).toBe(true);
      expect(n.dur, n.id).toBeGreaterThan(1.5);
    }
  });
  it('setiap kalimat selesai sebelum gambarnya berganti dan tidak menimpa kalimat berikutnya', () => {
    NARRATION.forEach((n, i) => {
      expect(n.end, `${n.id} melewati slotnya`).toBeLessThanOrEqual(n.slotEnd - 0.3);
      if (i) expect(n.start - NARRATION[i - 1].end, `${n.id} terlalu rapat`).toBeGreaterThanOrEqual(0.8);
    });
    expect(NARRATION[0].start).toBeGreaterThan(LEAD); // setelah nada pembuka lagu
    expect(NARRATION.at(-1).end).toBeLessThan(TOTAL - 3); // selesai sebelum video meredup
  });
  it('spokenAt menemukan kalimat yang sedang diucapkan', () => {
    const n = NARRATION[3];
    expect(spokenAt(n.start + 0.1).id).toBe(n.id);
    expect(spokenAt(n.end + 0.3)).toBeUndefined();
    expect(spokenAt(n.start - 0.1, 0.2).id).toBe(n.id);
    expect(spokenAt(0)).toBeUndefined();
  });
  it('pilihan narasi: mati bila pengguna mematikannya atau bahasanya bukan Indonesia', () => {
    const s = new Soundtrack();
    expect(s.voiceOn).toBe(true);
    s.setVoiceLanguage(false);
    expect(s.voiceOn).toBe(false);
    s.setVoiceLanguage(true);
    s.setVoice(false);
    expect(s.voiceOn).toBe(false);
  });
});
