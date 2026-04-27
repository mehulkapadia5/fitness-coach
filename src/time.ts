// IST = UTC+5:30, fixed offset, no DST. We do the conversion by adding the
// offset to a UTC timestamp and then reading the UTC-style fields — those
// fields then represent IST wall-clock time.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // 19_800_000
const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function toISTParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function nowUTCISO(): string {
  // Trim milliseconds for compactness; D1 stores as TEXT either way.
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function istDateString(d: Date = new Date()): string {
  const p = toISTParts(d);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function istTimeString(d: Date = new Date()): string {
  const p = toISTParts(d);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function istDayOfWeek(d: Date = new Date()): string {
  const p = toISTParts(d);
  return DAY_NAMES[p.weekday];
}

export function daysAgoIST(n: number): string {
  // Subtract n full days from "now in IST" then format. Doing the subtract
  // on the IST-shifted timestamp keeps us safely away from any UTC-day
  // boundary edge cases for the small 1–90 day range we use.
  const now = Date.now();
  const istShifted = now + IST_OFFSET_MS - n * DAY_MS;
  const d = new Date(istShifted);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

/*
 * Sanity assertions — kept as a comment block so they are not bundled.
 * These describe the expected behaviour. To run them, copy into a scratch
 * file and execute with `node --input-type=module`.
 *
 *   // 2026-04-27T13:12:00Z is 2026-04-27 18:42 IST, a Monday.
 *   const ref = new Date('2026-04-27T13:12:00Z');
 *   istDateString(ref)   // => '2026-04-27'
 *   istTimeString(ref)   // => '18:42'
 *   istDayOfWeek(ref)    // => 'Monday'
 *
 *   // 2026-04-27T18:35:00Z is 2026-04-28 00:05 IST, a Tuesday.
 *   const cross = new Date('2026-04-27T18:35:00Z');
 *   istDateString(cross) // => '2026-04-28'
 *   istDayOfWeek(cross)  // => 'Tuesday'
 *
 *   // 2026-04-27T18:25:00Z is 2026-04-27 23:55 IST — still Monday.
 *   const late = new Date('2026-04-27T18:25:00Z');
 *   istDateString(late)  // => '2026-04-27'
 *
 *   // daysAgoIST(0) === istDateString() for current time.
 *   // daysAgoIST(7) returns the IST date 7 days before now.
 */
