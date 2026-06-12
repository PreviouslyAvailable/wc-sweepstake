# Matchkit — FIFA World Cup 2026

A tournament record system built in the SIXPENCE design language: part draw
mechanism, part live scoreboard, part collectible archive — a FIFA World Cup
2026 office sweepstake. ("The hat" survives as ritual language in the product.) Everyone's name goes in the hat, all 48
teams get dealt out at random, and the ladder tracks points through to the final
on 19 July. Next.js 15 (App Router) + Supabase + Vercel.

## How the game works

- **The draw** is one-shot and cryptographically shuffled. 48 teams are dealt
  round-robin, so with e.g. 16 people everyone gets 3 teams; with 20 people,
  everyone gets 2 and eight lucky people get 3.
- **Scoring:** each group-stage win earns 3 pts, each draw 1 pt. Then a stacking
  bonus for every round a team reaches: R32 +2, R16 +4, QF +7, SF +11,
  Final +15, Champion +25. The champion is worth 64 bonus points, so nobody is
  mathematically dead until late — and even minnow teams matter in the groups.
- Group results are entered manually at the results desk (about 2 minutes each
  morning); knockout progress is a per-round bulk update.

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

Push to a Git repo, import into Vercel, and set the same environment variables
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_PASSCODE`). Deploy. Share the URL
with the office — no accounts
needed; viewing is open, and all writes are behind the passcode.

## Running the comp

1. **Before kickoff:** go to `/draw`, unlock with the passcode, add everyone's
   name, then hit **Run the draw** — ideally with the office watching, since
   the tickets reveal one by one.
2. **Each morning:** open `/admin` and key in yesterday's group results
   (team A, score, team B). The ladder updates instantly.
3. **After each round:** in **Round progress**, bump every surviving team to
   the round it reached and tick **out** for the eliminated. (E.g. when the
   R32 line-up is known: the 32 survivors → "Reached R32", the other 16 → out.)
## Security model (deliberate simplicity)

Read access is public via Supabase RLS select-only policies. All writes go
through Next.js API routes using the service-role key, gated by a shared
passcode stored in an httpOnly cookie. That's the right weight for an office
comp — no accounts, no OAuth, nothing to forget. Don't reuse a sensitive
passcode, and don't put anything private in the database.

## Ideas for v2

- Auto-sync results from football-data.org (free tier covers the World Cup)
  via a Vercel cron route, replacing manual entry.
- A "wooden spoon" prize view: first participant to lose all teams.
- Per-match predictions layered on top of the sweepstake for a second comp.
