// Konstruksi segmen jalan (lurus dan busur) dan jaringan rute dari layout. Semua belokan adalah busur
// pada radius putar sumbu belakang; tidak ada sudut siku-siku yang dianimasikan.
import { sweptHull, inflatePolygon, bbox, convexHull } from './sweptPath.js';
import { footprintAt } from './layout.js';

// Poligon konflik per segmen: potongan hull konveks setiap <= maxLen m lintasan agar rapat mengikuti sapuan nyata.
function conflictPieces(seg, vehicle, maxLen = 2) {
  const n = Math.max(1, Math.ceil(seg.length / maxLen - 1e-9));
  const out = [];
  for (let i = 0; i < n; i++) {
    const s0 = (seg.length * i) / n, s1 = (seg.length * (i + 1)) / n;
    const pts = [];
    const m = 4;
    for (let k = 0; k <= m; k++) pts.push(...footprintAt(seg.poseAt(s0 + ((s1 - s0) * k) / m), vehicle));
    const poly = inflatePolygon(convexHull(pts), vehicle.clearance / 2);
    out.push({ poly, bb: bbox(poly) });
  }
  return out;
}
import { speedLimitsMs } from '../config/vehicles.js';

const MAX_ARC = Math.PI / 4; // pecah busur agar hull konveks tetap rapat

export class Segment {
  constructor(o) {
    Object.assign(this, o);
    this.occupants = new Set();
  }
}

function headingOf(dx, dz) {
  return Math.atan2(dz, dx);
}

export function makeStraight(id, p0, p1, opts) {
  const dx = p1.x - p0.x, dz = p1.z - p0.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length, uz = dz / length;
  const theta = opts.reverse ? headingOf(-ux, -uz) : headingOf(ux, uz);
  const seg = new Segment({
    id,
    kind: 'straight',
    p0: { ...p0 },
    p1: { ...p1 },
    length,
    reverse: !!opts.reverse,
    lane: opts.lane ?? null,
    speedLimit: opts.speedLimit,
    tag: opts.tag ?? null,
    theta,
  });
  seg.poseAt = (s) => ({ x: p0.x + ux * s, z: p0.z + uz * s, theta });
  return seg;
}

// phi0 sudut awal (radian), dphi sapuan bertanda (+ = CCW, sudut naik). Arah tempuh adalah tangen.
export function makeArc(id, center, R, phi0, dphi, opts) {
  const length = Math.abs(dphi) * R;
  const sign = Math.sign(dphi) || 1;
  const seg = new Segment({
    id,
    kind: 'arc',
    center: { ...center },
    R,
    phi0,
    dphi,
    length,
    reverse: !!opts.reverse,
    lane: opts.lane ?? null,
    speedLimit: opts.speedLimit,
    tag: opts.tag ?? null,
  });
  seg.poseAt = (s) => {
    const phi = phi0 + (sign * s) / R;
    const tx = -Math.sin(phi) * sign, tz = Math.cos(phi) * sign;
    const theta = seg.reverse ? headingOf(-tx, -tz) : headingOf(tx, tz);
    return { x: center.x + R * Math.cos(phi), z: center.z + R * Math.sin(phi), theta };
  };
  return seg;
}

export function makeArcSplit(id, center, R, phi0, dphi, opts) {
  const n = Math.max(1, Math.ceil(Math.abs(dphi) / MAX_ARC - 1e-9));
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(makeArc(`${id}.${i + 1}`, center, R, phi0 + (dphi * i) / n, dphi / n, opts));
  }
  return out;
}

// Lajur lurus dipecah pada titik-titik simpang agar klaim segmen bersifat lokal.
function splitLine(idPrefix, z, xs, speedFn, lane, maxLen = 8) {
  const cuts = [...new Set(xs.map((x) => +x.toFixed(6)))].sort((a, b) => a - b);
  const dir = Math.sign(xs[xs.length - 1] - xs[0]) || 1;
  const ordered = dir > 0 ? cuts : cuts.reverse();
  const pieces = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i], b = ordered[i + 1];
    const n = Math.max(1, Math.ceil(Math.abs(b - a) / maxLen - 1e-9));
    for (let k = 0; k < n; k++) {
      const xa = a + ((b - a) * k) / n, xb = a + ((b - a) * (k + 1)) / n;
      pieces.push(
        makeStraight(`${idPrefix}[${xa.toFixed(2)}→${xb.toFixed(2)}]`, { x: xa, z }, { x: xb, z }, {
          lane,
          speedLimit: speedFn((xa + xb) / 2),
        }),
      );
    }
  }
  return pieces;
}

