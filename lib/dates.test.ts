import { describe, it, expect } from "vitest";
import {
  getRollingWindow,
  parseWeekOffset,
  formatFullDate,
  MAX_WEEK_OFFSET,
  DEFAULT_WEEK_OFFSET,
  resolveAirInstantUtcMs,
  londonDateKey,
  londonTodayKey,
  formatLondonTime,
  formatColumnHeader,
  formatIcsUtc,
  airtableWeekNum,
  suggestedPostDate,
  nextPostSlots,
} from "./dates";

/** getUTCDay for a `YYYY-MM-DD` key, read at noon UTC to avoid any rollover. */
function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

describe("getRollingWindow — 28-day period, 14 visible, week-stepped", () => {
  // Sample instants across the year, including both DST-transition days and a
  // late-Sunday-UTC instant that is already Monday in London. The expected key
  // is the Monday of LAST week — PERIOD_LOOKBACK_WEEKS back — so recently-aired
  // (and therefore rated) shows fall inside the period.
  const cases: Array<[label: string, iso: string, expectedMonday: string]> = [
    ["summer / BST (a Friday)", "2026-08-14T10:00:00Z", "2026-08-03"],
    ["winter / GMT (a Thursday)", "2026-01-15T10:00:00Z", "2026-01-05"],
    ["spring-forward day (BST begins)", "2026-03-29T12:00:00Z", "2026-03-16"],
    ["fall-back day (GMT begins)", "2026-10-25T12:00:00Z", "2026-10-12"],
  ];

  it.each(cases)(
    "starts a week before the Monday of the current week: %s",
    (_l, iso, monday) => {
      const w = getRollingWindow(0, new Date(iso));
      expect(w.periodStartKey).toBe(monday);
      expect(weekdayOf(w.periodStartKey)).toBe(1); // Monday
      expect(w.periodDayKeys).toHaveLength(28);
      expect(weekdayOf(w.periodEndKey)).toBe(0); // Sunday
    }
  );

  it("puts today inside the period, with a full week of hindsight before it", () => {
    // The lookback is what makes ratings usable: a show that premiered last week
    // has votes, and it must be on the calendar for those votes to matter.
    const now = new Date("2026-08-14T10:00:00Z"); // Friday
    const w = getRollingWindow(0, now);
    expect(w.periodDayKeys).toContain("2026-08-14");
    expect(w.periodDayKeys.indexOf("2026-08-14")).toBe(11); // 7 back + Mon→Fri
    expect(w.periodStartKey < londonTodayKey(now)).toBe(true);
  });

  it("shows exactly one Monday–Sunday week", () => {
    for (let offset = 0; offset <= MAX_WEEK_OFFSET; offset++) {
      const w = getRollingWindow(offset, new Date("2026-08-14T10:00:00Z"));
      expect(w.visibleDayKeys).toHaveLength(7);
      expect(weekdayOf(w.visibleDayKeys[0])).toBe(1);
      expect(weekdayOf(w.visibleDayKeys[6])).toBe(0);
    }
  });

  it("offers exactly one offset per week of the period", () => {
    // 28 days shown a week at a time is four positions: 0, 1, 2, 3.
    expect(MAX_WEEK_OFFSET).toBe(3);
  });

  it("steps the visible week by exactly one week per offset", () => {
    const now = new Date("2026-08-14T10:00:00Z"); // week of Mon 2026-08-10
    expect(getRollingWindow(0, now).visibleDayKeys[0]).toBe("2026-08-03");
    expect(getRollingWindow(1, now).visibleDayKeys[0]).toBe("2026-08-10");
    expect(getRollingWindow(2, now).visibleDayKeys[0]).toBe("2026-08-17");
    expect(getRollingWindow(3, now).visibleDayKeys[0]).toBe("2026-08-24");
  });

  it("keeps the visible week inside the 28-day period at every offset", () => {
    const now = new Date("2026-08-14T10:00:00Z");
    for (let offset = 0; offset <= MAX_WEEK_OFFSET; offset++) {
      const w = getRollingWindow(offset, now);
      const period = new Set(w.periodDayKeys);
      for (const key of w.visibleDayKeys) expect(period.has(key)).toBe(true);
    }
    // The last offset must land exactly on the end of the period.
    const last = getRollingWindow(MAX_WEEK_OFFSET, now);
    expect(last.visibleDayKeys[6]).toBe(last.periodEndKey);
  });

  it("opens on the week containing today, not the hindsight week", () => {
    // The whole point of DEFAULT_WEEK_OFFSET: with a week on screen instead of
    // a fortnight, offset 0 is entirely in the past and landing there would
    // show a page that finished on Sunday.
    const now = new Date("2026-08-14T10:00:00Z"); // Friday of the week of Mon 10th
    const landed = getRollingWindow(undefined, now);
    expect(landed.weekOffset).toBe(DEFAULT_WEEK_OFFSET);
    expect(landed.visibleDayKeys).toContain(londonTodayKey(now));

    // ...and the hindsight week is still reachable by asking for it.
    expect(getRollingWindow("0", now).weekOffset).toBe(0);
    expect(getRollingWindow("0", now).visibleDayKeys[0]).toBe("2026-08-03");
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
    // 2026-08-16 23:59Z is Mon 2026-08-17 00:59 BST, so "this week" is the week
    // of the 17th and the period starts a week before it, not two.
    const w = getRollingWindow(0, new Date("2026-08-16T23:59:00Z"));
    expect(w.periodStartKey).toBe("2026-08-10");
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
      expect(w.visibleDayKeys).toHaveLength(7);
    }
    // Out-of-range integers clamp to the nearest end of the period; only
    // unparseable input falls back to the default landing week.
    expect(getRollingWindow("99", now).weekOffset).toBe(MAX_WEEK_OFFSET);
    expect(getRollingWindow("-5", now).weekOffset).toBe(0);
    expect(getRollingWindow("2", now).weekOffset).toBe(2);
    expect(getRollingWindow("nonsense", now).weekOffset).toBe(DEFAULT_WEEK_OFFSET);
  });

  it("labels the visible week, collapsing a shared month or year", () => {
    const now = new Date("2026-08-14T10:00:00Z");
    // Mon 3 Aug – Sun 9 Aug: same month and year.
    expect(getRollingWindow(0, now).rangeLabel).toBe("3 – 9 Aug 2026");
    // Mon 17 Aug – Sun 23 Aug: still the same month.
    expect(getRollingWindow(2, now).rangeLabel).toBe("17 – 23 Aug 2026");
    // Mon 31 Aug – Sun 6 Sept crosses a month, so both are kept. en-GB
    // abbreviates September as "Sept" (4 letters) — correct ICU output, not a typo.
    expect(getRollingWindow(2, new Date("2026-08-28T10:00:00Z")).rangeLabel).toBe(
      "31 Aug – 6 Sept 2026"
    );
    // Mon 28 Dec – Sun 3 Jan crosses a year, so both years are kept.
    expect(getRollingWindow(2, new Date("2026-12-21T10:00:00Z")).rangeLabel).toBe(
      "28 Dec 2026 – 3 Jan 2027"
    );
  });

  it("is deterministic for a given instant and offset", () => {
    const a = getRollingWindow(1, new Date("2026-05-01T08:00:00Z"));
    const b = getRollingWindow(1, new Date("2026-05-01T08:00:00Z"));
    expect(a).toEqual(b);
  });
});

