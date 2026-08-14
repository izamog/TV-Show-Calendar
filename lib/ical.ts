import { formatIcsUtc } from "./dates";
import type { Episode } from "./types";

/**
 * Build an RFC 5545 `text/calendar` feed from the window episodes.
 *
 * Times are emitted as UTC (`...Z`) computed from the exact air instant, which
 * is an unambiguous representation of the moment: calendar apps localise it to
 * the viewer's zone and fire notifications at the true air time regardless of
 * where the subscriber is. Each VEVENT summary is strictly `S01EXX Show Name`.
 */

/** Default on-screen block length for an episode, in minutes. */
const EVENT_DURATION_MINUTES = 60;
const PRODID = "-//tv-shows-tracker//Rolling 14-day TV//EN";

/** Escape a value for an ICS text field per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line to <=75 octets with CRLF + single-space continuation. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(" " + rest);
  return chunks.join("\r\n");
}

export function buildCalendar(episodes: Episode[], dtstampMs: number = Date.now()): string {
  const dtstamp = formatIcsUtc(dtstampMs);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TV — Next 14 Days",
    "X-WR-TIMEZONE:Europe/London",
  ];

  for (const ep of episodes) {
    const start = ep.airInstantUtcMs;
    const end = start + EVENT_DURATION_MINUTES * 60_000;
    const summary = `${ep.code} ${ep.showName}`;
    const description = `${ep.episodeName} · ${ep.serviceName} · ${ep.seasonEpisodeCount} episodes in Season 1`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${ep.id}@tv-shows-tracker`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatIcsUtc(start)}`,
      `DTEND:${formatIcsUtc(end)}`,
      foldLine(`SUMMARY:${escapeText(summary)}`),
      foldLine(`DESCRIPTION:${escapeText(description)}`),
      foldLine(`LOCATION:${escapeText(ep.serviceName)}`),
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
