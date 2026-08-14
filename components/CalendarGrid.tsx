import EpisodeCard from "./EpisodeCard";
import { formatColumnHeader } from "@/lib/dates";
import type { Episode } from "@/lib/types";

/**
 * The rolling 14-day grid: two Monday–Sunday rows (7 columns each), top row
 * anchored to the Monday of the current London week. Each episode is rendered
 * in the cell matching its London air date.
 */
export default function CalendarGrid({
  dayKeys,
  episodes,
  todayKey,
}: {
  dayKeys: string[];
  episodes: Episode[];
  todayKey: string;
}) {
  const byDay = new Map<string, Episode[]>();
  for (const key of dayKeys) byDay.set(key, []);
  for (const ep of episodes) {
    byDay.get(ep.londonDateKey)?.push(ep);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {dayKeys.map((dayKey) => {
        const { weekday, dayOfMonth } = formatColumnHeader(dayKey);
        const dayEpisodes = byDay.get(dayKey) ?? [];
        const isToday = dayKey === todayKey;

        return (
          <div
            key={dayKey}
            className={[
              "flex min-h-[7rem] flex-col rounded-xl border p-2",
              isToday
                ? "border-sky-500/60 bg-sky-500/5"
                : "border-neutral-800 bg-neutral-950",
            ].join(" ")}
          >
            <div className="mb-2 flex items-baseline justify-between px-0.5">
              <span
                className={[
                  "text-xs font-semibold uppercase tracking-wide",
                  isToday ? "text-sky-400" : "text-neutral-400",
                ].join(" ")}
              >
                {weekday}
              </span>
              <span
                className={[
                  "text-sm font-bold",
                  isToday ? "text-sky-300" : "text-neutral-500",
                ].join(" ")}
              >
                {dayOfMonth}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {dayEpisodes.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-4 text-[11px] text-neutral-700">
                  —
                </div>
              ) : (
                dayEpisodes.map((ep) => <EpisodeCard key={ep.id} episode={ep} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
