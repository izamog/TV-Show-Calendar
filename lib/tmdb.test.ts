import { describe, it, expect } from "vitest";
import {
  isScripted,
  isReturningSeries,
  hasExcludedKeyword,
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
