// Per-user timezone support, defaulting to IST (UTC+5:30) for backward
// compat with v1. Each user has a `timezone` field on their `users` row
// that gets passed through to these helpers; if it's a fixed-offset zone
// like IST we use simple arithmetic, otherwise we delegate to the
// runtime's Intl support (which Cloudflare Workers do support).

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

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sunday..6=Saturday
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function nowUTCISO(): string {
  // Trim milliseconds for compactness; D1 stores as TEXT either way.
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Resolve wall-clock parts in the given IANA timezone. Uses
 * `Intl.DateTimeFormat` which is available in the Workers runtime and on
 * modern Node.
 */
function partsInZone(d: Date, tz: string): DateParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = dtf.formatToParts(d);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekdayShort = get('weekday'); // e.g. "Mon"
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  // Intl returns "24" for midnight in some browsers; coerce to 0.
  const hourRaw = Number.parseInt(get('hour'), 10);
  return {
    year: Number.parseInt(get('year'), 10),
    month: Number.parseInt(get('month'), 10),
    day: Number.parseInt(get('day'), 10),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number.parseInt(get('minute'), 10),
    weekday: weekdayMap[weekdayShort] ?? 0,
  };
}

export function istDateString(
  d: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): string {
  const p = partsInZone(d, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function istTimeString(
  d: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): string {
  const p = partsInZone(d, tz);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function istDayOfWeek(
  d: Date = new Date(),
  tz: string = DEFAULT_TIMEZONE,
): string {
  const p = partsInZone(d, tz);
  return DAY_NAMES[p.weekday];
}

export function daysAgoIST(n: number, tz: string = DEFAULT_TIMEZONE): string {
  // Anchor on today's wall-clock date in the requested zone, then subtract
  // n calendar days. Using Date.UTC on those zone-anchored components keeps
  // us insulated from DST (we're working in date-arithmetic space, not
  // timestamp-arithmetic).
  const todayParts = partsInZone(new Date(), tz);
  const utcMidnight = Date.UTC(
    todayParts.year,
    todayParts.month - 1,
    todayParts.day,
  );
  const target = new Date(utcMidnight - n * DAY_MS);
  const y = target.getUTCFullYear();
  const m = pad2(target.getUTCMonth() + 1);
  const day = pad2(target.getUTCDate());
  return `${y}-${m}-${day}`;
}

/*
 * Sanity assertions for IST (default zone). To run, copy into a scratch
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
 *
 *   // For a non-IST user, pass the timezone:
 *   istDateString(ref, 'America/Los_Angeles')  // => '2026-04-27' (06:12 PDT)
 */
