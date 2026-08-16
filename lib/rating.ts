import type { Rating } from "./types";

/**
 * Audience scores: TMDB's own `vote_average` blended with IMDb's rating.
 *
 * TMDB's API does not expose IMDb ratings at all — it only carries the IMDb
 * *id* — so the IMDb half comes from OMDb, a free read-only mirror of IMDb's
 * public data. That is an extra network dependency on a 1,000-request daily
 * budget, so every part of this module is built to degrade rather than fail:
 * an unset key, a rate-limit, a timeout or an unrated show all produce a
 * partial or null rating, never an exception. A missing rating is a normal
 * state here, not an error — most shows have not premiered when we first see
 * them, and an unaired show genuinely has nothing to average.
 */

const OMDB_BASE = "https://www.omdbapi.com/";
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Minimum votes before a score is trusted.
 *
 * TMDB seeds a handful of votes on announced-but-unaired shows, and a 10.0 off
 * three votes would otherwise outrank a genuinely acclaimed series and win a
 * fill slot on noise. Applied per source, so a show with a real IMDb following
 * still rates even when TMDB has barely registered it.
 */
export const MIN_TMDB_VOTES = 20;
export const MIN_IMDB_VOTES = 100;

/** An unrated show — the honest answer for a series that has not aired. */
export const UNRATED: Rating = {
  combined: null,
  tmdb: null,
  imdb: null,
  voteCount: 0,
};

/** True when OMDb is configured. Unset is a supported deployment, not a fault. */
export function hasOmdbKey(): boolean {
  return Boolean(process.env.OMDB_API_KEY?.trim());
}

interface OmdbResponse {
  Response?: string;
  imdbRating?: string;
  imdbVotes?: string;
}

/**
 * Parse one of OMDb's stringly-typed numeric fields.
 *
 * OMDb returns everything as a string and uses the literal "N/A" for absent
 * values, including on shows that exist but have no rating yet. Votes arrive
 * comma-grouped ("12,345"), which `Number` alone reads as NaN.
 */
function parseOmdbNumber(value: string | undefined): number | null {
  if (!value || value === "N/A") return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Fetch a show's IMDb rating by IMDb id, or null if it cannot be had.
 *
 * Never throws: the caller is resolving a whole calendar and one unrated show
 * must not take the grid down with it.
 */
export async function fetchImdbRating(
  imdbId: string | null | undefined
): Promise<{ rating: number; votes: number } | null> {
  const apiKey = process.env.OMDB_API_KEY?.trim();
  if (!apiKey || !imdbId) return null;

  const url = new URL(OMDB_BASE);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      // Same hour-long revalidation as TMDB: ratings move slowly, and the
      // daily OMDb budget is small enough that re-asking per request would
      // exhaust it well before the cron did.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as OmdbResponse;
    // OMDb signals "no such title" with a 200 and Response:"False".
    if (data.Response === "False") return null;

    const rating = parseOmdbNumber(data.imdbRating);
    const votes = parseOmdbNumber(data.imdbVotes);
    if (rating === null || votes === null) return null;
    return { rating, votes };
  } catch (err) {
    console.error(`[omdb] rating lookup failed for ${imdbId}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Blend the two scores into one, weighted by how many people voted.
 *
 * A plain mean would let TMDB's much smaller electorate move the number as far
 * as IMDb's — on a typical show IMDb carries one to two orders of magnitude
 * more votes, so weighting by vote count is what makes the blend mean
 * "how well received", rather than "the average of two differently-sized
 * polls". When only one source clears its floor the answer is simply that
 * source, which is why this returns the component scores too.
 */
export function combineRatings(
  tmdb: { rating: number; votes: number } | null,
  imdb: { rating: number; votes: number } | null
): Rating {
  const usableTmdb = tmdb && tmdb.votes >= MIN_TMDB_VOTES ? tmdb : null;
  const usableImdb = imdb && imdb.votes >= MIN_IMDB_VOTES ? imdb : null;

  const sources = [usableTmdb, usableImdb].filter(
    (s): s is { rating: number; votes: number } => s !== null
  );
  if (sources.length === 0) return UNRATED;

  const voteCount = sources.reduce((sum, s) => sum + s.votes, 0);
  const weighted = sources.reduce((sum, s) => sum + s.rating * s.votes, 0);

  return {
    // One decimal is the precision both sources publish at; carrying more
    // would imply a resolution the inputs do not have.
    combined: Math.round((weighted / voteCount) * 10) / 10,
    tmdb: usableTmdb?.rating ?? null,
    imdb: usableImdb?.rating ?? null,
    voteCount,
  };
}
