// One simulation clock (seconds since run start). Formatting for "Day 1, 06:00 WIB".
export function simTimeToCalendar(seconds, calendar) {
  const startSec = calendar.startHour * 3600;
  const total = Math.floor(startSec + seconds);
  const day = Math.floor(total / 86400) + 1;
  const rem = total % 86400;
  const hour = Math.floor(rem / 3600);
  const minute = Math.floor((rem % 3600) / 60);
  const second = rem % 60;
  return { day, hour, minute, second };
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatSimTime(seconds, calendar, withSeconds = false) {
  const c = simTimeToCalendar(seconds, calendar);
  const hm = `${pad2(c.hour)}:${pad2(c.minute)}${withSeconds ? ':' + pad2(c.second) : ''}`;
  return `Day ${c.day}, ${hm} ${calendar.timezone || 'WIB'}`;
}

// Jam-hari (0-23) pada waktu simulasi tertentu, untuk profil kedatangan per jam.
export function hourOfDay(seconds, calendar) {
  return simTimeToCalendar(seconds, calendar).hour;
}

export function formatDuration(seconds) {
  if (seconds == null || !isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return `${h} h ${m} min`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m} min ${sec} s`;
}
