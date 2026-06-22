import type { SupabaseClient } from "@supabase/supabase-js";
import { NAME_TO_ID, OPPONENT_TEAMS } from "@/lib/team-names";
import { ftScoresFromSportEvent } from "@/lib/sportapi-scores";
import { roundFromName } from "@/lib/tournament-rounds";

const HOST = "sportapi7.p.rapidapi.com";
const WC_START = "2026-06-11";
const LOOKBACK_DAYS = 7;

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(to);
  for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function scanFromDate(today: string): string {
  const lookback = new Date(today);
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);
  const fromLookback = lookback.toISOString().split("T")[0];
  return fromLookback < WC_START ? WC_START : fromLookback;
}

function apif(path: string, key: string) {
  return fetch(`https://${HOST}/${path}`, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
    cache: "no-store",
  });
}

interface CardCounts { yellow_a: number; red_a: number; yellow_b: number; red_b: number }

/**
 * Parse card totals from the statistics endpoint.
 *
 * The statistics API correctly separates:
 *   "Yellow cards"      — first-yellow cautions only
 *   "Yellow-red cards"  — second yellow (causing red) → per rules, counts as +1 yellow each
 *   "Red cards"         — straight reds only → +3 each
 *
 * Returns null if the statistics endpoint has no card data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCardsFromStats(statistics: any[]): CardCounts | null {
  const period = statistics.find((p) => p.period === "ALL") ?? statistics[0];
  if (!period) return null;

  let yellow_a = 0, red_a = 0, yellow_b = 0, red_b = 0;
  let found = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const group of (period.groups ?? []) as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of (group.statisticsItems ?? []) as any[]) {
      const name: string = (item.name ?? "").toLowerCase();
      const h = parseInt(item.home ?? "0", 10) || 0;
      const a = parseInt(item.away ?? "0", 10) || 0;
      if (name === "yellow cards") {
        yellow_a += h; yellow_b += a; found = true;
      } else if (name === "yellow-red cards") {
        // Yellow-red = second yellow causing a red → counts as +1 yellow per the rules
        yellow_a += h; yellow_b += a; found = true;
      } else if (name === "red cards") {
        red_a += h; red_b += a; found = true;
      }
    }
  }

  return found ? { yellow_a, red_a, yellow_b, red_b } : null;
}

/**
 * Parse card totals from the incidents endpoint as a fallback.
 *
 * Fixes vs the naive approach:
 *  1. Only counts incidents where teamSide is explicitly "home" or "away"
 *  2. Deduplicates the spurious `red` event the API fires alongside `yellowRed` —
 *     one `red` per `yellowRed` on the same side is skipped so it isn't
 *     double-counted as a straight red.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCardsFromIncidents(incidents: any[]): CardCounts {
  // First pass: count yellowRed incidents per side so we can skip their paired `red` events
  let yellowRedHome = 0, yellowRedAway = 0;
  for (const inc of incidents) {
    if (inc.incidentType !== "card" || inc.incidentClass !== "yellowRed") continue;
    if (inc.teamSide === "home") yellowRedHome++;
    else if (inc.teamSide === "away") yellowRedAway++;
  }

  let yellow_a = 0, red_a = 0, yellow_b = 0, red_b = 0;
  let skipRedHome = yellowRedHome, skipRedAway = yellowRedAway;

  for (const inc of incidents) {
    if (inc.incidentType !== "card") continue;
    const cls: string = inc.incidentClass ?? "";
    const side: string = inc.teamSide ?? "";
    if (side !== "home" && side !== "away") continue;
    const isHome = side === "home";

    if (cls === "yellow" || cls === "yellowRed") {
      if (isHome) yellow_a++; else yellow_b++;
    } else if (cls === "red") {
      if (isHome) {
        if (skipRedHome > 0) skipRedHome--; else red_a++;
      } else {
        if (skipRedAway > 0) skipRedAway--; else red_b++;
      }
    }
  }

  return { yellow_a, red_a, yellow_b, red_b };
}

/**
 * Fetch card counts for a SportAPI event.
 * Tries the statistics endpoint first (more reliable), falls back to incidents.
 */
async function fetchCardsForEvent(eventId: string, apiKey: string): Promise<CardCounts | null> {
  try {
    const statsRes = await apif(`api/v1/event/${eventId}/statistics`, apiKey);
    if (statsRes.ok) {
      const { statistics = [] } = await statsRes.json();
      const cards = parseCardsFromStats(statistics);
      if (cards) return cards;
    }
  } catch {
    // fall through
  }

  try {
    const incRes = await apif(`api/v1/event/${eventId}/incidents`, apiKey);
    if (incRes.ok) {
      const { incidents = [] } = await incRes.json();
      return parseCardsFromIncidents(incidents);
    }
  } catch {
    // fall through
  }

  return null;
}

