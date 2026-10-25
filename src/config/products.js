// Konfigurasi produk. Warna adalah token yang dapat diedit (dipilih menyerupai warna yang lazim di SPBU Pertamina;
// ganti dengan nilai resmi bila tersedia); nama produk selalu ditampilkan bersama warnanya.
export const PRODUCT_IDS = ['pertalite', 'pertamax', 'pertamaxTurbo', 'pertadex', 'b50'];

export const DEFAULT_PRODUCTS = {
  pertalite: { id: 'pertalite', name: 'Pertalite', color: '#1E9E4A' },
  pertamax: { id: 'pertamax', name: 'Pertamax', color: '#0D5FB8' },
  pertamaxTurbo: { id: 'pertamaxTurbo', name: 'Pertamax Turbo', color: '#D7192A' },
  pertadex: { id: 'pertadex', name: 'Pertadex', color: '#2F3A44' },
  b50: { id: 'b50', name: 'B50', color: '#C9A227' },
};

export function cloneProducts(p = DEFAULT_PRODUCTS) {
  return JSON.parse(JSON.stringify(p));
}
