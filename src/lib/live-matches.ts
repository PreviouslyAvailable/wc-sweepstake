import { fixturePairKey } from "@/lib/fixture-pair-key";
import {
  liveBreakdownForTeam,
  matchBreakdownFromScores,
  type LiveMatchBreakdown,
  type Result,
  type Team,
} from "@/lib/scoring";
import { dedupeResults } from "@/lib/result-dedup";
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
import { roundShortLabel, roundFromName, isGroupRoundName } from "@/lib/tournament-rounds";

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

function alignScoresToFixture(
  scoreA: number,
  scoreB: number,
  apiHomeId: string | null,
  fixtureHomeId: string | null
): { homeScore: number; awayScore: number } {
  if (!apiHomeId || !fixtureHomeId) return { homeScore: scoreA, awayScore: scoreB };
  if (apiHomeId === fixtureHomeId) return { homeScore: scoreA, awayScore: scoreB };
  return { homeScore: scoreB, awayScore: scoreA };
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

  const { fixtures, sportEventsById, worldCupGamesById, worldCupGamesByPair } =
    await fetchWcFixturesBundle({
      results: input.results,
      teams: input.teams,
      dates,
    });

  const apiEventsById = sportEventsById;
  const sortedFixtures = sortFixtures(fixtures);

  const participantById = new Map(input.participants.map((p) => [p.id, p.name]));
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const ownerByTeamId = new Map(
    input.assignments.map((a) => [a.team_id, participantById.get(a.participant_id) ?? null])
  );

  const deduped = dedupeResults(input.results);
  const resultsByPair = new Map(
    deduped.map((r) => [fixturePairKey(r.team_a, r.team_b), r])
  );
  const resultsByNote = new Map(
    deduped
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

    const feedFinished = f.status === "finished";
    const feedLive = f.status === "inprogress";
    const apiEv = apiEventsById.get(f.id);
    const wcGame =
      (f.wc26GameId ? worldCupGamesById.get(f.wc26GameId) : undefined) ??
      (homeId && awayId ? worldCupGamesByPair.get(fixturePairKey(homeId, awayId)) : undefined) ??
      worldCupGamesById.get(f.id);

    const homeRank = homeTeam?.world_rank ?? 99;
    const awayRank = awayTeam?.world_rank ?? 99;
    const roundName = f.roundName;
    const roundLabel = isGroupRoundName(roundName)
      ? ""
      : roundShortLabel(roundFromName(roundName));

    const pair = homeId && awayId ? fixturePairKey(homeId, awayId) : "";
    const filedResult =
      (homeId && awayId ? resultsByPair.get(pair) : null) ??
      resultsByNote.get(worldCup26Note(f.wc26GameId ?? f.id)) ??
      (feedFinished ? resultsByNote.get(`sport:${f.id}`) : null);

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
    } else if (wcGame && (feedFinished || feedLive)) {
      const apiHomeId = NAME_TO_ID[wcGame.home_team_name_en ?? ""] ?? null;
      const rawHome = Number(wcGame.home_score) || 0;
      const rawAway = Number(wcGame.away_score) || 0;
      const aligned = alignScoresToFixture(rawHome, rawAway, apiHomeId, homeId);
      homeScore = aligned.homeScore;
      awayScore = aligned.awayScore;
      homeBd = matchBreakdownFromScores(homeScore, awayScore, homeRank, awayRank);
      awayBd = matchBreakdownFromScores(awayScore, homeScore, awayRank, homeRank);
    } else if (apiEv && (feedFinished || feedLive)) {
      const scores = feedFinished ? ftScoresFromSportEvent(apiEv) : liveScoresFromSportEvent(apiEv);
      const apiHomeId = NAME_TO_ID[apiEv.homeTeam?.name ?? ""] ?? null;
      const aligned = alignScoresToFixture(scores.scoreA, scores.scoreB, apiHomeId, homeId);
      homeScore = aligned.homeScore;
      awayScore = aligned.awayScore;
      homeBd = matchBreakdownFromScores(homeScore, awayScore, homeRank, awayRank);
      awayBd = matchBreakdownFromScores(awayScore, homeScore, awayRank, homeRank);
    } else {
      homeBd = EMPTY_BREAKDOWN;
      awayBd = EMPTY_BREAKDOWN;
    }

    const status =
      filedResult && !feedLive ? "finished" : f.status;
    const statusLabel =
      status === "finished"
        ? filedResult
          ? "FT"
          : wcGame
            ? statusLabelFromGame(wcGame)
            : apiEv
              ? statusLabelFromEvent(apiEv)
              : statusLabelFromFixture(f.status)
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
      round: roundLabel ? `${roundLabel} · ${roundName}` : roundName,
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
