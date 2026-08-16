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
const CORE_SERVICES: Omit<AllowedService, "tier">[] = [
  { tmdbNetworkId: 2552, displayName: "Apple TV+", kind: "streaming" },
  { tmdbNetworkId: 3353, displayName: "Peacock", kind: "streaming" },
  { tmdbNetworkId: 4330, displayName: "Paramount+", kind: "streaming" },
  { tmdbNetworkId: 49, displayName: "HBO", kind: "broadcast" },
  // TMDB carries HBO Max as TWO networks, both literally named "HBO Max": the
  // legacy 3186 and 8304, created around the 2025 rebrand back from "Max".
  // New shows are tagged 8304 and 3186 has gone quiet (0 results in a 60-day
  // span where 8304 had one), so allowing only 3186 silently loses the service
  // as its back catalogue ages out. Both are kept — 3186 for already-tagged
  // shows, 8304 for everything new.
  //
  // Both map to the display name "Max" rather than TMDB's "HBO Max" because
  // that is the existing Airtable select option; renaming would need a new
  // option and orphan every row already written.
  { tmdbNetworkId: 3186, displayName: "Max", kind: "streaming" },
  { tmdbNetworkId: 8304, displayName: "Max", kind: "streaming" },
  { tmdbNetworkId: 77, displayName: "Syfy", kind: "broadcast" },
  { tmdbNetworkId: 453, displayName: "Hulu", kind: "streaming" },
  { tmdbNetworkId: 88, displayName: "FX", kind: "broadcast" },
  { tmdbNetworkId: 2739, displayName: "Disney+", kind: "streaming" },
  // TMDB 318 is named "STARZ". It was branded Lionsgate+ internationally from
  // 2022 and reverted in 2023; the id never changed, so this is a rename of an
  // existing entry, not a new network.
  { tmdbNetworkId: 318, displayName: "Starz", kind: "broadcast" },
  { tmdbNetworkId: 1024, displayName: "Prime Video", kind: "streaming" },
  { tmdbNetworkId: 174, displayName: "AMC", kind: "broadcast" },
  { tmdbNetworkId: 4661, displayName: "AMC+", kind: "streaming" },
  // MGM+ shows also carry the legacy id 922 ("Epix"). Only 6219 is allowed:
  // TMDB lists Epix first, and pickPrimaryService takes the first allowed
  // network, so allowing both would badge these shows as "Epix".
  { tmdbNetworkId: 6219, displayName: "MGM+", kind: "broadcast" },

  // --- UK broadcasters ---
  //
  // Each brand is several TMDB networks (a drama moves between BBC One and
  // BBC Two, or premieres on iPlayer as BBC Three), but only ONE display name,
  // because the badge and the Airtable `Network` select both want the brand a
  // reader recognises rather than the channel it happened to land on. Sharing a
  // display name across ids is safe: `pickPrimaryService` resolves to the
  // service, and everything downstream keys off `displayName`.
  //
  // Every id was read off a known original's `networks[]` (Sherlock, Wolf Hall,
  // Normal People, Detectorists; Broadchurch, Plebs, Litvinenko; It's a Sin,
  // Skins; Anne Boleyn; Gangs of London, Brassic, Code 404) — TMDB has no
  // network search endpoint and the company namespace is a different one.
  //
  // All are `broadcast` (20:00 London) except ITVX, which is streaming-first.
  { tmdbNetworkId: 4, displayName: "BBC", kind: "broadcast" },
  { tmdbNetworkId: 332, displayName: "BBC", kind: "broadcast" },
  { tmdbNetworkId: 3, displayName: "BBC", kind: "broadcast" },
  { tmdbNetworkId: 100, displayName: "BBC", kind: "broadcast" },
  { tmdbNetworkId: 9, displayName: "ITV", kind: "broadcast" },
  { tmdbNetworkId: 149, displayName: "ITV", kind: "broadcast" },
  { tmdbNetworkId: 5871, displayName: "ITV", kind: "streaming" },
  { tmdbNetworkId: 26, displayName: "Channel 4", kind: "broadcast" },
  { tmdbNetworkId: 136, displayName: "Channel 4", kind: "broadcast" },
  // TMDB names this network simply "5" — it is Channel 5 (Anne Boleyn, The
  // Teacher). Do not "correct" the id by searching for the name "Channel 5".
  { tmdbNetworkId: 99, displayName: "Channel 5", kind: "broadcast" },
  { tmdbNetworkId: 1063, displayName: "Sky", kind: "broadcast" },
  { tmdbNetworkId: 5237, displayName: "Sky", kind: "broadcast" },
  { tmdbNetworkId: 5213, displayName: "Sky", kind: "broadcast" },
  // Sky One closed in 2021 and its output moved to Sky Max, but TMDB still tags
  // the back catalogue — and some in-production shows — with both ids.
  { tmdbNetworkId: 214, displayName: "Sky", kind: "broadcast" },
];

