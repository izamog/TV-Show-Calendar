# TV — Next 14 Days

A production-ready **Next.js (App Router) + TypeScript** app that shows a rolling
**14-day calendar** of upcoming **scripted** Season 1 TV episodes on a curated set
of networks/streamers, plus a live subscribable **iCal feed**.

- **Rolling window:** always two Monday–Sunday weeks, with the top row anchored
  to the **Monday of the current London week**. It recomputes from the clock on
  every request — nothing is hardcoded to a fixed date.
- **Data:** [TMDB](https://www.themoviedb.org/) (v3 API key **or** v4 read token).
- **Timezone:** all air times are converted to **Europe/London**, handling the
  BST/GMT seasonal offset correctly via the IANA database (through `Intl`).
- **Calendar sync:** `GET /api/calendar` returns a `text/calendar` `.ics` feed
  built from the same dataset.

## What it shows

For every allowed English-language scripted show, the app pulls all Season 1
episodes and keeps those whose London air date lands in the current 14-day
window. Each episode card shows the poster/still, London air time, network
badge, `S01EXX Show Name` title, episode name, and Season 1 episode count.
Series premieres (`S01E01`) get a glowing border and a **SERIES PREMIERE** badge.

**Allowed services:** Apple TV+, Peacock, Paramount+, HBO, Max, Syfy, Hulu, FX,
Disney+, Lionsgate+, Prime Video. Documentary / reality / talk / news genres are
excluded so only scripted shows remain. (See `lib/config.ts`.)

## Project structure

```
app/
  layout.tsx              Root layout + metadata
  page.tsx                14-day grid (server component, live data)
  api/calendar/route.ts   .ics feed endpoint
components/
  CalendarGrid.tsx        2×7 Mon–Sun grid
  EpisodeCard.tsx         Single episode card (+ premiere treatment)
  CopyFeedButton.tsx      Client button: copy /api/calendar URL
lib/
  config.ts               Network allowlist, excluded genres, constants
  dates.ts                Rolling window + London/DST + ICS time helpers
  tmdb.ts                 TMDB fetching, filtering, Episode[] assembly
  ical.ts                 RFC 5545 feed builder
  types.ts                Shared domain types
```

The 14-day windowing and timezone logic live entirely in `lib/dates.ts`, so the
page and the `.ics` endpoint share identical semantics with no duplication.

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

Get credentials at <https://www.themoviedb.org/settings/api>.

## Calendar feed

Subscribe to `https://<your-deployment>/api/calendar` from Google Calendar
("Other calendars → From URL"), Apple Calendar ("File → New Calendar
Subscription"), or Outlook. Each event's summary is `S01EXX Show Name`, and
`DTSTART`/`DTEND` carry the exact air instant (emitted in UTC) so reminders fire
at the true air moment in the subscriber's local zone.

## Testing

Unit tests (Vitest) cover the non-trivial logic — the rolling-window anchoring
and BST/GMT conversions in `lib/dates.ts`, and the RFC 5545 feed builder in
`lib/ical.ts` (summary format, escaping, line folding, empty input).

```bash
npm test          # run once
npm run test:watch
```

Notably the window tests assert Monday-anchoring and 14-day spans across both DST
transition days and a late-Sunday-UTC instant that is already Monday in London,
locking in the "always a rolling 2-week Mon–Sun window" guarantee.

## Deploy to Vercel (1-click)

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel, **New Project → Import** the repo (framework auto-detected as Next.js).
3. Under **Environment Variables**, add `TMDB_API_KEY` **or**
   `TMDB_READ_ACCESS_TOKEN`.
4. **Deploy.** The page and `/api/calendar` render on-demand; TMDB responses are
   cached for an hour upstream, and the feed sets
   `s-maxage=3600, stale-while-revalidate` for CDN caching.

## Notes & assumptions

- TMDB episodes expose only a plain `air_date` (no time). Defaults are applied
  and documented in `lib/dates.ts`: **streaming → 00:00 UTC**, **broadcast →
  20:00 London**. An explicit time, if ever supplied, overrides the default.
- Network → TMDB id mapping uses canonical TMDB network ids; "Max"/"HBO Max"
  share one id, and "FX on Hulu" content is tagged under FX/Hulu upstream.
- Discovery sweeps the two most-popular Discover pages and looks back 21 days
  before the window so mid-run Season 1 shows are still caught. Adjust the
  constants at the top of `lib/tmdb.ts` to widen coverage.
