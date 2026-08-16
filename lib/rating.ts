import type { Rating } from "./types";

/**
 * Audience scores: TMDB's own `vote_average` blended with IMDb's rating.
 *
 * TMDB's API does not expose IMDb ratings at all — it only carries the IMDb
 * *id* — so the IMDb half is fetched separately, from IMDb's own daily dataset
 * in `lib/imdb.ts`. Either half may be missing and the blend is built to say so
 * rather than fail. A missing rating is a normal state here, not an error —
 * most shows have not premiered when we first see them, and an unaired show
 * genuinely has nothing to average.
 */

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
