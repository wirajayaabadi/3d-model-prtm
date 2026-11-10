// Daftar langkah presentasi sebagai data. Teks ada di content/{id,en}.js dengan kunci yang sama (id).
// cam: tujuan kamera; layers: lapisan dunia yang dinyalakan; highlight: sorotan area terminal;
// bmc: panel canvas aktif; sim: perintah simulasi saat masuk langkah; panel: panel simulasi di kartu.
const ALL_STEPS = [
  { id: 'b0.cover', ch: 0, cam: { kind: 'sky', dist: 820 }, sim: { preset: 'baseline', minute: 20, speed: 1 } },
  { id: 'b0.agenda', ch: 0, cam: { kind: 'terminal', dist: 400 } },

  { id: 'b1.glance', ch: 1, cam: { kind: 'map', dist: 1060 } },
  { id: 'b1.footprint', ch: 1, cam: { kind: 'map', dist: 1060 }, layers: ['pins'] },
  { id: 'b1.structure', ch: 1, cam: { kind: 'holding', dist: 200 } },
  { id: 'b1.position', ch: 1, cam: { kind: 'mapAt', lonLat: [105.5, -2.5], dist: 420 }, layers: ['pins', 'imports'] },
  { id: 'b1.security', ch: 1, cam: { kind: 'map', dist: 1060 }, layers: ['pins', 'outlets'] },

  { id: 'b2.overview', ch: 2, cam: { kind: 'terminal', dist: 330 }, highlight: ['plot'] },
  { id: 'b2.receiving', ch: 2, cam: { kind: 'focus', anchor: 'pipeline', dist: 300, offset: [-30, 0, 30] }, highlight: ['pipeline', 'tanks'] },
  { id: 'b2.storage', ch: 2, cam: { kind: 'focus', anchor: 'tanks', dist: 420 }, highlight: ['tanks'] },
  { id: 'b2.distribution', ch: 2, cam: { kind: 'focus', anchor: 'bays', dist: 120 }, roofs: true, highlight: ['bays'] },
  { id: 'b2.hsse', ch: 2, cam: { kind: 'focus', anchor: 'gate', dist: 150, offset: [20, 0, 0] }, highlight: ['gate', 'controlRoom', 'waiting'] },
  { id: 'b2.contribution', ch: 2, cam: { kind: 'terminal', dist: 300 }, zones: true },

  { id: 'b3.canvas', ch: 3, cam: { kind: 'bmc', dist: 250 }, layers: ['bmc'], bmc: ['valueProposition'] },
  { id: 'b3.offer', ch: 3, cam: { kind: 'bmc', dist: 250 }, layers: ['bmc'], bmc: ['valueProposition', 'customerSegments', 'channels'] },
  { id: 'b3.supply', ch: 3, cam: { kind: 'bmc', dist: 250 }, layers: ['bmc'], bmc: ['keyPartners', 'keyResources', 'keyActivities'] },
  { id: 'b3.revenue', ch: 3, cam: { kind: 'bmc', dist: 250 }, layers: ['bmc'], bmc: ['revenueStreams', 'customerRelationships'] },
  { id: 'b3.cost', ch: 3, cam: { kind: 'bmc', dist: 250 }, layers: ['bmc'], bmc: ['costStructure'] },

  { id: 'b4.flow', ch: 4, cam: { kind: 'map', dist: 1060 }, layers: ['pins', 'flow'] },
  { id: 'b4.units', ch: 4, cam: { kind: 'holding', dist: 210 }, layers: ['holdingFlow'] },
  { id: 'b4.itjChain', ch: 4, cam: { kind: 'mapAt', lonLat: [107.6, -6.6], dist: 110 }, layers: ['pins', 'java'] },
  { id: 'b4.stakeholders', ch: 4, cam: { kind: 'terminal', dist: 1150, offset: [-20, 0, -30] }, layers: ['ring'] },
  { id: 'b4.community', ch: 4, cam: { kind: 'terminal', dist: 1000, offset: [40, 0, 40] }, layers: ['ring'], highlight: ['buffer'] },

  { id: 'b5.baseline', ch: 5, cam: { kind: 'focus', anchor: 'bays', dist: 160, offset: [0, 0, 14] }, roofs: true, sim: { preset: 'baseline', minute: 75, speed: 3 }, panel: 'live' },
  { id: 'b5.surge', ch: 5, cam: { kind: 'focus', anchor: 'waiting', dist: 170, offset: [-10, 0, 0] }, sim: { preset: 'arrivalPlus50', minute: 150, speed: 3 }, panel: 'live' },
  { id: 'b5.mix', ch: 5, cam: { kind: 'focus', anchor: 'bays', dist: 150 }, roofs: true, sim: { preset: 'turboShift', minute: 90, speed: 3 }, panel: 'compare' },

  { id: 'b6.insights', ch: 6, cam: { kind: 'trip', dist: 80 }, trip: true, sim: { preset: 'baseline', minute: 40, speed: 1 } },
  { id: 'b6.close', ch: 6, cam: { kind: 'sky', dist: 820, offset: [-120, 0, 0] }, trip: 'hold' },
];

// Bab yang ditampilkan (fokus ITJ Plumpang): Pembuka, Rantai nilai & stakeholder, Simulasi, Penutup.
// Bab 1–3 (Company Profile, Business Unit, Business Model) tetap terdefinisi di atas dan di content/, cukup
// ditambahkan kembali ke daftar ini untuk menampilkannya lagi.
export const ACTIVE_CHAPTERS = [0, 4, 5, 6];
export const STEPS = ALL_STEPS.filter((s) => ACTIVE_CHAPTERS.includes(s.ch));
export const CHAPTER_COUNT = ACTIVE_CHAPTERS.length;

// Nomor bab yang dilihat penonton (0, 1, 2, …) untuk bab internal `ch`.
export function chapterNo(ch) {
  return Math.max(0, ACTIVE_CHAPTERS.indexOf(ch));
}

export function stepsOfChapter(ch) {
  return STEPS.filter((s) => s.ch === ch);
}
