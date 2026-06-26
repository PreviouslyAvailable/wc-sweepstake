# Matchkit — FIFA World Cup 2026

A tournament record system built in the SIXPENCE design language: part draw
mechanism, part live scoreboard, part collectible archive — a FIFA World Cup
2026 office sweepstake. Everyone's name goes in the hat, teams are dealt from two
bands at random, and the ladder tracks points through to the final on 19 July.
Next.js 15 (App Router) + Supabase + Vercel.

## How the game works

- **The draw** is one-shot and cryptographically shuffled. The pool holds 38 teams
  (19 Band A contenders, 19 Band B wildcards). Each participant draws one team
  from each hat — two teams per person. If fewer than 19 people enter, the
  lowest-ranked teams in each band sit out.
- **Scoring** is per match, not per tournament round:
  - **Goal** — +1 per goal in normal time or extra time
  - **Clean sheet** — +3 if zero conceded in normal + ET (both sides claim in a 0–0 draw)
  - **Cards** — +1 per yellow; two yellows = +2; straight red = +3
  - **Giant-killing** — +1 per full 10-rank FIFA gap on wins only
  - Penalty shootout goals and clean sheets are not scored; world ranks are frozen at seeding
- **Results** sync automatically from the World Cup feed every 15 minutes. Open
  `/admin` with the steward passcode to review filed results, re-sync cards, or
  mark eliminations after each round.

## Setup (~15 minutes)

### 1. Supabase

1. Create a new Supabase project (separate from Pathway).
2. Open the SQL editor and run `supabase/schema.sql` in full. This creates the
   tables, read-only RLS policies, and seeds all 48 teams in their groups.
3. From **Project Settings → API**, grab the project URL, anon key, and
   service-role key.

### 2. Local

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

### 3. Vercel

Push to a Git repo, import into Vercel, and set the environment variables from
`.env.example`. Vercel sets `CRON_SECRET` automatically for the 15-minute results
sync cron. Deploy. Share the URL with the office — no accounts needed; viewing is
open, and all writes are behind the steward passcode.

## Running the comp

1. **Before kickoff:** go to `/draw`, unlock with the steward passcode, add
   everyone's name, then hit **Run the draw** — ideally with the office watching,
   as the tickets reveal one by one.
2. **During the tournament:** results sync automatically from the live feed every
   15 minutes. Open `/admin` with the passcode to review filed results or mark
   eliminations after each round.
3. **After each round:** in **Round progress**, bump every surviving team to the
   round it reached and tick **out** for the eliminated.

## Security model (deliberate simplicity)

Read access is public via Supabase RLS select-only policies. All writes go
through Next.js API routes using the service-role key, gated by a shared steward
passcode stored in an httpOnly cookie (`/api/results`, `/api/progress`,
`/api/sync-cards`, `/api/draw`, `/api/participants`). Cron sync is `GET /api/sync`
with Vercel's `CRON_SECRET` bearer; stewards trigger `POST /api/sync` from the
results desk with the session cookie. That's the right weight for an office comp — no accounts, no OAuth,
nothing to forget. Don't reuse a sensitive passcode, and don't put anything
private in the database.

## Data feeds

- **worldcup26.ir** (default) — free live scores and fixtures; no API key.
  Disable with `WORLDCUP26_DISABLED=true`.
- **API-Football** (optional) — card counts via `API_FOOTBALL_KEY` from
  [api-football.com](https://www.api-football.com/). Synced automatically after
  each results pull; free tier is enough for card-only use.
- **SportAPI** (optional fallback) — RapidAPI Sofascore feed when worldcup26 is
  off and `SPORTAPI_ENABLED=true`. Card fallback if API-Football is not set.

## Ideas for v2

- A "wooden spoon" prize view: first participant to lose all teams.
- Per-match predictions layered on top of the sweepstake for a second comp.
