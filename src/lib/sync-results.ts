import type { SupabaseClient } from "@supabase/supabase-js";
import { NAME_TO_ID, OPPONENT_TEAMS } from "@/lib/team-names";
import { sportApiFetch } from "@/lib/sportapi-client";
import { fetchWcSportEvents, type SportEvent } from "@/lib/sportapi-events";
import type {
  SportApiIncidentsResponse,
  SportApiResultNote,
  SportApiStatisticsResponse,
} from "@/lib/sportapi-types";
import { ftScoresFromSportEvent } from "@/lib/sportapi-scores";
import { roundFromName } from "@/lib/tournament-rounds";
import { fixturePairKey } from "@/lib/fixture-pair-key";
import { WC_START, dateRange } from "@/lib/tournament-dates";
import {
  fetchWorldCup26Games,
  isWorldCup26Enabled,
  worldCup26Note,
  worldCup26GameToFixture,
  type WorldCup26Game,
} from "@/lib/worldcup26";
import type { Result } from "@/lib/scoring";

const LOOKBACK_DAYS = 7;

function scanFromDate(today: string): string {
  const lookback = new Date(today);
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);
  const fromLookback = lookback.toISOString().split("T")[0];
  return fromLookback < WC_START ? WC_START : fromLookback;
}

interface CardCounts { yellow_a: number; red_a: number; yellow_b: number; red_b: number }

