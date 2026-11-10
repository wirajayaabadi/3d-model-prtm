import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { offlinePlugin } from './scripts/offlinePlugin.mjs';

// Tiga halaman dalam satu proyek: video perkenalan di `/` (halaman utama), simulasi di `/simulasi/`, presentasi 3D
// di `/presentasi/`.
// `base: './'` membuat build dapat dijalankan dari folder mana pun (versi offline di laptop acara).
// offlinePlugin menulis dist/sw.js: service worker yang menyimpan seluruh situs di browser setelah kunjungan pertama.
export default defineConfig({
  base: './',
  plugins: [offlinePlugin()],
  build: {
    rollupOptions: {
      input: {
        video: fileURLToPath(new URL('./index.html', import.meta.url)),
        simulasi: fileURLToPath(new URL('./simulasi/index.html', import.meta.url)),
        presentasi: fileURLToPath(new URL('./presentasi/index.html', import.meta.url)),
      },
    },
  },
});
