// Interpolasi pose antara dua langkah simulasi (renderer tidak pernah mengubah status engine).
export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

export function lerpPose(a, b, t) {
  if (!a) return b;
  if (!b) return a;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, theta: lerpAngle(a.theta, b.theta, t) };
}

// Snapshot pose semua truk sebelum sekumpulan langkah dijalankan.
export function snapshotPoses(engine) {
  const m = new Map();
  for (const t of engine.trucks.values()) if (t.pose) m.set(t.id, t.pose);
  return m;
}
