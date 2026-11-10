import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// Dua halaman dalam satu proyek: simulasi di `/`, presentasi 3D di `/presentasi/`.
// `base: './'` membuat build dapat dijalankan dari folder mana pun (versi offline di laptop acara).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        presentasi: fileURLToPath(new URL('./presentasi/index.html', import.meta.url)),
      },
    },
  },
});
