import Link from "next/link";
import CalendarGrid from "@/components/CalendarGrid";
import CopyFeedButton from "@/components/CopyFeedButton";
import { getRollingWindow, londonDateKey } from "@/lib/dates";
import { getPeriodEpisodes } from "@/lib/tmdb";
import type { Episode } from "@/lib/types";

/**
 * The window depends on the current date and the episode data is fetched live,
 * so render on every request rather than prerendering at build time (which
 * would also require TMDB credentials to be present at build).
 */
export const dynamic = "force-dynamic";

/** Chevron for the week arrows. Rotated for the "earlier" direction. */
function Chevron({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 ${direction === "up" ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * One week-scroll arrow. At the ends of the period it renders as a disabled
 * span rather than a link, so keyboard and screen-reader users aren't offered
 * a control that goes nowhere.
 */
function WeekArrow({
  direction,
  targetOffset,
  enabled,
}: {
  direction: "up" | "down";
  targetOffset: number;
  enabled: boolean;
}) {
  const label = direction === "up" ? "Show previous week" : "Show next week";
  const base =
    "inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors";

  if (!enabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={`${label} (unavailable)`}
        className={`${base} cursor-not-allowed border-neutral-800 bg-neutral-950 text-neutral-600`}
      >
        <Chevron direction={direction} />
      </span>
    );
  }

  return (
    <Link
      href={`/?week=${targetOffset}`}
      aria-label={label}
      title={label}
      scroll={false}
      className={`${base} border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-900 hover:text-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950`}
    >
      <Chevron direction={direction} />
    </Link>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  // An absent or malformed ?week clamps to 0 — the current week.
  const window = getRollingWindow(searchParams.week);
  const todayKey = londonDateKey(Date.now());

  let episodes: Episode[] = [];
  let error: string | null = null;
  try {
    episodes = await getPeriodEpisodes();
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Failed to load episodes from TMDB.";
  }

  return (
    <main className="mx-auto max-w-[110rem] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-50 sm:text-4xl">
            TV Show Calendar
          </h1>
          <p className="mt-1 text-base text-neutral-300">
            Rolling four-week calendar of scripted Season&nbsp;1 premieres &amp;
            early episodes
          </p>
        </div>
        <CopyFeedButton />
      </header>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-col gap-1.5">
          <WeekArrow
            direction="up"
            targetOffset={window.earlierOffset}
            enabled={window.canGoEarlier}
          />
          <WeekArrow
            direction="down"
            targetOffset={window.laterOffset}
            enabled={window.canGoLater}
          />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-neutral-50 sm:text-2xl">
            {window.rangeLabel}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-300">
            Week {window.weekOffset + 1}–{window.weekOffset + 2} of 4 · showing
            14 of 28 days
          </p>
        </div>
      </div>

      {/* Announce the visible range when the arrows swap it out. */}
      <p aria-live="polite" className="sr-only">
        Showing {window.rangeLabel}
      </p>

      {error ? (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-6 text-base text-red-100">
          <p className="font-semibold">Couldn&apos;t load episodes.</p>
          <p className="mt-1 text-red-200">{error}</p>
          <p className="mt-3 text-red-200">
            Set <code className="font-mono">TMDB_API_KEY</code> (or{" "}
            <code className="font-mono">TMDB_READ_ACCESS_TOKEN</code>) in your
            environment and reload.
          </p>
        </div>
      ) : (
        <CalendarGrid
          dayKeys={window.visibleDayKeys}
          episodes={episodes}
          todayKey={todayKey}
        />
      )}
    </main>
  );
}
