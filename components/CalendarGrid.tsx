import EpisodeCard from "./EpisodeCard";
import { formatColumnHeader, formatFullDate } from "@/lib/dates";
import { groupByShow } from "@/lib/grouping";
import type { Episode } from "@/lib/types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The visible two-week slice of the rolling period: two Monday–Sunday rows of
 * seven. Each episode is rendered in the cell matching its London air date.
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
    <div>
      {/* Weekday header — the stacked layout on small screens labels each cell
          individually instead, so this row is desktop-only. */}
      <div className="hidden grid-cols-7 gap-3 pb-2 lg:grid" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-1 text-sm font-semibold uppercase tracking-wider text-neutral-300"
          >
            {label}
          </div>
        ))}
      </div>

      <ul className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-7">
        {dayKeys.map((dayKey) => {
          const { weekday, dayOfMonth } = formatColumnHeader(dayKey);
          const dayEpisodes = byDay.get(dayKey) ?? [];
          const groups = groupByShow(dayEpisodes);
          const isToday = dayKey === todayKey;

          return (
            <li
              key={dayKey}
              aria-label={formatFullDate(dayKey) + (isToday ? " (today)" : "")}
              className={[
                "flex min-h-[7rem] flex-col rounded-xl border p-2",
                isToday
                  ? "border-sky-400 bg-sky-500/10"
                  : "border-neutral-800 bg-neutral-950",
              ].join(" ")}
            >
              <div className="mb-2 flex items-baseline justify-between px-0.5">
                <span
                  aria-hidden="true"
                  className={[
                    "text-sm font-semibold uppercase tracking-wide lg:hidden",
                    isToday ? "text-sky-200" : "text-neutral-300",
                  ].join(" ")}
                >
                  {weekday}
                </span>
                <span
                  aria-hidden="true"
                  className={[
                    "text-base font-bold lg:ml-auto",
                    isToday ? "text-sky-200" : "text-neutral-300",
                  ].join(" ")}
                >
                  {dayOfMonth}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {groups.length === 0 ? (
                  // No visible glyph: a decorative dash here could not meet the
                  // 4.5:1 contrast floor without becoming visually noisy.
                  <p className="sr-only">No episodes</p>
                ) : (
                  groups.map((group) => (
                    <div key={group.showId} className="flex flex-col gap-2">
                      {group.shown.map((ep) => (
                        <EpisodeCard key={ep.id} episode={ep} />
                      ))}
                      {group.hiddenCount > 0 && (
                        <p className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm font-medium text-neutral-200">
                          and {group.hiddenCount} more episode
                          {group.hiddenCount === 1 ? "" : "s"}
                          <span className="sr-only"> of {group.showName}</span>
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
