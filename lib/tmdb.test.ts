import { describe, it, expect } from "vitest";
import {
  isScripted,
  isReturningSeries,
  hasExcludedKeyword,
  seasonAirDateRange,
  firstThirdMarker,
  qualifyingService,
  favouriteService,
  episodeCode,
  episodesInRange,
} from "./tmdb";
import type { TmdbShowDetails, TmdbSeasonDetails } from "./tmdb-client";

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

describe("qualifyingService — the filters Discover is loose about, re-checked", () => {
  it("returns the allowlisted service for an ordinary scripted show", () => {
    expect(qualifyingService(makeShow())).toEqual({
      name: "FX",
      kind: "broadcast",
      tier: "core",
    });
  });

  /**
   * Netflix qualifies now, but as a fill-tier service — it is discovered on
   * every run and then has to earn its place in lib/fill.ts against a thin
   * blog post slot. The tier is the whole difference, so it is asserted here
   * rather than left implicit.
   */
  it("returns fill tier for a second-tier service", () => {
    expect(
      qualifyingService(makeShow({ networks: [{ id: 213, name: "Netflix" }] }))
    ).toEqual({ name: "Netflix", kind: "streaming", tier: "fill" });
  });

  it("rejects a non-English show even when Discover returned it", () => {
    expect(qualifyingService(makeShow({ original_language: "es" }))).toBeNull();
  });

  it("rejects an excluded type", () => {
    expect(qualifyingService(makeShow({ type: "Reality" }))).toBeNull();
  });

  it("rejects a show already past its first season", () => {
    expect(qualifyingService(makeShow({ number_of_seasons: 4 }))).toBeNull();
  });

  it("rejects a show carrying an excluded keyword", () => {
    const withKeyword = makeShow({
      keywords: { results: [{ id: 346018, name: "vertical screen" }] },
    });
    expect(qualifyingService(withKeyword)).toBeNull();
  });

  it("rejects a show whose networks are on neither tier", () => {
    // 16 is CBS — mainstream, but not a service this calendar covers.
    expect(
      qualifyingService(makeShow({ networks: [{ id: 16, name: "CBS" }] }))
    ).toBeNull();
  });

  /**
   * One brand, several TMDB networks. A BBC drama moves between BBC One and
   * BBC Two and premieres on iPlayer as BBC Three, but the badge and the
   * Airtable option are per *brand* — so every one of those ids must resolve to
   * the same display name or the same show would label itself differently
   * depending on which channel TMDB listed first.
   */
  it.each([
    [4, "BBC"],
    [332, "BBC"],
    [3, "BBC"],
    [100, "BBC"],
    [9, "ITV"],
    [149, "ITV"],
    [5871, "ITV"],
    [26, "Channel 4"],
    [136, "Channel 4"],
    [99, "Channel 5"],
    [1063, "Sky"],
    [5237, "Sky"],
    [5213, "Sky"],
    [214, "Sky"],
  ])("resolves UK network %i to the brand %s", (id, brand) => {
    expect(
      qualifyingService(makeShow({ networks: [{ id, name: "whatever" }] }))
    ).toMatchObject({ name: brand, tier: "core" });
  });
});

