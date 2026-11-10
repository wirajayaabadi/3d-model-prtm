import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Tiga halaman dalam satu proyek: video perkenalan di `/` (halaman utama), simulasi di `/simulasi/`, presentasi 3D
// di `/presentasi/`.
// `base: './'` membuat build dapat dijalankan dari folder mana pun (versi offline di laptop acara).
export default defineConfig({
  base: './',
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
