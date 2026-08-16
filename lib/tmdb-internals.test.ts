import { describe, it, expect, vi, afterEach } from "vitest";
import {
  shiftDayKey,
  mapWithConcurrency,
  readAuth,
  tmdbGet,
} from "./tmdb";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("shiftDayKey — whole-day arithmetic on a YYYY-MM-DD key", () => {
  it("moves forward and back within a month", () => {
    expect(shiftDayKey("2026-08-14", 1)).toBe("2026-08-15");
    expect(shiftDayKey("2026-08-14", -1)).toBe("2026-08-13");
    expect(shiftDayKey("2026-08-14", 0)).toBe("2026-08-14");
  });

  it("crosses a month boundary in both directions", () => {
    expect(shiftDayKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDayKey("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("crosses a year boundary in both directions", () => {
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDayKey("2027-01-01", -1)).toBe("2026-12-31");
  });

  /**
   * 2028 is a leap year, 2026 is not. Day arithmetic that assumed a 28-day
   * February would land a day early crossing either one.
   */
  it("handles February in a leap year and a common year", () => {
    expect(shiftDayKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDayKey("2028-02-29", 1)).toBe("2028-03-01");
    expect(shiftDayKey("2026-02-28", 1)).toBe("2026-03-01");
  });

  /** The discover lookback shifts by 21 days, so multi-day jumps are the real use. */
  it("shifts by many days across a month boundary", () => {
    expect(shiftDayKey("2026-08-10", -21)).toBe("2026-07-20");
    expect(shiftDayKey("2026-08-25", 21)).toBe("2026-09-15");
  });

  /**
   * Every key is treated as UTC midnight. A DST-naive implementation using
   * local time would drop or repeat an hour and land on the wrong date when
   * the shift crosses the BST transition (2026-03-29).
   */
  it("is unaffected by the British Summer Time transition", () => {
    expect(shiftDayKey("2026-03-28", 1)).toBe("2026-03-29");
    expect(shiftDayKey("2026-03-29", 1)).toBe("2026-03-30");
    expect(shiftDayKey("2026-10-24", 2)).toBe("2026-10-26");
  });
});

describe("mapWithConcurrency — bounded parallelism, input order preserved", () => {
  it("returns results in input order even when workers finish out of order", async () => {
    const items = [30, 10, 20, 0];
    const out = await mapWithConcurrency(items, 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    // Completion order is 3,1,2,0 — the result must not follow it.
    expect(out).toEqual(["0:30", "1:10", "2:20", "3:0"]);
  });

  it("never runs more than `limit` workers at once", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("passes each item with its own index", async () => {
    const seen: Array<[string, number]> = [];
    await mapWithConcurrency(["a", "b", "c"], 1, async (item, index) => {
      seen.push([item, index]);
      return item;
    });
    expect(seen).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("handles an empty list without starting a worker", async () => {
    const worker = vi.fn();
    expect(await mapWithConcurrency([], 5, worker)).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  /** CONCURRENCY is a fixed 6, so a shorter list than the limit is routine. */
  it("caps runners at the item count when the limit is larger", async () => {
    const out = await mapWithConcurrency([1, 2], 6, async (n) => n * 2);
    expect(out).toEqual([2, 4]);
  });

  it("propagates a worker rejection rather than resolving with a hole", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("worker failed");
        return n;
      })
    ).rejects.toThrow("worker failed");
  });
});

describe("readAuth — TMDB credentials from the environment", () => {
  it("returns the v4 bearer token when only it is set", () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "v4-token");
    vi.stubEnv("TMDB_API_KEY", "");
    expect(readAuth()).toEqual({ bearer: "v4-token", apiKey: undefined });
  });

  it("returns the v3 api key when only it is set", () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "");
    vi.stubEnv("TMDB_API_KEY", "v3-key");
    expect(readAuth()).toEqual({ bearer: undefined, apiKey: "v3-key" });
  });

  it("returns both when both are set — the precedence is applied by tmdbGet", () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "v4-token");
    vi.stubEnv("TMDB_API_KEY", "v3-key");
    expect(readAuth()).toEqual({ bearer: "v4-token", apiKey: "v3-key" });
  });

  it("trims surrounding whitespace, which a copy-pasted token often carries", () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "  v4-token\n");
    vi.stubEnv("TMDB_API_KEY", "");
    expect(readAuth().bearer).toBe("v4-token");
  });

  it("treats a whitespace-only value as absent rather than as a credential", () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "   ");
    vi.stubEnv("TMDB_API_KEY", "v3-key");
    expect(readAuth()).toEqual({ bearer: undefined, apiKey: "v3-key" });
  });

  it("throws a message naming both variables when neither is set", () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "");
    vi.stubEnv("TMDB_API_KEY", "");
    expect(() => readAuth()).toThrow(/TMDB_READ_ACCESS_TOKEN/);
    expect(() => readAuth()).toThrow(/TMDB_API_KEY/);
  });
});

