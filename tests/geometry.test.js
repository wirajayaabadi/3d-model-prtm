import { describe, it, expect } from 'vitest';
import { createDefaultConfig } from '../src/config/index.js';
import { Engine } from '../src/sim/engine.js';
import { buildLayout } from '../src/geometry/layout.js';
import { buildNetwork } from '../src/geometry/routes.js';
import { simulateTravel } from '../src/geometry/kinematics.js';
import { convexHull, inflatePolygon, polygonsOverlap, polygonDistance, rectPoly, validateRoute } from '../src/geometry/sweptPath.js';
import { footprintAt, HEADING } from '../src/geometry/layout.js';

describe('Primitif geometri', () => {
  it('SAT: tumpang tindih, sentuhan dan jarak', () => {
    const a = rectPoly(0, 0, 2, 2), b = rectPoly(1, 1, 3, 3), c = rectPoly(2, 0, 4, 2), d = rectPoly(5, 0, 6, 1);
    expect(polygonsOverlap(a, b)).toBe(true);
    expect(polygonsOverlap(a, c)).toBe(false);
    expect(polygonDistance(a, d)).toBeCloseTo(3, 9);
    const inf = inflatePolygon(a, 0.5);
    expect(polygonsOverlap(inf, c)).toBe(true);
  });
  it('jejak truk 12 x 2,5 m di sekitar sumbu belakang', () => {
    const v = createDefaultConfig().vehicle;
    const fp = footprintAt({ x: 10, z: 20, theta: HEADING.north }, v);
    const zs = fp.map((p) => p.z), xs = fp.map((p) => p.x);
    expect(Math.min(...zs)).toBeCloseTo(12.5, 9); // hidung 7,5 m ke -Z
    expect(Math.max(...zs)).toBeCloseTo(24.5, 9); // bumper belakang 4,5 m ke +Z
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2.5, 9);
    expect(convexHull(fp)).toHaveLength(4);
  });
});

describe('Jaringan rute (Bagian 4.2)', () => {
  const cfg = createDefaultConfig();
  const layout = buildLayout(cfg);
  const net = buildNetwork(layout, cfg);

  it('belokan masuk bay: seperempat putaran dari (cx+8, 52) ke (cx, 44) lalu lurus ke sumbu belakang (cx, 17.5)', () => {
    for (const b of layout.bays) {
      const entry = net.bayManeuvers[b.index].entry;
      const p0 = entry[0].poseAt(0);
      expect(p0.x).toBeCloseTo(b.cx + 8, 6);
      expect(p0.z).toBeCloseTo(52, 6);
      const arcEnd = entry[1].poseAt(entry[1].length);
      expect(arcEnd.x).toBeCloseTo(b.cx, 6);
      expect(arcEnd.z).toBeCloseTo(44, 6);
      const last = entry[entry.length - 1];
      const pe = last.poseAt(last.length);
      expect(pe.x).toBeCloseTo(b.cx, 6);
      expect(pe.z).toBeCloseTo(17.5, 6);
      expect(Math.cos(pe.theta)).toBeCloseTo(0, 6);
      expect(Math.sin(pe.theta)).toBeCloseTo(-1, 6);
      const arcLen = entry[0].length + entry[1].length;
      expect(arcLen).toBeCloseTo((Math.PI / 2) * 8, 6);
    }
  });
  it('mundur keluar bay: lurus sampai Z 36 lalu seperempat putaran ke (cx+8, 44) menghadap barat', () => {
    for (const b of layout.bays) {
      const ex = net.bayManeuvers[b.index].exit;
      expect(ex[0].reverse).toBe(true);
      expect(ex[0].length).toBeCloseTo(18.5, 6);
      const end = ex[ex.length - 1].poseAt(ex[ex.length - 1].length);
      expect(end.x).toBeCloseTo(b.cx + 8, 6);
      expect(end.z).toBeCloseTo(44, 6);
      expect(Math.cos(end.theta)).toBeCloseTo(-1, 6);
    }
  });
  it('putar balik timur: setengah lingkaran pusat (122, 60) radius 8', () => {
    expect(net.uTurnRadius).toBe(8);
    const total = net.uTurn.reduce((a, s) => a + s.length, 0);
    expect(total).toBeCloseTo(Math.PI * 8, 6);
    expect(net.uTurn[0].poseAt(0)).toMatchObject({ x: 122, z: 68 });
    const end = net.uTurn[net.uTurn.length - 1];
    const pe = end.poseAt(end.length);
    expect(pe.x).toBeCloseTo(122, 6);
    expect(pe.z).toBeCloseTo(52, 6);
  });
  it('stall: mundur masuk berakhir dengan sumbu belakang Z 87,5; keluar berakhir di lajur Z 68 menghadap timur', () => {
    for (const st of layout.stalls) {
      const m = net.stallManeuvers[st.index];
      const inEnd = m.reverseIn[m.reverseIn.length - 1];
      const pe = inEnd.poseAt(inEnd.length);
      expect(pe.x).toBeCloseTo(st.x, 6);
      expect(pe.z).toBeCloseTo(87.5, 6);
      const outEnd = m.pullOut[m.pullOut.length - 1];
      const po = outEnd.poseAt(outEnd.length);
      expect(po.x).toBeCloseTo(st.x + 8, 6);
      expect(po.z).toBeCloseTo(68, 6);
      expect(Math.cos(po.theta)).toBeCloseTo(1, 6);
      expect(m.pullOut[0].length).toBeCloseTo(11.5, 6);
    }
  });
  it('semua segmen adalah lurus atau busur; tidak ada sudut siku', () => {
    for (const s of net.allSegments) {
      expect(['straight', 'arc']).toContain(s.kind);
      expect(s.length).toBeGreaterThan(0);
    }
  });
});

