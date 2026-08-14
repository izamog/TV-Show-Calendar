import Image from "next/image";
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
 */
export default function EpisodeCard({ episode }: { episode: Episode }) {
  const time = formatLondonTime(episode.airInstantUtcMs);
  const epNumber = `E${String(episode.episodeNumber).padStart(2, "0")}`;
  const seasonLabel = `S${episode.seasonNumber}`;
  const progress =
    episode.seasonEpisodeCount > 0
      ? Math.min(1, episode.episodeNumber / episode.seasonEpisodeCount)
      : 0;

  // Amber accent for premieres, sky for everything else.
  const accent = episode.isPremiere
    ? { chip: "bg-amber-400 text-neutral-950", bar: "bg-amber-400" }
    : { chip: "bg-sky-500 text-white", bar: "bg-sky-500" };

  return (
    <article
      className={[
        "group relative overflow-hidden rounded-lg border bg-neutral-900 text-left shadow-sm",
        episode.isPremiere
          ? "border-amber-400/70 animate-premiere-glow"
          : "border-neutral-800",
      ].join(" ")}
    >
      <div className="relative aspect-video w-full bg-neutral-800">
        {episode.posterUrl ? (
          <Image
            src={episode.posterUrl}
            alt={`${episode.showName} — ${episode.episodeName}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 14vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
            No artwork
          </div>
        )}

        {/* Bottom gradient so overlaid chips stay legible over any artwork. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-black/25" />

        {episode.isPremiere && (
          <span className="absolute left-1.5 top-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-950">
            Series Premiere
          </span>
        )}

        <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-100 backdrop-blur">
          {time}
        </span>

        {/* Designed season/episode chip: muted season segment + accent episode segment. */}
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-stretch overflow-hidden rounded-md text-[11px] font-bold leading-none shadow-sm ring-1 ring-black/20">
          <span className="flex items-center bg-black/75 px-1.5 py-1 text-neutral-200 backdrop-blur">
            {seasonLabel}
          </span>
          <span className={`flex items-center px-1.5 py-1 ${accent.chip}`}>
            {epNumber}
          </span>
        </span>
      </div>

      <div className="space-y-1.5 p-2.5">
        <span className="inline-block rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-300">
          {episode.serviceName}
        </span>
        <h3 className="text-sm font-semibold leading-snug text-neutral-50">
          {episode.showName}
        </h3>
        <p className="line-clamp-2 text-xs text-neutral-400">
          {episode.episodeName}
        </p>

        {/* Season 1 progress: this episode's position within the full season. */}
        <div className="pt-0.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full rounded-full ${accent.bar}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] font-medium text-neutral-500">
            Episode {episode.episodeNumber} of {episode.seasonEpisodeCount}
          </p>
        </div>
      </div>
    </article>
  );
}
