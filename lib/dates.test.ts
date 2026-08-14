import { describe, it, expect } from "vitest";
import {
  getRollingWindow,
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

describe("getRollingWindow — the non-negotiable 14-day window", () => {
  // Sample instants across the year, including both DST-transition days and a
  // late-Sunday-UTC instant that is already Monday in London.
  const cases: Array<[label: string, iso: string, expectedStart: string]> = [
    ["summer / BST (a Friday)", "2026-08-14T10:00:00Z", "2026-08-10"],
    ["winter / GMT (a Thursday)", "2026-01-15T10:00:00Z", "2026-01-12"],
    ["spring-forward day (BST begins)", "2026-03-29T12:00:00Z", "2026-03-23"],
    ["fall-back day (GMT begins)", "2026-10-25T12:00:00Z", "2026-10-19"],
  ];

  it.each(cases)("anchors to Monday and spans 14 days: %s", (_label, iso, expectedStart) => {
    const w = getRollingWindow(new Date(iso));
    expect(w.dayKeys).toHaveLength(14);
    expect(w.startKey).toBe(expectedStart);
    expect(w.startKey).toBe(w.dayKeys[0]);
    expect(w.endKey).toBe(w.dayKeys[13]);
    expect(weekdayOf(w.startKey)).toBe(1); // Monday
    expect(weekdayOf(w.endKey)).toBe(0); // Sunday
  });

  it("produces 14 consecutive calendar days with no gaps or duplicates", () => {
    const w = getRollingWindow(new Date("2026-03-29T12:00:00Z")); // across DST
    expect(new Set(w.dayKeys).size).toBe(14);
    for (let i = 1; i < w.dayKeys.length; i++) {
      const prev = new Date(w.dayKeys[i - 1] + "T00:00:00Z").getTime();
      const cur = new Date(w.dayKeys[i] + "T00:00:00Z").getTime();
      expect(cur - prev).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("uses the LONDON civil date, not UTC: a late-Sunday-UTC instant that is Monday in London rolls to the next week", () => {
    // 2026-08-16 23:59Z is Mon 2026-08-17 00:59 BST → window starts that Monday.
    const w = getRollingWindow(new Date("2026-08-16T23:59:00Z"));
    expect(w.startKey).toBe("2026-08-17");
    expect(weekdayOf(w.startKey)).toBe(1);
  });

  it("is deterministic for a given instant", () => {
    const a = getRollingWindow(new Date("2026-05-01T08:00:00Z"));
    const b = getRollingWindow(new Date("2026-05-01T08:00:00Z"));
    expect(a).toEqual(b);
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
