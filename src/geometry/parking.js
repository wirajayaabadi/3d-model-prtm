// Validasi stall: setiap stall harus lolos pemeriksaan lintasan sapuan untuk mundur-masuk dan maju-keluar
// dengan truk parkir di stall tetangga sebagai hambatan. Kapasitas efektif = jumlah stall yang lolos.
import { footprintAt, HEADING } from './layout.js';
import { validateRoute } from './sweptPath.js';

export function parkedPose(stall) {
  return { x: stall.parkedAxle.x, z: stall.parkedAxle.z, theta: HEADING.north };
}

export function validateStalls(layout, network, config, staticObstacles, bounds) {
  const v = config.vehicle;
  const results = layout.stalls.map((st, k) => {
    const neighbors = [];
    for (const dk of [-1, 1]) {
      const n = layout.stalls[k + dk];
      if (n) neighbors.push({ id: `stall${n.number}:truk`, kind: 'truck', poly: footprintAt(parkedPose(n), v) });
    }
    const obstacles = [...staticObstacles, ...neighbors];
    const man = network.stallManeuvers[k];
    const rIn = validateRoute(man.reverseIn, v, obstacles, bounds, v.clearance);
    const rOut = validateRoute(man.pullOut, v, obstacles, bounds, v.clearance);
    return {
      stall: st.number,
      index: k,
      feasible: rIn.feasible && rOut.feasible,
      reverseIn: rIn,
      pullOut: rOut,
      minClearance: Math.min(rIn.minClearance ?? Infinity, rOut.minClearance ?? Infinity),
    };
  });
  return {
    stalls: results,
    effectiveCapacity: results.filter((r) => r.feasible).length,
    targetCapacity: config.operations.targetWaitingCapacity,
  };
}