function parseCardsFromStats(statistics: SportApiStatisticsResponse["statistics"]): CardCounts | null {
  const periods = statistics ?? [];
  const period = periods.find((p) => p.period === "ALL") ?? periods[0];
  if (!period) return null;

  let yellow_a = 0, red_a = 0, yellow_b = 0, red_b = 0;
  let found = false;

  for (const group of period.groups ?? []) {
    for (const item of group.statisticsItems ?? []) {
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

function parseCardsFromIncidents(incidents: SportApiIncidentsResponse["incidents"]): CardCounts {
  const list = incidents ?? [];
  // First pass: count yellowRed incidents per side so we can skip their paired `red` events
  let yellowRedHome = 0, yellowRedAway = 0;
  for (const inc of list) {
    if (inc.incidentType !== "card" || inc.incidentClass !== "yellowRed") continue;
    if (inc.teamSide === "home") yellowRedHome++;
    else if (inc.teamSide === "away") yellowRedAway++;
  }

  let yellow_a = 0, red_a = 0, yellow_b = 0, red_b = 0;
  let skipRedHome = yellowRedHome, skipRedAway = yellowRedAway;

  for (const inc of list) {
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
    const statsRes = await sportApiFetch(`api/v1/event/${eventId}/statistics`, apiKey, {
      cache: "no-store",
    });
    if (statsRes.ok) {
      const data = (await statsRes.json()) as SportApiStatisticsResponse;
      const cards = parseCardsFromStats(data.statistics);
      if (cards) return cards;
    }
  } catch {
    // fall through
  }

  try {
    const incRes = await sportApiFetch(`api/v1/event/${eventId}/incidents`, apiKey, {
      cache: "no-store",
    });
    if (incRes.ok) {
      const data = (await incRes.json()) as SportApiIncidentsResponse;
      return parseCardsFromIncidents(data.incidents);
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
  finishedInFeed?: number;
  onFile?: number;
}

function isGameFinished(game: WorldCup26Game): boolean {
  return game.finished === "TRUE" || game.time_elapsed?.toLowerCase() === "finished";
}

export async function syncResultsFromApi(
  db: SupabaseClient,
  apiKey: string,
  wcKeyword = "world cup"
): Promise<SyncOutcome> {
  const today = new Date().toISOString().split("T")[0];
  const from = scanFromDate(today);
  const dates = dateRange(from, today);

  const { data: existing } = await db.from("results").select("note");
  const syncedIds = new Set(
    (existing ?? [])
      .map((r: { note: string | null }) => r.note)
      .filter((n): n is string => typeof n === "string" && n.startsWith("sport:"))
      .map((n) => n.slice(6))
  );

  let wcEvents: SportEvent[] = [];
  try {
    wcEvents = await fetchWcSportEvents(apiKey, {
      from,
      to: today,
      dates,
      keyword: wcKeyword,
      cache: "no-store",
    });
  } catch {
    // feed unavailable — sync returns empty
  }

  const toSync = wcEvents.filter((ev) => {
    const isFinished = ev.status?.type === "finished";
    const isNew = !syncedIds.has(String(ev.id));
    return isFinished && isNew;
  });

  let synced = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const ev of toSync) {
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

  for (const result of results as SportApiResultNote[]) {
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

function teamIdsFromGame(
  game: WorldCup26Game,
  results: Result[],
  worldRanks: Map<string, number>
): { homeId: string | null; awayId: string | null } {
  const fixture = worldCup26GameToFixture(game, { results, worldRanks });
  return {
    homeId: fixture?.homeId ?? NAME_TO_ID[game.home_team_name_en ?? ""] ?? null,
    awayId: fixture?.awayId ?? NAME_TO_ID[game.away_team_name_en ?? ""] ?? null,
  };
}

export async function syncResultsFromWorldCup26(
  db: SupabaseClient
): Promise<SyncOutcome> {
  const games = await fetchWorldCup26Games({ cache: "no-store" });
  if (!games.length) {
    return { synced: 0, checked: 0, skipped: 0, warnings: [], message: "World Cup feed unavailable" };
  }

  const [{ data: teamRows }, { data: existing }] = await Promise.all([
    db.from("teams").select("id, world_rank"),
    db.from("results").select("id, note, team_a, team_b, score_a, score_b, stage"),
  ]);

  const worldRanks = new Map(
    (teamRows ?? []).map((t: { id: string; world_rank: number }) => [t.id, t.world_rank])
  );
  const filed = (existing ?? []) as Array<{
    id: string;
    note: string | null;
    team_a: string;
    team_b: string;
    score_a: number;
    score_b: number;
    stage: string;
  }>;
  const results = filed as Result[];

  const byNote = new Map(
    filed.filter((r) => r.note).map((r) => [r.note as string, r])
  );
  const byPair = new Map(filed.map((r) => [fixturePairKey(r.team_a, r.team_b), r]));

  let synced = 0;
  let skipped = 0;
  let finishedInFeed = 0;
  const warnings: string[] = [];

  for (const game of games) {
    if (!isGameFinished(game)) continue;
    finishedInFeed++;

    const note = worldCup26Note(game.id);
    const { homeId, awayId } = teamIdsFromGame(game, results, worldRanks);
    if (!homeId || !awayId) {
      skipped++;
      warnings.push(
        `Skipped ${game.home_team_name_en || game.home_team_label} vs ${game.away_team_name_en || game.away_team_label} — could not map teams`
      );
      continue;
    }

    const scoreA = Number(game.home_score);
    const scoreB = Number(game.away_score);
    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
      skipped++;
      continue;
    }

    const fixture = worldCup26GameToFixture(game, { results, worldRanks });
    const stage = fixture?.roundName
      ? roundFromName(fixture.roundName)
      : game.type === "group"
        ? "group"
        : roundFromName(game.type);

    const keyed = fixturePairKey(homeId, awayId);
    const filedRow = byNote.get(note) ?? byPair.get(keyed);

    if (filedRow) {
      const homeIsA = filedRow.team_a === homeId;
      const wantA = homeIsA ? scoreA : scoreB;
      const wantB = homeIsA ? scoreB : scoreA;
      const patch: Record<string, string | number> = {};
      if (filedRow.score_a !== wantA) patch.score_a = wantA;
      if (filedRow.score_b !== wantB) patch.score_b = wantB;
      if (!filedRow.note) patch.note = note;
      if (filedRow.stage !== stage) patch.stage = stage;
      if (Object.keys(patch).length) {
        const { error } = await db.from("results").update(patch).eq("id", filedRow.id);
        if (error) warnings.push(`Update failed for game ${game.id}: ${error.message}`);
        else synced++;
      }
      continue;
    }

    await Promise.all([
      OPPONENT_TEAMS[homeId] ? ensureOpponentTeam(db, homeId) : Promise.resolve(),
      OPPONENT_TEAMS[awayId] ? ensureOpponentTeam(db, awayId) : Promise.resolve(),
    ]);

    const { data: inserted, error } = await db.from("results").insert({
      team_a: homeId,
      team_b: awayId,
      score_a: scoreA,
      score_b: scoreB,
      yellow_a: 0,
      red_a: 0,
      yellow_b: 0,
      red_b: 0,
      stage,
      note,
    }).select("id, note, team_a, team_b, score_a, score_b, stage").single();

    if (error) {
      warnings.push(`DB insert failed for game ${game.id}: ${error.message}`);
    } else if (inserted) {
      synced++;
      byNote.set(note, inserted);
      byPair.set(keyed, inserted);
      results.push(inserted as Result);
    }
  }

  const { count } = await db
    .from("results")
    .select("*", { count: "exact", head: true });

  const today = new Date().toISOString().split("T")[0];
  await db.from("settings").upsert({ key: "worldcup26_last_sync", value: today });

  return {
    synced,
    checked: games.length,
    skipped,
    warnings,
    finishedInFeed,
    onFile: count ?? filed.length,
  };
}

export async function syncResultsFromFeed(db: SupabaseClient): Promise<SyncOutcome> {
  if (isWorldCup26Enabled()) {
    return syncResultsFromWorldCup26(db);
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (apiKey && process.env.SPORTAPI_ENABLED === "true") {
    const wcKeyword = (process.env.SPORTAPI_TOURNAMENT_KEYWORD ?? "World Cup").toLowerCase();
    return syncResultsFromApi(db, apiKey, wcKeyword);
  }

  return {
    synced: 0,
    checked: 0,
    skipped: 0,
    warnings: [],
    message: "Live feed sync is off — file results manually on the desk.",
  };
}
