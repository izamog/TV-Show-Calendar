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

/** The rolling period the calendar covers: 4 Monday–Sunday weeks from this week. */
export const PERIOD_DAYS = 28;
/** How much of that period is on screen at once: 2 Monday–Sunday weeks. */
export const VISIBLE_DAYS = 14;
/** Scroll step for the up/down arrows. */
const DAYS_PER_WEEK = 7;
/** Highest week offset that still fits a full visible window inside the period. */
export const MAX_WEEK_OFFSET = (PERIOD_DAYS - VISIBLE_DAYS) / DAYS_PER_WEEK;

/**
 * A resolved rolling window. All day keys are `YYYY-MM-DD` London calendar dates.
 *
 * The *period* is a fixed 28 days beginning on the Monday of the current London
 * week. The *visible* slice is a 14-day (two-week) view into that period, moved
 * one week at a time by the up/down arrows — so the data range never changes as
 * the user scrolls, only which fortnight is on screen.
 */
export interface RollingWindow {
  /** Monday of the current London week — day 0 of the 28-day period. */
  periodStartKey: string;
  /** Final day of the 28-day period (periodStart + 27). */
  periodEndKey: string;
  /** All 28 day keys of the period, in order. */
  periodDayKeys: string[];
  /** Which week of the period the visible slice starts at (0..MAX_WEEK_OFFSET). */
  weekOffset: number;
  /** The 14 day keys currently on screen. */
  visibleDayKeys: string[];
  /** Human label for the visible slice, e.g. "27 Jul – 9 Aug 2026". */
  rangeLabel: string;
  /** Whether the up/down arrows have anywhere to go. */
  canGoEarlier: boolean;
  canGoLater: boolean;
  /** Offsets the arrows link to (clamped, so they never point out of range). */
  earlierOffset: number;
  laterOffset: number;
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
 * Parse the `?week=` search param into a valid week offset.
 * Anything absent, malformed, or out of range clamps to 0 (the current week),
 * so a hand-edited URL can never render an out-of-period grid.
 */
export function parseWeekOffset(raw?: string | null): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n)) return 0;
  return Math.min(Math.max(n, 0), MAX_WEEK_OFFSET);
}

/** Format the visible range, collapsing a shared month/year: "27 Jul – 9 Aug 2026". */
function formatRangeLabel(startKey: string, endKey: string): string {
  const at = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    // Noon UTC avoids any zone rollover when labelling a civil date.
    return new Date(Date.UTC(y, m - 1, d, 12));
  };
  const start = at(startKey);
  const end = at(endKey);
  const day = (dt: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric" }).format(dt);
  const month = (dt: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" }).format(dt);
  const year = (dt: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", year: "numeric" }).format(dt);

  const sameMonth = startKey.slice(0, 7) === endKey.slice(0, 7);
  const sameYear = startKey.slice(0, 4) === endKey.slice(0, 4);

  if (sameMonth) return `${day(start)} – ${day(end)} ${month(end)} ${year(end)}`;
  if (sameYear) {
    return `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${year(end)}`;
  }
  return `${day(start)} ${month(start)} ${year(start)} – ${day(end)} ${month(end)} ${year(end)}`;
}

/**
 * The rolling window: a 28-day period starting on the Monday of the current
 * London week, with a 14-day slice visible at `weekOffset`.
 *
 * Pass `now` for testability; defaults to the real clock. The period is
 * recomputed from the clock on every call and is never hardcoded.
 */
export function getRollingWindow(
  weekOffsetRaw?: string | number | null,
  now: Date = new Date()
): RollingWindow {
  const [year, month, day] = londonYmd(now);

  // Anchor at UTC midnight of today's London date. UTC arithmetic on a civil
  // date is DST-agnostic — we are only counting calendar days here, not
  // instants — so stepping by whole days never drifts across a DST boundary.
  const today = new Date(Date.UTC(year, month - 1, day));

  // getUTCDay: 0=Sun..6=Sat. Step back to the Monday of this week.
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const periodStart = new Date(today.getTime() - daysSinceMonday * MS_PER_DAY);

  const periodDayKeys: string[] = [];
  for (let i = 0; i < PERIOD_DAYS; i++) {
    periodDayKeys.push(civilDayKey(new Date(periodStart.getTime() + i * MS_PER_DAY)));
  }

  const weekOffset =
    typeof weekOffsetRaw === "number"
      ? Math.min(Math.max(Math.trunc(weekOffsetRaw), 0), MAX_WEEK_OFFSET)
      : parseWeekOffset(weekOffsetRaw);

  const from = weekOffset * DAYS_PER_WEEK;
  const visibleDayKeys = periodDayKeys.slice(from, from + VISIBLE_DAYS);

  return {
    periodStartKey: periodDayKeys[0],
    periodEndKey: periodDayKeys[periodDayKeys.length - 1],
    periodDayKeys,
    weekOffset,
    visibleDayKeys,
    rangeLabel: formatRangeLabel(
      visibleDayKeys[0],
      visibleDayKeys[visibleDayKeys.length - 1]
    ),
    canGoEarlier: weekOffset > 0,
    canGoLater: weekOffset < MAX_WEEK_OFFSET,
    earlierOffset: Math.max(0, weekOffset - 1),
    laterOffset: Math.min(MAX_WEEK_OFFSET, weekOffset + 1),
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

/**
 * Full spoken date for a day cell, e.g. "Monday 27 July 2026".
 * The visual header shows only "Mon" + "27"; screen readers get this instead so
 * the cell is unambiguous out of visual context (WCAG 1.3.1).
 */
export function formatFullDate(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map((n) => Number(n));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
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
