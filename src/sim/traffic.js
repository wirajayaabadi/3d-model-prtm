// Koordinasi lalu lintas: kinematika langkah tetap, klaim segmen/area konflik berbasis poligon,
// car-following di lajur bersama, hak jalan, dan deteksi kebuntuan.
import { vehicleExtents } from '../config/vehicles.js';
import { footprintAt } from '../geometry/layout.js';
import { inflatePolygon, bbox, bboxOverlap, polygonsOverlap } from '../geometry/sweptPath.js';

// Apakah poligon (dengan bbox) bersinggungan dengan salah satu potongan konflik segmen.
export function segmentHitsPoly(seg, poly, bb) {
  if (!bboxOverlap(seg.bb, bb)) return false;
  for (const c of seg.cpolys) if (bboxOverlap(c.bb, bb) && polygonsOverlap(c.poly, poly)) return true;
  return false;
}

export function segmentsConflict(a, b) {
  if (!bboxOverlap(a.bb, b.bb)) return false;
  for (const ca of a.cpolys) {
    for (const cb of b.cpolys) if (bboxOverlap(ca.bb, cb.bb) && polygonsOverlap(ca.poly, cb.poly)) return true;
  }
  return false;
}
import { limitWithLookahead, speedToStopIn } from '../geometry/kinematics.js';

const PRIORITY = { bayOut: 0, stallOut: 0, bayIn: 1, stallIn: 1, lane: 2 };

export class Traffic {
  constructor(vehicle, dt) {
    this.v = vehicle;
    this.ext = vehicleExtents(vehicle);
    this.dt = dt;
    this.infl = vehicle.clearance / 2;
    this.releaseCounter = 0;
  }

  leadExtent(seg) {
    return seg.reverse ? this.ext.rear : this.ext.front;
  }

  setOccupancy(truck, seg) {
    if (truck.curSeg === seg) return;
    if (truck.curSeg) truck.curSeg.occupants.delete(truck);
    truck.curSeg = seg;
    if (seg) seg.occupants.add(truck);
  }

  updatePose(truck) {
    const seg = truck.route.segments[truck.routeIndex];
    truck.pose = seg.poseAt(truck.s);
    truck.footprint = footprintAt(truck.pose, this.v);
    truck.fpoly = inflatePolygon(truck.footprint, this.infl);
    truck.fbb = bbox(truck.fpoly);
    this.setOccupancy(truck, seg);
  }

  setRoute(truck, route, startIndex = 0, s = 0) {
    truck.route = route;
    truck.routeIndex = startIndex;
    truck.s = s;
    // Belum memegang segmen apa pun: segmen awal (dan grup atomiknya) harus diklaim utuh lebih dulu.
    truck.acq = { tail: startIndex, head: startIndex - 1 };
    truck.atRouteEnd = false;
    truck.blocked = false;
    truck.requestSince = null;
    this.updatePose(truck);
  }

  // Memperpanjang rute truk yang sedang berada di lajur (segmen bersama yang sama) tanpa teleportasi.
  extendRoute(truck, newRoute) {
    const cur = truck.route.segments[truck.routeIndex];
    const idx = newRoute.segments.indexOf(cur);
    if (idx < 0) throw new Error('rute baru tidak memuat segmen saat ini');
    const oldHeadSeg = truck.acq ? truck.route.segments[truck.acq.head] : cur;
    let head = newRoute.segments.indexOf(oldHeadSeg);
    if (head < idx) head = idx;
    truck.route = newRoute;
    truck.routeIndex = idx;
    truck.acq = { tail: idx, head };
    truck.atRouteEnd = false;
    truck.routeEndOffset = 0;
    truck.blocked = false;
    truck.requestSince = null;
  }

  clearRoute(truck) {
    if (truck.acq) this.releaseCounter++;
    truck.acq = null;
    truck.route = null;
    truck.blocked = false;
    truck.speed = 0;
    this.setOccupancy(truck, null);
  }

  remainingDistance(truck) {
    const segs = truck.route.segments;
    let d = segs[truck.routeIndex].length - truck.s;
    for (let i = truck.routeIndex + 1; i < segs.length; i++) d += segs[i].length;
    return d;
  }

