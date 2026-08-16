import { FILLABLE_SLOT_COUNT, TARGET_SEASONS_PER_SLOT } from "./config";
import { nextPostSlots } from "./dates";
import type { ShowSeason } from "./types";

/**
 * Deciding which second-tier shows earn a place on the calendar.
 *
 * The calendar's unit of editorial work is a blog post, and a post covers 4–5
 * shows. Those shows are the ones sharing a `Suggested date` — the fortnightly
 * Sunday slot Airtable derives from each season's 1/3rd date (see
 * `suggestedPostDate` in lib/dates.ts). A slot holding two shows is a thin
 * post, so this module tops such slots up from `FILL_SERVICES` — best-rated
 * first, and no further than the target.
 *
 * The whole point is restraint. Admitting Netflix wholesale would bury the
 * curated allowlist under a service that premieres more Season 1s than the
 * rest of the list combined; admitting nothing leaves posts short. So a
 * second-tier show is imported only against a demonstrated shortage, in the
 * near term, in rating order.
 */

/**
 * Rank for filling: best-rated first, unrated last.
 *
 * Unrated is not the same as badly rated — it is almost always "has not aired,
 * so nobody has voted". Those shows still deserve a slot when nothing better
 * is available, so they sort to the back rather than being excluded, with the
 * TMDB id as a final tiebreak so the selection is stable across runs rather
 * than depending on the order TMDB happened to return.
 */
function byRatingDesc(a: ShowSeason, b: ShowSeason): number {
  const aRating = a.rating.combined;
  const bRating = b.rating.combined;
  if (aRating !== bRating) {
    if (aRating === null) return 1;
    if (bRating === null) return -1;
    return bRating - aRating;
  }
  return a.showId - b.showId;
}

export interface FillOptions {
  now?: Date;
  targetPerSlot?: number;
  fillableSlotCount?: number;
}

export interface FillDecision {
  /** The seasons that should reach the calendar, Airtable and the feeds. */
  selected: ShowSeason[];
  /** Per-slot bookkeeping, in slot order. Surfaced for logging on the cron. */
  slots: {
    slot: string;
    /** Undroppable shows already in the slot — core allowlist plus favourites. */
    keptCount: number;
    filledCount: number;
    /** Fill candidates that were available but not needed. */
    passedOver: number;
  }[];
}

/**
 * Choose the seasons to publish: every core and favourited show, plus the
 * best-rated second-tier shows needed to bring near-term slots up to target.
 *
 * Core and favourite shows are never filtered — the curated allowlist is the
 * calendar's editorial position and a favourite is that position stated by hand,
 * so a slot that already holds six of them keeps all six. Fill shows survive
 * only against a shortage in one of the next `fillableSlotCount` slots.
 *
 * Favourites count *toward* the target rather than sitting on top of it: they
 * are shows for the post like any other, so a slot holding two core shows and a
 * favourite needs one import, not two.
 *
 * A fill show with no `suggestedPostDate` is dropped: with no 1/3rd date it
 * belongs to no slot, so it cannot be answering a shortage in one.
 */
export function selectSeasons(
  seasons: ShowSeason[],
  options: FillOptions = {}
): FillDecision {
  const {
    now = new Date(),
    targetPerSlot = TARGET_SEASONS_PER_SLOT,
    fillableSlotCount = FILLABLE_SLOT_COUNT,
  } = options;

  const kept = seasons.filter((s) => s.serviceTier !== "fill");
  const fill = seasons.filter((s) => s.serviceTier === "fill");

  const fillable = nextPostSlots(fillableSlotCount, now);
  const candidatesBySlot = new Map<string, ShowSeason[]>();
  for (const slot of fillable) candidatesBySlot.set(slot, []);
  for (const season of fill) {
    const bucket =
      season.suggestedPostDate === null
        ? undefined
        : candidatesBySlot.get(season.suggestedPostDate);
    bucket?.push(season);
  }

  const keptCounts = new Map<string, number>();
  for (const season of kept) {
    if (season.suggestedPostDate === null) continue;
    keptCounts.set(
      season.suggestedPostDate,
      (keptCounts.get(season.suggestedPostDate) ?? 0) + 1
    );
  }

  const selected = [...kept];
  const slots: FillDecision["slots"] = [];

  for (const slot of fillable) {
    const keptCount = keptCounts.get(slot) ?? 0;
    const candidates = (candidatesBySlot.get(slot) ?? []).sort(byRatingDesc);
    const shortfall = Math.max(0, targetPerSlot - keptCount);
    const taken = candidates.slice(0, shortfall);

    selected.push(...taken);
    slots.push({
      slot,
      keptCount,
      filledCount: taken.length,
      passedOver: candidates.length - taken.length,
    });
  }

  return { selected, slots };
}
