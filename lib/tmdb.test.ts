import { describe, it, expect } from "vitest";
import {
  isScripted,
  isReturningSeries,
  hasExcludedKeyword,
  seasonAirDateRange,
  firstThirdMarker,
  type TmdbShowDetails,
} from "./tmdb";

function makeShow(overrides: Partial<TmdbShowDetails> = {}): TmdbShowDetails {
  return {
    id: 1,
    name: "Test Show",
    original_language: "en",
    type: "Scripted",
    number_of_seasons: 1,
    genres: [{ id: 18, name: "Drama" }],
    networks: [{ id: 88, name: "FX" }],
    keywords: { results: [] },
    ...overrides,
  };
}

describe("isScripted — genre AND type, because either signal can be missing", () => {
  it("keeps an ordinary scripted drama", () => {
    expect(isScripted(makeShow())).toBe(true);
  });

  it("keeps a miniseries — scripted, and exactly what the calendar is for", () => {
    expect(isScripted(makeShow({ type: "Miniseries" }))).toBe(true);
  });

  it.each(["Documentary", "News", "Reality", "Talk Show", "Video"])(
    "excludes type=%s",
    (type) => {
      expect(isScripted(makeShow({ type }))).toBe(false);
    }
  );

  /**
   * Regression: "An Amputation Obsession: The Monster and the Surgeon"
   * (TMDB 331701) is a real documentary carrying an EMPTY genres array, so the
   * genre-99 filter alone could never catch it. Only `type` identifies it.
   */
  it("excludes a documentary that has an empty genres array", () => {
    const show = makeShow({ type: "Documentary", genres: [] });
    expect(isScripted(show)).toBe(false);
  });

  it("still excludes by genre when type is absent", () => {
    const show = makeShow({ type: null, genres: [{ id: 99, name: "Documentary" }] });
    expect(isScripted(show)).toBe(false);
  });

  it("excludes the Kids genre", () => {
    expect(isScripted(makeShow({ genres: [{ id: 10762, name: "Kids" }] }))).toBe(false);
  });

  it("keeps a show with no genre information at all — absence is not evidence", () => {
    expect(isScripted(makeShow({ type: null, genres: undefined }))).toBe(true);
    expect(isScripted(makeShow({ type: null, genres: [] }))).toBe(true);
  });
});

describe("isReturningSeries — prior seasons, NOT TMDB's status field", () => {
  it("keeps a genuinely new show on its first season", () => {
    expect(isReturningSeries(makeShow({ number_of_seasons: 1 }))).toBe(false);
  });

  it("excludes a show that has already aired multiple seasons", () => {
    expect(isReturningSeries(makeShow({ number_of_seasons: 2 }))).toBe(true);
    expect(isReturningSeries(makeShow({ number_of_seasons: 9 }))).toBe(true);
  });

  it("keeps the show when the season count is unknown", () => {
    expect(isReturningSeries(makeShow({ number_of_seasons: null }))).toBe(false);
    expect(isReturningSeries(makeShow({ number_of_seasons: undefined }))).toBe(false);
  });

  /**
   * Guard against a tempting but wrong "fix": TMDB sets
   * status "Returning Series" on brand-new first-season shows (verified live on
   * Sterling Point, The Shards and Lanterns) — it only means "not ended".
   * Keying off it would empty most of the calendar, so the season count is the
   * signal and `status` is deliberately never read.
   */
  it("ignores status entirely — a first-season show is kept whatever it says", () => {
    const show = makeShow({ number_of_seasons: 1 });
    (show as Record<string, unknown>).status = "Returning Series";
    expect(isReturningSeries(show)).toBe(false);
  });
});

describe("hasExcludedKeyword", () => {
  it("excludes vertical screen and web mini series", () => {
    expect(
      hasExcludedKeyword(makeShow({ keywords: { results: [{ id: 346018, name: "vertical screen" }] } }))
    ).toBe(true);
    expect(
      hasExcludedKeyword(makeShow({ keywords: { results: [{ id: 356974, name: "web mini series" }] } }))
    ).toBe(true);
  });

  it("keeps ordinary keywords, and shows with none", () => {
    expect(
      hasExcludedKeyword(makeShow({ keywords: { results: [{ id: 11162, name: "miniseries" }] } }))
    ).toBe(false);
    expect(hasExcludedKeyword(makeShow({ keywords: undefined }))).toBe(false);
  });
});

