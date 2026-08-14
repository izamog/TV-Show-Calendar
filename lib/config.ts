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
 * TMDB genre ids to exclude so only scripted shows remain.
 * 99 Documentary, 10763 News, 10764 Reality, 10767 Talk.
 * Game shows and variety shows fall under Reality/Talk on TMDB.
 */
export const EXCLUDED_GENRE_IDS = [99, 10763, 10764, 10767];
export const EXCLUDED_GENRE_IDS_CSV = EXCLUDED_GENRE_IDS.join(",");

/** IANA zone used for every display + calendar calculation. */
export const DISPLAY_TIME_ZONE = "Europe/London";

/** TMDB image base for w500 poster art. */
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
