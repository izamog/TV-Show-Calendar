/**
 * Domain types shared across the TMDB data layer, the page, and the iCal feed.
 */

/** A network/streaming service we care about, and how it behaves for air times. */
export type ServiceKind = "streaming" | "broadcast";

/**
 * How a show earns its place on the calendar.
 *
 * `core`      — the curated network allowlist; every qualifying show is shown.
 * `favourite` — favourited on TMDB by the account that owns this calendar.
 *               Shown unconditionally like `core`, and on ANY network: the
 *               point of a favourite is that the curation already happened, by
 *               hand, so no automated filter should be able to overrule it.
 * `fill`      — mainstream services (Netflix, Stan, Crave) whose shows appear
 *               only when a blog post slot is short, best-rated first.
 *
 * `core` and `favourite` are both undroppable; they stay distinct so the badge
 * and the logs can say which reason applied, and because a favourite is the one
 * tier allowed past the Season-1 rule.
 */
export type ServiceTier = "core" | "favourite" | "fill";

export interface AllowedService {
  /** TMDB network id (from /tv/{id}.networks[].id). */
  tmdbNetworkId: number;
  /** Human-facing display name shown on the badge. */
  displayName: string;
  /** Whether the service streams (default 00:00 UTC) or broadcasts (default 20:00 local). */
  kind: ServiceKind;
  tier: ServiceTier;
}

/**
 * How well received a show is, blended across the two public scores.
 *
 * Kept as a struct rather than a bare number so the component scores stay
 * visible: a 9.0 from eleven TMDB votes and a 9.0 from 40,000 IMDb votes are
 * not the same claim, and the fill logic ranks on `combined` while a human
 * reading the row can see what produced it.
 */
export interface Rating {
  /**
   * Vote-weighted mean of the two scores, 0–10 to one decimal. Null when
   * neither source clears its confidence floor — an unrated show, which is the
   * normal state for a series that has not premiered yet.
   */
  combined: number | null;
  /** TMDB `vote_average`, or null below the vote floor. */
  tmdb: number | null;
  /** IMDb rating via OMDb, or null when unavailable or below the vote floor. */
  imdb: number | null;
  /** Total votes behind `combined`, across both sources. Zero when unrated. */
  voteCount: number;
}

/**
 * A single episode airing inside the displayed range, fully resolved and ready
 * for display and iCal export.
 *
 * Almost always Season 1 — the calendar is about new series — but a show
 * favourited on TMDB contributes whichever season is currently airing, so
 * nothing here may assume season 1.
 */
export interface Episode {
  /** Stable id: `${showId}-S${season}E${episodeNumber}`. Used as a React key and iCal UID seed. */
  id: string;
  showId: number;
  showName: string;
  episodeName: string;
  /** TMDB episode synopsis, shown on desktop hover. Null when TMDB has none. */
  episodeOverview: string | null;
  /** TMDB series synopsis — shown on hover for premieres, to introduce the show. */
  showOverview: string | null;
  seasonNumber: number;
  episodeNumber: number;
  /** e.g. "S01E01" — zero-padded both halves, widening past 99. */
  code: string;
  /** Total number of episodes in this episode's season. */
  seasonEpisodeCount: number;
  /** Full poster URL (w500) or null when TMDB has no artwork. */
  posterUrl: string | null;
  /** Display name of the primary network/streaming service. */
  serviceName: string;
  serviceKind: ServiceKind;
  serviceTier: ServiceTier;
  /** Blended audience score for the show this episode belongs to. */
  rating: Rating;
  /** The exact air instant as a UTC timestamp (ms since epoch). */
  airInstantUtcMs: number;
  /** ISO date (YYYY-MM-DD) of the air day, in London time — used for grid placement. */
  londonDateKey: string;
  /**
   * Whether this is episode 1 of its season. On a Season 1 row that is the
   * series premiere; on a favourite's later season it is a season premiere, and
   * the UI labels it accordingly rather than overclaiming.
   */
  isPremiere: boolean;
}

/**
 * One show's season summarised as a single record — the season-level view the
 * page and the iCal feed never need, because both are per-episode.
 *
 * Consumed by `/api/shows`, whose whole job is to be pulled into an external
 * table (Airtable via Zapier), so the field names are the plain nouns a
 * downstream table maps onto rather than the internal `Episode` vocabulary.
 */
export interface ShowSeason {
  /**
   * Stable id: `${showId}-S${paddedSeason}`. Lets a poller dedupe rows across
   * runs, and keeps two seasons of the same show apart — which is the same pair
   * Airtable upserts on.
   */
  id: string;
  showId: number;
  /** Plain show name, no S/E code — the same title the UI shows. */
  name: string;
  seasonNumber: number;
  /** Total episodes in this season, including any outside the queried range. */
  episodeCount: number;
  /**
   * ISO date (YYYY-MM-DD) the season starts/ends, taken from the WHOLE season,
   * not just the queried range — a season straddling the range boundary still
   * reports its true premiere and finale dates. Null when TMDB has no dated
   * episodes at all.
   */
  firstEpisodeAirDate: string | null;
  seasonFinishDate: string | null;
  /**
   * The episode ending the season's first third, `ceil(episodeCount / 3)` —
   * episode 4 of 10, episode 3 of both 9 and 8. Carried alongside the date so
   * the date can be checked against the episode it came from.
   */
  firstThirdEpisodeNumber: number | null;
  /** ISO date (YYYY-MM-DD) that episode airs. Null when it has no date yet. */
  firstThirdAirDate: string | null;
  /** Display name of the primary network/streaming service. */
  network: string;
  serviceTier: ServiceTier;
  /** Blended audience score, mirrored into the Airtable `Rating` column. */
  rating: Rating;
  /**
   * The blog post slot this season falls into — a `YYYY-MM-DD` Sunday, derived
   * from `firstThirdAirDate` by `suggestedPostDate` in lib/dates.ts.
   *
   * Airtable computes the identical value in its `Suggested date` formula
   * column, so this is never written there; it exists so the fill logic can
   * group seasons into the same buckets Airtable will show them in. Null when
   * the season has no 1/3rd date yet.
   */
  suggestedPostDate: string | null;
}
