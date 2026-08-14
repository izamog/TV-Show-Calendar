import {
  ALLOWED_NETWORK_IDS_OR,
  ALLOWED_SERVICE_BY_ID,
  EXCLUDED_GENRE_IDS,
  EXCLUDED_GENRE_IDS_CSV,
  TMDB_IMAGE_BASE,
} from "./config";
import {
  getRollingWindow,
  londonDateKey,
  resolveAirInstantUtcMs,
} from "./dates";
import type { Episode, ServiceKind } from "./types";

/**
 * TMDB data-fetching + processing layer.
 *
 * Produces the fully-resolved `Episode[]` for the current rolling 14-day window.
 * The window and timezone logic live in lib/dates.ts so both this module's
 * callers (the page and the iCal endpoint) share identical semantics.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const REQUEST_TIMEOUT_MS = 10_000;
/** How many Discover pages to sweep. 2 pages ≈ 40 candidate shows. */
const DISCOVER_PAGES = 2;
/** Bound outbound concurrency so we never hammer TMDB with 40 parallel calls. */
const CONCURRENCY = 6;
/**
 * Look back this many days before the window when discovering shows, so a
 * series that premiered shortly before the window but is still airing early
 * Season 1 episodes inside it is not missed. Discover filters on first_air_date.
 */
const DISCOVER_LOOKBACK_DAYS = 21;

interface TmdbAuth {
  /** Bearer token for the Authorization header (v4), if configured. */
  bearer?: string;
  /** api_key query param (v3), if configured. */
  apiKey?: string;
}

function readAuth(): TmdbAuth {
  const bearer = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!bearer && !apiKey) {
    throw new Error(
      "Missing TMDB credentials: set TMDB_READ_ACCESS_TOKEN (v4) or TMDB_API_KEY (v3)."
    );
  }
  return { bearer: bearer || undefined, apiKey: apiKey || undefined };
}

/** GET a TMDB endpoint with auth, a timeout, and meaningful error context. */
async function tmdbGet<T>(
  path: string,
  params: Record<string, string>,
  auth: TmdbAuth
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!auth.bearer && auth.apiKey) url.searchParams.set("api_key", auth.apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: auth.bearer
        ? { Authorization: `Bearer ${auth.bearer}`, Accept: "application/json" }
        : { Accept: "application/json" },
      // Cache TMDB responses for an hour; the window only changes daily.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `TMDB ${path} responded ${res.status} ${res.statusText}: ${body.slice(0, 200)}`
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`TMDB ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Run tasks with bounded concurrency, preserving input order in the result. */
async function mapWithConcurrency<I, O>(
  items: I[],
  limit: number,
  worker: (item: I, index: number) => Promise<O>
): Promise<O[]> {
  const results = new Array<O>(items.length);
  let cursor = 0;
  async function runner(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
  await Promise.all(runners);
  return results;
}

// --- TMDB response shapes (only the fields we use) ---

interface DiscoverResult {
  id: number;
  genre_ids?: number[];
  original_language?: string;
}
interface DiscoverResponse {
  results?: DiscoverResult[];
  total_pages?: number;
}
interface TmdbNetwork {
  id: number;
  name: string;
}
interface TmdbShowDetails {
  id: number;
  name: string;
  original_language?: string;
  genres?: { id: number; name: string }[];
  networks?: TmdbNetwork[];
}
interface TmdbSeasonEpisode {
  episode_number: number;
  name?: string;
  air_date?: string | null;
  still_path?: string | null;
}
interface TmdbSeasonDetails {
  episodes?: TmdbSeasonEpisode[];
  poster_path?: string | null;
}

/** ISO date `YYYY-MM-DD` shifted by whole days from a day key. */
function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map((n) => Number(n));
  const shifted = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Choose the primary allowed service for a show. A show can carry several
 * networks; we pick the first that is in our allowlist so the badge is stable.
 */
function pickPrimaryService(
  networks: TmdbNetwork[] | undefined
): { name: string; kind: ServiceKind } | null {
  if (!networks) return null;
  for (const n of networks) {
    const allowed = ALLOWED_SERVICE_BY_ID.get(n.id);
    if (allowed) return { name: allowed.displayName, kind: allowed.kind };
  }
  return null;
}

function isScripted(details: TmdbShowDetails): boolean {
  if (!details.genres) return true; // absence of an excluded genre => keep
  return !details.genres.some((g) => EXCLUDED_GENRE_IDS.includes(g.id));
}

/**
 * Fetch, filter, and resolve every Season 1 episode airing inside the current
 * rolling 14-day window on an allowed English-language scripted show.
 *
 * Returns episodes sorted by air instant. Never throws for a single bad show —
 * per-show failures are logged and skipped so one outage cannot blank the grid.
 */
export async function getWindowEpisodes(now: Date = new Date()): Promise<Episode[]> {
  const auth = readAuth();
  const window = getRollingWindow(now);
  const windowDays = new Set(window.dayKeys);

  const discoverGte = shiftDayKey(window.startKey, -DISCOVER_LOOKBACK_DAYS);
  const discoverLte = window.endKey;

  // 1) Discover candidate shows across the allowed networks.
  const candidateIds = new Set<number>();
  for (let page = 1; page <= DISCOVER_PAGES; page++) {
    const data = await tmdbGet<DiscoverResponse>(
      "/discover/tv",
      {
        include_adult: "false",
        include_null_first_air_dates: "false",
        language: "en-US",
        with_original_language: "en",
        with_networks: ALLOWED_NETWORK_IDS_OR,
        without_genres: EXCLUDED_GENRE_IDS_CSV,
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

  // 2) For each candidate, resolve details + Season 1 episodes in the window.
  const perShow = await mapWithConcurrency(
    Array.from(candidateIds),
    CONCURRENCY,
    async (showId): Promise<Episode[]> => {
      try {
        const details = await tmdbGet<TmdbShowDetails>(
          `/tv/${showId}`,
          { language: "en-US" },
          auth
        );

        // Re-verify the constraints Discover can be loose about.
        if (details.original_language && details.original_language !== "en") return [];
        if (!isScripted(details)) return [];
        const service = pickPrimaryService(details.networks);
        if (!service) return [];

        const season = await tmdbGet<TmdbSeasonDetails>(
          `/tv/${showId}/season/1`,
          { language: "en-US" },
          auth
        );
        const episodes = season.episodes ?? [];
        const seasonEpisodeCount = episodes.length;

        const out: Episode[] = [];
        for (const ep of episodes) {
          if (!ep.air_date) continue;
          const airInstantUtcMs = resolveAirInstantUtcMs(ep.air_date, service.kind);
          const dateKey = londonDateKey(airInstantUtcMs);
          if (!windowDays.has(dateKey)) continue;

          const code = `S01E${String(ep.episode_number).padStart(2, "0")}`;
          const posterPath = ep.still_path ?? season.poster_path ?? null;

          out.push({
            id: `${showId}-${code}`,
            showId,
            showName: details.name,
            episodeName: ep.name?.trim() || `Episode ${ep.episode_number}`,
            seasonNumber: 1,
            episodeNumber: ep.episode_number,
            code,
            seasonEpisodeCount,
            posterUrl: posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null,
            serviceName: service.name,
            serviceKind: service.kind,
            airInstantUtcMs,
            londonDateKey: dateKey,
            isPremiere: ep.episode_number === 1,
          });
        }
        return out;
      } catch (err) {
        console.error(`[tmdb] skipping show ${showId}:`, err);
        return [];
      }
    }
  );

  return perShow.flat().sort((a, b) => a.airInstantUtcMs - b.airInstantUtcMs);
}
