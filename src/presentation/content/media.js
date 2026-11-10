// Foto kunjungan (WebP ±100–200 KB, 1600 px) dan logo sebagai identitas subjek studi di sampul.
// Semua foto dipakai dengan izin tim; caption per bahasa ada di content/id.js dan en.js.
const url = (f) => new URL(`./media/${f}`, import.meta.url).href;

export const MEDIA = {
  logo: url('logo-pertamina.png'),
  'bab0-gerbang-itj': url('bab0-gerbang-itj.webp'),
  'bab0-briefing': url('bab0-briefing.webp'),
  'bab0-pembukaan': url('bab0-pembukaan.webp'),
  'bab2-cek-kesehatan': url('bab2-cek-kesehatan.webp'),
  'bab2-safety-induction': url('bab2-safety-induction.webp'),
  'bab2-area-terminal': url('bab2-area-terminal.webp'),
  'bab2-briefing-lapangan': url('bab2-briefing-lapangan.webp'),
  'bab2-peserta-apd': url('bab2-peserta-apd.webp'),
  'bab2-diskusi-kantor': url('bab2-diskusi-kantor.webp'),
  'bab5-presentasi-tradeoff': url('bab5-presentasi-tradeoff.webp'),
  'bab6-diskusi-manajemen': url('bab6-diskusi-manajemen.webp'),
};
