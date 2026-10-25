// Parameter operasi dan proses acak (Bagian 7 dan 8). Waktu servis hanya didefinisikan di sini.
export const DEFAULT_OPERATIONS = {
  arrivalRatePerHour: 18,
  requestedVolumeL: 24000,
  loadingRateLpm: 1200,
  prepMinutes: 3,
  completionMinutes: 3,
  targetWaitingCapacity: 30,
  demandShares: {
    pertalite: 0.3,
    pertamax: 0.3,
    b50: 0.25,
    pertadex: 0.1,
    pertamaxTurbo: 0.05,
  },
  seed: 20261025,
  protection: { passCount: 10, waitMinutes: 30 },
  calendar: {
    startHour: 6, // Hari 1, 06:00 WIB
    horizonHours: 24,
    warmupHours: 0,
    timezone: 'WIB',
  },
  // Ekstensi opsional (nonaktif pada baseline)
  hourlyProfileEnabled: false,
  hourlyProfile: Array(24).fill(1.0), // pengali per jam-hari (indeks 0 = 00:00), rata-rata harus 1.0
  serviceCV: 0, // koefisien variasi waktu servis (0 = deterministik)
};

export const SIM_STEP_SECONDS = 0.1;
export const PLAYBACK_SPEEDS = [1, 5, 20, 60];
