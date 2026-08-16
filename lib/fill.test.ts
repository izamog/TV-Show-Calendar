import { describe, it, expect } from "vitest";
import { selectSeasons } from "./fill";
import type { Rating, ServiceTier, ShowSeason } from "./types";

/** Fixed instant: Sunday 2026-08-16, so the next slots are 08-23, 09-06, 09-20. */
const NOW = new Date("2026-08-16T12:00:00Z");
const SLOT_1 = "2026-08-23";
const SLOT_2 = "2026-09-06";
const SLOT_3 = "2026-09-20";
/** Beyond the three fillable slots. */
const SLOT_FAR = "2026-11-15";

let nextId = 1;

function rated(combined: number | null): Rating {
  return { combined, tmdb: combined, imdb: combined, voteCount: combined === null ? 0 : 500 };
}

function season(
  tier: ServiceTier,
  slot: string | null,
  combined: number | null = null,
  overrides: Partial<ShowSeason> = {}
): ShowSeason {
  const showId = nextId++;
  return {
    id: `${showId}-S01`,
    showId,
    name: `Show ${showId}`,
    seasonNumber: 1,
    episodeCount: 8,
    firstEpisodeAirDate: "2026-08-01",
    seasonFinishDate: "2026-09-20",
    firstThirdEpisodeNumber: 3,
    firstThirdAirDate: "2026-08-18",
    network: tier === "fill" ? "Netflix" : tier === "favourite" ? "Apple TV+" : "HBO",
    serviceTier: tier,
    rating: rated(combined),
    suggestedPostDate: slot,
    ...overrides,
  };
}

const names = (seasons: ShowSeason[]) => seasons.map((s) => s.name);

