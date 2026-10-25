// Kinematika 1D sepanjang rute: percepatan, pengereman, batas kecepatan per segmen, lookahead.

// Kecepatan maksimum yang masih memungkinkan berhenti dalam jarak d dengan perlambatan a.
export function speedToStopIn(d, decel) {
  return d <= 0 ? 0 : Math.sqrt(2 * decel * d);
}

// Kecepatan maksimum saat ini agar bisa turun ke vLimit setelah menempuh jarak d.
export function speedForLimitAhead(vLimit, d, decel) {
  return Math.sqrt(vLimit * vLimit + 2 * decel * Math.max(0, d));
}

// Batas kecepatan efektif mempertimbangkan segmen-segmen berikutnya hingga jarak lookahead.
export function limitWithLookahead(segments, index, s, decel, lookahead = 60) {
  let lim = segments[index].speedLimit;
  let d = segments[index].length - s;
  for (let i = index + 1; i < segments.length && d < lookahead; i++) {
    lim = Math.min(lim, speedForLimitAhead(segments[i].speedLimit, d, decel));
    d += segments[i].length;
  }
  return lim;
}

// Simulasi perjalanan tanpa gangguan lalu lintas. Mengembalikan waktu (detik) untuk menempuh rute
// (berhenti di ujung bila stopAtEnd) atau hingga jarak untilDistance tercapai.
export function simulateTravel(segments, vehicle, { dt = 0.1, stopAtEnd = true, untilDistance = Infinity, initialSpeed = 0 } = {}) {
  const total = segments.reduce((a, g) => a + g.length, 0);
  const target = Math.min(total, untilDistance);
  let idx = 0, s = 0, dist = 0, v = initialSpeed, t = 0;
  let guard = 0;
  while (dist < target - 1e-9 && guard++ < 10_000_000) {
    let lim = limitWithLookahead(segments, idx, s, vehicle.decel);
    if (stopAtEnd && untilDistance === Infinity) lim = Math.min(lim, speedToStopIn(total - dist, vehicle.decel));
    v = Math.min(v + vehicle.accel * dt, lim);
    let ds = v * dt;
    if (dist + ds > target) ds = target - dist;
    dist += ds;
    s += ds;
    t += dt;
    while (idx < segments.length - 1 && s >= segments[idx].length - 1e-9) {
      s -= segments[idx].length;
      idx++;
    }
  }
  return { time: t, distance: dist, finalSpeed: v };
}