describe("episodesInRange — season to in-range Episode rows", () => {
  const service = { name: "FX", kind: "broadcast" as const, tier: "core" as const };
  const rating = { combined: 8.1, tmdb: 8.1, imdb: null, voteCount: 300 };
  const rangeDays = new Set(["2026-08-10", "2026-08-11", "2026-08-12"]);

  function makeSeason(
    episodes: NonNullable<TmdbSeasonDetails["episodes"]>,
    poster: string | null = "/season.jpg"
  ): TmdbSeasonDetails {
    return { episodes, poster_path: poster };
  }

  function build(season: TmdbSeasonDetails, seasonNumber = 1) {
    return episodesInRange({
      showId: 42,
      showName: "Test Show",
      showOverview: "A show.",
      seasonNumber,
      season,
      service,
      rating,
      rangeDays,
    });
  }

  it("keeps episodes inside the range and drops those outside it", () => {
    const out = build(
      makeSeason([
        { episode_number: 1, name: "Pilot", air_date: "2026-08-11" },
        { episode_number: 2, name: "Later", air_date: "2026-08-20" },
      ])
    );
    expect(out.map((e) => e.episodeNumber)).toEqual([1]);
    expect(out[0].londonDateKey).toBe("2026-08-11");
  });

  it("skips episodes with no air date rather than guessing one", () => {
    const out = build(
      makeSeason([
        { episode_number: 1, name: "Pilot", air_date: null },
        { episode_number: 2, name: "Second", air_date: "2026-08-11" },
      ])
    );
    expect(out.map((e) => e.episodeNumber)).toEqual([2]);
  });

  it("marks only episode 1 as the premiere and builds a padded code", () => {
    const out = build(
      makeSeason([
        { episode_number: 1, name: "Pilot", air_date: "2026-08-10" },
        { episode_number: 2, name: "Second", air_date: "2026-08-11" },
      ])
    );
    expect(out.map((e) => [e.code, e.isPremiere])).toEqual([
      ["S01E01", true],
      ["S01E02", false],
    ]);
    expect(out[0].id).toBe("42-S01E01");
  });

  /**
   * A favourited show contributes whichever season is airing, so the code and
   * the id must carry the real season number. Getting this wrong would collide
   * two seasons of the same show onto one React key and one Airtable row.
   */
  it("carries a non-first season number through the code, id and rows", () => {
    const out = build(
      makeSeason([{ episode_number: 3, name: "Third", air_date: "2026-08-11" }]),
      4
    );
    expect(out[0].code).toBe("S04E03");
    expect(out[0].id).toBe("42-S04E03");
    expect(out[0].seasonNumber).toBe(4);
    // Episode 1 of season 4 is a season premiere, and the flag still marks it —
    // the UI, not this layer, decides what to call it.
    expect(out[0].isPremiere).toBe(false);
  });

  it("counts the whole season, not just the in-range slice", () => {
    const out = build(
      makeSeason([
        { episode_number: 1, name: "Pilot", air_date: "2026-08-11" },
        { episode_number: 2, name: "Out", air_date: "2026-09-01" },
        { episode_number: 3, name: "Out", air_date: "2026-09-08" },
      ])
    );
    expect(out).toHaveLength(1);
    expect(out[0].seasonEpisodeCount).toBe(3);
  });

  it("falls back to the season poster when an episode has no still", () => {
    const out = build(
      makeSeason([{ episode_number: 1, name: "Pilot", air_date: "2026-08-11" }])
    );
    expect(out[0].posterUrl).toContain("/season.jpg");
  });

  it("has no poster at all when neither the still nor the season has one", () => {
    const out = build(
      makeSeason(
        [{ episode_number: 1, name: "Pilot", air_date: "2026-08-11" }],
        null
      )
    );
    expect(out[0].posterUrl).toBeNull();
  });

  it("names an untitled episode by its number rather than leaving it blank", () => {
    const out = build(
      makeSeason([{ episode_number: 7, name: "   ", air_date: "2026-08-11" }])
    );
    expect(out[0].episodeName).toBe("Episode 7");
  });

  it("returns nothing for a season with no episodes", () => {
    expect(build(makeSeason([]))).toEqual([]);
  });
});

