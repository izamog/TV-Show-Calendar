import { describe, it, expect } from "vitest";
import { combineRatings, MIN_IMDB_VOTES, MIN_TMDB_VOTES, UNRATED } from "./rating";

describe("combineRatings", () => {
  it("weights by vote count, so the larger electorate dominates", () => {
    // TMDB 6.0 from 100 votes, IMDb 9.0 from 900 — the mean must sit near 9,
    // not at the 7.5 a plain average would give.
    const rating = combineRatings(
      { rating: 6.0, votes: 100 },
      { rating: 9.0, votes: 900 }
    );
    expect(rating.combined).toBe(8.7);
    expect(rating.tmdb).toBe(6.0);
    expect(rating.imdb).toBe(9.0);
    expect(rating.voteCount).toBe(1000);
  });

  it("returns the single usable source when the other is missing", () => {
    const tmdbOnly = combineRatings({ rating: 7.4, votes: 500 }, null);
    expect(tmdbOnly.combined).toBe(7.4);
    expect(tmdbOnly.imdb).toBeNull();

    const imdbOnly = combineRatings(null, { rating: 8.1, votes: 5000 });
    expect(imdbOnly.combined).toBe(8.1);
    expect(imdbOnly.tmdb).toBeNull();
  });

  it("is unrated when neither source exists", () => {
    expect(combineRatings(null, null)).toEqual(UNRATED);
  });

  /**
   * The floors are the whole defence against an unaired show winning a fill
   * slot on a handful of votes — a 10.0 from three people must not outrank a
   * genuinely acclaimed series.
   */
  it("ignores a score below its vote floor", () => {
    const belowBoth = combineRatings(
      { rating: 10, votes: MIN_TMDB_VOTES - 1 },
      { rating: 10, votes: MIN_IMDB_VOTES - 1 }
    );
    expect(belowBoth).toEqual(UNRATED);
  });

  it("keeps a source that sits exactly on its floor", () => {
    const rating = combineRatings({ rating: 8.0, votes: MIN_TMDB_VOTES }, null);
    expect(rating.combined).toBe(8.0);
  });

  it("falls back to the trusted source when only one clears its floor", () => {
    const rating = combineRatings(
      { rating: 10, votes: 2 }, // noise
      { rating: 7.2, votes: 40_000 }
    );
    expect(rating.combined).toBe(7.2);
    expect(rating.tmdb).toBeNull();
    expect(rating.voteCount).toBe(40_000);
  });

  it("rounds to one decimal, the precision both sources publish at", () => {
    const rating = combineRatings(
      { rating: 8.26, votes: 100 },
      { rating: 8.24, votes: 100 }
    );
    expect(rating.combined).toBe(8.3);
  });

  it("handles a zero-vote source without dividing by zero", () => {
    expect(combineRatings({ rating: 0, votes: 0 }, null)).toEqual(UNRATED);
  });
});
