import { gzipSync } from "node:zlib";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MIN_IMDB_VOTES } from "./rating";

/**
 * The index is module state deliberately — one download shared by every show in
 * a render — so each test needs a fresh module rather than a fresh function.
 */
async function freshModule() {
  vi.resetModules();
  return import("./imdb");
}

/** A gzipped stand-in for `title.ratings.tsv.gz`, header row and all. */
function ratingsResponse(rows: string[][], init?: ResponseInit): Response {
  const tsv = [["tconst", "averageRating", "numVotes"], ...rows]
    .map((row) => row.join("\t"))
    .join("\n");
  return new Response(gzipSync(Buffer.from(`${tsv}\n`)), init);
}

function mockDataset(rows: string[][]) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(ratingsResponse(rows));
}

describe("fetchImdbRating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads a series rating out of the dataset", async () => {
    mockDataset([
      ["tt24512262", "4.7", "355"],
      ["tt36303968", "7.6", "5145"],
    ]);
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt24512262")).toEqual({ rating: 4.7, votes: 355 });
    expect(await fetchImdbRating("tt36303968")).toEqual({ rating: 7.6, votes: 5145 });
  });

  it("returns null for a title the dataset does not rate", async () => {
    mockDataset([["tt0000001", "5.7", "2225"]]);
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt9999999")).toBeNull();
  });

  it("returns null without an IMDb id, and never fetches for one", async () => {
    const fetchMock = mockDataset([["tt0000001", "5.7", "2225"]]);
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating(null)).toBeNull();
    expect(await fetchImdbRating(undefined)).toBeNull();
    expect(await fetchImdbRating("")).toBeNull();
    // A TMDB id in the IMDb slot must not be read as `tt`-less digits.
    expect(await fetchImdbRating("8840")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** Below the blend's floor the row can never be used, so it is not kept. */
  it("drops rows under the vote floor", async () => {
    mockDataset([
      ["tt1000000", "9.9", String(MIN_IMDB_VOTES - 1)],
      ["tt1000001", "9.9", String(MIN_IMDB_VOTES)],
    ]);
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt1000000")).toBeNull();
    expect(await fetchImdbRating("tt1000001")).toEqual({
      rating: 9.9,
      votes: MIN_IMDB_VOTES,
    });
  });

  /**
   * The rating and the vote count share one number in the index; a ten out of
   * ten and a three-million-vote title are the ends the packing has to survive.
   */
  it("round-trips the extremes of the packed representation", async () => {
    mockDataset([
      ["tt0111161", "9.3", "3141592"],
      ["tt0000010", "10.0", "100"],
      ["tt0000011", "1.0", "12345"],
    ]);
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt0111161")).toEqual({ rating: 9.3, votes: 3141592 });
    expect(await fetchImdbRating("tt0000010")).toEqual({ rating: 10, votes: 100 });
    expect(await fetchImdbRating("tt0000011")).toEqual({ rating: 1, votes: 12345 });
  });

  it("skips malformed rows rather than losing the dataset", async () => {
    mockDataset([
      ["tt0000001", "not-a-number", "2225"],
      ["tt0000002", "5.7", "N/A"],
      ["tt0000003", "6.4", "900"],
    ]);
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt0000001")).toBeNull();
    expect(await fetchImdbRating("tt0000002")).toBeNull();
    expect(await fetchImdbRating("tt0000003")).toEqual({ rating: 6.4, votes: 900 });
  });

  it("downloads once for the whole render, however many shows ask", async () => {
    const fetchMock = mockDataset([["tt0000003", "6.4", "900"]]);
    const { fetchImdbRating } = await freshModule();

    // Concurrent, as `resolveShowsInRange` resolves them: the shared promise is
    // the point, so the second caller must not start a second download.
    await Promise.all([
      fetchImdbRating("tt0000003"),
      fetchImdbRating("tt0000003"),
      fetchImdbRating("tt0000001"),
    ]);
    await fetchImdbRating("tt0000003");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("degrades to null when the dataset is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt0000003")).toBeNull();
  });

  it("degrades to null on an HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 503 })
    );
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt0000003")).toBeNull();
  });

  /**
   * A failed build must not be cached: caching "no ratings" for the whole TTL
   * would turn one bad minute into a rating-less afternoon.
   */
  it("retries after a failure instead of caching the emptiness", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(ratingsResponse([["tt0000003", "6.4", "900"]]));
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt0000003")).toBeNull();
    expect(await fetchImdbRating("tt0000003")).toEqual({ rating: 6.4, votes: 900 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rebuilds once the index is stale, so a day-old dump is not served forever", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ratingsResponse([["tt0000003", "6.4", "900"]]))
      .mockResolvedValueOnce(ratingsResponse([["tt0000003", "6.9", "1500"]]));
    const { fetchImdbRating } = await freshModule();

    expect(await fetchImdbRating("tt0000003")).toEqual({ rating: 6.4, votes: 900 });
    vi.setSystemTime(Date.now() + 7 * 60 * 60 * 1000);
    expect(await fetchImdbRating("tt0000003")).toEqual({ rating: 6.9, votes: 1500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
