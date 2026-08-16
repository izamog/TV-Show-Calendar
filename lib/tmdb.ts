import {
  CORE_NETWORK_IDS_OR,
  FILL_NETWORK_IDS_OR,
  ALLOWED_SERVICE_BY_ID,
  EXCLUDED_GENRE_IDS,
  EXCLUDED_GENRE_IDS_CSV,
  EXCLUDED_KEYWORD_IDS,
  EXCLUDED_KEYWORD_IDS_CSV,
  EXCLUDED_SHOW_TYPES,
  MAX_SEASONS_FOR_NEW_SHOW,
  MIN_SEASON_EPISODES,
  TMDB_IMAGE_BASE,
} from "./config";
import {
  getRollingWindow,
  londonDateKey,
  resolveAirInstantUtcMs,
  suggestedPostDate,
} from "./dates";
import { candidateSeasonNumbers, getFavouriteShowIds } from "./favourites";
import { selectSeasons } from "./fill";
import { fetchImdbRating } from "./imdb";
import { combineRatings } from "./rating";
import {
  mapWithConcurrency,
  readAuth,
  tmdbGet,
  type DiscoverResponse,
  type TmdbNetwork,
  type TmdbSeasonDetails,
  type TmdbShowDetails,
} from "./tmdb-client";
import type {
  Episode,
  Rating,
  ServiceKind,
  ServiceTier,
  ShowSeason,
} from "./types";

/**
 * TMDB data-fetching + processing layer.
 *
 * Produces the fully-resolved `Episode[]` for an arbitrary date range — the
 * rolling 28-day period for the page, a longer span for the iCal feed.
 * TMDB imposes no horizon on how far ahead we may query: Discover accepts any
 * `first_air_date` range and season payloads carry future `air_date`s, so the
 * range is purely our choice. The range and timezone logic live in
 * lib/dates.ts so every caller shares identical semantics.
 */

/** How many Discover pages to sweep per range. 3 pages ≈ 60 candidate shows. */
const DISCOVER_PAGES = 3;
/** Bound outbound concurrency so we never hammer TMDB with 60 parallel calls. */
const CONCURRENCY = 6;
/**
 * Look back this many days before the range when discovering shows, so a
 * series that premiered shortly before it but is still airing early Season 1
 * episodes inside it is not missed. Discover filters on first_air_date.
 */
const DISCOVER_LOOKBACK_DAYS = 21;
/**
 * Days of coverage in the subscribable iCal feed. Deliberately longer than the
 * page's 28-day period so a subscriber keeps seeing upcoming episodes without
 * the feed needing to be re-fetched on a tight schedule.
 */
const FEED_DAYS = 60;

/** A show's primary service, resolved from its TMDB networks. */
interface ResolvedService {
  name: string;
  kind: ServiceKind;
  tier: ServiceTier;
}

/** ISO date `YYYY-MM-DD` shifted by whole days from a day key. */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map((n) => Number(n));
  const shifted = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Choose the primary service for a show. A show can carry several networks; we
 * pick the first that is on one of our lists so the badge is stable.
 *
 * Core beats fill regardless of the order TMDB lists them in. A show can
 * legitimately carry both — international distribution routinely tags an HBO or
 * FX series with Netflix outside the US — and taking TMDB's first match would
 * tier such a show as `fill` on an accident of array order. It would then be
 * subject to being dropped by the fill logic, silently removing a
 * core-allowlist show from the calendar. Tie-break by tier, then by TMDB order
 * within the tier.
 */
function pickPrimaryService(
  networks: TmdbNetwork[] | undefined
): ResolvedService | null {
  if (!networks) return null;

  let fallback: ResolvedService | null = null;
  for (const n of networks) {
    const allowed = ALLOWED_SERVICE_BY_ID.get(n.id);
    if (!allowed) continue;
    const resolved = {
      name: allowed.displayName,
      kind: allowed.kind,
      tier: allowed.tier,
    };
    if (resolved.tier === "core") return resolved;
    fallback ??= resolved;
  }
  return fallback;
}

/**
 * Scripted per BOTH signals TMDB offers, because either can be absent:
 * `genres` is sometimes an empty array on real shows, and `type` is sometimes
 * missing. A show is kept only if neither signal marks it as non-scripted.
 */
