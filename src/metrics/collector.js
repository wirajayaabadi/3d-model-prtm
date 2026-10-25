// Pengumpul metrik: semua nilai dihitung dari status dan kejadian simulasi.
import { TRUCK_STATES } from '../sim/models/truck.js';

export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export function stats(values) {
  if (!values.length) return { n: 0, mean: null, p90: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { n: sorted.length, mean, p90: percentile(sorted, 0.9), max: sorted[sorted.length - 1] };
}

export class Collector {
  constructor(horizonSeconds, sampleInterval = 60) {
    this.horizon = horizonSeconds;
    this.sampleInterval = sampleInterval;
    this.reset();
  }

  reset() {
    this.truckLog = []; // truk yang telah keluar (dan catatan truk belum selesai saat ringkasan)
    this.series = []; // { t, queue, holding, committedBays, exited, inFacility }
    this.arrivals = 0;
    this.admitted = 0;
    this.exited = 0;
    this.exitedAfterHorizon = 0;
    this.volumeByProduct = {};
    this.LIntegral = 0; // ∫ N_fasilitas dt
    this.lastLAccrual = 0;
    this.nFacility = 0;
    this.deadlocks = [];
  }

  accrueL(now) {
    const dt = now - this.lastLAccrual;
    if (dt > 0) this.LIntegral += this.nFacility * dt;
    this.lastLAccrual = now;
  }

  onArrival() {
    this.arrivals++;
  }

  onAdmit(now) {
    this.accrueL(now);
    this.admitted++;
    this.nFacility++;
  }

  onLoaded(product, volume) {
    this.volumeByProduct[product] = (this.volumeByProduct[product] || 0) + volume;
  }

  onExit(truck, now) {
    this.accrueL(now);
    this.nFacility--;
    this.exited++;
    if (now > this.horizon + 1e-9) {
      this.exitedAfterHorizon++;
      truck.exitedAfterHorizon = true;
    }
    this.truckLog.push(this.record(truck, now, 'selesai'));
  }

  record(truck, now, status) {
    const ts = truck.timestamps;
    return {
      id: truck.id,
      label: truck.label,
      product: truck.product,
      requestedVolume: truck.requestedVolume,
      loadedVolume: truck.loadedVolume,
      bay: truck.bay,
      stall: truck.stall == null ? null : truck.stall + 1,
      status,
      afterHorizon: ts.exit != null && ts.exit > this.horizon,
      ...ts,
      entranceHolding: ts.facilityEntry != null ? ts.facilityEntry - ts.arrival : null,
      queueWait: ts.dispatch != null && ts.queueEntry != null ? ts.dispatch - ts.queueEntry : null,
      facilityTime: ts.exit != null && ts.facilityEntry != null ? ts.exit - ts.facilityEntry : null,
      systemTime: ts.exit != null ? ts.exit - ts.arrival : null,
      passedCount: truck.passedCount,
      protected: truck.protected,
      snapshotAt: now,
    };
  }

  sample(now, engine) {
    this.accrueL(now);
    const trucks = [...engine.trucks.values()];
    this.series.push({
      t: now,
      queue: trucks.filter((t) => t.state === TRUCK_STATES.WAITING).length,
      holding: trucks.filter((t) => t.state === TRUCK_STATES.HOLDING).length,
      committedBays: engine.bays.filter((b) => b.committed).length,
      exited: this.exited,
      inFacility: this.nFacility,
      afterHorizon: now > this.horizon + 1e-9,
    });
  }

  totalVolume() {
    return Object.values(this.volumeByProduct).reduce((a, b) => a + b, 0);
  }

  // Metrik waktu dari truk yang relevan (yang keluar dalam horizon jika filterHorizon).
  timeMetrics(engine, { withinHorizon = true } = {}) {
    const logs = this.truckLog.filter((r) => !withinHorizon || !r.afterHorizon);
    const dispatched = [...engine.trucks.values()]
      .filter((t) => t.timestamps.dispatch != null && (!withinHorizon || t.timestamps.dispatch <= this.horizon))
      .map((t) => t.timestamps.dispatch - t.timestamps.queueEntry)
      .concat(logs.map((r) => r.queueWait).filter((x) => x != null));
    const admitted = [...engine.trucks.values()]
      .filter((t) => t.timestamps.facilityEntry != null && (!withinHorizon || t.timestamps.facilityEntry <= this.horizon))
      .map((t) => t.timestamps.facilityEntry - t.timestamps.arrival)
      .concat(logs.map((r) => r.entranceHolding).filter((x) => x != null));
    return {
      queueWait: stats(dispatched),
      entranceHolding: stats(admitted),
      facilityTime: stats(logs.map((r) => r.facilityTime).filter((x) => x != null)),
      systemTime: stats(logs.map((r) => r.systemTime).filter((x) => x != null)),
    };
  }

  waitingAges(engine, now) {
    return [...engine.trucks.values()]
      .filter((t) => t.state === TRUCK_STATES.WAITING)
      .map((t) => ({ id: t.id, label: t.label, product: t.product, age: now - t.timestamps.queueEntry, protected: t.protected }))
      .sort((a, b) => b.age - a.age);
  }

  littlesLaw(engine, now) {
    this.accrueL(now);
    const elapsed = Math.min(now, this.horizon) || 1;
    const L = this.LIntegral / Math.max(now, 1e-9);
    const lambda = this.admitted / Math.max(now, 1e-9); // per detik
    const tm = this.timeMetrics(engine, { withinHorizon: false });
    const W = tm.facilityTime.mean;
    const lambdaW = W != null ? lambda * W : null;
    const diff = lambdaW != null && L > 0 ? ((lambdaW - L) / L) * 100 : null;
    return { L, lambdaPerHour: lambda * 3600, W, lambdaW, diffPercent: diff, elapsed };
  }
}
