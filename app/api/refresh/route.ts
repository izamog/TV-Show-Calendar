import {
  readAirtableConfig,
  syncShowSeasons,
  type SyncResult,
} from "@/lib/airtable";
import { getFeedEpisodes, getFeedShowSeasons } from "@/lib/tmdb";

/**
 * Cron target that forces the TMDB data to refresh.
 *
 * Why this exists rather than pointing the cron at `/api/calendar`: that route
 * sets `s-maxage=3600`, so a scheduled request could be answered by the CDN
 * without the origin function ever running — the TMDB cache would never
 * revalidate and the cron would silently do nothing. This route is explicitly
 * uncacheable, so it always executes.
 *
 * Calling `getFeedEpisodes()` re-runs every TMDB request behind Next's Data
 * Cache, which is shared across the deployment — so this warms the exact same
 * cached responses the page and the `.ics` feed read, picking up new shows,
 * new episodes, and changed titles/air dates/synopses.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  // Vercel sends `Authorization: Bearer $CRON_SECRET` when that env var is set.
  // Optional: without it the endpoint stays open, which is harmless (it only
  // refreshes a cache) but leaves TMDB quota exposed to casual abuse.
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const episodes = await getFeedEpisodes();

    // Push the season feed to Airtable in the same run. The cron is already
    // awake and the TMDB responses are already warm, so this costs one extra
    // set of Airtable writes rather than a second scheduled job — and keeps the
    // sync off any third-party automation service's task quota.
    const airtableConfig = readAirtableConfig();
    let airtable: SyncResult | null = null;
    if (airtableConfig) {
      const seasons = await getFeedShowSeasons();
      airtable = await syncShowSeasons(seasons, airtableConfig);
    }

    const body = {
      ok: true,
      refreshedAt: new Date().toISOString(),
      episodeCount: episodes.length,
      // null when Airtable credentials are not configured, which is a valid
      // deployment rather than a failure.
      airtable,
      durationMs: Date.now() - startedAt,
    };
    console.log("[api/refresh]", JSON.stringify(body));
    return Response.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/refresh] failed:", err);
    const message =
      err instanceof Error ? err.message : "Failed to refresh episode data.";
    return Response.json(
      { ok: false, error: message, durationMs: Date.now() - startedAt },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
