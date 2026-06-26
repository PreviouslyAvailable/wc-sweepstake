import { fixturePairKey } from "@/lib/fixture-pair-key";
import {
  liveBreakdownForTeam,
  matchBreakdownFromScores,
  type LiveMatchBreakdown,
  type Result,
  type Team,
} from "@/lib/scoring";
import { ftScoresFromSportEvent, liveScoresFromSportEvent } from "@/lib/sportapi-scores";
import type { SportEvent } from "@/lib/sportapi-events";
import { livePageFixtureDates } from "@/lib/tournament-dates";
import { fetchWcFixturesBundle, type WcFixture } from "@/lib/wc-fixtures";
import {
  statusLabelFromGame,
  worldCup26Note,
  type WorldCup26Game,
} from "@/lib/worldcup26";
import { NAME_TO_ID } from "@/lib/team-names";

export type { LiveMatchBreakdown as Breakdown };

export interface LiveMatch {
  id: number;
  status: string;
  statusLabel: string;
  startTimestamp: number;
  round: string;
  home: {
    teamId: string | null;
    name: string;
    flag: string;
    worldRank: number;
    score: number;
    owner: string | null;
    pts: number;
    breakdown: LiveMatchBreakdown;
  };
  away: {
    teamId: string | null;
    name: string;
    flag: string;
    worldRank: number;
    score: number;
    owner: string | null;
    pts: number;
    breakdown: LiveMatchBreakdown;
  };
}

const EMPTY_BREAKDOWN: LiveMatchBreakdown = {
  goals: 0,
  cleanSheet: 0,
  yellows: 0,
  reds: 0,
  cards: 0,
  giantKilling: 0,
  total: 0,
};

function statusLabelFromFixture(status: string): string {
  if (status === "finished") return "FT";
  if (status === "inprogress") return "LIVE";
  return "";
}

function statusLabelFromEvent(ev: SportEvent): string {
  const type: string = ev.status?.type ?? "";
  const desc: string = ev.status?.description ?? "";
  const minute: number | null = ev.time?.current ?? null;
  const injury: number | null = ev.time?.injuryTime ?? null;

  if (type === "notstarted") return "";
  if (type === "finished") {
    if (desc.toLowerCase().includes("pen") || ev.homeScore?.penalties != null) return "PEN";
    if (desc.toLowerCase().includes("extra") || desc.toLowerCase().includes("aet")) return "AET";
    return "FT";
  }
  if (desc.toLowerCase().includes("half time") || desc === "HT") return "HT";
  if (minute !== null) return injury ? `${minute}+${injury}'` : `${minute}'`;
  return "LIVE";
}

function sortFixtures(fixtures: WcFixture[]): WcFixture[] {
  return [...fixtures].sort((a, b) => {
    const order: Record<string, number> = { inprogress: 0, notstarted: 1, finished: 2 };
    const ao = order[a.status] ?? 3;
    const bo = order[b.status] ?? 3;
    if (ao !== bo) return ao - bo;
    if (a.status === "finished") return b.startTimestamp - a.startTimestamp;
    return a.startTimestamp - b.startTimestamp;
  });
}