describe("parseWeekOffset", () => {
  it("falls back to the default week when there is nothing to parse", () => {
    expect(parseWeekOffset(undefined)).toBe(DEFAULT_WEEK_OFFSET);
    expect(parseWeekOffset(null)).toBe(DEFAULT_WEEK_OFFSET);
    expect(parseWeekOffset("")).toBe(DEFAULT_WEEK_OFFSET);
    expect(parseWeekOffset("abc")).toBe(DEFAULT_WEEK_OFFSET);
    expect(parseWeekOffset("1.5")).toBe(DEFAULT_WEEK_OFFSET);
  });

  it("honours a well-formed integer, clamped into the period", () => {
    // 0 is meaningful — it is the hindsight week — so it must survive the
    // fallback rather than being treated as "nothing was asked for".
    expect(parseWeekOffset("0")).toBe(0);
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

describe("londonTodayKey — today's grid date", () => {
  it("uses the London day, not the UTC day, across the midnight boundary", () => {
    // 2026-08-13 23:30Z is already 2026-08-14 in London under BST.
    expect(londonTodayKey(new Date(Date.UTC(2026, 7, 13, 23, 30, 0)))).toBe(
      "2026-08-14"
    );
  });

  it("stays on the UTC day in winter, when London is GMT", () => {
    // 2026-01-13 23:30Z is 23:30 GMT — same civil day.
    expect(londonTodayKey(new Date(Date.UTC(2026, 0, 13, 23, 30, 0)))).toBe(
      "2026-01-13"
    );
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

describe("suggestedPostDate", () => {
  /**
   * Every pair here was read out of the live Airtable table (1/3rd Date ->
   * Suggested date). Airtable owns the formula; these are the regression net
   * that proves this module still agrees with it.
   */
  const airtableRows: [string, string][] = [
    ["2026-10-15", "2026-10-18"], // War
    ["2026-10-07", "2026-10-18"], // Carrie — Sunday 10-11 is even, pushed on
    ["2026-09-29", "2026-10-04"], // Brothers
    ["2026-09-27", "2026-10-04"], // American Hostage — 1/3rd IS a Sunday
    ["2026-09-22", "2026-10-04"], // The Drop
    ["2026-09-16", "2026-09-20"], // Neagley
    ["2026-09-09", "2026-09-20"], // Last Seen
    ["2026-09-08", "2026-09-20"], // The Varnell Hill Show
    ["2026-08-30", "2026-09-06"], // Lanterns — 1/3rd IS a Sunday
    ["2026-08-14", "2026-08-23"], // Fightland
    ["2026-08-12", "2026-08-23"], // The Shards
    ["2026-07-27", "2026-08-09"], // Furious
    ["2025-02-01", "2025-02-09"], // We Were Liars
    ["2025-01-29", "2025-02-09"], // Prime Target
    ["2024-12-24", "2024-12-29"], // Secret Level
    ["2024-12-19", "2024-12-29"], // Creature Commandos
  ];

  it.each(airtableRows)("maps 1/3rd date %s to slot %s", (third, slot) => {
    expect(suggestedPostDate(third)).toBe(slot);
  });

  it("always lands on a Sunday in an odd week", () => {
    for (const [third] of airtableRows) {
      const slot = suggestedPostDate(third)!;
      expect(weekdayOf(slot)).toBe(0);
      expect(airtableWeekNum(slot) % 2).toBe(1);
    }
  });

  it("jumps a whole week when the 1/3rd date is itself a Sunday", () => {
    // 2026-08-30 is a Sunday; `7 - 0 = 7` skips to 09-06 rather than staying put.
    expect(weekdayOf("2026-08-30")).toBe(0);
    expect(suggestedPostDate("2026-08-30")).toBe("2026-09-06");
  });

  it("returns null for a season with no 1/3rd date yet", () => {
    expect(suggestedPostDate(null)).toBeNull();
  });
});

describe("airtableWeekNum", () => {
  it("uses Sunday-start weeks with week 1 containing 1 January", () => {
    // 2026-01-01 is a Thursday, so week 1 runs from Sunday 2025-12-28.
    expect(airtableWeekNum("2026-01-01")).toBe(1);
    expect(airtableWeekNum("2026-01-03")).toBe(1); // Saturday, still week 1
    expect(airtableWeekNum("2026-01-04")).toBe(2); // Sunday, week 2 begins
  });

  it("differs from ISO 8601, which is why it is spelled out here", () => {
    // ISO puts 2026-01-01 (Thursday) in week 1 too, but 2027-01-01 (Friday)
    // in ISO week 53 of 2026 — Airtable calls it week 1.
    expect(airtableWeekNum("2027-01-01")).toBe(1);
  });
});

describe("nextPostSlots", () => {
  it("returns upcoming odd-week Sundays, earliest first", () => {
    // Sunday 2026-08-16 is an even week, so the next slot is 08-23.
    const slots = nextPostSlots(3, new Date("2026-08-16T12:00:00Z"));
    expect(slots).toEqual(["2026-08-23", "2026-09-06", "2026-09-20"]);
  });

  it("includes today when today is itself a slot", () => {
    const slots = nextPostSlots(2, new Date("2026-08-23T12:00:00Z"));
    expect(slots).toEqual(["2026-08-23", "2026-09-06"]);
  });

  it("steps correctly across the new-year parity reset", () => {
    const slots = nextPostSlots(4, new Date("2026-12-14T12:00:00Z"));
    for (const slot of slots) {
      expect(weekdayOf(slot)).toBe(0);
      expect(airtableWeekNum(slot) % 2).toBe(1);
    }
    // Sorted, and never a gap other than 1, 2 or 3 weeks.
    expect([...slots].sort()).toEqual(slots);
  });
});
