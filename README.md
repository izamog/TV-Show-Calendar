# TV Show Calendar

[![CI](https://github.com/izamog/TV-Show-Calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/izamog/TV-Show-Calendar/actions/workflows/ci.yml)

A production-ready **Next.js (App Router) + TypeScript** app that shows a
**rolling four-week calendar** of upcoming **scripted** Season 1 TV episodes on
a curated set of networks/streamers, plus a live subscribable **iCal feed**.

- **Rolling window:** the period is a fixed **28 days** starting on the Monday
  of the current London week, recomputed from the clock on every request and
  never hardcoded. **14 days (two Monday–Sunday rows) are on screen at a time**;
  the up/down arrows scroll that view one week at a time via `?week=0|1|2`.
  Out-of-range or malformed values clamp back into the period.
- **Accessibility:** WCAG 2.1 AA — see the Accessibility section below.
- **Data:** [TMDB](https://www.themoviedb.org/) (v3 API key **or** v4 read token).
- **Timezone:** all air times are converted to **Europe/London**, handling the
  BST/GMT seasonal offset correctly via the IANA database (through `Intl`).
- **Calendar sync:** `GET /api/calendar` returns a `text/calendar` `.ics` feed
  built from the same dataset.

## What it shows

For every allowed English-language scripted show, the app pulls all Season 1
episodes and keeps those whose London air date lands in the displayed grid. Each
episode card shows the poster/still, London air time, network badge, show name,
episode name, and a Season 1 progress bar. Series premieres (`S01E01`) get a
glowing border and a **SERIES PREMIERE** badge.

On desktop, hovering **or keyboard-focusing** a card reveals the episode
synopsis. The show's own synopsis is shown under an "About the show" heading in
two cases: on a series premiere, where it introduces a show no earlier episode
has, and as a fallback for any episode TMDB has no synopsis for. That fallback
matters because TMDB routinely carries neither a real title nor a description
for unaired episodes (they appear as "Episode 4"), which would otherwise leave
those cards with nothing to reveal. Escape dismisses the overlay without moving
focus.

When a single show has more than two episodes airing on the same day, only the
two earliest are shown as cards and the rest collapse into an **"and X more
episodes"** line — otherwise one streamer's batch drop would push every other
show that day out of the cell. The cap is per show per day, so other shows on
the same date are unaffected (`MAX_CARDS_PER_SHOW_PER_DAY` in `lib/grouping.ts`).

**Allowed services:** Apple TV+, Peacock, Paramount+, HBO, Max, Syfy, Hulu, FX,
Disney+, Starz, Prime Video, AMC, AMC+, MGM+.

Netflix is deliberately excluded, not an oversight.

A show must clear all of these to appear (all configurable in `lib/config.ts`):

| Rule | Why |
| ---- | --- |
| Not a documentary / kids / reality / talk / news **genre** | Scripted shows only. |
| Not a documentary / news / reality / talk-show / video **`type`** | A second, independent signal — TMDB has real shows with an *empty* `genres` array that are still correctly typed, so genre alone misses them. "Scripted" and "Miniseries" both pass. |
| Not keyworded *vertical screen* or *web mini series* | Short-form formats. |
| `number_of_seasons` ≤ 1 | Only genuinely new series; a show with prior seasons isn't premiering. **Not** keyed off TMDB's `status: "Returning Series"`, which merely means "not ended" and is set on brand-new first-season shows too. |
| Season 1 has ≥ 5 listed episodes | Filters one-off specials and two-part documentaries that TMDB models as a "season". A show that has only announced an episode or two is excluded until more of its season is published. |

## Project structure

```
app/
  layout.tsx              Root layout + metadata
  page.tsx                Grid + week nav (server component, live data)
  api/calendar/route.ts   .ics feed endpoint
  api/shows/route.ts      JSON season feed (one record per show, for automation)
components/
  CalendarGrid.tsx        Two-week Mon–Sun grid; groups episodes per show
  EpisodeCard.tsx         Single episode card (+ premiere treatment)
  CopyFeedButton.tsx      Client button: copy /api/calendar URL
lib/
  config.ts               Network allowlist, excluded genres/keywords, constants
  dates.ts                Rolling window + London/DST + ICS time helpers
  grouping.ts             Per-show-per-day card capping
  tmdb.ts                 TMDB fetching, filtering, Episode[] assembly
  ical.ts                 RFC 5545 feed builder
  airtable.ts             Upserts the season feed into an Airtable table
  types.ts                Shared domain types
```

The windowing and timezone logic live entirely in `lib/dates.ts`, so the page
and the `.ics` endpoint share identical semantics with no duplication.

## Local setup

Requires Node 18.17+ (Node 20+ recommended).

```bash
npm install
cp .env.local.example .env.local   # then fill in your TMDB credential
npm run dev                        # http://localhost:3000
```

### Environment variables

Set **either** credential (the v4 read token is preferred when both are set):

| Variable                  | Required            | Notes                                            |
| ------------------------- | ------------------- | ------------------------------------------------ |
| `TMDB_API_KEY`            | one of these two    | TMDB **v3** API key.                             |
| `TMDB_READ_ACCESS_TOKEN`  | one of these two    | TMDB **v4** read access token (Bearer JWT).      |
| `NEXT_PUBLIC_SITE_URL`    | no                  | Only for custom domains; the copy button reads the live origin at runtime, so this is normally unnecessary. |
| `AIRTABLE_TOKEN`          | no                  | Enables the Airtable sync. PAT with `data.records:write`.        |
| `AIRTABLE_BASE_ID`        | no                  | `app…` id of the destination base.                               |
| `AIRTABLE_TABLE_ID`       | no                  | `tbl…` id of the destination table.                              |

Get credentials at <https://www.themoviedb.org/settings/api>.

## Calendar feed

Subscribe to `https://<your-deployment>/api/calendar` from Google Calendar
("Other calendars → From URL"), Apple Calendar ("File → New Calendar
Subscription"), or Outlook. The feed covers a **60-day forward span** —
deliberately longer than the 28 days the page shows, so subscribers keep seeing
upcoming episodes. Each event's summary
is `Show Name 1x01` — show first, so events stay readable when a calendar
truncates them (the UI shows the show name with a designed S1/E05 chip
instead), and
`DTSTART`/`DTEND` carry the exact air instant (emitted in UTC) so reminders fire
at the true air moment in the subscriber's local zone.

## Show feed (JSON)

`GET /api/shows` returns one record per show — the season-level view, for
piping into a spreadsheet or database rather than a calendar client. It covers
the same 60-day forward span as the `.ics` feed.

```json
[
  {
    "id": "95350-S01",
    "showId": 95350,
    "name": "Lanterns",
    "seasonNumber": 1,
    "episodeCount": 8,
    "firstEpisodeAirDate": "2026-08-16",
    "seasonFinishDate": "2026-10-04",
    "firstThirdEpisodeNumber": 3,
    "firstThirdAirDate": "2026-08-30",
    "network": "HBO"
  }
]
```

`firstThirdAirDate` is when the episode ending the season's **first third**
airs — the marker is `ceil(episodeCount / 3)`, rounded **up** so the first
third is always a whole episode: episode 4 of a 10-episode season, episode 3 of
both a 9- and an 8-episode season. `firstThirdEpisodeNumber` carries which
episode that was, so the date can be checked against its source rather than
taken on trust.

Two things to know about the dates. They describe the **whole season**, not the
60-day window: a season that premiered before the window or finishes after it
still reports its real premiere and finale, because that is the season-level
fact a table is recording. And they are plain `YYYY-MM-DD` calendar dates with
no time component — unlike the `.ics` feed, which resolves each episode to an
exact air instant. Undated episodes (an unscheduled back half of a season is
common) are ignored, so `seasonFinishDate` is the latest date *known so far*.

A show appears only if it has at least one episode inside the window, which is
what keeps this a feed of currently-relevant new shows rather than every
candidate TMDB returns.

The response is a bare top-level array with a stable `id` per record, which is
the shape polling integrations expect — they treat each element as one item and
dedupe on `id`, so re-polling will not create duplicate rows. It is CDN-cached
for an hour, so polling it frequently does not translate into TMDB traffic.

## Airtable sync

The daily cron pushes the same season records into an Airtable table, so the
tracker stays current without anyone opening a browser.

This runs inside the app rather than through Zapier, Make or n8n. The cron is
already awake to refresh TMDB, so syncing in the same run needs no extra
service, no per-task quota, and no second Airtable authorisation to keep
pointed at the right account. Zapier in particular puts its Webhooks app behind
a paid plan, which makes polling `/api/shows` from there a non-starter on the
free tier.

Set `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE_ID` to enable it.
Leave any of them unset and the sync is skipped silently — the calendar and both
feeds work exactly as before, which is what a fork with only a TMDB key gets.

### How rows are matched

Records are upserted on **`TMDB ID` + `Season #`** together. A show may
legitimately appear more than once (a second season is a separate row), but
only ever once per season, so the pair is the natural key. Re-running the sync
updates rows in place rather than duplicating them, which matters because TMDB
revises air dates as schedules firm up.

Note this is deliberately *not* the `Feed Key` formula column, even though it
holds exactly that pair joined together: Airtable rejects computed fields in
`fieldsToMergeOn`. `Feed Key` is still useful for reading and filtering by eye.

### Column mapping

| Airtable column | Feed field              |
| --------------- | ----------------------- |
| Name            | `name`                  |
| TMDB ID         | `showId`                |
| Season #        | `seasonNumber`          |
| # of Episodes   | `episodeCount`          |
| Air Date        | `firstEpisodeAirDate`   |
| Finish Date     | `seasonFinishDate`      |
| 1/3rd Date      | `firstThirdAirDate`     |
| Network         | `network`               |

The date columns must be Airtable **Date** fields; values arrive as ISO
`YYYY-MM-DD` strings and Airtable parses them directly. `Feed Key` and
`1/3rd Episode` are formulas and are never written to — the API rejects writes
to computed fields, which would fail the whole batch.

`Network` is a **single select**, and `typecast` is deliberately off so the
sync cannot invent options in a list that is curated by hand. The trade-off is
that **adding a service to `lib/config.ts` requires adding the matching option
in Airtable**, or that batch will fail with `INVALID_MULTIPLE_CHOICE_OPTIONS`.
A failing batch is logged and skipped so the rest of the feed still syncs.

`GET /api/refresh` reports what happened:

```json
{ "ok": true, "episodeCount": 65, "airtable": { "created": 2, "updated": 10, "failed": 0 } }
```

`airtable` is `null` when the integration is not configured.

## Testing

Unit tests (Vitest) cover the non-trivial logic — the rolling-window anchoring
and BST/GMT conversions in `lib/dates.ts`, the show/genre/type filters in
`lib/tmdb.ts`, the per-show card capping in `lib/grouping.ts`, and the RFC 5545
feed builder in `lib/ical.ts` (summary format incl. episode zero-padding, escaping, folding,
empty input).

```bash
npm test          # run once
npm run test:watch
```

Notably the window tests assert Monday anchoring across both DST transition
days, that the visible 14 days always stay inside the 28-day period at every
offset, arrow availability at the ends, a late-Sunday-UTC instant that is
already Monday in London, and clamping of out-of-range or malformed `?week=`.

## Accessibility

Targets **WCAG 2.1 level AA**. Specifically:

- **Contrast (1.4.3).** Every text/background pair was measured, and three
  failures were fixed: `neutral-500` body text (4.18:1), `neutral-700` dimmed
  text (1.91:1), and white-on-`sky-500` episode chips (2.77:1, now near-black on
  `sky-400` at 9.24:1). Disabled arrows are exempt as inactive components.
- **Text size.** No hardcoded `10px`/`11px` type remains; the floor is `text-xs`
  (12px) for supporting labels and `text-sm` (14px) for body copy, all in `rem`
  so they scale with the browser's font-size setting (1.4.4).
- **Content on hover or focus (1.4.13).** The synopsis overlay is reachable by
  keyboard, not just pointer, and Escape dismisses it without moving focus.
- **Keyboard (2.1.1, 2.4.7).** All controls are reachable with a visible
  `focus-visible` ring. Arrows at the ends of the period render as
  `aria-disabled` spans rather than links to nowhere.
- **Structure (1.3.1).** The grid is a list of days, each labelled with its full
  spoken date ("Monday, 10 August 2026"); decorative artwork uses empty `alt`,
  and the S1/E05 chip carries an `sr-only` expansion.
- **Targets (2.5.5).** Arrows and the copy button are at least 44x44px.

Not automatically verified — no axe/Lighthouse run is wired into CI, so treat
this as a considered implementation rather than a certified audit.

## Deploy to Vercel (1-click)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel, **New Project → Import** the repo (framework auto-detected as Next.js).
3. Under **Environment Variables**, add `TMDB_API_KEY` **or**
   `TMDB_READ_ACCESS_TOKEN`.
4. **Deploy.** The page and `/api/calendar` render on-demand; TMDB responses are
   cached for an hour upstream, and the feed sets
   `s-maxage=3600, stale-while-revalidate` for CDN caching.

## Scheduled refresh

TMDB responses are cached for an hour (`next: { revalidate: 3600 }`), so any
request older than that refetches — picking up new shows, new episodes, and
changed titles, air dates and synopses. Nothing is stored incrementally: the
whole set is refetched and the *responses* are cached, which is why edits to
already-known episodes are never missed.

That refresh is lazy, though — it only happens when something asks. A daily
Vercel Cron (`vercel.json`) guarantees it regardless of traffic:

```json
{ "crons": [{ "path": "/api/refresh", "schedule": "0 6 * * *" }] }
```

`GET /api/refresh` re-runs the TMDB fetches and returns a small JSON summary
(`{ ok, refreshedAt, episodeCount, durationMs }`). It exists as a separate
endpoint rather than pointing the cron at `/api/calendar` because that route
sets `s-maxage=3600` — a scheduled request could be answered by the CDN without
the origin ever running, so the cron would silently do nothing. This route is
`no-store`. It warms the same shared Data Cache the page and feed read.

Set a **`CRON_SECRET`** environment variable in Vercel to lock the endpoint down;
Vercel automatically sends it as `Authorization: Bearer <secret>` on scheduled
invocations, so the cron keeps working while everything else gets a 401. If the
variable is unset the endpoint stays open, which is harmless (it only refreshes
a cache) but leaves TMDB quota open to casual abuse. Generate one without it
touching your shell history or a file:

```bash
openssl rand -base64 32 | tr -d '\n' | vercel env add CRON_SECRET production
```

Environment variable changes only take effect on a **new deployment** — set it,
then redeploy, or the endpoint will keep answering unauthenticated requests.

## Notes & assumptions

- TMDB episodes expose only a plain `air_date` (no time). Defaults are applied
  and documented in `lib/dates.ts`: **streaming → 00:00 UTC**, **broadcast →
  20:00 London**. An explicit time, if ever supplied, overrides the default.
- Network → TMDB id mapping uses canonical TMDB network ids; "Max"/"HBO Max"
  share one id, and "FX on Hulu" content is tagged under FX/Hulu upstream.
- Discovery sweeps the three most-popular Discover pages and looks back 21 days
  before the displayed range so mid-run Season 1 shows are still caught. Adjust
  the constants at the top of `lib/tmdb.ts` to widen coverage.
- TMDB imposes no horizon on how far ahead it can be queried — Discover accepts
  any `first_air_date` range and season payloads carry future `air_date`s — so
  navigating months ahead returns real data, thinning out naturally as fewer
  shows have been announced.
- Discover's `without_genres` / `without_keywords` filters are loose, so every
  rule in the table above is **re-applied per show** against `/tv/{id}` rather
  than trusted from the Discover response.