/**
 * The curated allowlist — every show on one of these is shown unconditionally.
 *
 * `tier` is stamped on here rather than repeated on all fifteen literals above,
 * which stay readable as a plain list of "the networks we cover".
 */
export const ALLOWED_SERVICES: AllowedService[] = CORE_SERVICES.map((s) => ({
  ...s,
  tier: "core",
}));

/**
 * Second-tier services, discovered on every run but NOT shown by default.
 *
 * These are mainstream services across the US/UK/AU/CA whose whole output would
 * swamp the calendar if allowed in wholesale — Netflix alone premieres more
 * scripted Season 1s than the entire core allowlist combined. A show from this
 * tier only reaches the calendar when a blog post slot is short of
 * `TARGET_SEASONS_PER_SLOT`, and then only the best-rated ones. See lib/fill.ts.
 *
 * Every id was resolved from a known original on that service (Wolf Like Me and
 * Bump for Stan, Letterkenny and The Trades for Crave) rather than guessed:
 * TMDB has no network search endpoint, and the company namespace is separate
 * from the network namespace — "Netflix" the company is 178464, not 213.
 */
export const FILL_SERVICES: AllowedService[] = [
  { tmdbNetworkId: 213, displayName: "Netflix", kind: "streaming", tier: "fill" },
  { tmdbNetworkId: 1255, displayName: "Stan", kind: "streaming", tier: "fill" },
  { tmdbNetworkId: 1344, displayName: "Crave", kind: "streaming", tier: "fill" },
];

/** Core + fill, in that order — the order `pickPrimaryService` walks. */
export const ALL_SERVICES: AllowedService[] = [
  ...ALLOWED_SERVICES,
  ...FILL_SERVICES,
];

/**
 * Fast lookup from TMDB network id -> service.
 *
 * Covers both tiers: a show is only *discovered* if it is on one of these, and
 * the tier it lands in decides whether it needs to earn its place later.
 */
export const ALLOWED_SERVICE_BY_ID: ReadonlyMap<number, AllowedService> =
  new Map(ALL_SERVICES.map((s) => [s.tmdbNetworkId, s]));

/**
 * Pipe-joined id lists for TMDB Discover `with_networks` OR-queries, one per
 * tier.
 *
 * Swept separately rather than as one combined query, and this matters: Discover
 * is sorted by `popularity.desc` and paged, so a single query mixing both tiers
 * would let Netflix — reliably among the most popular networks on TMDB — consume
 * the page budget and push genuine core-allowlist shows off the end of the
 * results entirely. The core list would then be silently thinned by the very
 * feature meant to top it up. Separate sweeps give each tier its own budget.
 */
export const CORE_NETWORK_IDS_OR = ALLOWED_SERVICES.map(
  (s) => s.tmdbNetworkId
).join("|");
export const FILL_NETWORK_IDS_OR = FILL_SERVICES.map(
  (s) => s.tmdbNetworkId
).join("|");

/**
 * How many shows should share one blog post slot (one `Suggested date`).
 *
 * The editorial target: a post covers four shows, so a slot holding fewer than
 * this is short of material and is topped up from `FILL_SERVICES`.
 *
 * This is a *ceiling on topping up*, not a cap on the slot: core-allowlist and
 * favourited shows are never dropped, so a slot legitimately holding five core
 * shows keeps all five and simply imports nothing.
 */
export const TARGET_SEASONS_PER_SLOT = 4;

/**
 * How many upcoming slots the fill logic is allowed to touch.
 *
 * Deliberately near-term. A distant slot is still accumulating core-allowlist
 * shows that simply have not been announced yet, so filling it now would import
 * Netflix rows to solve a shortage that would have resolved itself — and those
 * rows are hard to tell apart from ones that were genuinely needed.
 */
export const FILLABLE_SLOT_COUNT = 3;

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
