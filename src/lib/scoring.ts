import { formatTipBlock, formatTipLines } from "@/lib/tooltip-format";

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

/** Per-match breakdown with card counts — used on the live board. */
export interface LiveMatchBreakdown extends MatchBreakdown {
  yellows: number;
  reds: number;
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

/** Cumulative points for one team across all filed results. */
export function aggregateTeamScore(
  teamId: string,
  teams: Team[],
  results: Result[]
): MatchBreakdown {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const breakdown: MatchBreakdown = { goals: 0, cleanSheet: 0, cards: 0, giantKilling: 0, total: 0 };
  for (const result of results) {
    const m = matchBreakdownForTeam(teamId, result, teamById);
    breakdown.goals += m.goals;
    breakdown.cleanSheet += m.cleanSheet;
    breakdown.cards += m.cards;
    breakdown.giantKilling += m.giantKilling;
    breakdown.total += m.total;
  }
  return breakdown;
}

/** Scoring lines for tooltips — omits zero categories, ends with total. */
export function formatPtsBreakdownLines(
  breakdown: MatchBreakdown,
  extras?: { yellows?: number; reds?: number; signed?: boolean }
): string[] {
  const fmt = (n: number) => (extras?.signed && n > 0 ? `+${n}` : `${n}`);
  const lines: string[] = [`Goals: ${fmt(breakdown.goals)}`];
  if (breakdown.cleanSheet) {
    lines.push(
      extras?.signed
        ? `Clean sheet: ${fmt(breakdown.cleanSheet)}`
        : `Clean sheets: ${breakdown.cleanSheet}`
    );
  }
  if (extras?.yellows || extras?.reds) {
    const parts: string[] = [];
    if (extras.yellows) parts.push(`${extras.yellows}Y`);
    if (extras.reds) parts.push(`${extras.reds}R`);
    const cardPts = extras.signed ? `(+${breakdown.cards})` : `(${breakdown.cards} pts)`;
    lines.push(`Cards: ${parts.join(" ")} ${cardPts}`);
  } else if (breakdown.cards) {
    lines.push(`Cards: ${breakdown.cards}`);
  }
  if (breakdown.giantKilling) {
    lines.push(
      extras?.signed
        ? `Giant-kill: ${fmt(breakdown.giantKilling)}`
        : `Giant-killing: ${breakdown.giantKilling}`
    );
  }
  if (!extras?.signed) lines.push(`Total: ${breakdown.total}`);
  return lines;
}

export function formatTeamBreakdownTooltip(
  team: Pick<Team, "name" | "flag">,
  breakdown: MatchBreakdown
): string {
  return formatBreakdownTooltip(breakdown, `${team.flag} ${team.name}`);
}

export function formatBreakdownTooltip(
  breakdown: MatchBreakdown,
  context?: string | (string | null | undefined)[] | null
): string {
  const lines = formatPtsBreakdownLines(breakdown);
  if (!context) return formatTipLines(...lines);
  const pre = Array.isArray(context) ? context : [context];
  return formatTipBlock({ pre, lines });
}

/** Points for one side from raw scores — used when results are not yet filed. */
export function matchBreakdownFromScores(
  myScore: number,
  theirScore: number,
  myRank: number,
  theirRank: number,
  cardCounts: { yellows?: number; reds?: number } = {}
): LiveMatchBreakdown {
  const myYellows = cardCounts.yellows ?? 0;
  const myReds = cardCounts.reds ?? 0;
  const goals = myScore;
  const cleanSheet = theirScore === 0 ? 3 : 0;
  const cards = myYellows * 1 + myReds * 3;
  let giantKilling = 0;
  if (myScore > theirScore) {
    const gap = myRank - theirRank;
    if (gap > 0) giantKilling = Math.floor(gap / 10);
  }
  return {
    goals,
    cleanSheet,
    yellows: myYellows,
    reds: myReds,
    cards,
    giantKilling,
    total: goals + cleanSheet + cards + giantKilling,
  };
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

export function liveBreakdownForTeam(
  teamId: string,
  result: Result,
  teamById: Map<string, Team>
): LiveMatchBreakdown {
  const m = matchBreakdownForTeam(teamId, result, teamById);
  const isA = result.team_a === teamId;
  return {
    ...m,
    yellows: isA ? (result.yellow_a ?? 0) : (result.yellow_b ?? 0),
    reds: isA ? (result.red_a ?? 0) : (result.red_b ?? 0),
  };
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
      const breakdown = aggregateTeamScore(team.id, teams, results);
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

/** Points for teams that appear in results but hold no drawcard — opponents and held-out pool sides. */
export function computeUnclaimedTeamScores(
  assignments: Assignment[],
  teams: Team[],
  results: Result[]
): TeamScore[] {
  const assigned = new Set(assignments.map((a) => a.team_id));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const unclaimedIds = new Set<string>();

  for (const r of results) {
    if (!assigned.has(r.team_a)) unclaimedIds.add(r.team_a);
    if (!assigned.has(r.team_b)) unclaimedIds.add(r.team_b);
  }

  const scores: TeamScore[] = [];
  for (const teamId of unclaimedIds) {
    const team = teamById.get(teamId);
    if (!team) continue;

    const breakdown = aggregateTeamScore(teamId, teams, results);
    if (breakdown.total > 0) {
      scores.push({ team, breakdown, total: breakdown.total });
    }
  }

  return scores.sort(
    (a, b) => b.total - a.total || a.team.name.localeCompare(b.team.name)
  );
}