async function ensureOpponentTeam(
  db: SupabaseClient,
  teamId: string
): Promise<void> {
  const meta = OPPONENT_TEAMS[teamId];
  if (!meta) return;
  await db.from("teams").upsert(
    {
      id: teamId,
      name: meta.name,
      flag: meta.flag,
      band: "O", // opponent — not in the draw pool (Band A/B)
      world_rank: meta.world_rank,
      is_out: false,
      group_letter: "",
      furthest_round: "group",
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
}

export interface SyncOutcome {
  synced: number;
  checked: number;
  skipped: number;
  warnings: string[];
  message?: string;
}

export async function syncResultsFromApi(
  db: SupabaseClient,
  apiKey: string,
  wcKeyword = "world cup"
): Promise<SyncOutcome> {
  const today = new Date().toISOString().split("T")[0];
  const dates = dateRange(scanFromDate(today), today);

  const { data: existing } = await db.from("results").select("note");
  const syncedIds = new Set(
    (existing ?? [])
      .map((r: { note: string | null }) => r.note)
      .filter((n): n is string => typeof n === "string" && n.startsWith("sport:"))
      .map((n) => n.slice(6))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toSync: any[] = [];
  for (const date of dates) {
    try {
      const res = await apif(`api/v1/sport/football/scheduled-events/${date}`, apiKey);
      if (!res.ok) continue;
      const { events = [] } = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ev of events as any[]) {
        const isFinished = ev.status?.type === "finished";
        const isWC = (ev.tournament?.uniqueTournament?.name ?? "")
          .toLowerCase()
          .includes(wcKeyword);
        const isNew = !syncedIds.has(String(ev.id));
        if (isFinished && isWC && isNew) toSync.push(ev);
      }
    } catch {
      // skip failed date silently
    }
  }

  let synced = 0;
  let skipped = 0;
  const warnings: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ev of toSync as any[]) {
    const homeTeamName: string = ev.homeTeam?.name ?? "";
    const awayTeamName: string = ev.awayTeam?.name ?? "";
    const homeId = NAME_TO_ID[homeTeamName];
    const awayId = NAME_TO_ID[awayTeamName];
    if (!homeId || !awayId) {
      skipped++;
      warnings.push(`Skipped ${homeTeamName} vs ${awayTeamName} — unmapped team name`);
      continue;
    }

    await Promise.all([
      OPPONENT_TEAMS[homeId] ? ensureOpponentTeam(db, homeId) : Promise.resolve(),
      OPPONENT_TEAMS[awayId] ? ensureOpponentTeam(db, awayId) : Promise.resolve(),
    ]);

    const note = `sport:${ev.id}`;
    const { data: already } = await db.from("results").select("id").eq("note", note).maybeSingle();
    if (already) continue;

    const { scoreA, scoreB } = ftScoresFromSportEvent(ev);

    const roundName: string = ev.roundInfo?.name ?? ev.tournament?.name ?? "";
    const stage = roundFromName(roundName);

    const cards = await fetchCardsForEvent(String(ev.id), apiKey);
    if (!cards) {
      warnings.push(`Cards unavailable for event ${ev.id} — saved with 0 cards`);
    }
    const { yellow_a = 0, red_a = 0, yellow_b = 0, red_b = 0 } = cards ?? {};

    const { error } = await db.from("results").insert({
      team_a: homeId,
      team_b: awayId,
      score_a: scoreA,
      score_b: scoreB,
      yellow_a, red_a,
      yellow_b, red_b,
      stage,
      note,
    });

    if (error) {
      warnings.push(`DB insert failed for event ${ev.id}: ${error.message}`);
    } else {
      synced++;
    }
  }

  await db.from("settings").upsert({ key: "sportapi_last_date", value: today });

  return { synced, checked: dates.length, skipped, warnings };
}

export interface CardResyncOutcome {
  updated: number;
  skipped: number;
  warnings: string[];
}

export async function resyncCardsFromApi(
  db: SupabaseClient,
  apiKey: string
): Promise<CardResyncOutcome> {
  const { data: results } = await db
    .from("results")
    .select("id, note")
    .like("note", "sport:%");

  if (!results?.length) return { updated: 0, skipped: 0, warnings: [] };

  let updated = 0, skipped = 0;
  const warnings: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const result of results as any[]) {
    const eventId: string = result.note.slice(6);
    const cards = await fetchCardsForEvent(eventId, apiKey);

    if (!cards) {
      warnings.push(`Cards unavailable for event ${eventId}`);
      skipped++;
      continue;
    }

    const { error } = await db
      .from("results")
      .update(cards)
      .eq("id", result.id);

    if (error) {
      warnings.push(`Update failed for event ${eventId}: ${error.message}`);
      skipped++;
    } else {
      updated++;
    }
  }

  return { updated, skipped, warnings };
}
