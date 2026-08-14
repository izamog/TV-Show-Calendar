import type { Episode } from "./types";

/** Cards shown per show per day before the rest are summarised into one line. */
export const MAX_CARDS_PER_SHOW_PER_DAY = 2;

/** A show's episodes on one day: the cards to render plus how many are hidden. */
export interface ShowGroup {
  showId: number;
  showName: string;
  shown: Episode[];
  hiddenCount: number;
  /** Earliest air instant in the group, used to order groups within the day. */
  sortKey: number;
}

/**
 * Group one day's episodes by show, capping how many cards a single show may
 * occupy. A show dropping several episodes at once (common for streamers)
 * would otherwise push every other show that day out of view.
 *
 * Groups are returned in air order, and episodes within a group in air order,
 * so the two cards shown are always the earliest of that show's batch.
 */
export function groupByShow(episodes: Episode[]): ShowGroup[] {
  const byShow = new Map<number, Episode[]>();
  for (const ep of episodes) {
    const list = byShow.get(ep.showId);
    if (list) list.push(ep);
    else byShow.set(ep.showId, [ep]);
  }

  const groups: ShowGroup[] = [];
  for (const [showId, eps] of byShow) {
    const ordered = [...eps].sort(
      (a, b) =>
        a.airInstantUtcMs - b.airInstantUtcMs || a.episodeNumber - b.episodeNumber
    );
    groups.push({
      showId,
      showName: ordered[0].showName,
      shown: ordered.slice(0, MAX_CARDS_PER_SHOW_PER_DAY),
      hiddenCount: Math.max(0, ordered.length - MAX_CARDS_PER_SHOW_PER_DAY),
      sortKey: ordered[0].airInstantUtcMs,
    });
  }
  return groups.sort((a, b) => a.sortKey - b.sortKey);
}