  // Jarak dari sumbu belakang ke awal segmen i (negatif bila i adalah segmen saat ini).
  distToSegStart(truck, i) {
    const segs = truck.route.segments;
    let d = -truck.s;
    for (let k = truck.routeIndex; k < i; k++) d += segs[k].length;
    return d;
  }

  // Segmen yang ingin diklaim di depan (kontigu dari head+1), diperluas ke grup atomik.
  computeWanted(truck) {
    const segs = truck.route.segments;
    const head = truck.acq.head;
    if (head >= segs.length - 1) return null;
    const cur = segs[truck.routeIndex];
    const v = truck.speed;
    const need = this.leadExtent(cur) + this.v.clearance + (v * v) / (2 * this.v.decel) + v * this.dt + 0.5;
    let i = head + 1;
    let d = this.distToSegStart(truck, i);
    if (d >= need) return null;
    let last = head;
    while (i < segs.length && d < need) {
      last = i;
      d += segs[i].length;
      i++;
    }
    let grown = true;
    while (grown) {
      grown = false;
      for (const g of truck.route.groups) {
        if (last >= g.start && last < g.end) {
          last = g.end;
          grown = true;
        }
      }
    }
    let kind = 'lane';
    for (const g of truck.route.groups) {
      if (g.start >= head + 1 && g.start <= last) kind = g.kind;
    }
    return { from: head + 1, to: last, kind };
  }

  canAcquire(truck, from, to, trucks) {
    const segs = truck.route.segments;
    for (const o of trucks) {
      if (o === truck || !o.spawned || !o.fpoly) continue;
      const oLane = o.curSeg ? o.curSeg.lane : null;
      for (let i = from; i <= to; i++) {
        const seg = segs[i];
        const exempt = seg.lane && oLane === seg.lane;
        if (!exempt && segmentHitsPoly(seg, o.fpoly, o.fbb)) return false;
        if (o.acq && o.route) {
          const osegs = o.route.segments;
          for (let j = o.acq.tail; j <= o.acq.head; j++) {
            const h = osegs[j];
            if (seg.lane && seg.lane === h.lane) continue;
            if (segmentsConflict(seg, h)) return false;
          }
        }
      }
    }
    return true;
  }

  // Semua permintaan klaim diproses dalam urutan hak jalan: kelas prioritas, waktu permintaan, ID truk.
  processAcquisitions(travelling, allTrucks, now) {
    const requests = [];
    for (const t of travelling) {
      if (!t.acq) continue;
      const w = this.computeWanted(t);
      if (!w) {
        t.blocked = false;
        t.requestSince = null;
        continue;
      }
      if (t.requestSince == null) t.requestSince = now;
      requests.push({ t, w, prio: PRIORITY[w.kind] ?? 2 });
    }
    requests.sort((a, b) => a.prio - b.prio || a.t.requestSince - b.t.requestSince || a.t.id - b.t.id);
    for (const r of requests) {
      if (this.canAcquire(r.t, r.w.from, r.w.to, allTrucks)) {
        r.t.acq.head = r.w.to;
        r.t.blocked = false;
        r.t.requestSince = null;
      } else {
        r.t.blocked = true;
      }
    }
  }

