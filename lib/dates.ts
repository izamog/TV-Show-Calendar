import { DISPLAY_TIME_ZONE } from "./config";
import type { ServiceKind } from "./types";

/**
 * Date / timezone utilities shared by the page and the iCal endpoint.
 *
 * The rolling window and all display times are anchored to Europe/London and
 * derived from the current instant, so they recompute correctly whenever the
 * app runs and handle the BST/GMT seasonal offset via the IANA database
 * (through Intl) rather than any hardcoded offset.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_LENGTH_DAYS = 14;

/** A resolved 14-day window, all keys are `YYYY-MM-DD` London calendar dates. */
export interface RollingWindow {
  /** Monday of the current London week. */
  startKey: string;
  /** Sunday of the following week (start + 13 days). */
  endKey: string;
  /** 14 sequential London date keys, index 0 = Monday of current week. */
  dayKeys: string[];
}

/** Returns the London calendar date of an instant as `[year, month, day]` (month is 1-based). */
function londonYmd(instant: Date): [number, number, number] {
  // en-CA renders as YYYY-MM-DD, giving a stable, parseable civil date.
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const [year, month, day] = formatted.split("-").map((n) => Number(n));
  return [year, month, day];
}

/** `YYYY-MM-DD` for a UTC-midnight civil date. */
function civilDayKey(utcMidnight: Date): string {
  return utcMidnight.toISOString().slice(0, 10);
}

/**
 * The rolling 14-day window: two Monday–Sunday weeks whose first row starts on
 * the Monday of the current London calendar week. Pass `now` for testability;
 * defaults to the real clock.
 */
export function getRollingWindow(now: Date = new Date()): RollingWindow {
  const [year, month, day] = londonYmd(now);

  // Anchor at UTC midnight of today's London date. UTC arithmetic on a civil
  // date is DST-agnostic — we are only counting calendar days here, not
  // instants — so stepping by whole days never drifts across a DST boundary.
  const anchor = new Date(Date.UTC(year, month - 1, day));

  // getUTCDay: 0=Sun..6=Sat. Days elapsed since Monday of this week.
  const daysSinceMonday = (anchor.getUTCDay() + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - daysSinceMonday);

  const dayKeys: string[] = [];
  for (let i = 0; i < WINDOW_LENGTH_DAYS; i++) {
    const d = new Date(anchor.getTime() + i * MS_PER_DAY);
    dayKeys.push(civilDayKey(d));
  }

  return {
    startKey: dayKeys[0],
    endKey: dayKeys[dayKeys.length - 1],
    dayKeys,
  };
}

/**
 * Offset (zoned wall time minus UTC) in milliseconds for `instant` in a zone.
 * Positive east of UTC. For Europe/London this is +0 (GMT) or +3_600_000 (BST).
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // Intl renders midnight as hour 24 in some engines; normalise to 0.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUtc - instant.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to the corresponding UTC instant (ms).
 * Two passes settle the offset correctly across DST transitions.
 */
function zonedWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offset = timeZoneOffsetMs(new Date(naiveUtc), timeZone);
  let result = naiveUtc - offset;
  offset = timeZoneOffsetMs(new Date(result), timeZone);
  result = naiveUtc - offset;
  return result;
}

/**
 * Resolve the exact air instant (UTC ms) for an episode.
 *
 * TMDB exposes only a plain `air_date` for episodes (no time component), so we
 * apply the documented defaults:
 *   - streaming : 00:00 UTC on the air date (drops at midnight UTC).
 *   - broadcast : 20:00 Europe/London on the air date (typical primetime slot).
 *
 * `explicitTime` ("HH:MM", 24h) overrides the default when a source ever
 * provides one, and is interpreted as London wall time.
 */
export function resolveAirInstantUtcMs(
  airDate: string,
  kind: ServiceKind,
  explicitTime?: string | null
): number {
  const [year, month, day] = airDate.split("-").map((n) => Number(n));

  if (explicitTime) {
    const [hh, mm] = explicitTime.split(":").map((n) => Number(n));
    return zonedWallTimeToUtcMs(year, month, day, hh, mm, DISPLAY_TIME_ZONE);
  }

  if (kind === "streaming") {
    return Date.UTC(year, month - 1, day, 0, 0, 0);
  }

  // broadcast default: 20:00 London local.
  return zonedWallTimeToUtcMs(year, month, day, 20, 0, DISPLAY_TIME_ZONE);
}

/** London calendar date key (`YYYY-MM-DD`) for a UTC instant — used for grid placement. */
export function londonDateKey(instantUtcMs: number): string {
  const [year, month, day] = londonYmd(new Date(instantUtcMs));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** London clock time for display, e.g. "8:00 PM" or "12:00 AM". */
export function formatLondonTime(instantUtcMs: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(instantUtcMs))
    // en-GB yields "8:00 am"; uppercase the meridiem for the UI spec.
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

/** Weekday + day-of-month label for a column header, e.g. "Mon 12". */
export function formatColumnHeader(dayKey: string): { weekday: string; dayOfMonth: string } {
  // Interpret the key at noon UTC to avoid any tz rollover when labelling.
  const [year, month, day] = dayKey.split("-").map((n) => Number(n));
  const instant = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  }).format(instant);
  return { weekday, dayOfMonth: String(day) };
}

/** ICS UTC timestamp: `YYYYMMDDTHHMMSSZ`. */
export function formatIcsUtc(instantUtcMs: number): string {
  return (
    new Date(instantUtcMs)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")
  );
}
