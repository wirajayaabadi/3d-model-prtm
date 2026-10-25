// Sistem desain bertema Pertamina (Bagian 19). Nilai brand disampel dari citra logo yang diberikan pengguna;
// ganti dengan nilai pedoman brand resmi bila tersedia. Logo dan wordmark TIDAK direkonstruksi di mana pun.
export const BRAND = {
  red: '#E31E2D',
  blue: '#0067B3',
  green: '#A3C93A',
  ink: '#13261C',
  blueDark: '#004A80',
  blueTint: '#E6F0F8',
  greenText: '#4E7A12',
  surface: '#F5F7FA',
  line: '#DCE3EA',
  muted: '#5C6B66',
  steel: '#8A949E',
  concrete: '#C9CDD1',
  asphalt: '#3B4045',
  markingWhite: '#F4F4F0',
  markingYellow: '#F2C230',
  orange: '#F07C00',
  lightBlue: '#5AA6DD',
  teal: '#1F9E8F',
  grey: '#6B7280',
  skyTop: '#EAF1F8',
  white: '#FFFFFF',
};

// Warna status bay selalu dipasangkan dengan ikon/bentuk + teks agar terbaca dalam skala abu-abu.
export const BAY_STATE_STYLE = {
  available: { color: BRAND.green, icon: '●', shape: 'dot' },
  reserved: { color: BRAND.blue, icon: '◯', shape: 'ring' },
  prep: { color: BRAND.lightBlue, icon: '🕒', shape: 'clock' },
  loading: { color: BRAND.blue, icon: '◧', shape: 'fill' },
  completion: { color: BRAND.teal, icon: '☑', shape: 'check' },
  clearing: { color: BRAND.steel, icon: '↪', shape: 'arrow' },
  inactive: { color: BRAND.grey, icon: '▦', shape: 'hatched' },
  pendingDeactivation: { color: BRAND.grey, icon: '⏸', shape: 'pause', outline: BRAND.red },
};

export const LOAD_STATUS_STYLE = {
  stable: { color: BRAND.green, text: BRAND.greenText, icon: '◔' },
  nearCapacity: { color: BRAND.orange, text: '#9A4E00', icon: '◑' },
  overloaded: { color: BRAND.red, text: '#B3121F', icon: '●' },
};

export function hexToInt(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

export function hexToRgba(hex, a) {
  const n = hexToInt(hex);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
