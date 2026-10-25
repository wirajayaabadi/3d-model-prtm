// Kebijakan dispatch yang diasumsikan (bukan prosedur aktual ITJ): satu antrean bersama, diurutkan
// menurut waktu masuk antrean (saat truk selesai parkir), dengan aturan perlindungan anti-kelaparan.
import { BAY_STATES } from './models/bay.js';
import { TRUCK_STATES } from './models/truck.js';

export function isEarlier(a, b) {
  const ta = a.timestamps.queueEntry, tb = b.timestamps.queueEntry;
  return ta < tb || (ta === tb && a.id < b.id);
}

export function sortedQueue(trucks) {
  return trucks.filter((t) => t.state === TRUCK_STATES.WAITING).sort((a, b) => (isEarlier(a, b) ? -1 : 1));
}

// Mengembalikan daftar penugasan { truck, bay }. Pemanggil menerapkan efeknya melalui engine.assign.
export function runDispatch(trucks, bays, passCountThreshold, onProtected) {
  const assignments = [];
  let changed = true;
  while (changed) {
    changed = false;
    const queue = sortedQueue(trucks);
    const protectedTrucks = queue.filter((t) => t.protected);
    for (const t of queue) {
      let candidates = bays.filter(
        (b) => b.active && !b.pendingDeactivation && b.state === BAY_STATES.AVAILABLE && b.products.includes(t.product),
      );
      if (!candidates.length) continue;
      candidates = candidates.filter(
        (b) => !protectedTrucks.some((p) => p !== t && isEarlier(p, t) && b.products.includes(p.product)),
      );
      if (!candidates.length) continue;
      candidates.sort((a, b) => a.committedTotal - b.committedTotal || a.number - b.number);
      const bay = candidates[0];
      // Reservasi segera agar pemindaian berikutnya melihat bay ini sudah terpakai.
      bay.state = BAY_STATES.RESERVED;
      bay.truckId = t.id;
      t.state = TRUCK_STATES.TO_BAY;
      t.bay = bay.number;
      assignments.push({ truck: t, bay });
      for (const e of queue) {
        if (e !== t && e.state === TRUCK_STATES.WAITING && isEarlier(e, t)) {
          e.passedCount += 1;
          if (!e.protected && e.passedCount >= passCountThreshold) {
            e.protected = true;
            if (onProtected) onProtected(e, 'passCount');
          }
        }
      }
      changed = true;
      break;
    }
  }
  return assignments;
}
