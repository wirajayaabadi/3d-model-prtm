// Daftarkan service worker (src/offline/sw.js) agar situs tetap terbuka saat jaringan lambat atau putus.
// Hanya di build produksi: di `npm run dev` tidak ada sw.js dan berkas berubah terus.
export function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Skrip ini dibundel ke <akar>/assets/, jadi akar situs selalu satu folder di atasnya, dari halaman mana pun
  const root = new URL('../', import.meta.url);
  const start = () =>
    navigator.serviceWorker
      .register(new URL('sw.js', root), { scope: root.pathname })
      .catch((e) => console.warn('Mode offline tidak aktif', e));
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true }); // tunggu halaman selesai dimuat agar tidak berebut jaringan
}
