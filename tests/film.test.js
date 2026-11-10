// Halaman video: garis waktu utuh, teks dua bahasa lengkap, dan foto yang dirujuk memang ada.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SHOTS, TOTAL, PARTS, VISIT_STEPS, locate, partStart, fmtTime } from '../src/film/shots.js';
import { CONTENT } from '../src/film/content.js';
import { sectionAt, bedLevels, Soundtrack } from '../src/film/audio.js';

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
    expect(TOTAL).toBeGreaterThan(120);
    expect(TOTAL).toBeLessThan(200);
    expect(PARTS.map((_, i) => partStart(i))).toEqual([...PARTS.map((_, i) => partStart(i))].sort((a, b) => a - b));
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
        expect(c.shots[s.id]?.title, `${c.code} ${s.id}`).toBeTruthy();
        for (const [key] of s.labels || []) expect(c.labels[key], `${c.code} label ${key}`).toBeTruthy();
      }
      for (const p of PARTS) expect(c.ui.parts[p]).toBeTruthy();
      expect(c.ui.disclaimer).toBeTruthy();
    }
    expect(Object.keys(CONTENT.en.shots).sort()).toEqual(Object.keys(CONTENT.id.shots).sort());
    expect(Object.keys(CONTENT.en.ui).sort()).toEqual(Object.keys(CONTENT.id.ui).sort());
  });
});

describe('suara video', () => {
  it('tekstur musik berganti di batas bagian video', () => {
    expect(sectionAt(0)).toBe('intro');
    expect(sectionAt(SHOTS.find((s) => s.id === 'where').start + 0.1)).toBe('map');
    expect(sectionAt(SHOTS.find((s) => s.id === 'aerial').start + 0.1)).toBe('full');
    expect(sectionAt(partStart(1) + 0.1)).toBe('visit');
    expect(sectionAt(partStart(2) + 0.1)).toBe('closing');
  });
  it('deru mesin hanya pada adegan truk dan mereda saat truk tiba di SPBU', () => {
    const at = (id, p) => { const s = SHOTS.find((x) => x.id === id); return bedLevels(s.start + s.dur * p); };
    expect(at('truck', 0.5).engine).toBe(1);
    expect(at('trip', 0.3).engine).toBe(1);
    expect(at('trip', 0.98).engine).toBeLessThan(0.4);
    expect(at('v.opening', 0.5)).toMatchObject({ engine: 0, amb: 0 });
    expect(at('where', 0.5).engine).toBe(0);
    expect(at('storage', 0.5).amb).toBe(1);
  });
  it('tanpa Web Audio (mis. di Node) soundtrack diam tanpa galat', () => {
    const s = new Soundtrack();
    expect(s.available).toBe(false);
    expect(() => { s.unlock(); s.update(10, true); s.setMuted(true); }).not.toThrow();
  });
});