describe("tmdbGet — auth precedence, and failures that stay readable", () => {
  /** Capture the single fetch call the helper makes. */
  function stubFetch(
    impl: (url: URL, init: RequestInit) => unknown
  ): { calls: Array<{ url: URL; init: RequestInit }> } {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    vi.stubGlobal("fetch", (url: URL, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(impl(url, init));
    });
    return { calls };
  }

  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(body),
  });

  /**
   * The documented rule: the v4 bearer token wins when both are present. It
   * goes in the Authorization header, and no api_key must leak into the query
   * string alongside it.
   */
  it("prefers the v4 bearer token and sends no api_key when both are set", async () => {
    const { calls } = stubFetch(() => ok({ id: 1 }));
    await tmdbGet("/tv/1", { language: "en-US" }, { bearer: "v4", apiKey: "v3" });

    const { url, init } = calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer v4");
    expect(url.searchParams.get("api_key")).toBeNull();
  });

  it("falls back to the api_key query parameter when there is no bearer", async () => {
    const { calls } = stubFetch(() => ok({ id: 1 }));
    await tmdbGet("/tv/1", {}, { apiKey: "v3" });

    const { url, init } = calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(url.searchParams.get("api_key")).toBe("v3");
  });

  it("builds the URL from the fixed TMDB base and the given params", async () => {
    const { calls } = stubFetch(() => ok({}));
    await tmdbGet("/discover/tv", { page: "2", language: "en-US" }, { bearer: "v4" });

    const { url } = calls[0];
    expect(url.origin).toBe("https://api.themoviedb.org");
    expect(url.pathname).toBe("/3/discover/tv");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("returns the parsed body on success", async () => {
    stubFetch(() => ok({ id: 7, name: "Test" }));
    expect(await tmdbGet("/tv/7", {}, { bearer: "v4" })).toEqual({
      id: 7,
      name: "Test",
    });
  });

  /** A failing show must say which endpoint failed and why, or triage is guesswork. */
  it("throws with the path, status and response body on a non-OK response", async () => {
    stubFetch(() => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve("The resource you requested could not be found."),
    }));

    await expect(tmdbGet("/tv/999", {}, { bearer: "v4" })).rejects.toThrow(
      /\/tv\/999.*404.*Not Found.*could not be found/s
    );
  });

  it("reports a timeout as a timeout rather than as a raw AbortError", async () => {
    vi.stubGlobal("fetch", () => {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    await expect(tmdbGet("/tv/1", {}, { bearer: "v4" })).rejects.toThrow(
      /\/tv\/1 timed out after \d+ms/
    );
  });

  it("passes other network errors through unchanged", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("ECONNRESET")));
    await expect(tmdbGet("/tv/1", {}, { bearer: "v4" })).rejects.toThrow("ECONNRESET");
  });
});
