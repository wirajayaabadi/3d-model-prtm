import { DEFAULT_FACILITY, DEFAULT_BAY_CONFIG } from './facility.js';
import { DEFAULT_VEHICLE, DEFAULT_SPEED_LIMITS_KMH } from './vehicles.js';
import { DEFAULT_OPERATIONS } from './operations.js';
import { DEFAULT_PRODUCTS } from './products.js';
import { getPreset } from './presets.js';

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

// Konfigurasi lengkap dasar. Semua perubahan skenario bekerja pada salinan ini.
export function createDefaultConfig() {
  return deepClone({
    facility: DEFAULT_FACILITY,
    bays: DEFAULT_BAY_CONFIG,
    vehicle: DEFAULT_VEHICLE,
    speedLimitsKmh: DEFAULT_SPEED_LIMITS_KMH,
    operations: DEFAULT_OPERATIONS,
    products: DEFAULT_PRODUCTS,
  });
}

export function createPresetConfig(presetId, params) {
  const preset = getPreset(presetId);
  const cfg = createDefaultConfig();
  return preset.apply(cfg, params ?? preset.params);
}

export { DEFAULT_FACILITY, DEFAULT_BAY_CONFIG, DEFAULT_VEHICLE, DEFAULT_SPEED_LIMITS_KMH, DEFAULT_OPERATIONS, DEFAULT_PRODUCTS };