export async function buildLiveMatches(input: {
  results: Result[];
  assignments: { participant_id: string; team_id: string }[];
  participants: { id: string; name: string }[];
  teams: Team[];
  now?: Date;
}): Promise<{ matches: LiveMatch[]; asOf: string; apiEventsById: Map<number, SportEvent> }> {
  const now = input.now ?? new Date();
  const dates = livePageFixtureDates(now);

  const { fixtures, sources } = await fetchWcFixturesBundle({
    results: input.results,
    teams: input.teams,
    dates,
  });

  const { sportEventsById: apiEventsById, worldCupGamesById: gamesById } = sources;
  const sortedFixtures = sortFixtures(fixtures);

  const participantById = new Map(input.participants.map((p) => [p.id, p.name]));
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const ownerByTeamId = new Map(
    input.assignments.map((a) => [a.team_id, participantById.get(a.participant_id) ?? null])
  );

  const resultsByPair = new Map(
    input.results.map((r) => [fixturePairKey(r.team_a, r.team_b), r])
  );
  const resultsByNote = new Map(
    input.results
      .filter((r): r is Result & { note: string } => typeof r.note === "string")
      .map((r) => [r.note, r])
  );

  const matches = sortedFixtures.map((f) => {
    const homeId = f.homeId;
    const awayId = f.awayId;
    const homeTeam = homeId ? teamById.get(homeId) : null;
    const awayTeam = awayId ? teamById.get(awayId) : null;
    const homeApiName = homeTeam?.name ?? f.homeLabel ?? homeId ?? "TBD";
    const awayApiName = awayTeam?.name ?? f.awayLabel ?? awayId ?? "TBD";

    const isFinished = f.status === "finished";
    const isLive = f.status === "inprogress";
    const apiEv = apiEventsById.get(f.id);
    const wcGame = gamesById.get(f.id);

    const homeRank = homeTeam?.world_rank ?? 99;
    const awayRank = awayTeam?.world_rank ?? 99;
    const roundName = f.roundName;

    const pair = homeId && awayId ? fixturePairKey(homeId, awayId) : "";
    const filedResult =
      (homeId && awayId ? resultsByPair.get(pair) : null) ??
      resultsByNote.get(worldCup26Note(f.id)) ??
      (isFinished ? resultsByNote.get(`sport:${f.id}`) : null);

    let homeScore = 0;
    let awayScore = 0;
    let homeBd: LiveMatchBreakdown;
    let awayBd: LiveMatchBreakdown;

    if (filedResult && homeId && awayId) {
      const homeIsA = filedResult.team_a === homeId;
      homeScore = homeIsA ? filedResult.score_a : filedResult.score_b;
      awayScore = homeIsA ? filedResult.score_b : filedResult.score_a;
      homeBd = liveBreakdownForTeam(homeId, filedResult, teamById);
      awayBd = liveBreakdownForTeam(awayId, filedResult, teamById);
    } else if (wcGame && (isFinished || isLive)) {
      const apiHomeId = NAME_TO_ID[wcGame.home_team_name_en ?? ""] ?? null;
      const homeIsApiHome = apiHomeId === homeId;
      homeScore = homeIsApiHome
        ? Number(wcGame.home_score) || 0
        : Number(wcGame.away_score) || 0;
      awayScore = homeIsApiHome
        ? Number(wcGame.away_score) || 0
        : Number(wcGame.home_score) || 0;
      homeBd = matchBreakdownFromScores(homeScore, awayScore, homeRank, awayRank);
      awayBd = matchBreakdownFromScores(awayScore, homeScore, awayRank, homeRank);
    } else if (apiEv && (isFinished || isLive)) {
      const scores = isFinished ? ftScoresFromSportEvent(apiEv) : liveScoresFromSportEvent(apiEv);
      homeScore = scores.scoreA;
      awayScore = scores.scoreB;
      homeBd = matchBreakdownFromScores(homeScore, awayScore, homeRank, awayRank);
      awayBd = matchBreakdownFromScores(awayScore, homeScore, awayRank, homeRank);
    } else {
      homeBd = EMPTY_BREAKDOWN;
      awayBd = EMPTY_BREAKDOWN;
    }

    const status = filedResult ? "finished" : f.status;
    const statusLabel = filedResult
      ? "FT"
      : wcGame
        ? statusLabelFromGame(wcGame)
        : apiEv
          ? statusLabelFromEvent(apiEv)
          : statusLabelFromFixture(f.status);

    return {
      id: f.id,
      status,
      statusLabel,
      startTimestamp: f.startTimestamp,
      round: roundName,
      home: {
        teamId: homeId,
        name: homeApiName,
        flag: homeTeam?.flag ?? "🏳️",
        worldRank: homeRank,
        score: homeScore,
        owner: homeId ? (ownerByTeamId.get(homeId) ?? null) : null,
        pts: homeBd.total,
        breakdown: homeBd,
      },
      away: {
        teamId: awayId,
        name: awayApiName,
        flag: awayTeam?.flag ?? "🏳️",
        worldRank: awayRank,
        score: awayScore,
        owner: awayId ? (ownerByTeamId.get(awayId) ?? null) : null,
        pts: awayBd.total,
        breakdown: awayBd,
      },
    };
  });

  return { matches, asOf: now.toISOString(), apiEventsById };
}
