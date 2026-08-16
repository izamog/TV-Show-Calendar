import { describe, it, expect } from "vitest";
import { seasonProgress, synopsisFor } from "./episode";
import type { Episode } from "./types";

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: "1-S01E01",
    showId: 1,
    showName: "Test Show",
    episodeName: "Pilot",
    episodeOverview: "An episode synopsis.",
    showOverview: "A show synopsis.",
    seasonNumber: 1,
    episodeNumber: 1,
    code: "S01E01",
    seasonEpisodeCount: 10,
    posterUrl: null,
    serviceName: "FX",
    serviceKind: "broadcast",
    airInstantUtcMs: Date.UTC(2026, 7, 11, 19, 0, 0),
    londonDateKey: "2026-08-11",
    isPremiere: true,
    ...overrides,
  };
}

describe("seasonProgress — position through the season, as a 0–1 fraction", () => {
  it("reports the fraction of the season reached", () => {
    expect(seasonProgress(makeEpisode({ episodeNumber: 5, seasonEpisodeCount: 10 }))).toBe(0.5);
    expect(seasonProgress(makeEpisode({ episodeNumber: 10, seasonEpisodeCount: 10 }))).toBe(1);
  });

  /**
   * TMDB sometimes reports an episode number beyond the fetched episode count —
   * a late-added special, or a season still being filled in. Unclamped, the bar
   * renders wider than its track.
   */
  it("clamps at 1 when the episode number exceeds the season count", () => {
    expect(seasonProgress(makeEpisode({ episodeNumber: 12, seasonEpisodeCount: 10 }))).toBe(1);
  });

  it("returns 0 rather than dividing by zero when the count is unknown", () => {
    expect(seasonProgress(makeEpisode({ seasonEpisodeCount: 0 }))).toBe(0);
  });
});

describe("synopsisFor — which synopses a card reveals", () => {
  it("includes the show synopsis on a premiere, which has no prior episode", () => {
    const { showSynopsis, hasSynopsis } = synopsisFor(makeEpisode({ isPremiere: true }));
    expect(showSynopsis).toBe("A show synopsis.");
    expect(hasSynopsis).toBe(true);
  });

  it("omits the show synopsis on a later episode that has its own", () => {
    const { showSynopsis, hasSynopsis } = synopsisFor(makeEpisode({ isPremiere: false }));
    expect(showSynopsis).toBeNull();
    expect(hasSynopsis).toBe(true);
  });

  /**
   * Unaired episodes often carry neither a title nor a description. Without
   * this fallback those cards had nothing to reveal and showed no overlay.
   */
  it("falls back to the show synopsis on a later episode with no synopsis of its own", () => {
    const { showSynopsis, hasSynopsis } = synopsisFor(
      makeEpisode({ isPremiere: false, episodeOverview: null })
    );
    expect(showSynopsis).toBe("A show synopsis.");
    expect(hasSynopsis).toBe(true);
  });

  it("reports nothing to reveal when neither synopsis exists", () => {
    const { showSynopsis, hasSynopsis } = synopsisFor(
      makeEpisode({ isPremiere: false, episodeOverview: null, showOverview: null })
    );
    expect(showSynopsis).toBeNull();
    expect(hasSynopsis).toBe(false);
  });

  it("still reveals a premiere that has only a show synopsis", () => {
    const { hasSynopsis } = synopsisFor(
      makeEpisode({ isPremiere: true, episodeOverview: null })
    );
    expect(hasSynopsis).toBe(true);
  });
});
