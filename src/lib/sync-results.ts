import type { SupabaseClient } from "@supabase/supabase-js";
import { NAME_TO_ID, OPPONENT_TEAMS } from "@/lib/team-names";
import { fetchWcSportEvents, type SportEvent } from "@/lib/sportapi-events";
import { fetchCardsForSportApiEvent } from "@/lib/sportapi-cards";
import { ftScoresFromSportEvent } from "@/lib/sportapi-scores";
import { roundFromName } from "@/lib/tournament-rounds";
import { fixturePairKey } from "@/lib/fixture-pair-key";
import {
  noteWithPenWinner,
  penWinnerFromSportEvent,
  penWinnerFromWc26Scores,
  penWinnerFromWorldCup26Game,
} from "@/lib/knockout-result";
import { getLockedResultPairs } from "@/lib/steward-overrides";
import { WC_START, dateRange } from "@/lib/tournament-dates";
import {
  fetchWorldCup26Games,
  isWorldCup26Enabled,
  worldCup26Note,
  worldCup26GameToFixture,
  type WorldCup26Game,
} from "@/lib/worldcup26";
import type { Result } from "@/lib/scoring";
import { syncTeamProgress } from "@/lib/sync-progress";

const LOOKBACK_DAYS = 7;

function scanFromDate(today: string): string {
  const lookback = new Date(today);
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);
  const fromLookback = lookback.toISOString().split("T")[0];
  return fromLookback < WC_START ? WC_START : fromLookback;
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
  progressUpdated?: number;
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

  const [{ data: existing }, lockedPairs] = await Promise.all([
    db.from("results").select("id, note, team_a, team_b, score_a, score_b, stage, yellow_a, red_a, yellow_b, red_b"),
    getLockedResultPairs(db),
  ]);

  const filed = (existing ?? []) as Array<{
    id: string;
    note: string | null;
    team_a: string;
    team_b: string;
    score_a: number;
    score_b: number;
    stage: string;
    yellow_a: number;
    red_a: number;
    yellow_b: number;
    red_b: number;
  }>;

  const byNote = new Map(
    filed.filter((r) => r.note).map((r) => [r.note as string, r])
  );
  const byPair = new Map(filed.map((r) => [fixturePairKey(r.team_a, r.team_b), r]));

  let wcEvents: SportEvent[] = [];
  let feedError = false;
  try {
    wcEvents = await fetchWcSportEvents(apiKey, {
      from,
      to: today,
      dates,
      keyword: wcKeyword,
      cache: "no-store",
    });
  } catch {
    feedError = true;
  }

  const toSync = wcEvents.filter((ev) => ev.status?.type === "finished");

  let synced = 0;
  let skipped = 0;
  const warnings: string[] = [];
  if (feedError) {
    warnings.push("SportAPI feed unavailable");
  }

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
    const keyed = fixturePairKey(homeId, awayId);
    if (lockedPairs.has(keyed)) {
      skipped++;
      continue;
    }

    const filedRow = byNote.get(note) ?? byPair.get(keyed);

    const { scoreA, scoreB } = ftScoresFromSportEvent(ev);
    const roundName: string = ev.roundInfo?.name ?? ev.tournament?.name ?? "";
    const stage = roundFromName(roundName);
    const penWinner = penWinnerFromSportEvent(ev, homeId, awayId);
    const noteWithPen = penWinner ? noteWithPenWinner(note, penWinner) : note;

    if (filedRow) {
      const homeIsA = filedRow.team_a === homeId;
      const wantA = homeIsA ? scoreA : scoreB;
      const wantB = homeIsA ? scoreB : scoreA;
      const patch: Record<string, string | number> = {};
      if (filedRow.score_a !== wantA) patch.score_a = wantA;
      if (filedRow.score_b !== wantB) patch.score_b = wantB;
      if (!filedRow.note) patch.note = noteWithPen;
      else if (penWinner && !filedRow.note.includes("|pen:")) patch.note = noteWithPenWinner(filedRow.note, penWinner);
      if (filedRow.stage !== stage) patch.stage = stage;

      const cards = await fetchCardsForSportApiEvent(String(ev.id), apiKey);
      if (cards) {
        const ya = homeIsA ? cards.yellow_a : cards.yellow_b;
        const ra = homeIsA ? cards.red_a : cards.red_b;
        const yb = homeIsA ? cards.yellow_b : cards.yellow_a;
        const rb = homeIsA ? cards.red_b : cards.red_a;
        if (filedRow.yellow_a !== ya) patch.yellow_a = ya;
        if (filedRow.red_a !== ra) patch.red_a = ra;
        if (filedRow.yellow_b !== yb) patch.yellow_b = yb;
        if (filedRow.red_b !== rb) patch.red_b = rb;
      }

      if (Object.keys(patch).length) {
        const { error } = await db.from("results").update(patch).eq("id", filedRow.id);
        if (error) warnings.push(`Update failed for event ${ev.id}: ${error.message}`);
        else synced++;
      }
      continue;
    }

    const cards = await fetchCardsForSportApiEvent(String(ev.id), apiKey);
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
      note: noteWithPen,
    });

    if (error) {
      warnings.push(`DB insert failed for event ${ev.id}: ${error.message}`);
    } else {
      synced++;
      const row = {
        id: note,
        note: noteWithPen,
        team_a: homeId,
        team_b: awayId,
        score_a: scoreA,
        score_b: scoreB,
        stage,
        yellow_a,
        red_a,
        yellow_b,
        red_b,
      };
      byNote.set(note, row);
      byPair.set(keyed, row);
    }
  }

  await db.from("settings").upsert({ key: "sportapi_last_date", value: today });

  return { synced, checked: dates.length, skipped, warnings };
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

  const [{ data: teamRows }, { data: existing }, lockedPairs] = await Promise.all([
    db.from("teams").select("id, world_rank"),
    db.from("results").select("id, note, team_a, team_b, score_a, score_b, stage"),
    getLockedResultPairs(db),
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

    const penWinner =
      penWinnerFromWorldCup26Game(game, homeId, awayId) ??
      penWinnerFromWc26Scores(
        homeId,
        awayId,
        scoreA,
        scoreB,
        stage,
        game.time_elapsed ?? ""
      );
    const noteWithPen = penWinner ? noteWithPenWinner(note, penWinner) : note;

    if (filedRow) {
      if (lockedPairs.has(keyed)) continue;

      const homeIsA = filedRow.team_a === homeId;
      const wantA = homeIsA ? scoreA : scoreB;
      const wantB = homeIsA ? scoreB : scoreA;
      const patch: Record<string, string | number> = {};
      if (filedRow.score_a !== wantA) patch.score_a = wantA;
      if (filedRow.score_b !== wantB) patch.score_b = wantB;
      if (!filedRow.note) patch.note = noteWithPen;
      else if (penWinner && !filedRow.note.includes("|pen:")) {
        patch.note = noteWithPenWinner(filedRow.note, penWinner);
      }
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
      note: noteWithPen,
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
  let outcome: SyncOutcome;

  if (isWorldCup26Enabled()) {
    outcome = await syncResultsFromWorldCup26(db);
  } else {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (apiKey && process.env.SPORTAPI_ENABLED === "true") {
      const wcKeyword = (process.env.SPORTAPI_TOURNAMENT_KEYWORD ?? "World Cup").toLowerCase();
      outcome = await syncResultsFromApi(db, apiKey, wcKeyword);
    } else {
      outcome = {
        synced: 0,
        checked: 0,
        skipped: 0,
        warnings: [],
        message: "Live feed sync is off — file results manually on the desk.",
      };
    }
  }

  try {
    const progress = await syncTeamProgress(db);
    outcome = {
      ...outcome,
      progressUpdated: progress.updated,
      warnings: [...outcome.warnings, ...progress.warnings],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Progress sync failed";
    outcome = {
      ...outcome,
      warnings: [...outcome.warnings, msg],
    };
  }

  return outcome;
}
