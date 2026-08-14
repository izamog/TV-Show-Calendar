"use client";

import Image from "next/image";
import { useState } from "react";
import { formatLondonTime } from "@/lib/dates";
import type { Episode } from "@/lib/types";

/**
 * A single episode card placed in its air-date cell.
 *
 * The season/episode number is surfaced as a designed segmented "S1 · E05" chip
 * over the artwork plus a Season 1 progress bar — not as a text prefix on the
 * title. (The terse `S01E01` code form is reserved for the iCal feed.)
 *
 * Series premieres (E01) get a glowing amber treatment so they stand out.
 *
 * Hovering — or focusing, see below — reveals the episode synopsis; for a series
 * premiere the show's own synopsis is included first, since there is no prior
 * episode to have introduced it.
 *
 * Accessibility (WCAG 2.1 AA, SC 1.4.13 "Content on Hover or Focus"):
 *   - The card is focusable and reveals the synopsis on keyboard focus too, so
 *     the content is not pointer-only.
 *   - Escape dismisses the overlay without moving focus, which is why this is a
 *     client component; hover/focus alone would be CSS-only.
 *   - The overlay stays in the DOM at `opacity-0`, so assistive tech can always
 *     reach the synopsis regardless of hover state.
 */
export default function EpisodeCard({ episode }: { episode: Episode }) {
  const [dismissed, setDismissed] = useState(false);

  const time = formatLondonTime(episode.airInstantUtcMs);
  const epNumber = `E${String(episode.episodeNumber).padStart(2, "0")}`;
  const seasonLabel = `S${episode.seasonNumber}`;
  const progress =
    episode.seasonEpisodeCount > 0
      ? Math.min(1, episode.episodeNumber / episode.seasonEpisodeCount)
      : 0;

  // The show synopsis appears in two cases: on a premiere, where it introduces
  // a series no earlier episode has, and as a fallback for any episode TMDB has
  // no synopsis for — common for unaired episodes, which often carry neither a
  // real title nor a description. Without the fallback those cards had nothing
  // to reveal and so showed no overlay at all.
  const showSynopsis =
    episode.isPremiere || !episode.episodeOverview ? episode.showOverview : null;
  const hasSynopsis = Boolean(showSynopsis || episode.episodeOverview);

  // Both chips put near-black text on a light fill: white on sky-500 measures
  // only 2.77:1, well under the 4.5:1 AA floor.
  const accent = episode.isPremiere
    ? { chip: "bg-amber-400 text-neutral-950", bar: "bg-amber-400" }
    : { chip: "bg-sky-400 text-neutral-950", bar: "bg-sky-400" };

  return (
    <article
      className={[
        "group relative overflow-hidden rounded-lg border bg-neutral-900 text-left shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950",
        episode.isPremiere
          ? "border-amber-400/70 animate-premiere-glow"
          : "border-neutral-800",
      ].join(" ")}
      // Focusable so the hover-revealed synopsis is reachable by keyboard.
      tabIndex={hasSynopsis ? 0 : undefined}
      data-dismissed={dismissed}
      onKeyDown={(e) => {
        if (e.key === "Escape" && hasSynopsis) setDismissed(true);
      }}
      onBlur={() => setDismissed(false)}
      onMouseLeave={() => setDismissed(false)}
    >
      <div className="relative aspect-video w-full bg-neutral-800">
        {episode.posterUrl ? (
          <Image
            src={episode.posterUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 14vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
            No artwork
          </div>
        )}

        {/* Bottom gradient so overlaid chips stay legible over any artwork. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-black/25" />

        {episode.isPremiere && (
          <span className="absolute left-1.5 top-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-neutral-950">
            Series Premiere
          </span>
        )}

        {/* Bottom-right, opposite the S1/E01 chip: at the larger accessible font
            size a top-right time badge collides with the premiere badge. */}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/85 px-1.5 py-1 text-xs font-semibold leading-none text-neutral-50 backdrop-blur">
          <span className="sr-only">Airs at </span>
          {time}
        </span>

        {/* Designed season/episode chip: muted season segment + accent episode segment. */}
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-stretch overflow-hidden rounded-md text-xs font-bold leading-none shadow-sm ring-1 ring-black/20">
          <span className="sr-only">
            Season {episode.seasonNumber}, episode {episode.episodeNumber}:{" "}
          </span>
          <span
            aria-hidden="true"
            className="flex items-center bg-black/85 px-1.5 py-1 text-neutral-100 backdrop-blur"
          >
            {seasonLabel}
          </span>
          <span aria-hidden="true" className={`flex items-center px-1.5 py-1 ${accent.chip}`}>
            {epNumber}
          </span>
        </span>
      </div>

      <div className="space-y-1.5 p-2.5">
        <span className="inline-block rounded bg-neutral-800 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-200">
          {episode.serviceName}
        </span>
        <h3 className="text-base font-semibold leading-snug text-neutral-50">
          {episode.showName}
        </h3>
        <p className="line-clamp-2 text-sm text-neutral-300">{episode.episodeName}</p>

        {/* Season 1 progress: this episode's position within the full season. */}
        <div className="pt-0.5">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-700"
            role="presentation"
          >
            <div
              className={`h-full rounded-full ${accent.bar}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs font-medium text-neutral-300">
            Episode {episode.episodeNumber} of {episode.seasonEpisodeCount}
          </p>
        </div>
      </div>

      {hasSynopsis && (
        <div
          className={[
            // Covers the whole card on hover/focus. Fully opaque: at 95% the
            // artwork and labels underneath bleed through and compete.
            "pointer-events-none absolute inset-0 z-20 hidden flex-col gap-1.5",
            "overflow-y-auto bg-neutral-950 p-2.5",
            "opacity-0 transition-opacity duration-150",
            "group-hover:pointer-events-auto group-hover:opacity-100",
            "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            // Escape sets this, hiding the overlay without moving focus.
            "group-data-[dismissed=true]:pointer-events-none group-data-[dismissed=true]:opacity-0",
            "lg:flex",
          ].join(" ")}
        >
          <h4 className="text-sm font-semibold leading-snug text-neutral-50">
            {episode.showName}
          </h4>

          {showSynopsis && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                About the show
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-200">
                {showSynopsis}
              </p>
            </div>
          )}

          {episode.episodeOverview && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
                {episode.episodeName}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-200">
                {episode.episodeOverview}
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
