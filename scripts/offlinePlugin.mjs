// Plugin Vite: menulis dist/sw.js dari templat src/offline/sw.js, dengan daftar semua berkas hasil build dan versi
// yang berubah setiap kali isi build berubah. Hanya berjalan saat `vite build`.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const TEMPLATE = new URL('../src/offline/sw.js', import.meta.url);

// Nama berkas build → alamat relatif terhadap akar situs. Halaman disimpan sebagai folder ('' = halaman utama).
export function precacheList(fileNames) {
  return fileNames
    .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
    .map((f) => (f === 'index.html' ? '' : f.replace(/(^|\/)index\.html$/, '$1')))
    .sort((a, b) => (a.endsWith('/') || a === '' ? 0 : 1) - (b.endsWith('/') || b === '' ? 0 : 1) || a.localeCompare(b));
}

export function swSource(bundle) {
  const files = precacheList(Object.keys(bundle));
  const hash = createHash('sha256');
  for (const name of Object.keys(bundle).sort()) {
    const item = bundle[name];
    hash.update(name);
    hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
  }
  const version = hash.digest('hex').slice(0, 12);
  return `const VERSION = ${JSON.stringify(version)};\nconst FILES = ${JSON.stringify(files, null, 1)};\n${fs.readFileSync(TEMPLATE, 'utf8')}`;
}

export function offlinePlugin() {
  return {
    name: 'itj-offline-sw',
    apply: 'build',
    enforce: 'post', // setelah Vite menulis halaman HTML ke bundle
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(bundle) });
    },
  };
}
