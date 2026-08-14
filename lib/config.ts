import type { AllowedService } from "./types";

/**
 * The only networks/streaming services we surface, keyed by TMDB network id.
 *
 * TMDB network ids are stable, well-known values taken from the `networks`
 * array on `/tv/{id}`. Where the requested brand maps onto the same TMDB
 * network as another (e.g. "Max" and "HBO Max" share id 3186, and
 * "FX on Hulu" content is tagged under FX / Hulu), we map to the closest
 * canonical TMDB network rather than inventing ids that do not exist.
 *
 * `kind` drives the default air time when TMDB provides no explicit time:
 *   - streaming  -> 00:00 UTC on the air date
 *   - broadcast  -> 20:00 London local on the air date
 * See lib/dates.ts (resolveAirInstant) for how these defaults are applied.
 */
export const ALLOWED_SERVICES: AllowedService[] = [
  { tmdbNetworkId: 2552, displayName: "Apple TV+", kind: "streaming" },
  { tmdbNetworkId: 3353, displayName: "Peacock", kind: "streaming" },
  { tmdbNetworkId: 4330, displayName: "Paramount+", kind: "streaming" },
  { tmdbNetworkId: 49, displayName: "HBO", kind: "broadcast" },
  { tmdbNetworkId: 3186, displayName: "Max", kind: "streaming" },
  { tmdbNetworkId: 77, displayName: "Syfy", kind: "broadcast" },
  { tmdbNetworkId: 453, displayName: "Hulu", kind: "streaming" },
  { tmdbNetworkId: 88, displayName: "FX", kind: "broadcast" },
  { tmdbNetworkId: 2739, displayName: "Disney+", kind: "streaming" },
  { tmdbNetworkId: 318, displayName: "Lionsgate+", kind: "streaming" },
  { tmdbNetworkId: 1024, displayName: "Prime Video", kind: "streaming" },
];

/** Fast lookup from TMDB network id -> allowed service. */
export const ALLOWED_SERVICE_BY_ID: ReadonlyMap<number, AllowedService> =
  new Map(ALLOWED_SERVICES.map((s) => [s.tmdbNetworkId, s]));

/** Pipe-joined id list for a TMDB Discover `with_networks` OR-query. */
export const ALLOWED_NETWORK_IDS_OR = ALLOWED_SERVICES.map(
  (s) => s.tmdbNetworkId
).join("|");

/**
 * TMDB genre ids to exclude so only adult-facing scripted shows remain.
 * 99 Documentary, 10762 Kids, 10763 News, 10764 Reality, 10767 Talk.
 * Game shows and variety shows fall under Reality/Talk on TMDB.
 */
export const EXCLUDED_GENRE_IDS = [99, 10762, 10763, 10764, 10767];
export const EXCLUDED_GENRE_IDS_CSV = EXCLUDED_GENRE_IDS.join(",");

/**
 * TMDB keyword ids to exclude. These tag short-form formats that are not the
 * kind of series this calendar is for:
 *   346018 "vertical screen", 356974 "web mini series".
 * Applied twice: as a Discover `without_keywords` filter, and re-checked per
 * show from `/tv/{id}?append_to_response=keywords` (Discover's keyword filter
 * is as loose as its genre filter).
 */
export const EXCLUDED_KEYWORD_IDS = [346018, 356974];
export const EXCLUDED_KEYWORD_IDS_CSV = EXCLUDED_KEYWORD_IDS.join(",");

/**
 * TMDB `type` values to exclude (from `/tv/{id}.type`).
 *
 * This is a *separate and more reliable* signal than `genres`: TMDB has shows
 * with a completely empty `genres` array that are still correctly typed. The
 * documentary "An Amputation Obsession: The Monster and the Surgeon" is exactly
 * that case — `genres: []` (so the genre-99 filter could never catch it) but
 * `type: "Documentary"`. Genre and type filtering are both applied.
 *
 * The remaining types — "Scripted" and "Miniseries" — are both kept: a
 * miniseries is scripted and is precisely the kind of Season 1 run this
 * calendar exists to surface.
 */
export const EXCLUDED_SHOW_TYPES = [
  "Documentary",
  "News",
  "Reality",
  "Talk Show",
  "Video",
];

/**
 * A show that has already aired more than one season is not a new series, so
 * its "Season 1" is not upcoming. Note this deliberately does NOT key off
 * TMDB's `status: "Returning Series"`, which merely means "not ended" and is
 * set on brand-new first-season shows too — filtering on it would remove most
 * of the calendar.
 */
export const MAX_SEASONS_FOR_NEW_SHOW = 1;

/**
 * Minimum number of Season 1 episodes for the run to count as a season.
 * Filters out one-off specials and two-part documentaries that TMDB models as
 * a "season". Note this is measured on the episodes TMDB currently lists, so a
 * show that has only announced its first episode or two is excluded until more
 * of its season is published.
 */
export const MIN_SEASON_EPISODES = 5;

/** IANA zone used for every display + calendar calculation. */
export const DISPLAY_TIME_ZONE = "Europe/London";

/** TMDB image base for w500 poster art. */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
