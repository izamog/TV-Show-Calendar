import { describe, it, expect } from "vitest";
import { groupByShow, MAX_CARDS_PER_SHOW_PER_DAY } from "./grouping";
import type { Episode } from "./types";

function ep(
  showId: number,
  showName: string,
  episodeNumber: number,
  airInstantUtcMs = Date.UTC(2026, 7, 14, 0, 0, 0)
): Episode {
  return {
    id: `${showId}-S01E${episodeNumber}`,
    showId,
    showName,
    episodeName: `Episode ${episodeNumber}`,
    episodeOverview: null,
    showOverview: null,
    seasonNumber: 1,
    episodeNumber,
    code: `S01E${String(episodeNumber).padStart(2, "0")}`,
    seasonEpisodeCount: 8,
    posterUrl: null,
    serviceName: "Hulu",
    serviceKind: "streaming",
    airInstantUtcMs,
    londonDateKey: "2026-08-14",
    isPremiere: episodeNumber === 1,
  };
}

describe("groupByShow — cap cards per show per day", () => {
  it("shows every episode when a show has 2 or fewer that day", () => {
    const groups = groupByShow([ep(1, "Furious", 1), ep(1, "Furious", 2)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].shown).toHaveLength(2);
    expect(groups[0].hiddenCount).toBe(0);
  });

  it("caps at 2 cards and reports the remainder", () => {
    const groups = groupByShow([
      ep(1, "Furious", 1),
      ep(1, "Furious", 2),
      ep(1, "Furious", 3),
      ep(1, "Furious", 4),
    ]);
    expect(groups[0].shown).toHaveLength(MAX_CARDS_PER_SHOW_PER_DAY);
    expect(groups[0].hiddenCount).toBe(2);
  });

  it("keeps the EARLIEST episodes as the visible cards", () => {
    const groups = groupByShow([
      ep(1, "Furious", 3, Date.UTC(2026, 7, 14, 3)),
      ep(1, "Furious", 1, Date.UTC(2026, 7, 14, 1)),
      ep(1, "Furious", 2, Date.UTC(2026, 7, 14, 2)),
    ]);
    expect(groups[0].shown.map((e) => e.episodeNumber)).toEqual([1, 2]);
    expect(groups[0].hiddenCount).toBe(1);
  });

  it("caps per show, not per day — a second show is unaffected", () => {
    const groups = groupByShow([
      ep(1, "Furious", 1),
      ep(1, "Furious", 2),
      ep(1, "Furious", 3),
      ep(2, "Lucky", 4),
    ]);
    expect(groups).toHaveLength(2);
    const furious = groups.find((g) => g.showId === 1)!;
    const lucky = groups.find((g) => g.showId === 2)!;
    expect(furious.hiddenCount).toBe(1);
    expect(lucky.shown).toHaveLength(1);
    expect(lucky.hiddenCount).toBe(0);
  });

  it("orders groups by their earliest air instant", () => {
    const groups = groupByShow([
      ep(2, "Later Show", 1, Date.UTC(2026, 7, 14, 20)),
      ep(1, "Earlier Show", 1, Date.UTC(2026, 7, 14, 1)),
    ]);
    expect(groups.map((g) => g.showName)).toEqual(["Earlier Show", "Later Show"]);
  });

  it("handles an empty day", () => {
    expect(groupByShow([])).toEqual([]);
  });
});
