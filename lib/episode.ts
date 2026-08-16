import type { Episode } from "./types";

/**
 * This episode's position through its season, as a 0–1 fraction for the
 * progress bar.
 *
 * Clamped at 1 because TMDB occasionally reports an episode number beyond the
 * fetched episode count (a late-added special, or a season still being filled
 * in), and a bar wider than its track renders as an overflow.
 */
export function seasonProgress(episode: Episode): number {
  if (episode.seasonEpisodeCount <= 0) return 0;
  return Math.min(1, episode.episodeNumber / episode.seasonEpisodeCount);
}

/** Which synopses a card should reveal, and whether it has anything to reveal. */
export interface EpisodeSynopsis {
  /** The show-level synopsis, when it should be shown above the episode one. */
  showSynopsis: string | null;
  /** False when there is nothing to reveal, so the card skips the overlay entirely. */
  hasSynopsis: boolean;
}

/**
 * Decide which synopses a card shows.
 *
 * The show synopsis appears in two cases: on a premiere, where it introduces a
 * series no earlier episode has, and as a fallback for any episode TMDB has no
 * synopsis for — common for unaired episodes, which often carry neither a real
 * title nor a description. Without the fallback those cards had nothing to
 * reveal and so showed no overlay at all.
 */
export function synopsisFor(episode: Episode): EpisodeSynopsis {
  const showSynopsis =
    episode.isPremiere || !episode.episodeOverview
      ? episode.showOverview
      : null;

  return {
    showSynopsis,
    hasSynopsis: Boolean(showSynopsis || episode.episodeOverview),
  };
}
