/**
 * Local date/time helpers. Pickup times are stored as local wall-clock time plus
 * an IANA time zone, never as UTC or as the visitor's own time zone.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidDateString = (s: string) =>
  DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
export const isValidTimeString = (s: string) => TIME_RE.test(s);

/** Today's date (YYYY-MM-DD) at the given time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current wall-clock time (HH:mm) at the given time zone. */
export function nowTimeInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A reasonable upcoming default: one week from today at the pickup location. */
export function defaultPickupDate(timeZone: string, now: Date = new Date()): string {
  return addDays(todayInTimeZone(timeZone, now), 7);
}

export function isPastPickup(
  date: string,
  time: string,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  const today = todayInTimeZone(timeZone, now);
  if (date < today) return true;
  if (date > today) return false;
  return time <= nowTimeInTimeZone(timeZone, now);
}

/** "14 Apr 2027" — date-only formatting, independent of the viewer's zone. */
export function formatLocalDate(date: string, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * Local wall-clock datetime at `timeZone` with its UTC offset for that instant,
 * e.g. "2026-10-23T14:00:00+01:00".
 */
export function localDateTimeWithOffset(instant: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      timeZoneName: "longOffset",
    }).formatToParts(instant).map((p) => [p.type, p.value]),
  );
  const tz = String(parts["timeZoneName"]); // "GMT", "GMT+01:00"
  const offset = tz === "GMT" ? "+00:00" : tz.replace("GMT", "");
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}:${parts["second"]}${offset}`;
}