// Membangun jaringan: tiga garis lajur bersama dan manuver privat per stall / per bay.
export function buildNetwork(layout, config) {
  const v = config.vehicle;
  const sp = speedLimitsMs(config.speedLimitsKmh);
  const R = v.turningRadius;
  const roads = layout.roads;
  const W = v.width;
  const halfW = W / 2;
  const infl = v.clearance / 2;

  // --- Garis masuk: pendekatan gerbang (di luar plot) -> konektor masuk -> lajur masuk area tunggu
  const entryCuts = [-roads.gateApproachLength, 0, roads.entranceConnectorEndX, ...layout.stalls.map((s) => s.entryJoinX), layout.entryLaneEndX];
  const entryLine = splitLine('masuk', roads.entryLaneZ, entryCuts, (x) => (x < roads.entranceConnectorEndX ? sp.entranceConnector : sp.waitingAisle), 'entry', 10);

  // --- Loop: lajur keberangkatan -> konektor -> putar balik timur -> jalan pendekatan
  const depCuts = [layout.zones.waiting.x0, ...layout.stalls.map((s) => s.departureJoinX), roads.departureLaneEndX, roads.uTurnCenter.x];
  const departure = splitLine('berangkat', roads.departureLaneZ, depCuts, (x) => (x < roads.departureLaneEndX ? sp.waitingAisle : sp.departureConnector), 'loop');
  const Ru = (roads.departureLaneZ - roads.approachZ) / 2;
  const uTurn = makeArcSplit('putarbalik', roads.uTurnCenter, Ru, Math.PI / 2, -Math.PI, { lane: 'loop', speedLimit: sp.uTurn });
  const appCuts = [roads.uTurnCenter.x, ...layout.bays.map((b) => b.approachJoinX), roads.approachEndX];
  const approach = splitLine('pendekatan', roads.approachZ, appCuts, () => sp.approach, 'loop');
  const loop = [...departure, ...uTurn, ...approach];

  // --- Garis keluar: jalan pengumpul keluar -> gerbang keluar -> lajur konseptual luar
  const exitCuts = [roads.exitRoadStartX, ...layout.bays.map((b) => b.exitJoinX), 0, -roads.exitRunoffLength];
  const exitLine = splitLine('keluar', roads.exitRoadZ, exitCuts, () => sp.exitRoad, 'exit');

  // --- Manuver stall
  const stallManeuvers = layout.stalls.map((st) => {
    const cIn = st.reverseTurnCenter; // (x+R, lajurMasuk+R)
    const reverseArc = makeArcSplit(`stall${st.number}.mundurBusur`, cIn, R, -Math.PI / 2, -Math.PI / 2, { reverse: true, speedLimit: sp.reversing, tag: 'stallIn' });
    const reverseStraight = makeStraight(`stall${st.number}.mundurLurus`, { x: st.x, z: cIn.z }, { x: st.x, z: st.parkedAxle.z }, { reverse: true, speedLimit: sp.reversing, tag: 'stallIn' });
    const cOut = st.pullOutTurnCenter; // (x+R, lajurBerangkat+R)
    const pullStraight = makeStraight(`stall${st.number}.keluarLurus`, { x: st.x, z: st.parkedAxle.z }, { x: st.x, z: cOut.z }, { speedLimit: sp.waitingAisle, tag: 'stallOut' });
    const pullArc = makeArcSplit(`stall${st.number}.keluarBusur`, cOut, R, Math.PI, Math.PI / 2, { speedLimit: sp.waitingAisle, tag: 'stallOut' });
    return { reverseIn: [...reverseArc, reverseStraight], pullOut: [pullStraight, ...pullArc] };
  });

  // --- Manuver bay
  const bayManeuvers = layout.bays.map((b) => {
    const cIn = b.entryTurnCenter; // (cx+R, pendekatan-R)
    const entryArc = makeArcSplit(`bay${b.number}.masukBusur`, cIn, R, Math.PI / 2, Math.PI / 2, { speedLimit: sp.bayManeuver, tag: 'bayIn' });
    const zTurnEnd = cIn.z;
    const zRev = b.reverseTurnCenter.z;
    const zBlock = b.z1;
    const entryStraights = [];
    const cuts = [zTurnEnd, zRev, zBlock, b.serviceAxle.z].filter((z, i, a) => a.indexOf(z) === i).sort((a, c) => c - a);
    for (let i = 0; i < cuts.length - 1; i++) {
      entryStraights.push(makeStraight(`bay${b.number}.masukLurus${i + 1}`, { x: b.cx, z: cuts[i] }, { x: b.cx, z: cuts[i + 1] }, { speedLimit: sp.bayManeuver, tag: i === 0 ? 'bayCrossing' : 'bayIn' }));
    }
    const revStraight = makeStraight(`bay${b.number}.mundurLurus`, { x: b.cx, z: b.serviceAxle.z }, { x: b.cx, z: zRev }, { reverse: true, speedLimit: sp.reversing, tag: 'bayOut' });
    const revArc = makeArcSplit(`bay${b.number}.mundurBusur`, b.reverseTurnCenter, R, Math.PI, -Math.PI / 2, { reverse: true, speedLimit: sp.reversing, tag: 'bayOut' });
    return { entry: [...entryArc, ...entryStraights], exit: [revStraight, ...revArc] };
  });

  // Penunjuk ke piece berikutnya pada garis lajur yang sama (untuk car-following melewati titik belok).
  for (const line of [entryLine, loop, exitLine]) {
    for (let i = 0; i < line.length; i++) line[i].next = line[i + 1] || null;
  }

  // --- Poligon per segmen: strip lajur untuk lajur bersama, hull sapuan untuk manuver.
  const all = [...entryLine, ...loop, ...exitLine];
  for (const m of stallManeuvers) all.push(...m.reverseIn, ...m.pullOut);
  for (const m of bayManeuvers) all.push(...m.entry, ...m.exit);
  for (const seg of all) {
    if (seg.lane && seg.kind === 'straight') {
      const ux = (seg.p1.x - seg.p0.x) / seg.length, uz = (seg.p1.z - seg.p0.z) / seg.length;
      const nx = -uz, nz = ux;
      seg.poly = [
        { x: seg.p0.x + nx * halfW, z: seg.p0.z + nz * halfW },
        { x: seg.p1.x + nx * halfW, z: seg.p1.z + nz * halfW },
        { x: seg.p1.x - nx * halfW, z: seg.p1.z - nz * halfW },
        { x: seg.p0.x - nx * halfW, z: seg.p0.z - nz * halfW },
      ];
      seg.cpolys = [{ poly: inflatePolygon(seg.poly, infl), bb: null }];
      seg.cpolys[0].bb = bbox(seg.cpolys[0].poly);
    } else {
      seg.poly = sweptHull(seg, v, 0.5);
      seg.cpolys = conflictPieces(seg, v, 2);
    }
    seg.bb = bbox(seg.cpolys.flatMap((c) => c.poly));
  }

  const indexOf = (arr, pred) => {
    const i = arr.findIndex(pred);
    if (i < 0) throw new Error('segmen tidak ditemukan');
    return i;
  };
  const near = (a, b) => Math.abs(a - b) < 1e-6;

  // Rute: daftar segmen + rentang indeks grup atomik [start, end] (inklusif).
  function withGroups(segs, groups) {
    return { segments: segs, groups, totalLength: segs.reduce((s, g) => s + g.length, 0) };
  }
  function extendGroup(segs, endIdx, dist) {
    let acc = 0, i = endIdx;
    while (acc < dist && i + 1 < segs.length) {
      i++;
      acc += segs[i].length;
    }
    return i;
  }
  const extendDist = v.length + v.clearance;

  const routes = {
    // Dari posisi di garis masuk (indeks piece awal) ke stall k.
    toStall(k, fromPieceIndex = 0) {
      const st = layout.stalls[k];
      const end = indexOf(entryLine, (p) => near(p.p1.x, st.entryJoinX));
      const lanePieces = entryLine.slice(fromPieceIndex, end + 1);
      const man = stallManeuvers[k].reverseIn;
      const segs = [...lanePieces, ...man];
      return withGroups(segs, [{ start: lanePieces.length, end: segs.length - 1, kind: 'stallIn' }]);
    },
    // Hanya pendekatan gerbang sampai gerbang (untuk truk yang tertahan di gerbang).
    gateHold(fromPieceIndex = 0) {
      const end = indexOf(entryLine, (p) => near(p.p1.x, 0));
      return withGroups(entryLine.slice(fromPieceIndex, end + 1), []);
    },
    stallToBay(k, j) {
      const st = layout.stalls[k];
      const b = layout.bays[j];
      const out = stallManeuvers[k].pullOut;
      const i0 = indexOf(loop, (p) => p.kind === 'straight' && near(p.p0.x, st.departureJoinX) && near(p.p0.z, roads.departureLaneZ));
      const i1 = indexOf(loop, (p) => p.kind === 'straight' && near(p.p1.x, b.approachJoinX) && near(p.p1.z, roads.approachZ));
      const lane = loop.slice(i0, i1 + 1);
      const entry = bayManeuvers[j].entry;
      const segs = [...out, ...lane, ...entry];
      const g1End = extendGroup(segs, out.length - 1, extendDist);
      return withGroups(segs, [
        { start: 0, end: g1End, kind: 'stallOut' },
        { start: out.length + lane.length, end: segs.length - 1, kind: 'bayIn' },
      ]);
    },
    bayToExit(j) {
      const b = layout.bays[j];
      const ex = bayManeuvers[j].exit;
      const i0 = indexOf(exitLine, (p) => near(p.p0.x, b.exitJoinX));
      const lane = exitLine.slice(i0);
      const segs = [...ex, ...lane];
      const gEnd = extendGroup(segs, ex.length - 1, extendDist);
      return withGroups(segs, [{ start: 0, end: gEnd, kind: 'bayOut' }]);
    },
  };

  return { entryLine, loop, exitLine, departure, uTurn, approach, stallManeuvers, bayManeuvers, routes, allSegments: all, uTurnRadius: Ru };
}
