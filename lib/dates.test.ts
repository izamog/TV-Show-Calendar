import { describe, it, expect } from "vitest";
import {
  getRollingWindow,
  parseWeekOffset,
  formatFullDate,
  MAX_WEEK_OFFSET,
  resolveAirInstantUtcMs,
  londonDateKey,
  formatLondonTime,
  formatColumnHeader,
  formatIcsUtc,
} from "./dates";

/** getUTCDay for a `YYYY-MM-DD` key, read at noon UTC to avoid any rollover. */
function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

describe("getRollingWindow — 28-day period, 14 visible, week-stepped", () => {
  // Sample instants across the year, including both DST-transition days and a
  // late-Sunday-UTC instant that is already Monday in London.
  const cases: Array<[label: string, iso: string, expectedMonday: string]> = [
    ["summer / BST (a Friday)", "2026-08-14T10:00:00Z", "2026-08-10"],
    ["winter / GMT (a Thursday)", "2026-01-15T10:00:00Z", "2026-01-12"],
    ["spring-forward day (BST begins)", "2026-03-29T12:00:00Z", "2026-03-23"],
    ["fall-back day (GMT begins)", "2026-10-25T12:00:00Z", "2026-10-19"],
  ];

  it.each(cases)("starts on the Monday of the current week: %s", (_l, iso, monday) => {
    const w = getRollingWindow(0, new Date(iso));
    expect(w.periodStartKey).toBe(monday);
    expect(weekdayOf(w.periodStartKey)).toBe(1); // Monday
    expect(w.periodDayKeys).toHaveLength(28);
    expect(weekdayOf(w.periodEndKey)).toBe(0); // Sunday
  });

  it("shows exactly 14 days, starting Monday and ending Sunday", () => {
    for (let offset = 0; offset <= MAX_WEEK_OFFSET; offset++) {
      const w = getRollingWindow(offset, new Date("2026-08-14T10:00:00Z"));
      expect(w.visibleDayKeys).toHaveLength(14);
      expect(weekdayOf(w.visibleDayKeys[0])).toBe(1);
      expect(weekdayOf(w.visibleDayKeys[13])).toBe(0);
    }
  });

  it("steps the visible slice by exactly one week per offset", () => {
    const now = new Date("2026-08-14T10:00:00Z"); // week of Mon 2026-08-10
    expect(getRollingWindow(0, now).visibleDayKeys[0]).toBe("2026-08-10");
    expect(getRollingWindow(1, now).visibleDayKeys[0]).toBe("2026-08-17");
    expect(getRollingWindow(2, now).visibleDayKeys[0]).toBe("2026-08-24");
  });

  it("keeps the visible slice inside the 28-day period at every offset", () => {
    const now = new Date("2026-08-14T10:00:00Z");
    for (let offset = 0; offset <= MAX_WEEK_OFFSET; offset++) {
      const w = getRollingWindow(offset, now);
      const period = new Set(w.periodDayKeys);
      for (const key of w.visibleDayKeys) expect(period.has(key)).toBe(true);
    }
    // The last offset must land exactly on the end of the period.
    const last = getRollingWindow(MAX_WEEK_OFFSET, now);
    expect(last.visibleDayKeys[13]).toBe(last.periodEndKey);
  });

  it("produces 28 consecutive days with no gaps or duplicates across a DST change", () => {
    const w = getRollingWindow(0, new Date("2026-03-29T12:00:00Z"));
    expect(new Set(w.periodDayKeys).size).toBe(28);
    for (let i = 1; i < w.periodDayKeys.length; i++) {
      const prev = new Date(w.periodDayKeys[i - 1] + "T00:00:00Z").getTime();
      const cur = new Date(w.periodDayKeys[i] + "T00:00:00Z").getTime();
      expect(cur - prev).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("uses the LONDON civil date: a late-Sunday-UTC instant already Monday in London rolls forward", () => {
    // 2026-08-16 23:59Z is Mon 2026-08-17 00:59 BST → period starts that Monday.
    const w = getRollingWindow(0, new Date("2026-08-16T23:59:00Z"));
    expect(w.periodStartKey).toBe("2026-08-17");
  });

  it("reports arrow availability at the ends of the period", () => {
    const now = new Date("2026-08-14T10:00:00Z");
    const first = getRollingWindow(0, now);
    expect(first.canGoEarlier).toBe(false);
    expect(first.canGoLater).toBe(true);

    const last = getRollingWindow(MAX_WEEK_OFFSET, now);
    expect(last.canGoEarlier).toBe(true);
    expect(last.canGoLater).toBe(false);

    // Arrow targets are clamped, so they never point outside the period.
    expect(first.earlierOffset).toBe(0);
    expect(last.laterOffset).toBe(MAX_WEEK_OFFSET);
  });

  it("clamps out-of-range and malformed ?week values instead of breaking", () => {
    const now = new Date("2026-08-14T10:00:00Z");
    for (const bad of ["", "nonsense", "-5", "99", "1.5", "1e3", null, undefined]) {
      const w = getRollingWindow(bad as string | null | undefined, now);
      expect(w.weekOffset).toBeGreaterThanOrEqual(0);
      expect(w.weekOffset).toBeLessThanOrEqual(MAX_WEEK_OFFSET);
      expect(w.visibleDayKeys).toHaveLength(14);
    }
    expect(getRollingWindow("99", now).weekOffset).toBe(MAX_WEEK_OFFSET);
    expect(getRollingWindow("-5", now).weekOffset).toBe(0);
    expect(getRollingWindow("2", now).weekOffset).toBe(2);
  });

  it("labels the visible range, collapsing a shared month or year", () => {
    const now = new Date("2026-08-14T10:00:00Z");
    // Mon 10 Aug – Sun 23 Aug: same month and year.
    expect(getRollingWindow(0, now).rangeLabel).toBe("10 – 23 Aug 2026");
    // Mon 24 Aug – Sun 6 Sep: crosses a month boundary. en-GB abbreviates
    // September as "Sept" (4 letters) — that is correct ICU output, not a typo.
    expect(getRollingWindow(2, now).rangeLabel).toBe("24 Aug – 6 Sept 2026");
    // Crossing a year boundary keeps both years.
    expect(getRollingWindow(2, new Date("2026-12-14T10:00:00Z")).rangeLabel).toBe(
      "28 Dec 2026 – 10 Jan 2027"
    );
  });

  it("is deterministic for a given instant and offset", () => {
    const a = getRollingWindow(1, new Date("2026-05-01T08:00:00Z"));
    const b = getRollingWindow(1, new Date("2026-05-01T08:00:00Z"));
    expect(a).toEqual(b);
  });
});

describe("parseWeekOffset", () => {
  it("clamps to the valid range and defaults to the current week", () => {
    expect(parseWeekOffset(undefined)).toBe(0);
    expect(parseWeekOffset(null)).toBe(0);
    expect(parseWeekOffset("")).toBe(0);
    expect(parseWeekOffset("abc")).toBe(0);
    expect(parseWeekOffset("1")).toBe(1);
    expect(parseWeekOffset("-3")).toBe(0);
    expect(parseWeekOffset("100")).toBe(MAX_WEEK_OFFSET);
  });
});

describe("formatFullDate — spoken label for a day cell", () => {
  it("renders the unabbreviated date", () => {
    // en-GB punctuates the weekday with a comma.
    expect(formatFullDate("2026-08-10")).toBe("Monday, 10 August 2026");
  });
});

describe("resolveAirInstantUtcMs — air-time defaults", () => {
  it("streaming defaults to 00:00 UTC on the air date", () => {
    const ms = resolveAirInstantUtcMs("2026-08-14", "streaming");
    expect(new Date(ms).toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("broadcast defaults to 20:00 London — 19:00 UTC in BST (summer)", () => {
    const ms = resolveAirInstantUtcMs("2026-08-14", "broadcast");
    expect(new Date(ms).toISOString()).toBe("2026-08-14T19:00:00.000Z");
  });

  it("broadcast defaults to 20:00 London — 20:00 UTC in GMT (winter)", () => {
    const ms = resolveAirInstantUtcMs("2026-01-15", "broadcast");
    expect(new Date(ms).toISOString()).toBe("2026-01-15T20:00:00.000Z");
  });

  it("an explicit London wall time overrides the default", () => {
    const summer = resolveAirInstantUtcMs("2026-08-14", "streaming", "21:30");
    expect(new Date(summer).toISOString()).toBe("2026-08-14T20:30:00.000Z"); // BST -1h
    const winter = resolveAirInstantUtcMs("2026-01-15", "streaming", "21:30");
    expect(new Date(winter).toISOString()).toBe("2026-01-15T21:30:00.000Z"); // GMT
  });
});

describe("londonDateKey — grid placement date", () => {
  it("keeps a BST-morning instant on its London day", () => {
    // 00:00 UTC on 2026-08-14 is 01:00 BST same day.
    expect(londonDateKey(Date.UTC(2026, 7, 14, 0, 0, 0))).toBe("2026-08-14");
  });

  it("rolls a late-night-UTC instant forward when London is already the next day", () => {
    // 2026-08-13 23:30Z is 2026-08-14 00:30 BST.
    expect(londonDateKey(Date.UTC(2026, 7, 13, 23, 30, 0))).toBe("2026-08-14");
  });
});

describe("formatLondonTime — display clock", () => {
  it("renders 00:00 UTC as 1:00 AM in BST and 12:00 AM in GMT", () => {
    expect(formatLondonTime(Date.UTC(2026, 7, 14, 0, 0, 0))).toBe("1:00 AM");
    expect(formatLondonTime(Date.UTC(2026, 0, 15, 0, 0, 0))).toBe("12:00 AM");
  });

  it("renders a broadcast 20:00 London slot as 8:00 PM year-round", () => {
    expect(formatLondonTime(resolveAirInstantUtcMs("2026-08-14", "broadcast"))).toBe("8:00 PM");
    expect(formatLondonTime(resolveAirInstantUtcMs("2026-01-15", "broadcast"))).toBe("8:00 PM");
  });
});

describe("format helpers", () => {
  it("formatColumnHeader gives weekday + day-of-month", () => {
    expect(formatColumnHeader("2026-08-10")).toEqual({ weekday: "Mon", dayOfMonth: "10" });
  });

  it("formatIcsUtc emits YYYYMMDDTHHMMSSZ", () => {
    expect(formatIcsUtc(Date.UTC(2026, 7, 14, 19, 0, 0))).toBe("20260814T190000Z");
  });
});
