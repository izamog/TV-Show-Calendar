import { buildCalendar } from "@/lib/ical";
import { getWindowEpisodes } from "@/lib/tmdb";

/**
 * Live iCal feed for the current rolling 14-day window.
 *
 * Subscribable from Google/Apple/Outlook calendars. Recomputed per request
 * (with TMDB responses cached upstream for an hour) so the window always
 * reflects the current week without a redeploy.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  try {
    const episodes = await getWindowEpisodes();
    const body = buildCalendar(episodes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="tv-next-14-days.ics"',
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[api/calendar] failed to build feed:", err);
    const message =
      err instanceof Error && err.message.startsWith("Missing TMDB credentials")
        ? err.message
        : "Failed to generate calendar feed.";
    return new Response(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
