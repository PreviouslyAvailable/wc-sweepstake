export type Band = "A" | "B";

export interface Team {
  id: string;
  name: string;
  flag: string;
  band: Band;
  world_rank: number;
  is_out: boolean;
  // kept in DB but not used for scoring
  group_letter?: string;
  furthest_round?: string;
}

export interface Participant {
  id: string;
  name: string;
  paid?: boolean;
}

export interface Assignment {
  id: string;
  participant_id: string;
  team_id: string;
  position: number; // 0 = Band A contender, 1 = Band B wildcard
}

export interface Result {
  id: string;
  stage: string;
  team_a: string;
  team_b: string;
  score_a: number;
  score_b: number;
  yellow_a: number;
  red_a: number;
  yellow_b: number;
  red_b: number;
  note?: string | null;
  created_at: string;
}

export interface MatchBreakdown {
  goals: number;
  cleanSheet: number;
  cards: number;
  giantKilling: number;
  total: number;
}

export interface TeamScore {
  team: Team;
  breakdown: MatchBreakdown;
  total: number;
}

export interface StandingRow {
  participant: Participant;
  teams: TeamScore[];
  alive: number;
  total: number;
}

export function matchBreakdownForTeam(
  teamId: string,
  result: Result,
  teamById: Map<string, Team>
): MatchBreakdown {
  const isA = result.team_a === teamId;
  const isB = result.team_b === teamId;
  const zero: MatchBreakdown = { goals: 0, cleanSheet: 0, cards: 0, giantKilling: 0, total: 0 };
  if (!isA && !isB) return zero;

  const myGoals = isA ? result.score_a : result.score_b;
  const theirGoals = isA ? result.score_b : result.score_a;
  const myYellows = isA ? (result.yellow_a ?? 0) : (result.yellow_b ?? 0);
  const myReds = isA ? (result.red_a ?? 0) : (result.red_b ?? 0);
  const opponentId = isA ? result.team_b : result.team_a;

  const myTeam = teamById.get(teamId);
  const opponent = teamById.get(opponentId);

  const goals = myGoals;
  const cleanSheet = theirGoals === 0 ? 3 : 0;
  // Two yellows = +2 (counted as two cards), straight red = +3
  const cards = myYellows * 1 + myReds * 3;

  // Giant-killing: win vs a higher-ranked (lower rank number) side
  // +1 per full 10-place gap
  let giantKilling = 0;
  if (myGoals > theirGoals && myTeam && opponent) {
    const rankGap = myTeam.world_rank - opponent.world_rank;
    if (rankGap > 0) {
      giantKilling = Math.floor(rankGap / 10);
    }
  }

  const total = goals + cleanSheet + cards + giantKilling;
  return { goals, cleanSheet, cards, giantKilling, total };
}

export function computeStandings(
  participants: Participant[],
  assignments: Assignment[],
  teams: Team[],
  results: Result[]
): StandingRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const rows: StandingRow[] = participants.map((p) => {
    const myTeams = assignments
      .filter((a) => a.participant_id === p.id)
      .sort((a, b) => a.position - b.position)
      .map((a) => teamById.get(a.team_id))
      .filter((t): t is Team => Boolean(t));

    const teamScores: TeamScore[] = myTeams.map((team) => {
      const breakdown: MatchBreakdown = { goals: 0, cleanSheet: 0, cards: 0, giantKilling: 0, total: 0 };
      for (const result of results) {
        const m = matchBreakdownForTeam(team.id, result, teamById);
        breakdown.goals += m.goals;
        breakdown.cleanSheet += m.cleanSheet;
        breakdown.cards += m.cards;
        breakdown.giantKilling += m.giantKilling;
        breakdown.total += m.total;
      }
      return { team, breakdown, total: breakdown.total };
    });

    return {
      participant: p,
      teams: teamScores,
      alive: teamScores.filter((t) => !t.team.is_out).length,
      total: teamScores.reduce((s, t) => s + t.total, 0),
    };
  });

  return rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.alive - a.alive ||
      a.participant.name.localeCompare(b.participant.name)
  );
}
