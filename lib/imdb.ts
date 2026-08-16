/**
 * IMDb series ratings, read from IMDb's own daily dataset.
 *
 * TMDB carries the IMDb *id* but never the IMDb *rating*, so the score has to
 * come from somewhere else. The obvious somewhere else is OMDb, and this module
 * used to be a call to it — but OMDb's title records lag IMDb by weeks and its
 * series-level aggregate is frequently absent altogether on a show that has
 * only just premiered. That is precisely the show this calendar is about: a
 * Season 1 opener two weeks old. Measured against a live feed, OMDb had no
 * rating for eighteen of twenty-two shows, and where it did answer it was
 * stale — 5.6 from 74 votes for a series IMDb itself scored 4.9 from 393.
 *
 * `title.ratings.tsv.gz` is IMDb's own publication of the same numbers, rebuilt
 * daily, keyed by the same `tt…` id TMDB already hands us, and needing no key
 * and no request budget. It is one file for every title rather than one request
 * per show, so it is fetched once and held.
 *
 * Everything here degrades rather than throws: an unreachable dataset, a
 * truncated download or an unrated title all produce `null` and leave a
 * TMDB-only score, never a blank calendar.
 */
import { MIN_IMDB_VOTES } from "./rating";

const RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";

/**
 * Generous by the standards of the rest of the codebase, because this is one
 * ~9MB download rather than a per-show API call, and it is amortised over every
 * show in the render.
 */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * How long a built index is trusted.
 *
 * IMDb rebuilds the dump once a day, so anything shorter re-downloads a file
 * that has not changed. Held per warm instance, not globally: a cold start
 * pays for the fetch again, which is the cost of not running a database.
 */
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;

export interface ImdbRating {
  rating: number;
  votes: number;
}

/**
 * Rating and vote count packed into one number, keyed by the numeric part of
 * the `tt…` id.
 *
 * The dump has ~1.7M titles and ~428k that clear the vote floor. A
 * `Map<string, {rating, votes}>` of those costs ~65MB resident for hours;
 * packing both fields into the number a `Map<number, number>` already stores
 * costs roughly a third of that, for two three-line helpers. Ratings are
 * published to one decimal (0.0–10.0, so under 1000 once scaled) and the
 * most-voted title on IMDb has ~3M votes, which keeps the product far inside
 * `Number.MAX_SAFE_INTEGER`.
 */
const VOTE_SCALE = 1000;

function pack(rating: number, votes: number): number {
  return votes * VOTE_SCALE + Math.round(rating * 10);
}

function unpack(packed: number): ImdbRating {
  return {
    rating: (packed % VOTE_SCALE) / 10,
    votes: Math.floor(packed / VOTE_SCALE),
  };
}

/**
 * Parse one `tconst\taverageRating\tnumVotes` row into the index.
 *
 * Silently ignores the header row, blank trailing lines and anything
 * malformed — one bad row in 1.7M must not cost the whole dataset.
 */
function addRow(index: Map<number, number>, line: string): void {
  if (!line.startsWith("tt")) return;

  const [tconst, rating, votes] = line.split("\t");
  const id = Number(tconst.slice(2));
  const score = Number(rating);
  const voteCount = Number(votes);
  if (!Number.isInteger(id) || !Number.isFinite(score) || !Number.isFinite(voteCount)) {
    return;
  }

  // Rows under the blend's floor can never be used, so keeping them would be
  // memory spent on rows we are contractually about to ignore. This is the one
  // place the index knows about the floor; see `combineRatings`.
  if (voteCount < MIN_IMDB_VOTES) return;

  index.set(id, pack(score, voteCount));
}

/**
 * Download and parse the dump, or null if it cannot be had.
 *
 * Streamed and decompressed incrementally rather than buffered: the file is
 * ~9MB compressed and ~25MB of text, and there is no reason to hold either in
 * full when the only thing kept is the index. `cache: "no-store"` because the
 * response is far past Next's 2MB data-cache entry limit — the TTL above is
 * the cache.
 */
async function buildIndex(): Promise<Map<number, number> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(RATINGS_URL, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok || !res.body) return null;

    const lines = res.body
      .pipeThrough(new DecompressionStream("gzip"))
      .pipeThrough(new TextDecoderStream()) as unknown as AsyncIterable<string>;

    const index = new Map<number, number>();
    // Chunk boundaries fall mid-row, so the tail of each chunk is carried into
    // the next rather than parsed as a row of its own.
    let carry = "";
    for await (const chunk of lines) {
      const rows = (carry + chunk).split("\n");
      carry = rows.pop() ?? "";
      for (const row of rows) addRow(index, row);
    }
    addRow(index, carry);

    // An empty index means a truncated or reshaped file, not a world without
    // ratings — treat it as a failure so the next call retries.
    return index.size > 0 ? index : null;
  } catch (err) {
    console.error("[imdb] ratings dataset unavailable:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let cached: { at: number; index: Promise<Map<number, number> | null> } | null = null;

/**
 * The index, built at most once per TTL per instance.
 *
 * The *promise* is cached rather than its result, so the dozens of shows a
 * single render resolves concurrently share one download instead of starting
 * dozens. A build that fails is evicted immediately: caching "no ratings" for
 * six hours would turn one bad minute into a rating-less afternoon.
 */
function loadIndex(): Promise<Map<number, number> | null> {
  const now = Date.now();
  if (cached && now - cached.at < INDEX_TTL_MS) return cached.index;

  const index = buildIndex();
  const entry = { at: now, index };
  cached = entry;
  void index.then((built) => {
    if (built === null && cached === entry) cached = null;
  });
  return index;
}

/**
 * A show's IMDb rating by IMDb id, or null if it cannot be had.
 *
 * Never throws: the caller is resolving a whole calendar and one unrated show
 * must not take the grid down with it. The id is a *series* id — IMDb rates
 * episodes separately and the dump carries both, so passing an episode id here
 * would silently answer with one episode's score in place of the show's.
 */
export async function fetchImdbRating(
  imdbId: string | null | undefined
): Promise<ImdbRating | null> {
  if (!imdbId?.startsWith("tt")) return null;

  const id = Number(imdbId.slice(2));
  if (!Number.isInteger(id)) return null;

  const index = await loadIndex();
  const packed = index?.get(id);
  return packed === undefined ? null : unpack(packed);
}
