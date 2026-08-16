import Link from "next/link";
import CalendarGrid from "@/components/CalendarGrid";
import CopyFeedButton from "@/components/CopyFeedButton";
import {
  formatFullDate,
  getRollingWindow,
  londonTodayKey,
  type RollingWindow,
} from "@/lib/dates";
import { getPeriodEpisodes } from "@/lib/tmdb";
import type { Episode } from "@/lib/types";

/**
 * The window depends on the current date and the episode data is fetched live,
 * so render on every request rather than prerendering at build time (which
 * would also require TMDB credentials to be present at build).
 */
export const dynamic = "force-dynamic";

/** Chevron for the week arrows. Rotated for the "earlier" direction. */
function Chevron({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 ${direction === "prev" ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * One week-stepping arrow. At the ends of the period it renders as a disabled
 * span rather than a link, so keyboard and screen-reader users aren't offered
 * a control that goes nowhere.
 */
function WeekArrow({
  direction,
  targetOffset,
  enabled,
}: {
  direction: "prev" | "next";
  targetOffset: number;
  enabled: boolean;
}) {
  const label = direction === "prev" ? "Show previous week" : "Show next week";
  // min-h/w-11 holds the 44px target (SC 2.5.5) even though the glyph is 16px.
  const base =
    "inline-flex h-11 w-11 items-center justify-center border-hair transition-colors duration-micro ease-out";

  if (!enabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={`${label} (unavailable)`}
        className={`${base} cursor-not-allowed border-rule bg-paper text-rule`}
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
      className={`${base} border-rule-strong bg-paper text-ink hover:bg-accent hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-y-px`}
    >
      <Chevron direction={direction} />
    </Link>
  );
}

/**
 * The week on screen: its dates, the feed link, the seven day columns, and the
 * arrows that step to the neighbouring week.
 *
 * One CSS grid holds all three so the arrows can be a single element that
 * changes position rather than two copies that take turns being hidden. Above
 * `lg` they are a rail to the right of the week, centred against its height;
 * below it, where a side rail has no room, `order` moves them to a right-aligned
 * row directly under the band.
 */
function WeekView({
  window,
  episodes,
  todayKey,
  error,
}: {
  window: RollingWindow;
  episodes: Episode[];
  todayKey: string;
  /** A TMDB failure replaces the week's columns; the dates and the arrows still
      work, since the window is computed from the clock and not from the fetch. */
  error: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="order-1 flex flex-col gap-md border-b-hair border-rule pb-md sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
        <h2 className="text-head leading-tight text-ink">
          {window.rangeLabel}
        </h2>
        <CopyFeedButton />
      </div>

      <div className="order-3 min-w-0 lg:order-2">
        {error ? (
          <div className="border-hair border-accent bg-paper-2 p-lg">
            <p className="font-display text-base text-ink">
              Couldn’t load episodes.
            </p>
            <p className="mt-2xs text-sm text-muted">{error}</p>
            <p className="mt-sm text-sm text-muted">
              Set <code className="font-mono text-xs">TMDB_API_KEY</code> (or{" "}
              <code className="font-mono text-xs">TMDB_READ_ACCESS_TOKEN</code>)
              in your environment and reload.
            </p>
          </div>
        ) : (
          <CalendarGrid
            dayKeys={window.visibleDayKeys}
            episodes={episodes}
            todayKey={todayKey}
          />
        )}
      </div>

      <div className="order-2 flex justify-end lg:order-3">
        {/* The rail stretches to the week's height, capped at one viewport, and
            centres the arrows inside itself. On a week that fits the screen
            that centre *is* the week's centre. On a taller one the cap plus
            `sticky` hold the rail to the viewport, so the arrows stay put
            instead of sitting at a midpoint far below the fold — `sticky` can
            only stop an element scrolling away, never pull a below-fold one up. */}
        <div className="flex gap-sm lg:sticky lg:top-0 lg:max-h-dvh lg:flex-col lg:justify-center">
          <WeekArrow
            direction="prev"
            targetOffset={window.earlierOffset}
            enabled={window.canGoEarlier}
          />
          <WeekArrow
            direction="next"
            targetOffset={window.laterOffset}
            enabled={window.canGoLater}
          />
        </div>
      </div>

      {/* Announce the visible week when the arrows swap it out. */}
      <p aria-live="polite" className="sr-only">
        Showing {window.rangeLabel}
      </p>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  // Next 15 made searchParams a Promise: it is request data, and awaiting it
  // is what lets the rest of the page prerender before the request arrives.
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  // An absent or malformed ?week lands on DEFAULT_WEEK_OFFSET — the week
  // containing today. A well-formed one is honoured, clamped into the period.
  const window = getRollingWindow(week);
  const todayKey = londonTodayKey();

  let episodes: Episode[] = [];
  let error: string | null = null;
  try {
    episodes = await getPeriodEpisodes();
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Failed to load episodes from TMDB.";
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* N6 newspaper masthead: dateline, wordmark, standfirst, double rule. */}
      <header className="px-md pt-lg text-center sm:px-lg lg:px-xl">
        <p className="tabular text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {formatFullDate(todayKey)}
        </p>
        {/* leading 1.02, not tighter: at 320px the wordmark wraps to two lines
            and a sub-1.0 line-height collides the second line's cap-tops with
            the first line's baseline. */}
        <h1 className="mt-2xs text-mast leading-[1.02] tracking-tight text-ink">
          TV Show Calendar
        </h1>
        <p className="mx-auto mt-xs max-w-[46ch] text-balance text-sm text-muted">
          Season premieres and early episodes. Seven days on the page,
          twenty-eight in the feed.
        </p>
        <div
          aria-hidden="true"
          className="mt-lg h-rule-double border-y-hair border-rule-strong"
        />
      </header>

      <main className="mx-auto w-full max-w-[110rem] flex-1 px-md py-lg sm:px-lg lg:px-xl">
        <WeekView
          window={window}
          episodes={episodes}
          todayKey={todayKey}
          error={error}
        />
      </main>

      {/* Ft4 dense colophon. Carries the TMDB attribution their terms require,
          which the page previously had nowhere to put. */}
      <footer className="mt-xl border-t-hair border-rule px-md py-lg sm:px-lg lg:px-xl">
        <p className="max-w-[72ch] font-mono text-xs leading-relaxed text-muted">
          TV Show Calendar — a rolling twenty-eight-day window, one week shown
          at a time, recomputed for Europe/London on every request. Episode data,
          artwork and synopses from TMDB; scores blended with IMDb ratings
          supplied by OMDb. This product uses the TMDB API but is not endorsed or
          certified by TMDB. Subscribe at{" "}
          <a
            href="/api/calendar"
            className="text-ink underline decoration-accent decoration-2 underline-offset-2 transition-colors duration-micro ease-out hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:text-accent"
          >
            /api/calendar
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
