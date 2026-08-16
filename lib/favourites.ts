import {
  tmdbGet,
  type TmdbAccount,
  type TmdbAuth,
  type TmdbFavouritesResponse,
  type TmdbShowDetails,
} from "./tmdb-client";

/**
 * The shows the calendar's owner has favourited on TMDB, and which of their
 * seasons is worth fetching.
 *
 * The calendar is otherwise a feed of *new* series, so on its own it would
 * never mention that a show you already follow is back. Favourites are the
 * answer, and they are deliberately a separate source rather than a relaxation
 * of the network allowlist: Discover would surface almost none of them, because
 * they are typically past their first season, on a network nobody added, or
 * both.
 */

/**
 * Pages of TMDB favourites to read. TMDB pages these 20 at a time, so this is a
 * 200-show ceiling on a personal favourites list — generous, and it stops a
 * runaway account from turning one page render into hundreds of requests.
 */
const FAVOURITE_PAGES = 10;

/**
 * TMDB ids of the shows the calendar's owner has favourited.
 *
 * No new credential is needed. TMDB's v4 read access token authenticates as the
 * account that issued it, so `/account` yields that account's id and the v3
 * favourites endpoint accepts the same bearer — the v3 `api_key` + `session_id`
 * approval dance the API docs describe is only for third-party apps acting on
 * someone else's behalf. A v3-key-only install has no account to read, which is
 * one of the reasons this degrades quietly.
 *
 * Never throws. An unfavourited, misconfigured, or unreachable account yields
 * an empty list and the calendar carries on as the network-allowlist feed it
 * was before — a personal extra must not be able to break a public page.
 */
export async function getFavouriteShowIds(auth: TmdbAuth): Promise<Set<number>> {
  const ids = new Set<number>();
  if (!auth.bearer) return ids; // v3 api_key alone identifies an app, not a user.

  try {
    const account = await tmdbGet<TmdbAccount>("/account", {}, auth);
    for (let page = 1; page <= FAVOURITE_PAGES; page++) {
      const data = await tmdbGet<TmdbFavouritesResponse>(
        `/account/${account.id}/favorite/tv`,
        { language: "en-US", page: String(page) },
        auth
      );
      for (const r of data.results ?? []) ids.add(r.id);
      if (data.total_pages !== undefined && page >= data.total_pages) break;
    }
  } catch (err) {
    console.error("[tmdb] favourites unavailable, continuing without them:", err);
    return new Set<number>();
  }
  return ids;
}

/**
 * Which seasons of a show could have an episode inside the queried range.
 *
 * For an ordinary discovered show the answer is always `[1]` — the calendar is
 * a feed of new series, and a show with a second season has already been
 * filtered out by `isReturningSeries`.
 *
 * For a favourite it is whichever season is actually running, which TMDB hands
 * over directly: `last_episode_to_air` and `next_episode_to_air` each name their
 * season, and between them they cover the only two cases that matter — a season
 * mid-run, and a range straddling the gap between one season's finale and the
 * next season's premiere. Reading those two beats scanning `seasons[]` by date,
 * because a season summary carries only its *first* air date and so cannot tell
 * you whether the season is still running.
 *
 * Season 0 is TMDB's specials bucket and is never a season the calendar means.
 * The fallback to the last real season keeps a favourite whose episodes are all
 * in the past (nothing "next", nothing recently aired) from resolving to
 * nothing at all.
 */
export function candidateSeasonNumbers(
  details: TmdbShowDetails,
  isFavourite: boolean
): number[] {
  if (!isFavourite) return [1];

  const fromAiring = [
    details.last_episode_to_air?.season_number,
    details.next_episode_to_air?.season_number,
  ].filter((n): n is number => typeof n === "number" && n > 0);

  if (fromAiring.length > 0) {
    return [...new Set(fromAiring)].sort((a, b) => a - b);
  }

  const real = (details.seasons ?? [])
    .map((s) => s.season_number)
    .filter((n) => n > 0);
  return real.length > 0 ? [Math.max(...real)] : [1];
}
