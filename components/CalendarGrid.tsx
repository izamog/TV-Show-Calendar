import EpisodeCard from "./EpisodeCard";
import { formatColumnHeader, formatFullDate } from "@/lib/dates";
import { groupByShow } from "@/lib/grouping";
import type { Episode } from "@/lib/types";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The visible week of the rolling period: one Monday–Sunday row of seven. Each
 * episode is rendered in the cell matching its London air date.
 *
 * Day cells carry no border of their own — a rule above the numeral is the
 * whole frame. Boxing each day and then boxing each card inside it is
 * card-in-card, and it was flattening the one distinction the grid needs to
 * make: which cells have something in them.
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
      <div
        className="hidden grid-cols-7 gap-md pb-2xs lg:grid"
        aria-hidden="true"
      >
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-muted"
          >
            {label}
          </div>
        ))}
      </div>

      <ul className="grid list-none grid-cols-1 gap-lg p-0 sm:grid-cols-2 lg:grid-cols-7 lg:gap-md">
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
                "flex min-h-[6rem] flex-col border-t-strong pt-xs",
                isToday ? "border-accent" : "border-rule",
              ].join(" ")}
            >
              <div className="mb-sm flex items-baseline gap-xs">
                <span
                  aria-hidden="true"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted lg:hidden"
                >
                  {weekday}
                </span>
                <span
                  aria-hidden="true"
                  className={[
                    "tabular font-display text-base leading-none",
                    isToday ? "text-accent" : "text-ink",
                  ].join(" ")}
                >
                  {dayOfMonth}
                </span>
                {isToday && (
                  <span
                    aria-hidden="true"
                    className="ml-auto text-xs font-semibold uppercase tracking-[0.14em] text-accent"
                  >
                    Today
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-sm">
                {groups.length === 0 ? (
                  // No visible glyph: a decorative dash here could not meet the
                  // 4.5:1 contrast floor without becoming visually noisy.
                  <p className="sr-only">No episodes</p>
                ) : (
                  groups.map((group) => (
                    <div key={group.showId} className="flex flex-col gap-sm">
                      {group.shown.map((ep) => (
                        <EpisodeCard key={ep.id} episode={ep} />
                      ))}
                      {group.hiddenCount > 0 && (
                        <p className="border-t-hair border-rule pt-2xs text-xs text-muted">
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
