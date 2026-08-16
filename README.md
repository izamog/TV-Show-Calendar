# TV Show Calendar

[![CI](https://github.com/izamog/TV-Show-Calendar/actions/workflows/ci.yml/badge.svg)](https://github.com/izamog/TV-Show-Calendar/actions/workflows/ci.yml)

A production-ready **Next.js (App Router) + TypeScript** app that shows a
**rolling four-week calendar** of **scripted** Season 1 TV episodes on a curated
set of networks/streamers — plus whatever season is currently airing of the
shows you have favourited on TMDB — with a live subscribable **iCal feed**.

- **Rolling window:** the period is a fixed **28 days** starting on the Monday
  **one week before** the current London week, recomputed from the clock on
  every request and never hardcoded. **One Monday–Sunday week is on screen at a
  time**; the back/forward arrows step through the four weeks of the period via
  `?week=0|1|2|3`. With no `?week=` the page opens on the week containing
  today (`DEFAULT_WEEK_OFFSET`), not on the hindsight week — arriving on a week
  that ended last Sunday reads as a stale page. A well-formed offset is
  honoured, so `?week=0` still reaches the hindsight week deliberately;
  malformed values fall back to the default and out-of-range integers clamp
  into the period.
  The week of hindsight is what makes ratings usable — see
  [Ratings](#ratings).
- **Accessibility:** WCAG 2.1 AA — see the Accessibility section below.
- **Design:** a printed-listings register — warm paper, one accent, a broadsheet
  masthead over a week of dated columns. Every value comes from
  `tokens.css`; see [Project structure](#project-structure).
- **Data:** [TMDB](https://www.themoviedb.org/) (v3 API key **or** v4 read token).
  The page footer carries the attribution TMDB's terms require: *this product
  uses the TMDB API but is not endorsed or certified by TMDB.*
- **Timezone:** all air times are converted to **Europe/London**, handling the
  BST/GMT seasonal offset correctly via the IANA database (through `Intl`).
- **Calendar sync:** `GET /api/calendar` returns a `text/calendar` `.ics` feed
  built from the same dataset.

## What it shows

For every allowed English-language scripted show, the app pulls all Season 1
episodes and keeps those whose London air date lands in the displayed grid. Each
episode card shows the poster/still, London air time, network badge, show name,
episode name, and a season progress bar. Episode 1 gets an accent border and a
flag across the top of the card — **SERIES PREMIERE** on a first season,
**SEASON PREMIERE** on a favourited show's later one.

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

**Core services (US):** Apple TV+, Peacock, Paramount+, HBO, Max, Syfy, Hulu,
FX, Disney+, Starz, Prime Video, AMC, AMC+, MGM+.

**Core services (UK):** BBC, ITV, Channel 4, Channel 5, Sky. Each is a *brand*
covering several TMDB networks — BBC is One, Two, Three and Four; ITV is ITV1,
ITV2 and ITVX; Channel 4 is Channel 4 and E4; Sky is Atlantic, Max, Comedy and
the retired Sky One, which TMDB still tags shows with. They all resolve to the
one brand name so a drama that moves between BBC One and BBC Two does not label
itself differently depending on which channel TMDB happened to list first.

Every qualifying show on any core service appears, unconditionally.

**Fill services:** Netflix, Stan (AU), Crave (CA). These are discovered on every
run but do **not** appear by default — they are held back and admitted only to
top up a thin blog post slot, best-rated first. See
[Blog post slots and fill](#blog-post-slots-and-fill).

Netflix's exclusion from the core list is deliberate, not an oversight: it
premieres more scripted Season 1s than the entire core list combined, so
admitting it wholesale would bury the curated allowlist.

### Favourited shows

The calendar is otherwise a feed of *new* series, which means it will never tell
you that a show you already follow is back. So every show favourited on the TMDB
account that issued the read token is pulled in as well, carrying **whichever
season is currently airing** rather than Season 1.

Favourites bypass every automated filter — the network allowlist, the
Season-1-only rule, the five-episode minimum and the genre/type exclusions. A
filter exists to guess at what is worth watching, and a favourite is that
question already answered by hand, so nothing automated should be able to
overrule it. In practice this is what admits Bridgerton (Netflix, fill tier),
Severance (Apple TV+, season 3) and Slow Horses (season 6).

Like core shows they are never dropped by the fill logic, and they **count
toward** a slot's target rather than sitting on top of it: a favourite is a show
for the post like any other.

No extra credential is needed. A v4 read access token authenticates as the
account that issued it, so `/account` yields the account id and the favourites
endpoint accepts the same bearer — the `session_id` approval flow in TMDB's docs
is only for apps acting on somebody else's behalf. An install with only a v3
`TMDB_API_KEY` has no account to read, and one whose owner has favourited
nothing gets an empty list; both cases degrade quietly to the network-allowlist
feed.

### Ratings

Each card carries a blended audience score out of 10 — the **vote-weighted
mean** of TMDB's `vote_average` and IMDb's rating. Weighting by vote count is
what makes it mean "how well received": IMDb typically carries one to two orders
of magnitude more votes than TMDB, and a plain average would let the smaller
electorate move the number just as far.

TMDB's API carries a show's IMDb *id* but never its IMDb *rating*, so the IMDb
half is looked up in [IMDb's own `title.ratings` dataset][imdb-datasets], which
IMDb rebuilds daily. It needs no key and no request budget: the file is fetched
once, indexed in memory for six hours and shared by every show in a render. If
it cannot be reached the score falls back to TMDB alone — degraded, never
broken.

The rating is always the **series** score, keyed by the series `tt…` id from
TMDB's `external_ids`. IMDb rates episodes separately and the dataset carries
both, so an episode id in that slot would quietly report one episode's reception
as the show's.

This replaced [OMDb](https://www.omdbapi.com/), which was the source until it
proved to lag IMDb by weeks on exactly the shows this calendar is about: on a
live feed of 22 shows OMDb had no series rating for 18 of them, and where it did
answer it was stale — 5.6 from 74 votes for a series IMDb itself scored 4.9 from
393. `OMDB_API_KEY` is no longer read.

[imdb-datasets]: https://developer.imdb.com/non-commercial-datasets/

A score is ignored below a vote floor (20 on TMDB, 100 on IMDb), and a show with
neither source above its floor shows no rating at all. That is the normal state
for a series that has not premiered: **no rating means "not yet rated", not
"badly rated"**, which is why no "Unrated" chip is drawn.

**This is why the period starts a week in the past.** Nobody votes on an unaired
episode, so a purely forward-looking window is one in which almost every show is
unrated and "rank the candidates by rating" has nothing to work with. Including
the week just gone means the most recently premiered shows arrive carrying real
scores. The period stays 28 days, so this trades a week of forward view for a
week of rated hindsight — `PERIOD_LOOKBACK_WEEKS` in `lib/dates.ts` is the knob.

## Blog post slots and fill

The calendar's unit of editorial work is a blog post, and a post covers about
four shows. Which shows share a post is decided by the **`Suggested date`** column in
Airtable — a fortnightly Sunday derived from each season's 1/3rd date:

```
Sunday         = the next Sunday strictly after the 1/3rd date
Suggested date = that Sunday, pushed on a week if it falls in an even week number
```

Posts therefore only ever land on odd-week Sundays. Airtable owns this formula;
`suggestedPostDate` in `lib/dates.ts` reproduces it exactly, and
`lib/dates.test.ts` pins the two together against real rows read out of the
table. It is never written back — it is a computed column, and the API rejects
writes to those.

When a slot holds fewer than **4** shows, `lib/fill.ts` tops it up from the fill
services, highest rating first, taking only the shortfall. Note this is a
ceiling on *topping up*, not a cap on the slot — a slot legitimately holding six
core shows keeps all six and simply imports nothing. The rules:

| Rule | Why |
| ---- | --- |
| Core and favourited shows are never dropped | The curated allowlist is the editorial position, and a favourite is that position stated by hand; a slot holding six of them keeps all six. |
| Favourites count toward the target | A favourite is a show for the post like any other, so a slot with two core shows and a favourite needs one import, not two. |
| Only the next **3** slots are filled | A distant slot is still accumulating core shows that have not been announced yet. Filling it now would import a Netflix row to solve a shortage that would have resolved itself. |
| Unrated sorts last, not out | Unrated is almost always "has not aired". Those shows still beat leaving a post short. |
| A fill show with no 1/3rd date is dropped | With no date it belongs to no slot, so it cannot be answering a shortage in one. |
| Ties break on TMDB id | So the selection is stable across runs rather than depending on the order TMDB happened to return results in. |

The fill decision is always computed over the **whole feed span**, even when
rendering the 28-day page. Whether a show earns its place depends on how many
shows share its slot, and that can only be counted over the full span —
resolving the page over its own shorter range would reach a different decision
and show a row the `.ics` feed and Airtable disagreed about.

A **discovered** show must clear all of these to appear (all configurable in
`lib/config.ts`). A **favourited** show bypasses every one of them:

| Rule | Why |
| ---- | --- |
| Not a documentary / kids / reality / talk / news **genre** | Scripted shows only. |
| Not a documentary / news / reality / talk-show / video **`type`** | A second, independent signal — TMDB has real shows with an *empty* `genres` array that are still correctly typed, so genre alone misses them. "Scripted" and "Miniseries" both pass. |
| Not keyworded *vertical screen* or *web mini series* | Short-form formats. |
| `number_of_seasons` ≤ 1 | Only genuinely new series; a show with prior seasons isn't premiering. **Not** keyed off TMDB's `status: "Returning Series"`, which merely means "not ended" and is set on brand-new first-season shows too. |
| Season 1 has ≥ 5 listed episodes | Filters one-off specials and two-part documentaries that TMDB models as a "season". A show that has only announced an episode or two is excluded until more of its season is published. |

## Project structure

```
tokens.css                Design tokens: colour, type, space, rule, motion
tailwind.config.ts        Binds every token to a utility name
app/
  layout.tsx              Root layout, fonts, metadata
  page.tsx                Masthead + edition band + grid + colophon
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
  tmdb-client.ts          TMDB wire layer: auth, fetch, concurrency, response shapes
  favourites.ts           The owner's TMDB favourites + which season is airing
  tmdb.ts                 Filtering, Episode[]/ShowSeason[] assembly, orchestration
  rating.ts               Vote-weighted TMDB + IMDb blended score
  imdb.ts                 IMDb series ratings, indexed from IMDb's daily dataset
  fill.ts                 Tops thin blog post slots up from the fill tier
  ical.ts                 RFC 5545 feed builder
  airtable.ts             Upserts the season feed into an Airtable table
  types.ts                Shared domain types
```

The windowing and timezone logic live entirely in `lib/dates.ts`, so the page
and the `.ics` endpoint share identical semantics with no duplication.

`tokens.css` is the design layer and the only place a colour, font, size, rule
weight or duration is defined. `tailwind.config.ts` binds each one to a utility
name (`bg-paper`, `text-accent`, `font-display`, `gap-lg`, `h-rule-double`), so
components reference tokens rather than values. A raw hex, `oklch()` or
`font-family` written inline in `app/` or `components/` is a bug: add the token
first, then use the name. The layout imports `tokens.css` ahead of
`app/globals.css` — not via `@import`, because this project's PostCSS chain is
`tailwindcss` + `autoprefixer` with no `postcss-import` to inline it.

`lib/tmdb-client.ts` is a leaf: it imports nothing else from `lib/`. That is
what keeps the graph acyclic, since `lib/favourites.ts` needs the fetch helper
and the show shape while `lib/tmdb.ts` needs the favourites.

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
| `TMDB_READ_ACCESS_TOKEN`  | one of these two    | TMDB **v4** read access token (Bearer JWT). Also unlocks [favourited shows](#favourited-shows), which the v3 key alone cannot reach. |
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

`GET /api/shows` returns one record per **season** — the season-level view, for
piping into a spreadsheet or database rather than a calendar client. It covers
the same 60-day forward span as the `.ics` feed. A show is almost always one
record, but a favourited show whose season finale and next premiere both fall in
the span legitimately produces two, distinguished by `seasonNumber` — the same
pair Airtable upserts on.

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
| Rating          | `rating.combined`       |

The date columns must be Airtable **Date** fields; values arrive as ISO
`YYYY-MM-DD` strings and Airtable parses them directly. `Feed Key` and
`1/3rd Episode` and `Suggested date` are formulas and are never written to —
the API rejects writes to computed fields, which would fail the whole batch.
`Suggested date` in particular is *read* (recomputed identically in
`lib/dates.ts`) so shows can be grouped into slots, but never written back.

`Network` is a **single select**, and `typecast` is deliberately off so the
sync cannot invent options in a list that is curated by hand. A network with no
matching option is written as **`UNKNOWN`** instead. Losing an otherwise-correct
row's dates and episode counts over a labelling gap would be a bad trade — the
row lands and a human relabels it, rather than the batch being rejected with
`INVALID_MULTIPLE_CHOICE_OPTIONS`.

The options are mirrored in `NETWORK_OPTIONS` in `lib/airtable.ts`, because the
sync has to know a value is writable *before* sending it. A test asserts every
service in `ALLOWED_SERVICES` and `FILL_SERVICES` is accounted for in either
`NETWORK_OPTIONS` or `PENDING_NETWORK_OPTIONS`, so adding a network to
`lib/config.ts` without deciding which list it belongs in fails CI rather than
quietly producing a run of `UNKNOWN` rows. `UNKNOWN` remains the runtime net for
what code cannot see — an option deleted in the Airtable UI.

**Pending options.** Airtable's API cannot add a choice to a single-select —
only the UI can — so a service whose option does not exist yet is listed in
`PENDING_NETWORK_OPTIONS` rather than `NETWORK_OPTIONS`. That is the safe order
of operations: `NETWORK_OPTIONS` is a claim about what Airtable will accept, and
claiming an option that does not exist fails the whole ten-record batch rather
than the one row. Pending services sync as `UNKNOWN` until the option is added
by hand, then move across. Nothing is pending right now — every service the
calendar can emit is writable.

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
days, that the visible week always stays inside the 28-day period at every
offset, that the default landing week contains today while `?week=0` still
resolves to the hindsight week, arrow availability at the ends, a
late-Sunday-UTC instant that is already Monday in London, and clamping of
out-of-range or malformed `?week=`.

## Accessibility

Targets **WCAG 2.1 level AA**. Specifically:

- **Contrast (1.4.3).** Every text/background pair is measured against the
  rendered page, not estimated from the token's OKLCH lightness. Current
  results: ink on paper 15.96:1, ink on card 14.60:1, accent on paper 7.33:1,
  paper on accent (premiere flag, episode chip) 7.33:1, muted on paper 6.72:1,
  accent on card 6.70:1, muted on card 6.14:1, and `--color-rule-strong` on
  paper 3.29:1 for control boundaries (SC 1.4.11 needs 3:1). `--color-rule` at
  1.57:1 is decorative separation only — it is never the sole carrier of
  meaning. Disabled arrows are exempt as inactive components.
- **Text size.** No hardcoded `10px`/`11px` type remains; the floor is `text-xs`
  (12px) for supporting labels and `text-sm` (14px) for body copy, all in `rem`
  so they scale with the browser's font-size setting (1.4.4). `--text-xs` is
  deliberately 12px rather than the 10.24px a 1.25 type ratio from 16px would
  give — the floor outranks the ratio.
- **Motion (2.3.3).** Nothing on the page loops. The premiere marker is a
  printed flag, not the animated glow it used to be: that animated a paint
  property, ran forever, and had no `prefers-reduced-motion` escape. The only
  motion left is a colour shift on hover and the synopsis crossfade, both
  clamped to 150ms under `prefers-reduced-motion: reduce`.
- **Content on hover or focus (1.4.13).** The synopsis overlay is reachable by
  keyboard, not just pointer, and Escape dismisses it without moving focus.
- **Keyboard (2.1.1, 2.4.7).** All controls are reachable with a visible
  `focus-visible` ring. Arrows at the ends of the period render as
  `aria-disabled` spans rather than links to nowhere.
- **Structure (1.3.1).** The grid is a list of days, each labelled with its full
  spoken date ("Monday, 10 August 2026"); decorative artwork uses empty `alt`,
  and the S1/E05 chip carries an `sr-only` expansion.
- **Targets (2.5.5).** Arrows and the copy button are at least 44x44px.
- **Reflow (1.4.10).** Verified at 320, 375, 414, 768, 1280 and 1920px: no
  horizontal scroll at any width, and no button or link label wraps to a second
  line. `overflow-x: clip` (not `hidden`, which would open a new scroll
  container) sits on both `html` and `body`.

**Touch parity, unresolved.** The synopsis overlay is hover/focus-only and
hidden entirely below the `lg` breakpoint, so touch users get no route to a
synopsis at all. That is a content-parity gap, not a hover-only affordance —
nothing is shown that cannot be reached — but it is still a gap. Fixing it means
making the card a real toggle on coarse pointers, which is a behaviour change
rather than a visual one.

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
  the constants at the top of `lib/tmdb.ts` to widen coverage. Favourites are a
  separate source, not a Discover sweep — Discover would never surface most of
  them, since they are typically past their first season or on an unlisted
  network.
- TMDB imposes no horizon on how far ahead it can be queried — Discover accepts
  any `first_air_date` range and season payloads carry future `air_date`s — so
  navigating months ahead returns real data, thinning out naturally as fewer
  shows have been announced.
- Discover's `without_genres` / `without_keywords` filters are loose, so every
  rule in the table above is **re-applied per show** against `/tv/{id}` rather
  than trusted from the Discover response.
