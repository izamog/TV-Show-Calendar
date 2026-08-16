/**
 * The TMDB wire layer: credentials, the HTTP call, bounded concurrency, and the
 * response shapes.
 *
 * Split from lib/tmdb.ts so that "how we talk to TMDB" is separable from "which
 * shows qualify and how they become rows". It also breaks what would otherwise
 * be an import cycle: lib/favourites.ts needs the fetch helper and the show
 * shape, while lib/tmdb.ts needs the favourites — with both depending on this
 * module instead, the graph stays a DAG.
 *
 * Only the fields the app actually reads are declared on the response types;
 * TMDB returns a great deal more.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const REQUEST_TIMEOUT_MS = 10_000;

export interface TmdbAuth {
  /** Bearer token for the Authorization header (v4), if configured. */
  bearer?: string;
  /** api_key query param (v3), if configured. */
  apiKey?: string;
}

/** Read TMDB credentials from the environment; the v4 bearer wins when both are set. */
export function readAuth(): TmdbAuth {
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
export async function tmdbGet<T>(
  path: string,
  params: Record<string, string>,
  auth: TmdbAuth
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!auth.bearer && auth.apiKey) url.searchParams.set("api_key", auth.apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
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
export async function mapWithConcurrency<I, O>(
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

export interface DiscoverResult {
  id: number;
  genre_ids?: number[];
  original_language?: string;
}
export interface DiscoverResponse {
  results?: DiscoverResult[];
  total_pages?: number;
}
export interface TmdbNetwork {
  id: number;
  name: string;
}
/** The shape of `/account` — we only need the numeric id for the favourites path. */
export interface TmdbAccount {
  id: number;
}
export interface TmdbFavouritesResponse {
  results?: { id: number }[];
  total_pages?: number;
}
/** An entry in `/tv/{id}.seasons[]`. Season 0 is TMDB's specials bucket. */
interface TmdbSeasonSummary {
  season_number: number;
  episode_count?: number;
  air_date?: string | null;
}
/** `/tv/{id}.last_episode_to_air` / `.next_episode_to_air`. */
interface TmdbEpisodeStub {
  season_number?: number;
}
export interface TmdbShowDetails {
  id: number;
  name: string;
  original_language?: string;
  overview?: string | null;
  /** "Scripted" | "Miniseries" | "Documentary" | "News" | "Reality" | "Talk Show" | "Video". */
  type?: string | null;
  /** Seasons aired so far. > 1 means the show is not a new series. */
  number_of_seasons?: number | null;
  genres?: { id: number; name: string }[];
  networks?: TmdbNetwork[];
  /** TMDB's own audience score, 0–10, and how many votes produced it. */
  vote_average?: number | null;
  vote_count?: number | null;
  /** Present because we request `append_to_response=keywords`. */
  keywords?: { results?: { id: number; name: string }[] };
  /**
   * Present because we request `append_to_response=external_ids`. The IMDb id
   * is the only route to an IMDb rating — TMDB carries the id but never the
   * score — and appending it costs nothing over the `/tv/{id}` call we already
   * make, where a separate `/external_ids` request would double that traffic.
   */
  external_ids?: { imdb_id?: string | null };
  /** Every season TMDB lists, including the specials bucket at season 0. */
  seasons?: TmdbSeasonSummary[];
  /** The most recently aired / next scheduled episode, each naming its season. */
  last_episode_to_air?: TmdbEpisodeStub | null;
  next_episode_to_air?: TmdbEpisodeStub | null;
}
interface TmdbSeasonEpisode {
  episode_number: number;
  name?: string;
  overview?: string | null;
  air_date?: string | null;
  still_path?: string | null;
}
export interface TmdbSeasonDetails {
  episodes?: TmdbSeasonEpisode[];
  poster_path?: string | null;
}
