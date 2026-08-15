import { getFeedShowSeasons } from "@/lib/tmdb";

/**
 * Season-level JSON feed, covering the same forward span as the iCal feed.
 *
 * Exists for automation rather than for humans: `/api/calendar` emits one entry
 * per episode, which is the wrong grain for a table that wants one row per
 * show. This returns a bare top-level array of season records, which is the
 * shape polling integrations (Zapier's "Retrieve Poll", Make's HTTP module)
 * expect — they treat each array element as one item and dedupe on `id`.
 *
 * Cached at the CDN for an hour like the calendar feed, since a poller hitting
 * it every few minutes must not translate into TMDB traffic every few minutes.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  try {
    const seasons = await getFeedShowSeasons();
    return Response.json(seasons, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[api/shows] failed to build feed:", err);
    const message =
      err instanceof Error && err.message.startsWith("Missing TMDB credentials")
        ? err.message
        : "Failed to generate show feed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
