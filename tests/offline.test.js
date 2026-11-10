// Service worker: daftar berkas yang disimpan dan sw.js yang dihasilkan saat build.
import { describe, it, expect } from 'vitest';
import { precacheList, swSource } from '../scripts/offlinePlugin.mjs';

const bundle = {
  'index.html': { type: 'asset', source: '<html>video</html>' },
  'simulasi/index.html': { type: 'asset', source: '<html>sim</html>' },
  'presentasi/index.html': { type: 'asset', source: '<html>pres</html>' },
  'assets/video-abc.js': { type: 'chunk', code: 'console.log(1)' },
  'assets/background-music-x.mp3': { type: 'asset', source: new Uint8Array([1, 2, 3]) },
  'assets/video-abc.js.map': { type: 'asset', source: '{}' },
};

describe('mode offline (service worker)', () => {
  it('menyimpan ketiga halaman sebagai folder dan semua berkas build, kecuali sw.js dan source map', () => {
    const list = precacheList([...Object.keys(bundle), 'sw.js']);
    expect(list.slice(0, 3).sort()).toEqual(['', 'presentasi/', 'simulasi/']);
    expect(list).toContain('assets/video-abc.js');
    expect(list).toContain('assets/background-music-x.mp3');
    expect(list).not.toContain('sw.js');
    expect(list.some((f) => f.endsWith('.map') || f.endsWith('index.html'))).toBe(false);
  });
  it('versi berubah hanya bila isi build berubah', () => {
    const version = (b) => swSource(b).match(/const VERSION = "(\w+)"/)[1];
    expect(version(bundle)).toBe(version({ ...bundle }));
    expect(version({ ...bundle, 'index.html': { type: 'asset', source: '<html>baru</html>' } })).not.toBe(version(bundle));
    expect(() => new Function(swSource(bundle))).not.toThrow(); // sw.js hasil build adalah JavaScript yang sah
  });
});
