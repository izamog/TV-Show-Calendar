import { describe, it, expect } from "vitest";
import { buildCalendar } from "./ical";
import type { Episode } from "./types";

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "100-S01E01",
    showId: 100,
    showName: "Widow's Bay",
    episodeName: "Episode 1: Pilot",
    seasonNumber: 1,
    episodeNumber: 1,
    code: "S01E01",
    seasonEpisodeCount: 8,
    posterUrl: "https://image.tmdb.org/t/p/w500/x.jpg",
    serviceName: "Apple TV+",
    serviceKind: "streaming",
    airInstantUtcMs: Date.UTC(2026, 7, 14, 19, 0, 0),
    londonDateKey: "2026-08-14",
    isPremiere: true,
    ...overrides,
  };
}

/** Unfold RFC 5545 continuation lines (`\r\n ` → ``) then split. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, "").split("\r\n");
}

describe("buildCalendar", () => {
  it("wraps events in a well-formed VCALENDAR", () => {
    const ics = buildCalendar([makeEpisode()], Date.UTC(2026, 7, 1, 0, 0, 0));
    const ls = lines(ics);
    expect(ls[0]).toBe("BEGIN:VCALENDAR");
    expect(ls).toContain("VERSION:2.0");
    expect(ls[ls.length - 2]).toBe("END:VCALENDAR"); // trailing CRLF => empty last element
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("emits exactly one VEVENT per episode", () => {
    const ics = buildCalendar([makeEpisode(), makeEpisode({ id: "100-S01E02", code: "S01E02", episodeNumber: 2, isPremiere: false })]);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect((ics.match(/END:VEVENT/g) ?? []).length).toBe(2);
  });

  it("summary is strictly `S01EXX Show Name`", () => {
    const ics = buildCalendar([makeEpisode()]);
    expect(lines(ics)).toContain("SUMMARY:S01E01 Widow's Bay");
  });

  it("sets DTSTART to the exact air instant and DTEND 60 minutes later", () => {
    const ics = buildCalendar([makeEpisode()]);
    const ls = lines(ics);
    expect(ls).toContain("DTSTART:20260814T190000Z");
    expect(ls).toContain("DTEND:20260814T200000Z");
  });

  it("carries a stable UID derived from the episode id", () => {
    const ics = buildCalendar([makeEpisode()]);
    expect(lines(ics)).toContain("UID:100-S01E01@tv-shows-tracker");
  });

  it("escapes commas and semicolons in text fields per RFC 5545", () => {
    const ics = buildCalendar([
      makeEpisode({ showName: "Cheers, Mate; Yes", episodeName: "A, B; C" }),
    ]);
    const ls = lines(ics);
    expect(ls).toContain("SUMMARY:S01E01 Cheers\\, Mate\\; Yes");
    expect(ls.some((l) => l.startsWith("DESCRIPTION:A\\, B\\; C"))).toBe(true);
  });

  it("does NOT escape apostrophes (only \\ ; , and newlines are special)", () => {
    const ics = buildCalendar([makeEpisode()]);
    expect(ics).toContain("Widow's Bay");
    expect(ics).not.toContain("Widow\\'s");
  });

  it("folds content lines longer than 75 octets", () => {
    const longName = "A".repeat(120);
    const ics = buildCalendar([makeEpisode({ showName: longName })]);
    // Every raw physical line must be <= 75 chars.
    for (const raw of ics.split("\r\n")) {
      expect(raw.length).toBeLessThanOrEqual(75);
    }
    // …but unfolded, the summary is intact.
    expect(lines(ics)).toContain(`SUMMARY:S01E01 ${longName}`);
  });

  it("handles an empty episode list (valid, event-free calendar)", () => {
    const ics = buildCalendar([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
