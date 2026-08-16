import { describe, it, expect, vi, afterEach } from "vitest";
import {
  combineRatings,
  fetchImdbRating,
  hasOmdbKey,
  MIN_IMDB_VOTES,
  MIN_TMDB_VOTES,
  UNRATED,
} from "./rating";

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

describe("fetchImdbRating", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.restoreAllMocks();
  });

  it("returns null without a key, so an unconfigured deploy still works", async () => {
    delete process.env.OMDB_API_KEY;
    expect(hasOmdbKey()).toBe(false);
    expect(await fetchImdbRating("tt1234567")).toBeNull();
  });

  it("returns null without an IMDb id", async () => {
    process.env.OMDB_API_KEY = "key";
    expect(await fetchImdbRating(null)).toBeNull();
  });

  it("parses OMDb's comma-grouped vote count", async () => {
    process.env.OMDB_API_KEY = "key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ Response: "True", imdbRating: "8.4", imdbVotes: "124,301" }),
        { status: 200 }
      )
    );
    expect(await fetchImdbRating("tt1234567")).toEqual({
      rating: 8.4,
      votes: 124_301,
    });
  });

  /** OMDb uses the literal string "N/A" for a show nobody has rated yet. */
  it("treats N/A as no rating rather than NaN", async () => {
    process.env.OMDB_API_KEY = "key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ Response: "True", imdbRating: "N/A", imdbVotes: "N/A" }),
        { status: 200 }
      )
    );
    expect(await fetchImdbRating("tt1234567")).toBeNull();
  });

  /** OMDb signals "no such title" with a 200 and Response:"False". */
  it("handles OMDb's soft failure", async () => {
    process.env.OMDB_API_KEY = "key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ Response: "False", Error: "Incorrect IMDb ID." }), {
        status: 200,
      })
    );
    expect(await fetchImdbRating("tt0000000")).toBeNull();
  });

  it("degrades to null on a rate limit rather than throwing", async () => {
    process.env.OMDB_API_KEY = "key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("limit reached", { status: 401 })
    );
    expect(await fetchImdbRating("tt1234567")).toBeNull();
  });

  it("degrades to null when the request errors, so one show cannot blank the grid", async () => {
    process.env.OMDB_API_KEY = "key";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    expect(await fetchImdbRating("tt1234567")).toBeNull();
  });

  it("sends the id and key as query params", async () => {
    process.env.OMDB_API_KEY = "secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ Response: "True", imdbRating: "7.0", imdbVotes: "1,000" }), {
        status: 200,
      })
    );
    await fetchImdbRating("tt42");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("i")).toBe("tt42");
    expect(url.searchParams.get("apikey")).toBe("secret");
  });
});