describe('Kelayakan lintasan sapuan (Bagian 4.4, 16)', () => {
  const e = new Engine(createDefaultConfig());
  it('semua rute masuk/keluar bay (termasuk 13 dan 14), stall dan putar balik lolos validasi default', () => {
    expect(e.geometryReport.allFeasible).toBe(true);
    for (const b of e.geometryReport.bays) expect(b.feasible).toBe(true);
    for (const s of e.geometryReport.stalls.stalls) expect(s.feasible).toBe(true);
    expect(e.geometryReport.uTurn.feasible).toBe(true);
  });
  it('kapasitas parkir efektif berasal dari stall yang layak (17), bukan target (30)', () => {
    expect(e.effectiveCapacity).toBe(17);
    expect(e.geometryReport.stalls.targetCapacity).toBe(30);
    expect(e.effectiveCapacity).toBe(e.geometryReport.stalls.stalls.filter((s) => s.feasible).length);
  });
  it('validasi menandai rute yang tidak layak dengan lokasi dan kedalaman', () => {
    const cfg = createDefaultConfig();
    const v = cfg.vehicle;
    const layout = buildLayout(cfg);
    const net = buildNetwork(layout, cfg);
    const bounds = { width: 136, length: 100, gateCorridors: [] };
    const obstacle = { id: 'uji', kind: 'column', poly: rectPoly(55, 40, 57, 42) }; // di tengah lintasan masuk bay 7
    const r = validateRoute(net.bayManeuvers[6].entry, v, [obstacle], bounds, v.clearance);
    expect(r.feasible).toBe(false);
    expect(r.worst[0].obstacle).toBe('uji');
    expect(r.worst[0].depth).toBeGreaterThan(0.5);
  });
  it('plot yang disempitkan membuat putar balik dan bay 14 tidak layak dan dilaporkan, bukan diperbaiki diam-diam', () => {
    const cfg = createDefaultConfig();
    cfg.facility.plot.width = 124; // mundur keluar bay 14 membutuhkan X hingga 124,5 + margin 0,5
    const f = new Engine(cfg);
    expect(f.geometryReport.allFeasible).toBe(false);
    expect(f.geometryReport.uTurn.feasible).toBe(false);
    const b14 = f.geometryReport.bays[13];
    expect(b14.feasible).toBe(false);
    expect(b14.exit.worst.some((w) => w.obstacle === 'plotBoundary' && w.depth > 0)).toBe(true);
    // kendaraan tidak diskalakan
    expect(f.config.vehicle.length).toBe(12);
  });
  it('stall yang tidak lolos tidak dihitung dan tidak digunakan', () => {
    const cfg = createDefaultConfig();
    cfg.facility.zones.waiting.z1 = 102; // dorong stall melewati batas plot (Z 100)
    cfg.facility.zones.waiting.z0 = 78;
    cfg.facility.stalls.z0 = 90;
    cfg.facility.stalls.z1 = 102;
    cfg.facility.stalls.parkedAxleZ = 97.5;
    cfg.facility.plot.length = 100;
    expect(() => new Engine(cfg)).toThrow(); // zona keluar plot ditolak oleh validasi konfigurasi
  });
});

describe('Waktu tempuh (Bagian 12, 16)', () => {
  it('waktu tempuh berbeda per bay dan merespons kecepatan dan panjang rute', () => {
    const cfg = createDefaultConfig();
    const layout = buildLayout(cfg);
    const net = buildNetwork(layout, cfg);
    const t1 = simulateTravel(net.routes.stallToBay(8, 0).segments, cfg.vehicle).time;
    const t14 = simulateTravel(net.routes.stallToBay(8, 13).segments, cfg.vehicle).time;
    expect(t1).toBeGreaterThan(t14 + 30);
    const fast = createDefaultConfig();
    fast.speedLimitsKmh.approach = 10;
    const net2 = buildNetwork(buildLayout(fast), fast);
    const t1fast = simulateTravel(net2.routes.stallToBay(8, 0).segments, fast.vehicle).time;
    expect(t1fast).toBeLessThan(t1 - 20);
  });
  it('gabungan pendekatan + mundur keluar sekitar 3-4 menit', () => {
    const e = new Engine(createDefaultConfig());
    for (const tt of e.travelTimes) {
      const total = (tt.approach + tt.reverseClear) / 60;
      expect(total).toBeGreaterThan(2.3);
      expect(total).toBeLessThan(4.2);
    }
  });
});

describe('Perubahan geometri', () => {
  it('menghitung ulang posisi, luas, stall dan rute, lalu run baru yang bersih', () => {
    const cfg = createDefaultConfig();
    cfg.facility.plot.width = 150;
    cfg.facility.zones.waiting.x1 = 110;
    const e = new Engine(cfg);
    expect(e.layout.plot.area).toBe(15000);
    expect(e.layout.zones.waiting.area).toBe(90 * 24);
    expect(e.stalls.length).toBe(20);
    expect(e.bays).toHaveLength(14);
    expect(e.time).toBe(0);
    expect(e.trucks.size).toBe(0);
  });
});
