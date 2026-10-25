// Geometri jejak dan lintasan sapuan: poligon konveks, SAT, jarak, hull, validasi rute.
import { footprintAt } from './layout.js';

export { footprintAt as footprint };

export function rectPoly(x0, z0, x1, z1) {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
}

export function circlePoly(cx, cz, r, n = 16) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) });
  }
  return pts;
}

export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

export function ensureCCW(poly) {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

// Andrew monotone chain. Hasil berurutan CCW (dalam sistem x-z dengan area bertanda positif).
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function bbox(poly) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  return { x0, z0, x1, z1 };
}

export function bboxOverlap(a, b, eps = 0) {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
}

// Menggeser setiap sisi poligon konveks CCW ke luar sejauh d dan memotong garis-garis hasilnya.
export function inflatePolygon(poly, d) {
  if (d === 0) return poly;
  const p = ensureCCW(poly);
  const n = p.length;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    const ex = b.x - a.x, ez = b.z - a.z;
    const len = Math.hypot(ex, ez) || 1;
    // normal luar untuk CCW dalam orientasi (x,z) dengan area positif: (ez, -ex)/len
    const nx = ez / len, nz = -ex / len;
    lines.push({ ax: a.x + nx * d, az: a.z + nz * d, dx: ex, dz: ez });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i + n - 1) % n], l2 = lines[i];
    const det = l1.dx * l2.dz - l1.dz * l2.dx;
    if (Math.abs(det) < 1e-12) {
      out.push({ x: l2.ax, z: l2.az });
      continue;
    }
    const t = ((l2.ax - l1.ax) * l2.dz - (l2.az - l1.az) * l2.dx) / det;
    out.push({ x: l1.ax + l1.dx * t, z: l1.az + l1.dz * t });
  }
  return out;
}

function project(poly, nx, nz) {
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const v = p.x * nx + p.z * nz;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// SAT untuk poligon konveks. Sentuhan tepi dianggap tidak tumpang tindih.
export function polygonsOverlap(a, b, eps = 1e-7) {
  for (const poly of [a, b]) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      const nx = q.z - p.z, nz = -(q.x - p.x);
      const len = Math.hypot(nx, nz);
      if (len < 1e-12) continue;
      const pa = project(a, nx / len, nz / len);
      const pb = project(b, nx / len, nz / len);
      if (pa.max <= pb.min + eps || pb.max <= pa.min + eps) return false;
    }
  }
  return true;
}

// Kedalaman penetrasi minimum (SAT); 0 jika tidak tumpang tindih.
export function penetrationDepth(a, b) {
  let depth = Infinity;
  for (const poly of [a, b]) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      const nx = q.z - p.z, nz = -(q.x - p.x);
      const len = Math.hypot(nx, nz);
      if (len < 1e-12) continue;
      const pa = project(a, nx / len, nz / len);
      const pb = project(b, nx / len, nz / len);
      const o = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
      if (o <= 0) return 0;
      if (o < depth) depth = o;
    }
  }
  return depth === Infinity ? 0 : depth;
}

function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

// Jarak minimum antara dua poligon konveks (0 jika tumpang tindih).
export function polygonDistance(a, b) {
  if (polygonsOverlap(a, b)) return 0;
  let d = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      d = Math.min(d, pointSegDist(a[i], b[j], b[(j + 1) % b.length]));
      d = Math.min(d, pointSegDist(b[j], a[i], a[(i + 1) % a.length]));
    }
  }
  return d;
}

// Pose pada jarak s di sepanjang satu segmen, termasuk ujung-ujungnya.
export function sampleSegmentPoses(seg, ds = 0.25) {
  const n = Math.max(1, Math.ceil(seg.length / ds));
  const poses = [];
  for (let i = 0; i <= n; i++) poses.push({ ...seg.poseAt((seg.length * i) / n), s: (seg.length * i) / n });
  return poses;
}

// Hull konveks dari semua jejak sepanjang segmen.
export function sweptHull(seg, vehicle, ds = 0.5) {
  const pts = [];
  for (const pose of sampleSegmentPoses(seg, ds)) pts.push(...footprintAt(pose, vehicle));
  return convexHull(pts);
}

// Validasi rute: seluruh jejak harus bebas dari hambatan dan batas plot dengan margin yang diberikan.
// obstacles: [{ id, kind, poly }], bounds: { width, length, gateCorridors: [{ z, halfWidth }] }
export function validateRoute(segments, vehicle, obstacles, bounds, margin, ds = 0.25) {
  const violations = [];
  let minClearance = Infinity;
  const obsB = obstacles.map((o) => ({ ...o, bb: bbox(o.poly) }));
  const prevHeading = { set: false, theta: 0, x: 0, z: 0 };
  let rotatesInPlace = false;
  for (const seg of segments) {
    for (const pose of sampleSegmentPoses(seg, ds)) {
      const fp = footprintAt(pose, vehicle);
      const fb = bbox(fp);
      if (prevHeading.set) {
        const moved = Math.hypot(pose.x - prevHeading.x, pose.z - prevHeading.z);
        let dth = Math.abs(pose.theta - prevHeading.theta);
        dth = Math.min(dth, Math.abs(dth - 2 * Math.PI));
        if (moved < 1e-6 && dth > 1e-6) rotatesInPlace = true;
      }
      prevHeading.set = true;
      prevHeading.theta = pose.theta;
      prevHeading.x = pose.x;
      prevHeading.z = pose.z;
      for (const o of obsB) {
        if (!bboxOverlap(fb, o.bb, -margin)) continue;
        const d = polygonDistance(fp, o.poly);
        if (d < minClearance) minClearance = d;
        if (d < margin - 1e-9) {
          const depth = d > 0 ? margin - d : margin + penetrationDepth(fp, o.poly);
          violations.push({ segmentId: seg.id, s: pose.s, obstacle: o.id, kind: o.kind, depth, x: pose.x, z: pose.z });
        }
      }
      if (bounds) {
        for (const p of fp) {
          const inGate = (bounds.gateCorridors || []).some((g) => Math.abs(p.z - g.z) <= g.halfWidth && p.x <= margin + 0.01);
          if (inGate) continue;
          const dx0 = p.x - margin, dx1 = bounds.width - margin - p.x;
          const dz0 = p.z - margin, dz1 = bounds.length - margin - p.z;
          const worst = Math.min(dx0, dx1, dz0, dz1);
          if (worst < minClearance - margin) minClearance = Math.max(0, worst + margin);
          if (worst < -1e-9) {
            const axis = worst === dx0 ? 'x0' : worst === dx1 ? 'x1' : worst === dz0 ? 'z0' : 'z1';
            violations.push({ segmentId: seg.id, s: pose.s, obstacle: 'plotBoundary', kind: 'boundary', axis, depth: -worst, x: pose.x, z: pose.z });
          }
        }
      }
    }
  }
  if (rotatesInPlace) violations.push({ segmentId: 'route', s: 0, obstacle: 'rotateInPlace', kind: 'kinematic', depth: 0 });
  // Ringkasan: pelanggaran terburuk per hambatan
  const worstByObstacle = {};
  for (const v of violations) {
    const k = v.obstacle;
    if (!worstByObstacle[k] || v.depth > worstByObstacle[k].depth) worstByObstacle[k] = v;
  }
  return {
    feasible: violations.length === 0,
    minClearance: minClearance === Infinity ? null : minClearance,
    violations,
    worst: Object.values(worstByObstacle),
  };
}