describe("selectSeasons — topping up thin blog post slots", () => {
  it("keeps every core season untouched", () => {
    const core = [
      season("core", SLOT_1),
      season("core", SLOT_FAR),
      season("core", null), // no 1/3rd date yet
    ];
    const { selected } = selectSeasons(core, { now: NOW });
    expect(names(selected)).toEqual(names(core));
  });

  it("fills a thin slot up to the target, best-rated first", () => {
    const core = [season("core", SLOT_1), season("core", SLOT_1)];
    const weak = season("fill", SLOT_1, 5.1);
    const strong = season("fill", SLOT_1, 9.2);
    const middling = season("fill", SLOT_1, 7.4);

    const { selected, slots } = selectSeasons(
      [...core, weak, strong, middling],
      { now: NOW }
    );

    // Two core + two fill = the target of four; the weakest is passed over.
    expect(selected).toHaveLength(4);
    expect(names(selected)).toContain(strong.name);
    expect(names(selected)).toContain(middling.name);
    expect(names(selected)).not.toContain(weak.name);
    expect(slots[0]).toEqual({
      slot: SLOT_1,
      keptCount: 2,
      filledCount: 2,
      passedOver: 1,
    });
  });

  it("takes only the shortfall, dropping the rest by rating", () => {
    const core = [season("core", SLOT_1), season("core", SLOT_1), season("core", SLOT_1)];
    const best = season("fill", SLOT_1, 9.5);
    const good = season("fill", SLOT_1, 8.0);
    const poor = season("fill", SLOT_1, 4.0);

    const { selected, slots } = selectSeasons([...core, best, good, poor], { now: NOW });

    expect(selected).toHaveLength(4);
    expect(names(selected)).toContain(best.name);
    expect(names(selected)).not.toContain(good.name);
    expect(names(selected)).not.toContain(poor.name);
    expect(slots[0].passedOver).toBe(2);
  });

  /** The headline requirement: a great Netflix show gets in, an average one does not. */
  it("admits a highly rated show and rejects a mediocre one from the same service", () => {
    const core = Array.from({ length: 3 }, () => season("core", SLOT_1));
    const acclaimed = season("fill", SLOT_1, 9.0);
    const forgettable = season("fill", SLOT_1, 6.1);

    const { selected } = selectSeasons([...core, acclaimed, forgettable], { now: NOW });

    expect(names(selected)).toContain(acclaimed.name);
    expect(names(selected)).not.toContain(forgettable.name);
  });

  it("does not fill a slot that already meets the target", () => {
    const core = Array.from({ length: 4 }, () => season("core", SLOT_1));
    const candidate = season("fill", SLOT_1, 9.9);

    const { selected, slots } = selectSeasons([...core, candidate], { now: NOW });

    expect(names(selected)).not.toContain(candidate.name);
    expect(slots[0]).toEqual({
      slot: SLOT_1,
      keptCount: 4,
      filledCount: 0,
      passedOver: 1,
    });
  });

  it("leaves an over-full slot alone rather than trimming core shows", () => {
    const core = Array.from({ length: 7 }, () => season("core", SLOT_1));
    const { selected } = selectSeasons(core, { now: NOW });
    expect(selected).toHaveLength(7);
  });

  it("only touches the next few slots, leaving distant ones to fill naturally", () => {
    const far = season("fill", SLOT_FAR, 9.8);
    const near = season("fill", SLOT_3, 6.0);

    const { selected, slots } = selectSeasons([far, near], { now: NOW });

    expect(names(selected)).toContain(near.name);
    expect(names(selected)).not.toContain(far.name);
    expect(slots.map((s) => s.slot)).toEqual([SLOT_1, SLOT_2, SLOT_3]);
  });

  it("drops a fill season with no slot, since it answers no shortage", () => {
    const orphan = season("fill", null, 9.9);
    const { selected } = selectSeasons([orphan], { now: NOW });
    expect(selected).toEqual([]);
  });

  it("fills each slot independently", () => {
    const seasons = [
      season("core", SLOT_1),
      ...Array.from({ length: 4 }, () => season("core", SLOT_2)),
      season("fill", SLOT_1, 7.0),
      season("fill", SLOT_2, 9.9),
    ];
    const { slots } = selectSeasons(seasons, { now: NOW });

    expect(slots[0]).toMatchObject({ keptCount: 1, filledCount: 1 });
    // Slot 2 is already full, so its 9.9 candidate is passed over.
    expect(slots[1]).toMatchObject({ keptCount: 4, filledCount: 0, passedOver: 1 });
  });

  /**
   * Favourites behave like core: undroppable, and counted toward the target.
   *
   * The counting half is the part worth pinning. A favourite is a show for the
   * post like any other, so it must reduce the shortfall — treating it as a
   * bonus on top would quietly turn a four-show post into five whenever the
   * owner favourited something, which is the opposite of a ceiling.
   */
  it("keeps every favourited season and counts it toward the slot's target", () => {
    const core = [season("core", SLOT_1), season("core", SLOT_1)];
    const favourite = season("favourite", SLOT_1);
    const strong = season("fill", SLOT_1, 9.4);
    const alsoStrong = season("fill", SLOT_1, 9.1);

    const { selected, slots } = selectSeasons(
      [...core, favourite, strong, alsoStrong],
      { now: NOW }
    );

    expect(names(selected)).toContain(favourite.name);
    // 2 core + 1 favourite = 3, so exactly one fill is imported, not two.
    expect(slots[0]).toEqual({
      slot: SLOT_1,
      keptCount: 3,
      filledCount: 1,
      passedOver: 1,
    });
    expect(names(selected)).toContain(strong.name);
    expect(names(selected)).not.toContain(alsoStrong.name);
  });

  it("keeps an unrated favourite in a distant slot, where fill shows are not touched", () => {
    // A favourite is never a candidate to be weighed — it bypasses the slot
    // window entirely, exactly as a core show does.
    const favourite = season("favourite", SLOT_FAR);
    const orphan = season("favourite", null);
    const { selected } = selectSeasons([favourite, orphan], { now: NOW });
    expect(names(selected)).toEqual([favourite.name, orphan.name]);
  });

  /**
   * Unrated is "has not aired yet", not "bad". Those shows are still worth
   * having when nothing better is on offer, so they sort last rather than out.
   */
  it("prefers a rated show but still uses an unrated one to fill the gap", () => {
    const unrated = season("fill", SLOT_1, null);
    const rated6 = season("fill", SLOT_1, 6.0);

    const { selected } = selectSeasons([rated6, unrated], { now: NOW });
    expect(names(selected)).toEqual([rated6.name, unrated.name]);
  });

  it("is deterministic when ratings tie", () => {
    const a = season("fill", SLOT_1, 8.0);
    const b = season("fill", SLOT_1, 8.0);
    const first = selectSeasons([a, b], { now: NOW }).selected;
    const second = selectSeasons([b, a], { now: NOW }).selected;
    expect(names(first)).toEqual(names(second));
  });

  it("honours an overridden target", () => {
    const core = [season("core", SLOT_1)];
    const fill = Array.from({ length: 4 }, (_, i) => season("fill", SLOT_1, 9 - i));
    const { selected } = selectSeasons([...core, ...fill], {
      now: NOW,
      targetPerSlot: 3,
    });
    expect(selected).toHaveLength(3);
  });
});
