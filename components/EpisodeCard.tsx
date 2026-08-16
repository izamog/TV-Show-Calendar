"use client";

import Image from "next/image";
import { useState } from "react";
import { formatLondonTime } from "@/lib/dates";
import { seasonProgress, synopsisFor } from "@/lib/episode";
import type { Episode } from "@/lib/types";

/**
 * The two treatments. There is one accent on this page, so a premiere is marked
 * *with* it and everything else is marked in ink — rather than the old pair of
 * competing hues, where a second colour spent on the ordinary case left the
 * premiere nothing louder to be.
 */
interface Accent {
  /** Fill + text for the episode-number segment of the S·E chip. */
  chip: string;
  /** Fill for the season-progress bar. */
  bar: string;
}

/**
 * Artwork panel: the still, the legibility gradient, and the two overlaid data
 * chips. Split out of EpisodeCard because it is a self-contained visual layer
 * with no state of its own.
 *
 * The premiere marker is *not* here — it is a printed flag above the artwork,
 * so it never has to compete with the image for legibility.
 */
function CardArtwork({
  episode,
  accent,
}: {
  episode: Episode;
  accent: Accent;
}) {
  const time = formatLondonTime(episode.airInstantUtcMs);
  const epNumber = `E${String(episode.episodeNumber).padStart(2, "0")}`;
  const seasonLabel = `S${episode.seasonNumber}`;

  return (
    <div className="relative aspect-video w-full bg-paper-3">
      {episode.posterUrl ? (
        <Image
          src={episode.posterUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 14vw"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.14em] text-muted">
          No artwork
        </div>
      )}

      {/* Bottom gradient so overlaid chips stay legible over any artwork. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-scrim from-5% to-transparent to-55%"
      />

      {/* Bottom-right, opposite the S1/E01 chip: at the larger accessible font
          size a top-right time badge collides with the chip's descenders. */}
      <span className="tabular absolute bottom-0 right-0 bg-scrim px-2xs py-3xs font-mono text-xs leading-none text-accent-ink">
        <span className="sr-only">Airs at </span>
        {time}
      </span>

      {/* Segmented season/episode chip: scrim season segment + filled episode
          segment. Mono because it is a code, not a word. */}
      <span className="tabular absolute bottom-0 left-0 inline-flex items-stretch font-mono text-xs font-bold leading-none">
        <span className="sr-only">
          Season {episode.seasonNumber}, episode {episode.episodeNumber}:{" "}
        </span>
        <span
          aria-hidden="true"
          className="flex items-center bg-scrim px-2xs py-3xs text-accent-ink"
        >
          {seasonLabel}
        </span>
        <span
          aria-hidden="true"
          className={`flex items-center px-2xs py-3xs ${accent.chip}`}
        >
          {epNumber}
        </span>
      </span>
    </div>
  );
}

/**
 * The blended TMDB + IMDb score, or nothing at all.
 *
 * Rendered only when a rating exists: most shows here have not premiered, and
 * an explicit "Unrated" chip on the majority of cards would read as a verdict
 * on the show rather than an absence of votes. The number carries a spoken
 * label because "8.4" beside a star is unambiguous visually and meaningless
 * read aloud in isolation.
 *
 * The accent measures 4.56:1 on `--color-paper-2`, past the 4.5:1 AA floor.
 */
function RatingBadge({ rating }: { rating: Episode["rating"] }) {
  if (rating.combined === null) return null;

  return (
    <span className="tabular inline-flex items-center gap-3xs font-mono text-xs font-bold text-accent">
      <span aria-hidden="true">★</span>
      <span className="sr-only">Rated </span>
      {rating.combined.toFixed(1)}
      <span className="sr-only"> out of 10</span>
    </span>
  );
}

/** Season progress: this episode's position within the full season. */
function SeasonProgress({
  episode,
  accent,
}: {
  episode: Episode;
  accent: Accent;
}) {
  const progress = seasonProgress(episode);

  return (
    <div className="pt-2xs">
      <div
        className="h-rule-double w-full overflow-hidden bg-rule"
        role="presentation"
      >
        <div
          className={`h-full ${accent.bar}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="tabular mt-2xs text-xs text-muted">
        Episode {episode.episodeNumber} of {episode.seasonEpisodeCount}
      </p>
    </div>
  );
}

/**
 * The hover/focus synopsis panel. Stays in the DOM at `opacity-0` rather than
 * unmounting, so assistive tech can always reach the text regardless of hover.
 */
function SynopsisOverlay({
  episode,
  showSynopsis,
}: {
  episode: Episode;
  showSynopsis: string | null;
}) {
  return (
    <div
      className={[
        // Covers the whole card on hover/focus. Fully opaque: at 95% the
        // artwork and labels underneath bleed through and compete.
        "pointer-events-none absolute inset-0 z-raised hidden flex-col gap-xs",
        "overflow-y-auto bg-paper p-sm",
        "opacity-0 transition-opacity duration-short ease-out",
        "group-hover:pointer-events-auto group-hover:opacity-100",
        "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        // Escape sets this, hiding the overlay without moving focus.
        "group-data-[dismissed=true]:pointer-events-none group-data-[dismissed=true]:opacity-0",
        "lg:flex",
      ].join(" ")}
    >
      <h4 className="font-display text-base leading-snug text-ink">
        {episode.showName}
      </h4>

      {/* The component scores, so the blended number can be read in context —
          a 9.0 from a handful of votes is a different claim to a 9.0 from
          forty thousand, and the overlay is where there is room to say so.

          Set in the body face rather than the mono: this is a sentence about
          the score, not a data chip, and the outlier is capped at two roles. */}
      {episode.rating.combined !== null && (
        <p className="tabular text-xs text-muted">
          <span className="font-semibold text-accent">
            {episode.rating.combined.toFixed(1)}
          </span>
          <span> / 10 </span>
          <span>
            (
            {[
              episode.rating.tmdb !== null &&
                `TMDB ${episode.rating.tmdb.toFixed(1)}`,
              episode.rating.imdb !== null &&
                `IMDb ${episode.rating.imdb.toFixed(1)}`,
            ]
              .filter(Boolean)
              .join(", ")}
            )
          </span>
        </p>
      )}

      {showSynopsis && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            About the show
          </p>
          <p className="mt-2xs text-sm leading-relaxed text-ink">
            {showSynopsis}
          </p>
        </div>
      )}

      {episode.episodeOverview && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {episode.episodeName}
          </p>
          <p className="mt-2xs text-sm leading-relaxed text-ink">
            {episode.episodeOverview}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A single episode card placed in its air-date cell.
 *
 * The season/episode number is surfaced as a segmented "S1 E05" code chip over
 * the artwork plus a season progress bar — not as a text prefix on the title.
 * (The terse `S01E01` code form is reserved for the iCal feed.)
 *
 * A premiere is marked by a filled accent flag across the top of the card. The
 * previous treatment was an infinitely-pulsing box-shadow: it animated a paint
 * property, ran forever with no `prefers-reduced-motion` escape, and on a grid
 * where a dozen cards can be premieres it made the page impossible to settle on.
 * A printed flag is louder and costs nothing to look at.
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

  const { showSynopsis, hasSynopsis } = synopsisFor(episode);

  // Paper-on-accent measures 4.97:1 and ink-on-paper 11.8:1; the reverse of
  // either — accent text on a paper chip at this size — would not clear AA.
  const accent: Accent = episode.isPremiere
    ? { chip: "bg-accent text-accent-ink", bar: "bg-accent" }
    : { chip: "bg-paper text-ink", bar: "bg-ink" };

  return (
    <article
      className={[
        "group relative overflow-hidden border-hair bg-paper-2 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        episode.isPremiere ? "border-accent" : "border-rule",
      ].join(" ")}
      // Focusable so the hover-revealed synopsis is reachable by keyboard.
      tabIndex={hasSynopsis ? 0 : undefined}
      data-dismissed={dismissed}
      onKeyDown={(e) => {
        if (e.key === "Escape" && hasSynopsis) setDismissed(true);
      }}
      onBlur={() => {
        setDismissed(false);
      }}
      onMouseLeave={() => {
        setDismissed(false);
      }}
    >
      {/* "Series premiere" only when it really is one. A favourited show
          contributes whichever season is currently airing, so episode 1 of its
          fourth season is a season premiere and saying otherwise would be a
          plain factual error on the card. */}
      {episode.isPremiere && (
        <p className="bg-accent px-2xs py-3xs text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">
          {episode.seasonNumber === 1 ? "Series premiere" : "Season premiere"}
        </p>
      )}

      <CardArtwork episode={episode} accent={accent} />

      <div className="flex flex-col gap-2xs p-sm">
        <div className="flex flex-wrap items-center gap-xs">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {episode.serviceName}
          </span>
          <RatingBadge rating={episode.rating} />
        </div>
        <h3 className="font-display text-base leading-snug text-ink">
          {episode.showName}
        </h3>
        <p className="line-clamp-2 text-sm text-muted">{episode.episodeName}</p>

        <SeasonProgress episode={episode} accent={accent} />
      </div>

      {hasSynopsis && (
        <SynopsisOverlay episode={episode} showSynopsis={showSynopsis} />
      )}
    </article>
  );
}
