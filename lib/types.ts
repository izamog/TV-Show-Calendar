/**
 * Domain types shared across the TMDB data layer, the page, and the iCal feed.
 */

/** A network/streaming service we care about, and how it behaves for air times. */
export type ServiceKind = "streaming" | "broadcast";

export interface AllowedService {
  /** TMDB network id (from /tv/{id}.networks[].id). */
  tmdbNetworkId: number;
  /** Human-facing display name shown on the badge. */
  displayName: string;
  /** Whether the service streams (default 00:00 UTC) or broadcasts (default 20:00 local). */
  kind: ServiceKind;
}

/**
 * A single Season 1 episode airing inside the displayed range, fully resolved
 * and ready for display and iCal export.
 */
export interface Episode {
  /** Stable id: `${showId}-S01E${episodeNumber}`. Used as a React key and iCal UID seed. */
  id: string;
  showId: number;
  showName: string;
  episodeName: string;
  /** TMDB episode synopsis, shown on desktop hover. Null when TMDB has none. */
  episodeOverview: string | null;
  /** TMDB series synopsis — shown on hover for premieres, to introduce the show. */
  showOverview: string | null;
  seasonNumber: 1;
  episodeNumber: number;
  /** e.g. "S01E01" */
  code: string;
  /** Total number of episodes in Season 1. */
  seasonEpisodeCount: number;
  /** Full poster URL (w500) or null when TMDB has no artwork. */
  posterUrl: string | null;
  /** Display name of the primary network/streaming service. */
  serviceName: string;
  serviceKind: ServiceKind;
  /** The exact air instant as a UTC timestamp (ms since epoch). */
  airInstantUtcMs: number;
  /** ISO date (YYYY-MM-DD) of the air day, in London time — used for grid placement. */
  londonDateKey: string;
  /** Whether this is the series premiere (S01E01). */
  isPremiere: boolean;
}