  // Jarak bumper-ke-bumper ke truk terdekat di depan pada lajur yang sama (Infinity bila tidak ada).
  // maneuvering: truk yang sumbu belakangnya tidak berada di lajur (sedang manuver/parkir) tetapi badannya
  // mungkin masih menutupi lajur; diperlakukan sebagai "bayangan" dengan proyeksi titik terbelakang badannya.
  leaderGap(truck, maneuvering = [], lookahead = 80) {
    const segs = truck.route.segments;
    let gap = Infinity;
    let d = -truck.s;
    const extent = this.ext.rear + this.ext.front;
    const scan = (seg) => {
      for (const o of seg.occupants) {
        if (o === truck) continue;
        const pos = d + o.s;
        if (pos <= 1e-9) continue;
        const g = pos - extent;
        if (g < gap) gap = g;
      }
      if (seg.kind === 'straight' && maneuvering.length) {
        const ux = (seg.p1.x - seg.p0.x) / seg.length, uz = (seg.p1.z - seg.p0.z) / seg.length;
        const strip = seg.cpolys[0];
        for (const o of maneuvering) {
          if (o === truck || !bboxOverlap(o.fbb, strip.bb) || !polygonsOverlap(o.fpoly, strip.poly)) continue;
          let minAlong = Infinity;
          for (const c of o.footprint) {
            const a = (c.x - seg.p0.x) * ux + (c.z - seg.p0.z) * uz;
            if (a < minAlong) minAlong = a;
          }
          const pos = d + minAlong;
          if (pos <= 1e-9) continue;
          const g = pos - this.ext.front;
          if (g < gap) gap = g;
        }
      }
      d += seg.length;
    };
    let lastLane = null;
    let i = truck.routeIndex;
    for (; i < segs.length && d < lookahead; i++) {
      const seg = segs[i];
      if (!seg.lane) {
        if (i > truck.routeIndex) break;
        d += seg.length;
        continue;
      }
      scan(seg);
      lastLane = seg;
    }
    // Lanjutkan sejauh satu panjang truk di lajur fisik setelah titik belok: badan truk yang menunggu di
    // depan titik belok dapat menjulur ke belakang hingga ke jalur kita.
    if (lastLane) {
      const limit = d + this.v.length + this.v.clearance;
      for (let n = lastLane.next; n && d < limit; n = n.next) scan(n);
    }
    return gap;
  }

  // Jarak bebas di depan posisi virtual awal lajur (untuk memutuskan spawn).
  spawnGap(firstSegments) {
    let d = 0, gap = Infinity;
    for (const seg of firstSegments) {
      for (const o of seg.occupants) {
        const g = d + o.s - this.ext.rear - this.ext.front;
        if (g < gap) gap = g;
      }
      d += seg.length;
      if (d > 40) break;
    }
    return gap;
  }

  // Satu langkah kinematika. Mengembalikan true bila truk berpindah.
  stepTruck(truck, maneuvering = []) {
    const segs = truck.route.segments;
    const idx = truck.routeIndex;
    const seg = segs[idx];
    const dt = this.dt;
    const v0 = truck.speed;

    let stopDist = this.remainingDistance(truck) - (truck.routeEndOffset || 0);
    if (truck.acq.head < segs.length - 1) {
      const dBoundary = this.distToSegStart(truck, truck.acq.head + 1) - this.leadExtent(seg) - this.v.clearance;
      if (dBoundary < stopDist) stopDist = dBoundary;
    }
    if (idx < segs.length - 1 && segs[idx + 1].reverse !== seg.reverse) {
      const dChange = seg.length - truck.s;
      if (dChange < stopDist) stopDist = dChange;
    }
    let lim = limitWithLookahead(segs, idx, truck.s, this.v.decel);
    const gap = this.leaderGap(truck, maneuvering);
    if (gap !== Infinity) {
      const g = gap - this.v.stationaryGap;
      if (g < stopDist) stopDist = g;
      lim = Math.min(lim, Math.max(0, g / this.v.headwaySeconds));
    }
    lim = Math.min(lim, speedToStopIn(stopDist, this.v.decel));
    let v = Math.max(0, Math.min(v0 + this.v.accel * dt, lim));
    let ds = v * dt;
    if (ds > stopDist) {
      ds = Math.max(0, stopDist);
      v = 0;
    }
    truck.speed = v;
    if (ds <= 0) {
      truck.moving = false;
      return false;
    }
    truck.s += ds;
    let i = truck.routeIndex;
    while (i < segs.length - 1 && truck.s >= segs[i].length - 1e-9) {
      truck.s -= segs[i].length;
      i++;
    }
    truck.routeIndex = i;
    if (i === segs.length - 1 && truck.s >= segs[i].length - (truck.routeEndOffset || 0) - 1e-9) {
      truck.s = segs[i].length - (truck.routeEndOffset || 0);
      truck.atRouteEnd = true;
      truck.speed = 0;
    }
    this.updatePose(truck);
    this.releaseBehind(truck);
    truck.moving = true;
    return true;
  }

  releaseBehind(truck) {
    if (!truck.acq) return;
    const segs = truck.route.segments;
    let released = false;
    while (truck.acq.tail < truck.routeIndex) {
      const seg = segs[truck.acq.tail];
      if (segmentHitsPoly(seg, truck.fpoly, truck.fbb)) break;
      truck.acq.tail++;
      released = true;
    }
    if (released) this.releaseCounter++;
  }
}
