import { describe, it, expect, vi, afterEach } from "vitest";
import { candidateSeasonNumbers, getFavouriteShowIds } from "./favourites";
import type { TmdbShowDetails } from "./tmdb-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("candidateSeasonNumbers — which season is actually airing", () => {
  it("is always season 1 for a discovered show, whatever TMDB reports", () => {
    const details = makeShow({
      number_of_seasons: 6,
      last_episode_to_air: { season_number: 6 },
      next_episode_to_air: { season_number: 6 },
    });
    expect(candidateSeasonNumbers(details, false)).toEqual([1]);
  });

  it("follows the airing season for a favourite", () => {
    const details = makeShow({
      number_of_seasons: 4,
      last_episode_to_air: { season_number: 4 },
      next_episode_to_air: { season_number: 4 },
    });
    expect(candidateSeasonNumbers(details, true)).toEqual([4]);
  });

  /**
   * The case the two-signal read exists for: a range straddling the gap between
   * one season's finale and the next season's premiere. Reading only "last" or
   * only "next" would miss half of it.
   */
  it("returns both seasons when one has just ended and the next is scheduled", () => {
    const details = makeShow({
      last_episode_to_air: { season_number: 2 },
      next_episode_to_air: { season_number: 3 },
    });
    expect(candidateSeasonNumbers(details, true)).toEqual([2, 3]);
  });

  it("ignores the season 0 specials bucket", () => {
    const details = makeShow({
      last_episode_to_air: { season_number: 0 },
      next_episode_to_air: { season_number: 5 },
      seasons: [
        { season_number: 0, episode_count: 3 },
        { season_number: 5, episode_count: 8 },
      ],
    });
    expect(candidateSeasonNumbers(details, true)).toEqual([5]);
  });

  /**
   * A favourite whose episodes are all in the past has nothing next and, once
   * TMDB drops the field, nothing last either. Falling back to the latest real
   * season keeps it resolvable rather than silently yielding nothing.
   */
  it("falls back to the latest real season when nothing is airing", () => {
    const details = makeShow({
      last_episode_to_air: null,
      next_episode_to_air: null,
      seasons: [
        { season_number: 0, episode_count: 2 },
        { season_number: 1, episode_count: 8 },
        { season_number: 3, episode_count: 8 },
        { season_number: 2, episode_count: 8 },
      ],
    });
    expect(candidateSeasonNumbers(details, true)).toEqual([3]);
  });

  it("falls back to season 1 when TMDB reports no seasons at all", () => {
    expect(candidateSeasonNumbers(makeShow({ seasons: [] }), true)).toEqual([1]);
    expect(candidateSeasonNumbers(makeShow({}), true)).toEqual([1]);
  });
});


/**
 * The degradation contract. Favourites are a personal extra bolted onto a
 * public page, so every failure mode has to end in "no favourites" rather than
 * "no calendar". These are the cases that would otherwise throw out of
 * `resolveShowsInRange` and blank the grid.
 */
describe("getFavouriteShowIds — never throws, whatever TMDB does", () => {
  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(body),
  });

  it("reads every page of favourites and stops at the last one", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: URL) => {
      calls.push(url.pathname + (url.searchParams.get("page") ?? ""));
      if (url.pathname.endsWith("/account")) return Promise.resolve(ok({ id: 7 }));
      const page = Number(url.searchParams.get("page"));
      return Promise.resolve(
        ok({ results: [{ id: page * 10 }, { id: page * 10 + 1 }], total_pages: 2 })
      );
    });

    const ids = await getFavouriteShowIds({ bearer: "v4" });
    expect([...ids].sort((a, b) => a - b)).toEqual([10, 11, 20, 21]);
    // Stops after page 2 rather than walking to the FAVOURITE_PAGES ceiling.
    expect(calls.filter((c) => c.includes("favorite")).length).toBe(2);
  });

  /**
   * A v3 api_key identifies an *application*, not a user, so there is no
   * account whose favourites could be read. Returning empty without a request
   * is both correct and avoids a guaranteed 401 on every render.
   */
  it("returns empty without calling TMDB when there is no v4 bearer", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await getFavouriteShowIds({ apiKey: "v3" })).toEqual(new Set());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty when the account lookup fails", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({ ok: false, status: 401, statusText: "Unauthorized", text: () => Promise.resolve("") })
    );
    expect(await getFavouriteShowIds({ bearer: "dead" })).toEqual(new Set());
  });

  it("returns empty when the network is unreachable", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNREFUSED")));
    expect(await getFavouriteShowIds({ bearer: "v4" })).toEqual(new Set());
  });

  /**
   * A partial failure discards the partial result rather than returning half a
   * list. A half-read favourites list looks exactly like "the owner unfavourited
   * things", which would silently drop shows from the calendar.
   */
  it("returns empty when a later page fails, not a partial list", async () => {
    let n = 0;
    vi.stubGlobal("fetch", (url: URL) => {
      if (url.pathname.endsWith("/account")) return Promise.resolve(ok({ id: 7 }));
      n++;
      if (n === 1) return Promise.resolve(ok({ results: [{ id: 1 }], total_pages: 3 }));
      return Promise.reject(new Error("boom"));
    });
    expect(await getFavouriteShowIds({ bearer: "v4" })).toEqual(new Set());
  });

  it("handles an account that has favourited nothing", async () => {
    vi.stubGlobal("fetch", (url: URL) =>
      Promise.resolve(
        url.pathname.endsWith("/account")
          ? ok({ id: 7 })
          : ok({ results: [], total_pages: 0 })
      )
    );
    expect(await getFavouriteShowIds({ bearer: "v4" })).toEqual(new Set());
  });
});
