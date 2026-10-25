import { describe, it, expect } from 'vitest';
import { createPresetConfig } from '../src/config/index.js';
import { PRESETS } from '../src/config/presets.js';
import { Engine } from '../src/sim/engine.js';
import { polygonsOverlap, bboxOverlap, bbox } from '../src/geometry/sweptPath.js';
import { TRUCK_STATES } from '../src/sim/models/truck.js';

const H = 24 * 3600;

function firstOverlap(engine) {
  const ts = [...engine.trucks.values()].filter((t) => t.spawned && t.footprint);
  const ps = ts.map((t) => ({ t, bb: bbox(t.footprint) }));
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (bboxOverlap(ps[i].bb, ps[j].bb) && polygonsOverlap(ps[i].t.footprint, ps[j].t.footprint)) {
        return { a: ps[i].t.label, b: ps[j].t.label, t: engine.time };
      }
    }
  }
  return null;
}

describe('Lalu lintas 24 jam untuk setiap preset (Bagian 10, 16)', () => {
  it.each(PRESETS.map((p) => [p.id]))('%s: tanpa tumpang tindih, tanpa kebuntuan, tanpa putar di tempat, rute valid', (id) => {
    const e = new Engine(createPresetConfig(id), { presetId: id });
    let overlap = null;
    let maxJump = 0;
    const lastPose = new Map();
    while (e.time < H) {
      e.step();
      // tidak ada teleportasi: perpindahan per langkah <= v_max * dt (10 km/h) + toleransi
      for (const t of e.trucks.values()) {
        if (!t.pose) continue;
        const lp = lastPose.get(t.id);
        if (lp && lp.route === t.route) {
          const d = Math.hypot(t.pose.x - lp.x, t.pose.z - lp.z);
          if (d > maxJump) maxJump = d;
        }
        lastPose.set(t.id, { x: t.pose.x, z: t.pose.z, route: t.route });
      }
      if (e.stepCount % 5 === 0 && !overlap) overlap = firstOverlap(e);
    }
    expect(overlap).toBeNull();
    expect(e.deadlock).toBeNull();
    expect(maxJump).toBeLessThanOrEqual(2.778 * 0.1 + 0.01);
    expect(e.log.some((l) => l.type === 'deadlock')).toBe(false);
  });

  it('truk mengikuti rute, menjaga jarak diam dan tidak berhenti di dalam area konflik bay', () => {
    const e = new Engine(createPresetConfig('arrivalPlus50'));
    let crossingStops = 0;
    while (e.time < 6 * 3600) {
      e.step();
      for (const t of e.trucks.values()) {
        if (!t.route || !t.currentSegment) continue;
        if (t.speed === 0 && t.blocked && t.currentSegment.tag === 'bayCrossing') crossingStops++;
      }
    }
    expect(crossingStops).toBe(0);
  });

  it('pengawas kebuntuan menyala saat sengaja diciptakan (bay dinonaktifkan tidak memengaruhi; uji jalur buatan)', () => {
    const e = new Engine(createPresetConfig('baseline'));
    e.runUntil(1200);
    const t = [...e.trucks.values()].find((x) => x.travelling);
    expect(t).toBeDefined();
    // Paksa truk terblokir tanpa pernah bisa bergerak: pasang klaim palsu yang bertabrakan.
    t.blocked = true;
    const origStep = e.traffic.stepTruck.bind(e.traffic);
    e.traffic.stepTruck = () => false;
    e.traffic.processAcquisitions = (moving) => moving.forEach((m) => (m.blocked = true));
    e.runUntil(e.time + 700);
    expect(e.deadlock).not.toBeNull();
    expect(e.log.some((l) => l.type === 'deadlock' && l.message === 'Traffic deadlock detected')).toBe(true);
    expect(e.autoPaused).toBe(true);
    e.traffic.stepTruck = origStep;
  });

  it('antrean gerbang: maksimal 3 truk digambar di luar plot, sisanya hanya dihitung', () => {
    const cfg = createPresetConfig('arrivalPlus50');
    cfg.operations.arrivalRatePerHour = 120;
    const e = new Engine(cfg);
    let maxDrawn = 0, maxHolding = 0;
    while (e.time < 2 * 3600) {
      e.step();
      const drawn = e.holding.filter((t) => t.spawned).length;
      if (drawn > maxDrawn) maxDrawn = drawn;
      if (e.holding.length > maxHolding) maxHolding = e.holding.length;
    }
    expect(maxHolding).toBeGreaterThan(3);
    expect(maxDrawn).toBeLessThanOrEqual(3);
  });
});