export function isScripted(details: TmdbShowDetails): boolean {
  if (details.type && EXCLUDED_SHOW_TYPES.includes(details.type)) return false;
  if (!details.genres) return true; // absence of an excluded genre => keep
  return !details.genres.some((g) => EXCLUDED_GENRE_IDS.includes(g.id));
}

/** True when the show has already aired more than one season (not a new series). */
export function isReturningSeries(details: TmdbShowDetails): boolean {
  const seasons = details.number_of_seasons;
  if (typeof seasons !== "number") return false; // unknown => keep
  return seasons > MAX_SEASONS_FOR_NEW_SHOW;
}

/** True when the show carries an excluded keyword (vertical screen / web mini series). */
export function hasExcludedKeyword(details: TmdbShowDetails): boolean {
  const keywords = details.keywords?.results;
  if (!keywords) return false;
  return keywords.some((k) => EXCLUDED_KEYWORD_IDS.includes(k.id));
}

/** Trim a TMDB overview to a non-empty string, or null when it is blank. */
function cleanOverview(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * First and last air date across a whole season's episodes.
 *
 * Deliberately spans every episode TMDB lists, not the ones inside a queried
 * range: a season that starts before the range or finishes after it must still
 * report its real premiere and finale, since that is the season-level fact a
 * downstream table is recording.
 *
 * TMDB air dates are zero-padded `YYYY-MM-DD`, so lexicographic ordering is
 * chronological and no date parsing (or timezone) is involved. Undated
 * episodes — common for an unscheduled back half of a season — are ignored
 * rather than treated as a gap.
 */
export function seasonAirDateRange(
  episodes: { air_date?: string | null }[]
): { firstEpisodeAirDate: string | null; seasonFinishDate: string | null } {
  const dates = episodes
    .map((ep) => ep.air_date?.trim())
    .filter((d): d is string => Boolean(d))
    .sort();
  return {
    firstEpisodeAirDate: dates[0] ?? null,
    seasonFinishDate: dates[dates.length - 1] ?? null,
  };
}

/**
 * The episode that ends the season's first third, and when it airs.
 *
 * The marker is `ceil(episodeCount / 3)` — round UP, so the first third is
 * always a whole episode and never lands mid-episode. A 10-episode season
 * marks at episode 4 (3.33 rounded up), while both 9 and 8 mark at episode 3.
 *
 * Position is taken by `episode_number` rather than array order, because TMDB
 * does not guarantee the season payload is ordered and a mis-ordered list would
 * silently return the wrong episode's date. Null when the season is empty or
 * that particular episode has no announced air date yet.
 */
export function firstThirdMarker(
  episodes: { episode_number: number; air_date?: string | null }[]
): { firstThirdEpisodeNumber: number | null; firstThirdAirDate: string | null } {
  if (episodes.length === 0) {
    return { firstThirdEpisodeNumber: null, firstThirdAirDate: null };
  }
  const ordered = [...episodes].sort((a, b) => a.episode_number - b.episode_number);
  const marker = ordered[Math.ceil(ordered.length / 3) - 1];
  return {
    firstThirdEpisodeNumber: marker.episode_number,
    firstThirdAirDate: marker.air_date?.trim() || null,
  };
}

/**
 * Re-check the constraints Discover is loose about against `/tv/{id}`, and
 * return the show's primary allowed service — or null when the show fails any
 * of them. Returning the service rather than a boolean is deliberate: the
 * caller needs it immediately, and answering "does it qualify" and "on what"
 * separately would mean walking the network list twice.
 */
export function qualifyingService(
  details: TmdbShowDetails
): ResolvedService | null {
  if (details.original_language && details.original_language !== "en") {
    return null;
  }
  if (!isScripted(details)) return null;
  if (isReturningSeries(details)) return null;
  if (hasExcludedKeyword(details)) return null;
  return pickPrimaryService(details.networks);
}

/**
 * The service to badge a favourited show with — which is never a reason to drop
 * it.
 *
 * A favourite reaches the calendar on any network, including ones the allowlist
 * has never heard of (Bridgerton is Netflix, Severance is Apple TV+, and the
 * next one might be on a service nobody has added). So this always returns a
 * service, falling back to TMDB's own first network name, and stamps the
 * `favourite` tier over whatever tier the network would otherwise imply — a
 * favourite on Netflix must not be droppable by the fill logic.
 *
 * `kind` decides the assumed air time, and an unlisted network gives us nothing
 * to decide it from. `streaming` (00:00 UTC) is the assumption: it is what the
 * services most likely to be missing from a hand-written broadcaster list
 * actually do, and being wrong costs a card sitting at the top of the right day
 * rather than in the wrong day entirely.
 */
export function favouriteService(details: TmdbShowDetails): ResolvedService {
  const known = pickPrimaryService(details.networks);
  if (known) return { ...known, tier: "favourite" };
  return {
    name: details.networks?.[0]?.name ?? "Unknown",
    kind: "streaming",
    tier: "favourite",
  };
}

/** `S01E01` — both halves zero-padded to two digits, widening rather than truncating. */
export function episodeCode(seasonNumber: number, episodeNumber: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `S${pad(seasonNumber)}E${pad(episodeNumber)}`;
}

/**
 * Map a fetched season into the Episode rows that fall inside `rangeDays`.
 *
 * Pure given its arguments, which is the point: this is where air-date
 * resolution, London date placement and range filtering all land, and it is
 * the part worth testing without reaching for the network.
 */
interface EpisodesInRangeArgs {
  showId: number;
  showName: string;
  showOverview: string | null;
  seasonNumber: number;
  season: TmdbSeasonDetails;
  service: ResolvedService;
  rating: Rating;
  rangeDays: ReadonlySet<string>;
}

export function episodesInRange(args: EpisodesInRangeArgs): Episode[] {
  const { showId, showName, showOverview, seasonNumber, season, service, rating, rangeDays } = args;
  const episodes = season.episodes ?? [];
  const seasonEpisodeCount = episodes.length;
  const out: Episode[] = [];

  for (const ep of episodes) {
    if (!ep.air_date) continue;
    const airInstantUtcMs = resolveAirInstantUtcMs(ep.air_date, service.kind);
    const dateKey = londonDateKey(airInstantUtcMs);
    if (!rangeDays.has(dateKey)) continue;

    const code = episodeCode(seasonNumber, ep.episode_number);
    const posterPath = ep.still_path ?? season.poster_path ?? null;

    out.push({
      id: `${showId}-${code}`,
      showId,
      showName,
      episodeName: ep.name?.trim() || `Episode ${ep.episode_number}`,
      episodeOverview: cleanOverview(ep.overview),
      showOverview,
      seasonNumber,
      episodeNumber: ep.episode_number,
      code,
      seasonEpisodeCount,
      posterUrl: posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null,
      serviceName: service.name,
      serviceKind: service.kind,
      serviceTier: service.tier,
      rating,
      airInstantUtcMs,
      londonDateKey: dateKey,
      isPremiere: ep.episode_number === 1,
    });
  }

  return out;
}

/**
 * Blend TMDB's score with IMDb's for one show.
 *
 * TMDB's half is already in hand from `/tv/{id}`. The IMDb half is a lookup in
 * IMDb's dataset — `external_ids.imdb_id` on a `/tv/{id}` response is the
 * *series* id, so this is the show's score and never one episode's — and it
 * degrades to null when the dataset is unreachable, leaving a TMDB-only rating
 * rather than no calendar.
 */
async function resolveRating(details: TmdbShowDetails): Promise<Rating> {
  const tmdb =
    typeof details.vote_average === "number" &&
    typeof details.vote_count === "number"
      ? { rating: details.vote_average, votes: details.vote_count }
      : null;
  const imdb = await fetchImdbRating(details.external_ids?.imdb_id);
  return combineRatings(tmdb, imdb);
}

/** One candidate season that survived filtering: its summary and its in-range episodes. */
interface ResolvedShow {
  season: ShowSeason;
  /** Episodes falling inside the queried range. Empty when none do. */
  episodes: Episode[];
}

/**
 * Fetch, filter, and resolve every allowed show with activity between
 * `startKey` and `endKey` (inclusive, London calendar dates), returning both
 * the season-level summary and the in-range episodes for each.
 *
 * Both views come from this single pass because they need the exact same
 * discovery, filtering and season fetch — splitting them would double the TMDB
 * traffic to answer the same question twice.
 *
 * Two kinds of show arrive here. **Discovered** shows come from Discover on an
 * allowlisted network and must pass every filter, Season 1 included.
 * **Favourited** shows come from the owner's TMDB account and pass all of them
 * unconditionally, on whatever network and in whatever season is currently
 * airing — a filter exists to guess at what is worth watching, and a favourite
 * is that question already answered.
 *
 * Never throws for a single bad show — per-show failures are logged and skipped
 * so one outage cannot blank the grid.
 */
async function resolveShowsInRange(
  startKey: string,
  endKey: string
): Promise<ResolvedShow[]> {
  const auth = readAuth();

  const rangeDays = new Set<string>();
  for (let key = startKey; key <= endKey; key = shiftDayKey(key, 1)) {
    rangeDays.add(key);
  }

  const discoverGte = shiftDayKey(startKey, -DISCOVER_LOOKBACK_DAYS);
  const discoverLte = endKey;

  // 1) Discover candidate shows, one sweep per tier so a popular fill network
  //    cannot consume the page budget and starve the core allowlist.
  const candidateIds = new Set<number>();
  for (const networks of [CORE_NETWORK_IDS_OR, FILL_NETWORK_IDS_OR]) {
    for (let page = 1; page <= DISCOVER_PAGES; page++) {
      const data = await tmdbGet<DiscoverResponse>(
        "/discover/tv",
        {
          include_adult: "false",
          include_null_first_air_dates: "false",
          language: "en-US",
          with_original_language: "en",
          with_networks: networks,
          without_genres: EXCLUDED_GENRE_IDS_CSV,
          without_keywords: EXCLUDED_KEYWORD_IDS_CSV,
          "first_air_date.gte": discoverGte,
          "first_air_date.lte": discoverLte,
          sort_by: "popularity.desc",
          page: String(page),
        },
        auth
      );
      for (const r of data.results ?? []) candidateIds.add(r.id);
      if (data.total_pages !== undefined && page >= data.total_pages) break;
    }
  }

  // 2) Add the owner's favourites. Discover would never surface most of them —
  //    they are on unlisted networks, or well past their first season — which
  //    is exactly why they are a separate source rather than a filter relaxation.
  const favouriteIds = await getFavouriteShowIds(auth);
  for (const id of favouriteIds) candidateIds.add(id);

  // 3) For each candidate, resolve details + the relevant season(s) in the window.
  const perShow = await mapWithConcurrency(
    Array.from(candidateIds),
    CONCURRENCY,
    async (showId): Promise<ResolvedShow[]> => {
      try {
        const details = await tmdbGet<TmdbShowDetails>(
          `/tv/${showId}`,
          { language: "en-US", append_to_response: "keywords,external_ids" },
          auth
        );

        const isFavourite = favouriteIds.has(showId);
        const service = isFavourite
          ? favouriteService(details)
          : qualifyingService(details);
        if (!service) return [];

        // Rated only after the show has qualified. The score is a property of
        // the show, so it is resolved once even when two seasons fall inside
        // the range.
        const rating = await resolveRating(details);

        const resolved = await Promise.all(
          candidateSeasonNumbers(details, isFavourite).map(
            async (seasonNumber): Promise<ResolvedShow | null> => {
              const season = await tmdbGet<TmdbSeasonDetails>(
                `/tv/${showId}/season/${seasonNumber}`,
                { language: "en-US" },
                auth
              );
              const episodes = season.episodes ?? [];

              // A run this short is a special or a two-parter, not a season —
              // unless it was favourited, in which case a four-episode run is
              // still a thing the owner asked to be told about.
              if (!isFavourite && episodes.length < MIN_SEASON_EPISODES) {
                return null;
              }

              const marker = firstThirdMarker(episodes);
              return {
                season: {
                  id: `${showId}-S${String(seasonNumber).padStart(2, "0")}`,
                  showId,
                  name: details.name,
                  seasonNumber,
                  episodeCount: episodes.length,
                  ...seasonAirDateRange(episodes),
                  ...marker,
                  network: service.name,
                  serviceTier: service.tier,
                  rating,
                  suggestedPostDate: suggestedPostDate(marker.firstThirdAirDate),
                },
                episodes: episodesInRange({
                  showId,
                  showName: details.name,
                  showOverview: cleanOverview(details.overview),
                  seasonNumber,
                  season,
                  service,
                  rating,
                  rangeDays,
                }),
              };
            }
          )
        );

        return resolved.filter((r): r is ResolvedShow => r !== null);
      } catch (err) {
        console.error(`[tmdb] skipping show ${showId}:`, err);
        return [];
      }
    }
  );

  return perShow.flat();
}

/**
 * The single resolved, fill-selected view of the feed span that every caller
 * reads from.
 *
 * Resolution ALWAYS covers the full feed span, even for the 28-day page. That
 * is deliberate and load-bearing: whether a second-tier show earns its place
 * depends on how many shows share its blog post slot, and a slot's membership
 * can only be counted over the whole span. Resolving the page over its own
 * shorter range would count a smaller set, reach a different fill decision, and
 * show a Netflix row the `.ics` feed and Airtable disagreed about. One span,
 * one decision, then filter — the same reason the window itself lives only in
 * lib/dates.ts.
 *
 * The extra breadth is close to free: the page's period is a prefix of the feed
 * span, so both share one set of cached TMDB responses.
 */
async function resolveFeedSelection(now: Date): Promise<{
  seasons: ShowSeason[];
  episodes: Episode[];
}> {
  const window = getRollingWindow(0, now);
  const startKey = window.periodStartKey;
  const endKey = shiftDayKey(startKey, FEED_DAYS - 1);

  const resolved = await resolveShowsInRange(startKey, endKey);

  // Only shows actually airing in the span are candidates — that requirement is
  // what makes this a feed of *current* new shows rather than every candidate
  // Discover returned.
  const airing = resolved.filter((r) => r.episodes.length > 0);
  const decision = selectSeasons(
    airing.map((r) => r.season),
    { now }
  );
  console.log("[tmdb] fill decision", JSON.stringify(decision.slots));

  const keptIds = new Set(decision.selected.map((s) => s.id));
  const kept = airing.filter((r) => keptIds.has(r.season.id));

  return {
    seasons: kept
      .map((r) => r.season)
      .sort((a, b) =>
        (a.firstEpisodeAirDate ?? "9999-12-31").localeCompare(
          b.firstEpisodeAirDate ?? "9999-12-31"
        )
      ),
    episodes: kept
      .flatMap((r) => r.episodes)
      .sort((a, b) => a.airInstantUtcMs - b.airInstantUtcMs),
  };
}

/**
 * Episodes for the page: the whole rolling 28-day period.
 *
 * The full period is fetched regardless of which fortnight is on screen, so
 * paging the week offset re-uses the same cached TMDB responses instead of
 * issuing a differently-shaped request each time.
 */
export async function getPeriodEpisodes(now: Date = new Date()): Promise<Episode[]> {
  const window = getRollingWindow(0, now);
  const period = new Set(window.periodDayKeys);
  const { episodes } = await resolveFeedSelection(now);
  return episodes.filter((e) => period.has(e.londonDateKey));
}

/**
 * Episodes for the subscribable iCal feed: a longer forward span than the page
 * shows, so subscribers see beyond the on-screen period. The feed is never
 * navigated; it always runs forward from the current week.
 */
export async function getFeedEpisodes(now: Date = new Date()): Promise<Episode[]> {
  return (await resolveFeedSelection(now)).episodes;
}

/**
 * Season summaries for `/api/shows`, over the same forward span as the iCal
 * feed so both public feeds describe the same set of shows.
 *
 * Sorted by premiere date so a downstream table receives rows in the order the
 * seasons actually start, with undated seasons last. The dates reported are
 * whole-season, per `seasonAirDateRange`.
 */
export async function getFeedShowSeasons(now: Date = new Date()): Promise<ShowSeason[]> {
  return (await resolveFeedSelection(now)).seasons;
}
