// Service worker: menyimpan seluruh situs (video, simulasi, presentasi) di browser setelah kunjungan pertama, supaya
// situs tetap terbuka saat jaringan lambat atau putus. Berkas ini adalah templat; saat build, plugin di
// scripts/offlinePlugin.mjs menaruh VERSION dan FILES (daftar semua berkas hasil build) di atasnya dan menulisnya
// sebagai dist/sw.js.
//
// Aturan:
// - Halaman HTML: ambil dari jaringan dulu supaya deploy baru langsung terlihat. Bila jaringan putus, atau tidak
//   menjawab dalam NAV_TIMEOUT, pakai salinan tersimpan.
// - Berkas lain (JS, CSS, model 3D, foto, musik, font): pakai salinan tersimpan dulu. Aman karena nama berkas Vite
//   memuat hash isinya, jadi isi baru selalu bernama baru.
// - Versi baru service worker baru mengambil alih setelah semua tab situs ditutup, sehingga presentasi yang sedang
//   berjalan tidak pernah kehilangan berkasnya di tengah jalan.
/* global VERSION, FILES */
const CACHE = `itj-offline-${VERSION}`;
const NAV_TIMEOUT = 3000;
const ROOT = new URL('./', self.registration.scope);

// Kunci simpanan halaman: tanpa query dan tanpa "index.html", selalu diakhiri "/" (Vercel juga melayani /simulasi)
function pageKey(url) {
  const u = new URL(url);
  let path = u.pathname.replace(/index\.html$/, '');
  if (!path.endsWith('/') && !/\.[a-z0-9]+$/i.test(path.split('/').pop())) path += '/';
  return u.origin + path;
}
const isPage = (req) => req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

// Respons hasil pengalihan tidak boleh dipakai untuk navigasi; salin badannya ke respons baru
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function store(cache, key, res) {
  if (res && res.ok && res.type === 'basic') await cache.put(key, await clean(res.clone()));
  return res;
}

self.addEventListener('install', (event) => {
  // Unduh semua berkas. Satu berkas gagal tidak membatalkan yang lain; yang terlewat diambil saat pertama dipakai.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(
        FILES.map(async (f) => {
          const url = new URL(f, ROOT).href;
          const key = f === '' || f.endsWith('/') ? pageKey(url) : url;
          if (await cache.match(key)) return;
          await store(cache, key, await fetch(url, { cache: 'reload' }));
        }),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('itj-offline-') && name !== CACHE) await caches.delete(name);
      await self.clients.claim(); // kunjungan pertama: halaman yang sedang terbuka langsung dilayani
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('/sw.js')) return;
  event.respondWith(isPage(req) ? page(event, req) : asset(req));
});

async function page(event, req) {
  const cache = await caches.open(CACHE);
  const key = pageKey(req.url);
  const network = fetch(req).then((res) => store(cache, key, res));
  event.waitUntil(network.catch(() => {})); // biarkan unduhan selesai walau salinan sudah dipakai
  const saved = await cache.match(key);
  if (!saved) return network.catch(() => offlinePage());
  const late = new Promise((resolve) => setTimeout(() => resolve(saved), NAV_TIMEOUT));
  return Promise.race([network.then((res) => (res.ok ? res : saved)), late]).catch(() => saved);
}

async function asset(req) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(req);
  if (saved) return saved;
  try {
    return await store(cache, req, await fetch(req));
  } catch (e) {
    return Response.error();
  }
}

function offlinePage() {
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>'
    + '<body style="font:16px system-ui;padding:32px;background:#0b1626;color:#e8eef5">'
    + '<h1 style="font-size:22px">Tidak ada koneksi</h1><p>Halaman ini belum tersimpan di browser ini. Sambungkan internet lalu muat ulang.</p>'
    + '<p style="opacity:.7">Presentasi akademik, bukan materi resmi Pertamina</p></body>';
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