describe("seasonAirDateRange — whole-season premiere and finale dates", () => {
  it("returns the first and last air date of the season", () => {
    expect(
      seasonAirDateRange([
        { air_date: "2026-09-07" },
        { air_date: "2026-09-14" },
        { air_date: "2026-09-21" },
      ])
    ).toEqual({ firstEpisodeAirDate: "2026-09-07", seasonFinishDate: "2026-09-21" });
  });

  /**
   * TMDB does not guarantee episodes arrive in air order, and a binge drop can
   * list several episodes on one date, so the range is computed by sorting
   * rather than by trusting position.
   */
  it("does not assume the episode list is already in air order", () => {
    expect(
      seasonAirDateRange([
        { air_date: "2026-09-21" },
        { air_date: "2026-09-07" },
        { air_date: "2026-09-14" },
      ])
    ).toEqual({ firstEpisodeAirDate: "2026-09-07", seasonFinishDate: "2026-09-21" });
  });

  it("handles a full-season drop where every episode shares one date", () => {
    expect(
      seasonAirDateRange([{ air_date: "2026-09-07" }, { air_date: "2026-09-07" }])
    ).toEqual({ firstEpisodeAirDate: "2026-09-07", seasonFinishDate: "2026-09-07" });
  });

  /**
   * A season with an announced premiere but an unscheduled back half is normal.
   * The dated episodes still give a real premiere; the finale is simply the
   * latest date known so far rather than null.
   */
  it("ignores undated episodes instead of treating them as a gap", () => {
    expect(
      seasonAirDateRange([
        { air_date: "2026-09-07" },
        { air_date: null },
        { air_date: "2026-09-14" },
        {},
        { air_date: "  " },
      ])
    ).toEqual({ firstEpisodeAirDate: "2026-09-07", seasonFinishDate: "2026-09-14" });
  });

  it("returns nulls when no episode has a date at all", () => {
    expect(seasonAirDateRange([])).toEqual({
      firstEpisodeAirDate: null,
      seasonFinishDate: null,
    });
    expect(seasonAirDateRange([{ air_date: null }])).toEqual({
      firstEpisodeAirDate: null,
      seasonFinishDate: null,
    });
  });
});

describe("firstThirdMarker — ceil(episodeCount / 3), rounded UP", () => {
  /** Build a season of `n` episodes airing weekly from 2026-09-07. */
  function season(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      episode_number: i + 1,
      air_date: new Date(Date.UTC(2026, 8, 7) + i * 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    }));
  }

  /** The three cases that defined the rule. */
  it.each([
    [10, 4],
    [9, 3],
    [8, 3],
  ])("a %i-episode season marks at episode %i", (count, expected) => {
    expect(firstThirdMarker(season(count)).firstThirdEpisodeNumber).toBe(expected);
  });

  it("rounds up rather than down or to nearest", () => {
    // Rounding down would give 3, 3, 4; nearest would give 3, 4, 4.
    expect(firstThirdMarker(season(10)).firstThirdEpisodeNumber).toBe(4);
    expect(firstThirdMarker(season(11)).firstThirdEpisodeNumber).toBe(4);
    expect(firstThirdMarker(season(13)).firstThirdEpisodeNumber).toBe(5);
  });

  it("marks an exact multiple of three at the true third", () => {
    expect(firstThirdMarker(season(6)).firstThirdEpisodeNumber).toBe(2);
    expect(firstThirdMarker(season(12)).firstThirdEpisodeNumber).toBe(4);
  });

  it("never marks below episode 1, even for a very short season", () => {
    expect(firstThirdMarker(season(1)).firstThirdEpisodeNumber).toBe(1);
    expect(firstThirdMarker(season(2)).firstThirdEpisodeNumber).toBe(1);
  });

  it("returns that episode's air date", () => {
    // Episode 4 of 10, four weeks after the 2026-09-07 premiere.
    expect(firstThirdMarker(season(10))).toEqual({
      firstThirdEpisodeNumber: 4,
      firstThirdAirDate: "2026-09-28",
    });
  });

  /**
   * TMDB does not guarantee the season payload is ordered, and reading by array
   * position instead of episode number would silently return another episode's
   * date — a wrong value that still looks plausible in a table.
   */
  it("picks by episode number, not array position", () => {
    const shuffled = [...season(9)].reverse();
    expect(firstThirdMarker(shuffled)).toEqual({
      firstThirdEpisodeNumber: 3,
      firstThirdAirDate: "2026-09-21",
    });
  });

  it("reports the episode but a null date when that episode is unscheduled", () => {
    const eps = season(9).map((ep) =>
      ep.episode_number === 3 ? { ...ep, air_date: null } : ep
    );
    expect(firstThirdMarker(eps)).toEqual({
      firstThirdEpisodeNumber: 3,
      firstThirdAirDate: null,
    });
  });

  it("returns nulls for an empty season", () => {
    expect(firstThirdMarker([])).toEqual({
      firstThirdEpisodeNumber: null,
      firstThirdAirDate: null,
    });
  });
});
