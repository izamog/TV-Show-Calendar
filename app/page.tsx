import CalendarGrid from "@/components/CalendarGrid";
import CopyFeedButton from "@/components/CopyFeedButton";
import { formatColumnHeader, getRollingWindow, londonDateKey } from "@/lib/dates";
import { getWindowEpisodes } from "@/lib/tmdb";
import type { Episode } from "@/lib/types";

/**
 * The window depends on the current date and the episode data is fetched live,
 * so render on every request rather than prerendering at build time (which
 * would also require TMDB credentials to be present at build).
 */
export const dynamic = "force-dynamic";

function rangeLabel(startKey: string, endKey: string): string {
  const start = formatColumnHeader(startKey);
  const end = formatColumnHeader(endKey);
  return `${start.weekday} ${start.dayOfMonth} – ${end.weekday} ${end.dayOfMonth}`;
}

export default async function HomePage() {
  const window = getRollingWindow();
  const todayKey = londonDateKey(Date.now());

  let episodes: Episode[] = [];
  let error: string | null = null;
  try {
    episodes = await getWindowEpisodes();
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Failed to load episodes from TMDB.";
  }

  return (
    <main className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-50 sm:text-3xl">
            TV — Next 14 Days
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Scripted Season&nbsp;1 premieres &amp; early episodes ·{" "}
            {rangeLabel(window.startKey, window.endKey)} · times shown in London
            (BST/GMT)
          </p>
        </div>
        <CopyFeedButton />
      </header>

      {error ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-6 text-sm text-red-200">
          <p className="font-semibold">Couldn&apos;t load episodes.</p>
          <p className="mt-1 text-red-300/80">{error}</p>
          <p className="mt-3 text-red-300/60">
            Set <code className="font-mono">TMDB_API_KEY</code> (or{" "}
            <code className="font-mono">TMDB_READ_ACCESS_TOKEN</code>) in your
            environment and reload.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-neutral-500">
            {episodes.length} episode{episodes.length === 1 ? "" : "s"} in the
            window
          </p>
          <CalendarGrid
            dayKeys={window.dayKeys}
            episodes={episodes}
            todayKey={todayKey}
          />
        </>
      )}
    </main>
  );
}
