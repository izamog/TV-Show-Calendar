import type { ShowSeason } from "./types";

/**
 * Pushes the season feed into an Airtable table.
 *
 * Runs from the daily cron rather than a third-party automation service: the
 * cron already wakes to refresh TMDB, so syncing in the same run needs no extra
 * infrastructure, no per-task quota, and no second Airtable authorisation to
 * keep pointed at the right account.
 */

const AIRTABLE_API = "https://api.airtable.com/v0";
/** Airtable accepts at most 10 records per create/update request. */
const BATCH_SIZE = 10;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Field ids in the destination table.
 *
 * Ids rather than names because Airtable ids survive a field being renamed in
 * the UI, which names do not — and this table is edited by hand. The human
 * label is kept alongside each so the mapping stays readable.
 */
export const FIELD = {
  name: "fldQAY2FUPKrtrv5x", // Name
  tmdbId: "fldQMA0LbYPufSJMN", // TMDB ID
  seasonNumber: "flddEQgT0HTayORQS", // Season #
  episodeCount: "fldMZkgVh9upZxjjT", // # of Episodes
  airDate: "fldiLmY8JKmBmnGLS", // Air Date
  finishDate: "fldWB3VDy9CRy9Vay", // Finish Date
  firstThirdDate: "fldo4AvwvM9BpAEwS", // 1/3rd Date
  network: "fldGLBZLrOi8Yr9yr", // Network
} as const;

/**
 * The pair Airtable matches on to decide update-vs-create.
 *
 * NOT the `Feed Key` formula field, even though it holds exactly this value
 * joined together: Airtable refuses computed fields in `fieldsToMergeOn`. These
 * two are plain fields, and together they are unique — a show may legitimately
 * appear more than once, but only ever once per season.
 */
const MERGE_ON = [FIELD.tmdbId, FIELD.seasonNumber];

/** Written to `Network` when TMDB reports a service the select has no option for. */
export const UNKNOWN_NETWORK = "UNKNOWN";

/**
 * The options that exist in the `Network` single-select.
 *
 * Mirrored here because the sync must know, before writing, whether a value is
 * writable — Airtable rejects the whole batch for one unknown option, and
 * reading the schema on every run would need a broader token scope for a list
 * that changes about once a year.
 *
 * Wider than `ALLOWED_SERVICES` on purpose: "Netflix", "FX on Hulu" and "FX on
 * Disney" are options the calendar never emits but the table still uses for
 * rows entered by hand.
 */
export const NETWORK_OPTIONS: ReadonlySet<string> = new Set([
  "Netflix", "Prime Video", "Disney+", "Paramount+", "Peacock",
  "FX on Hulu", "FX on Disney", "Hulu", "AMC", "HBO",
  "Apple TV+", "Max", "MGM+", "FX", "Syfy", "Starz", "AMC+",
  UNKNOWN_NETWORK,
]);

/**
 * Map a network onto a writable select option, falling back to `UNKNOWN`.
 *
 * Preferred over letting the write fail: a network the table has no option for
 * is a labelling gap, and losing an otherwise-correct row's dates and episode
 * counts over it would be a bad trade. The row lands, flagged for a human to
 * relabel, rather than vanishing.
 */
export function toAirtableNetwork(network: string): string {
  return NETWORK_OPTIONS.has(network) ? network : UNKNOWN_NETWORK;
}

export interface AirtableConfig {
  token: string;
  baseId: string;
  tableId: string;
}

/**
 * Read Airtable credentials, or null when the integration is not configured.
 *
 * Absence is not an error. The calendar is a public project that must run for
 * anyone who clones it with only a TMDB key; the Airtable push is an extra this
 * deployment happens to do, so an unconfigured install skips it silently rather
 * than failing the refresh.
 */
export function readAirtableConfig(): AirtableConfig | null {
  const token = process.env.AIRTABLE_TOKEN?.trim();
  const baseId = process.env.AIRTABLE_BASE_ID?.trim();
  const tableId = process.env.AIRTABLE_TABLE_ID?.trim();
  if (!token || !baseId || !tableId) return null;
  return { token, baseId, tableId };
}

/** One season mapped onto the destination table's columns. */
export function toAirtableFields(season: ShowSeason): Record<string, unknown> {
  return {
    [FIELD.name]: season.name,
    [FIELD.tmdbId]: season.showId,
    [FIELD.seasonNumber]: season.seasonNumber,
    [FIELD.episodeCount]: season.episodeCount,
    // Airtable clears a date cell when sent null, which is the right outcome for
    // a season whose finale is not yet scheduled.
    [FIELD.airDate]: season.firstEpisodeAirDate,
    [FIELD.finishDate]: season.seasonFinishDate,
    [FIELD.firstThirdDate]: season.firstThirdAirDate,
    [FIELD.network]: toAirtableNetwork(season.network),
  };
}

/** Split a list into fixed-size chunks, preserving order. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface SyncResult {
  created: number;
  updated: number;
  /** Batches that failed. The sync continues past them; see the note below. */
  failed: number;
}

/**
 * Upsert every season into Airtable, matching on TMDB ID + Season #.
 *
 * A failing batch is logged and skipped rather than aborting the run, so one
 * bad record cannot stop the rest of the feed from syncing.
 *
 * `typecast` is deliberately NOT set — it would let Airtable invent select
 * options and corrupt a list curated by hand. Unwritable `Network` values are
 * handled before the request instead, by `toAirtableNetwork` folding them to
 * `UNKNOWN`, so the single most likely cause of a rejected batch cannot arise.
 */
export async function syncShowSeasons(
  seasons: ShowSeason[],
  config: AirtableConfig
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, failed: 0 };
  const url = `${AIRTABLE_API}/${config.baseId}/${config.tableId}`;

  for (const batch of chunk(seasons, BATCH_SIZE)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          performUpsert: { fieldsToMergeOn: MERGE_ON },
          records: batch.map((s) => ({ fields: toAirtableFields(s) })),
        }),
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          `[airtable] batch of ${batch.length} failed ${res.status}: ${body.slice(0, 300)}`
        );
        result.failed += batch.length;
        continue;
      }

      const data = (await res.json()) as {
        records?: unknown[];
        createdRecords?: string[];
      };
      const created = data.createdRecords?.length ?? 0;
      result.created += created;
      result.updated += (data.records?.length ?? 0) - created;
    } catch (err) {
      console.error(`[airtable] batch of ${batch.length} errored:`, err);
      result.failed += batch.length;
    } finally {
      clearTimeout(timer);
    }
  }

  return result;
}
