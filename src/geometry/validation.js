// Validasi konfigurasi (bukan geometri lintasan; lihat sweptPath.js untuk itu).
import { PRODUCT_IDS } from '../config/products.js';

export function validateConfig(config) {
  const errors = [];
  const v = config.vehicle;
  const ops = config.operations;

  const sum = v.frontOverhang + v.wheelbase + v.rearOverhang;
  if (Math.abs(sum - v.length) > 1e-6) {
    errors.push({ code: 'vehicleLengthMismatch', detail: { sum, length: v.length } });
  }
  for (const k of ['length', 'width', 'height', 'frontOverhang', 'wheelbase', 'rearOverhang', 'turningRadius', 'accel', 'decel']) {
    if (!(v[k] > 0)) errors.push({ code: 'vehicleNonPositive', detail: { field: k, value: v[k] } });
  }
  for (const k of ['stationaryGap', 'headwaySeconds', 'clearance', 'lateralGap']) {
    if (v[k] < 0) errors.push({ code: 'vehicleNegative', detail: { field: k, value: v[k] } });
  }

  if (ops.arrivalRatePerHour < 0) errors.push({ code: 'negativeValue', detail: { field: 'arrivalRatePerHour' } });
  if (!(ops.loadingRateLpm > 0)) errors.push({ code: 'loadingRateNonPositive', detail: { value: ops.loadingRateLpm } });
  if (!(ops.requestedVolumeL > 0)) errors.push({ code: 'volumeNonPositive', detail: { value: ops.requestedVolumeL } });
  if (ops.prepMinutes < 0) errors.push({ code: 'negativeValue', detail: { field: 'prepMinutes' } });
  if (ops.completionMinutes < 0) errors.push({ code: 'negativeValue', detail: { field: 'completionMinutes' } });
  if (ops.protection.passCount < 0) errors.push({ code: 'negativeValue', detail: { field: 'protection.passCount' } });
  if (ops.protection.waitMinutes < 0) errors.push({ code: 'negativeValue', detail: { field: 'protection.waitMinutes' } });
  if (ops.serviceCV < 0) errors.push({ code: 'negativeValue', detail: { field: 'serviceCV' } });

  const shareTotal = Object.values(ops.demandShares).reduce((a, b) => a + b, 0);
  if (Math.abs(shareTotal - 1) > 0.0001) errors.push({ code: 'sharesNotOne', detail: { total: shareTotal } });
  for (const [k, s] of Object.entries(ops.demandShares)) {
    if (s < 0) errors.push({ code: 'negativeValue', detail: { field: `demandShares.${k}` } });
    if (!PRODUCT_IDS.includes(k)) errors.push({ code: 'unknownProduct', detail: { product: k } });
  }

  if (ops.hourlyProfileEnabled) {
    const p = ops.hourlyProfile;
    if (!Array.isArray(p) || p.length !== 24) errors.push({ code: 'profileLength', detail: {} });
    else {
      const avg = p.reduce((a, b) => a + b, 0) / 24;
      if (Math.abs(avg - 1) > 0.0001) errors.push({ code: 'profileAverage', detail: { avg } });
      if (p.some((m) => m < 0)) errors.push({ code: 'negativeValue', detail: { field: 'hourlyProfile' } });
    }
  }

  if (config.bays.length !== config.facility.bays.count) {
    errors.push({ code: 'bayCountMismatch', detail: { bays: config.bays.length, expected: config.facility.bays.count } });
  }
  for (const b of config.bays) {
    const uniq = new Set(b.products);
    if (b.products.length !== 3 || uniq.size !== 3) errors.push({ code: 'bayProducts', detail: { bay: b.number } });
    for (const p of b.products) if (!PRODUCT_IDS.includes(p)) errors.push({ code: 'unknownProduct', detail: { bay: b.number, product: p } });
  }

  const f = config.facility;
  if (!(f.plot.width > 0 && f.plot.length > 0)) errors.push({ code: 'plotNonPositive', detail: {} });
  for (const [k, z] of Object.entries(f.zones)) {
    if (z.x0 < 0 || z.z0 < 0 || z.x1 > f.plot.width || z.z1 > f.plot.length || z.x1 <= z.x0 || z.z1 <= z.z0) {
      errors.push({ code: 'zoneOutOfPlot', detail: { zone: k } });
    }
  }
  const zoneList = Object.entries(f.zones);
  for (let i = 0; i < zoneList.length; i++) {
    for (let j = i + 1; j < zoneList.length; j++) {
      const a = zoneList[i][1], b = zoneList[j][1];
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) {
        errors.push({ code: 'zoneOverlap', detail: { zones: [zoneList[i][0], zoneList[j][0]] } });
      }
    }
  }
  return errors;
}

// Memvalidasi tiga produk unik untuk satu bay (dipakai editor produk).
export function validateBayProducts(products) {
  if (!Array.isArray(products) || products.length !== 3) return false;
  if (new Set(products).size !== 3) return false;
  return products.every((p) => PRODUCT_IDS.includes(p));
}