describe("pickPrimaryService — tier precedence across a show's networks", () => {
  /**
   * International distribution routinely tags a US cable/streaming series with
   * Netflix outside its home market. Tiering such a show by whichever network
   * TMDB happened to list first would make a core-allowlist show droppable by
   * the fill logic.
   */
  it("prefers the core service when a show carries both tiers", () => {
    const netflixFirst = qualifyingService(
      makeShow({
        networks: [
          { id: 213, name: "Netflix" },
          { id: 88, name: "FX" },
        ],
      })
    );
    expect(netflixFirst).toEqual({ name: "FX", kind: "broadcast", tier: "core" });
  });

  it("still resolves fill tier when no core network is present", () => {
    expect(
      qualifyingService(
        makeShow({
          networks: [
            { id: 16, name: "CBS" },
            { id: 1255, name: "Stan" },
          ],
        })
      )
    ).toEqual({ name: "Stan", kind: "streaming", tier: "fill" });
  });

  it("keeps TMDB's order within a tier, so the badge is stable", () => {
    expect(
      qualifyingService(
        makeShow({
          networks: [
            { id: 1255, name: "Stan" },
            { id: 213, name: "Netflix" },
          ],
        })
      )
    ).toEqual({ name: "Stan", kind: "streaming", tier: "fill" });
  });
});

describe("favouriteService — a favourite is never dropped for its network", () => {
  /**
   * The headline behaviour: Bridgerton is Netflix, which is fill tier and
   * therefore droppable. Favouriting it must override that, or the whole point
   * of the feature — "keep me up to date on shows I already like" — fails
   * silently on exactly the shows most likely to be favourited.
   */
  it("stamps the favourite tier over a fill-tier network", () => {
    expect(
      favouriteService(makeShow({ networks: [{ id: 213, name: "Netflix" }] }))
    ).toEqual({ name: "Netflix", kind: "streaming", tier: "favourite" });
  });

  it("stamps the favourite tier over a core-tier network too", () => {
    // Undroppable either way, but the tier must say WHY it was kept.
    expect(
      favouriteService(makeShow({ networks: [{ id: 88, name: "FX" }] }))
    ).toEqual({ name: "FX", kind: "broadcast", tier: "favourite" });
  });

  /**
   * A network on neither list still yields a service rather than null. This is
   * the case the allowlist cannot anticipate — a favourite on a service nobody
   * has added — and dropping it would be the allowlist quietly overruling a
   * choice made by hand.
   */
  it("falls back to TMDB's own network name for an unlisted service", () => {
    expect(
      favouriteService(makeShow({ networks: [{ id: 99999, name: "Nebula TV" }] }))
    ).toEqual({ name: "Nebula TV", kind: "streaming", tier: "favourite" });
  });

  it("survives a show with no networks at all", () => {
    expect(favouriteService(makeShow({ networks: [] }))).toEqual({
      name: "Unknown",
      kind: "streaming",
      tier: "favourite",
    });
    expect(favouriteService(makeShow({ networks: undefined }))).toMatchObject({
      name: "Unknown",
    });
  });
});

describe("episodeCode — zero-padded, widening rather than truncating", () => {
  it("pads both halves to two digits", () => {
    expect(episodeCode(1, 1)).toBe("S01E01");
    expect(episodeCode(4, 12)).toBe("S04E12");
  });

  it("widens past 99 rather than losing a digit", () => {
    expect(episodeCode(1, 100)).toBe("S01E100");
    expect(episodeCode(12, 7)).toBe("S12E07");
  });
});

/**
 * Both TMDB "HBO Max" networks must resolve, and to the same brand.
 *
 * Regression guard: 3186 is the legacy id and 8304 the one TMDB tags new shows
 * with since the 2025 rebrand. Allowing only 3186 loses the service entirely as
 * its back catalogue ages out of the window — which is exactly what was
 * happening, and is invisible because a missing show looks like a quiet week.
 */
describe("HBO Max — TMDB carries it under two network ids", () => {
  it.each([3186, 8304])("resolves network %i to Max", (id) => {
    expect(
      qualifyingService(makeShow({ networks: [{ id, name: "HBO Max" }] }))
    ).toEqual({ name: "Max", kind: "streaming", tier: "core" });
  });
});
