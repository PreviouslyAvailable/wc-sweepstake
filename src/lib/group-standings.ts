import type { Result } from "@/lib/scoring";
import { teamsInGroup, groupLetterForTeam, WC_GROUPS } from "@/lib/wc-groups";

export interface GroupTeamStats {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface GroupTableRow extends GroupTeamStats {
  position: number;
  groupLetter: string;
}

export interface ThirdPlaceRow {
  teamId: string;
  groupLetter: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
  /** True when group games are complete and position is locked at 3rd. */
  locked: boolean;
  /** Best possible stats if all remaining group games are won. */
  maxPoints: number;
  maxGoalDifference: number;
  maxGoalsFor: number;
}

export type GroupFateKind =
  | "in_race"           // still fighting for top 2
  | "clinched_top2"     // guaranteed top 2
  | "third_bubble"      // could qualify as best third
  | "clinched_third"    // locked in as a qualifying third
  | "eliminated";       // out of the tournament

export interface GroupFate {
  kind: GroupFateKind;
  position: number;
  maxPosition: number;
}

const GROUP_MATCHES = 3;

function emptyStats(teamId: string): GroupTeamStats {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  };
}

function groupResultsForTeams(
  teamIds: readonly string[],
  results: Result[]
): Result[] {
  const set = new Set(teamIds);
  return results.filter(
    (r) =>
      r.stage === "group" &&
      set.has(r.team_a) &&
      set.has(r.team_b)
  );
}

export function statsForTeam(
  teamId: string,
  groupTeamIds: readonly string[],
  results: Result[]
): GroupTeamStats {
  const stats = emptyStats(teamId);
  const groupResults = groupResultsForTeams(groupTeamIds, results);

  for (const r of groupResults) {
    const isHome = r.team_a === teamId;
    const isAway = r.team_b === teamId;
    if (!isHome && !isAway) continue;

    const gf = isHome ? r.score_a : r.score_b;
    const ga = isHome ? r.score_b : r.score_a;
    stats.played += 1;
    stats.goalsFor += gf;
    stats.goalsAgainst += ga;

    if (gf > ga) {
      stats.won += 1;
      stats.points += 3;
    } else if (gf === ga) {
      stats.drawn += 1;
      stats.points += 1;
    } else {
      stats.lost += 1;
    }
  }

  stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
  return stats;
}

function h2hStats(
  teamIds: readonly string[],
  results: Result[]
): Map<string, GroupTeamStats> {
  const set = new Set(teamIds);
  const map = new Map<string, GroupTeamStats>();
  for (const id of teamIds) map.set(id, emptyStats(id));

  for (const r of results) {
    if (r.stage !== "group") continue;
    if (!set.has(r.team_a) || !set.has(r.team_b)) continue;

    for (const [teamId, isHome] of [
      [r.team_a, true],
      [r.team_b, false],
    ] as const) {
      const stats = map.get(teamId)!;
      const gf = isHome ? r.score_a : r.score_b;
      const ga = isHome ? r.score_b : r.score_a;
      stats.played += 1;
      stats.goalsFor += gf;
      stats.goalsAgainst += ga;
      if (gf > ga) {
        stats.won += 1;
        stats.points += 3;
      } else if (gf === ga) {
        stats.drawn += 1;
        stats.points += 1;
      } else {
        stats.lost += 1;
      }
      stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
    }
  }

  return map;
}

function compareTiedTeams(
  a: string,
  b: string,
  tiedIds: readonly string[],
  groupTeamIds: readonly string[],
  groupResults: Result[],
  worldRanks: Map<string, number>
): number {
  // FIFA order after points: full-group GD, full-group GF, then mini-league H2H.
  const fullA = statsForTeam(a, groupTeamIds, groupResults);
  const fullB = statsForTeam(b, groupTeamIds, groupResults);
  if (fullA.goalDifference !== fullB.goalDifference) {
    return fullB.goalDifference - fullA.goalDifference;
  }
  if (fullA.goalsFor !== fullB.goalsFor) return fullB.goalsFor - fullA.goalsFor;

  const h2h = h2hStats(tiedIds, groupResults);
  const ha = h2h.get(a) ?? emptyStats(a);
  const hb = h2h.get(b) ?? emptyStats(b);

  if (ha.points !== hb.points) return hb.points - ha.points;
  if (ha.goalDifference !== hb.goalDifference) return hb.goalDifference - ha.goalDifference;
  if (ha.goalsFor !== hb.goalsFor) return hb.goalsFor - ha.goalsFor;

  const rankA = worldRanks.get(a) ?? 999;
  const rankB = worldRanks.get(b) ?? 999;
  return rankA - rankB;
}

export function sortGroupTable(
  groupTeamIds: readonly string[],
  results: Result[],
  worldRanks: Map<string, number>
): string[] {
  const groupResults = groupResultsForTeams(groupTeamIds, results);
  const statsMap = new Map(
    groupTeamIds.map((id) => [id, statsForTeam(id, groupTeamIds, groupResults)])
  );

  const byPoints = new Map<number, string[]>();
  for (const id of groupTeamIds) {
    const pts = statsMap.get(id)!.points;
    const list = byPoints.get(pts) ?? [];
    list.push(id);
    byPoints.set(pts, list);
  }

  const sorted: string[] = [];
  const pointBuckets = [...byPoints.keys()].sort((a, b) => b - a);

  for (const pts of pointBuckets) {
    const tied = byPoints.get(pts)!;
    if (tied.length === 1) {
      sorted.push(tied[0]);
      continue;
    }
    const ordered = [...tied].sort((a, b) =>
      compareTiedTeams(a, b, tied, groupTeamIds, groupResults, worldRanks)
    );
    sorted.push(...ordered);
  }

  return sorted;
}

export function buildGroupTable(
  groupLetter: string,
  results: Result[],
  worldRanks: Map<string, number>
): GroupTableRow[] {
  const teamIds = teamsInGroup(groupLetter);
  const ordered = sortGroupTable(teamIds, results, worldRanks);
  return ordered.map((teamId, i) => ({
    ...statsForTeam(teamId, teamIds, results),
    position: i + 1,
    groupLetter,
  }));
}

function maxPoints(stats: GroupTeamStats): number {
  const remaining = GROUP_MATCHES - stats.played;
  return stats.points + remaining * 3;
}

function maxGoalsFor(stats: GroupTeamStats): number {
  const remaining = GROUP_MATCHES - stats.played;
  // Generous upper bound — each remaining win could be high-scoring.
  return stats.goalsFor + remaining * 5;
}

function maxGoalDifference(stats: GroupTeamStats): number {
  const remaining = GROUP_MATCHES - stats.played;
  return stats.goalDifference + remaining * 5;
}

function compareThirdPlace(a: ThirdPlaceRow, b: ThirdPlaceRow): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
  return b.goalsFor - a.goalsFor;
}

function compareThirdPlaceMax(a: ThirdPlaceRow, b: ThirdPlaceRow): number {
  if (a.maxPoints !== b.maxPoints) return b.maxPoints - a.maxPoints;
  if (a.maxGoalDifference !== b.maxGoalDifference) {
    return b.maxGoalDifference - a.maxGoalDifference;
  }
  return b.maxGoalsFor - a.maxGoalsFor;
}

/** Rank the 12 third-place candidates; top 8 advance. */
export function buildThirdPlaceTable(
  results: Result[],
  worldRanks: Map<string, number>
): ThirdPlaceRow[] {
  const rows: ThirdPlaceRow[] = [];

  for (const letter of Object.keys(WC_GROUPS)) {
    const table = buildGroupTable(letter, results, worldRanks);
    const third = table[2];
    if (!third) continue;
    const remaining = GROUP_MATCHES - third.played;
    rows.push({
      teamId: third.teamId,
      groupLetter: letter,
      points: third.points,
      goalDifference: third.goalDifference,
      goalsFor: third.goalsFor,
      locked: remaining === 0,
      maxPoints: maxPoints(third),
      maxGoalDifference: maxGoalDifference(third),
      maxGoalsFor: maxGoalsFor(third),
    });
  }

  return rows.sort(compareThirdPlace);
}

/** Teams that might finish 3rd — for bubble / elimination math. */
function thirdPlaceCandidates(
  groupLetter: string,
  results: Result[],
  worldRanks: Map<string, number>
): ThirdPlaceRow[] {
  const teamIds = teamsInGroup(groupLetter);
  const ordered = sortGroupTable(teamIds, results, worldRanks);
  const statsMap = new Map(
    teamIds.map((id) => [id, statsForTeam(id, teamIds, results)])
  );

  const candidates = new Set<string>();
  // Current top 3 by table, plus anyone who could still reach 3rd on max points.
  for (let i = 0; i < ordered.length; i++) {
    candidates.add(ordered[i]);
  }
  for (const id of teamIds) {
    const stats = statsMap.get(id)!;
    const others = teamIds.filter((x) => x !== id);
    const otherMaxPts = others
      .map((x) => maxPoints(statsMap.get(x)!))
      .sort((a, b) => b - a);
    // Could this team finish 3rd? At least two others must finish below on max points.
    const myMax = maxPoints(stats);
    const teamsThatMustFinishAbove = otherMaxPts.filter((p) => p > myMax).length;
    if (teamsThatMustFinishAbove < 2) candidates.add(id);
  }

  return [...candidates].map((teamId) => {
    const stats = statsMap.get(teamId)!;
    const remaining = GROUP_MATCHES - stats.played;
    return {
      teamId,
      groupLetter,
      points: stats.points,
      goalDifference: stats.goalDifference,
      goalsFor: stats.goalsFor,
      locked: remaining === 0 && ordered.indexOf(teamId) === 2,
      maxPoints: maxPoints(stats),
      maxGoalDifference: maxGoalDifference(stats),
      maxGoalsFor: maxGoalsFor(stats),
    };
  });
}

export function analyzeGroupFate(
  teamId: string,
  results: Result[],
  worldRanks: Map<string, number>
): GroupFate | null {
  const letter = groupLetterForTeam(teamId);
  if (!letter) return null;

  const teamIds = teamsInGroup(letter);
  const ordered = sortGroupTable(teamIds, results, worldRanks);
  const statsMap = new Map(
    teamIds.map((id) => [id, statsForTeam(id, teamIds, results)])
  );
  const myStats = statsMap.get(teamId)!;
  const position = ordered.indexOf(teamId) + 1;
  const myMax = maxPoints(myStats);
  const myMin = myStats.points;

  // How many teams could finish strictly above us on max points?
  let teamsAboveOnMax = 0;
  for (const id of teamIds) {
    if (id === teamId) continue;
    if (maxPoints(statsMap.get(id)!) > myMin) teamsAboveOnMax += 1;
  }

  // Clinched top 2: at most one other team can finish ahead on points.
  if (teamsAboveOnMax <= 1 && position <= 2) {
    // Conservative tie check: if someone can tie our max and we're not clearly ahead on table, wait.
    let clinched = true;
    for (const id of teamIds) {
      if (id === teamId) continue;
      const otherMax = maxPoints(statsMap.get(id)!);
      if (otherMax > myStats.points) {
        clinched = false;
        break;
      }
      if (otherMax === myStats.points && ordered.indexOf(id) < position) {
        clinched = false;
        break;
      }
    }
    if (clinched && myStats.played > 0) {
      return { kind: "clinched_top2", position, maxPosition: 2 };
    }
  }

  // Locked 4th — three rivals already above our best possible total.
  const teamsGuaranteedAbove = teamIds.filter(
    (id) => id !== teamId && statsMap.get(id)!.points > myMax
  ).length;
  if (teamsGuaranteedAbove >= 3) {
    return { kind: "eliminated", position, maxPosition: 4 };
  }

  // Still fighting for a top-two finish (including 3rd on the table who can overtake 2nd).
  if (position <= 2) {
    return { kind: "in_race", position, maxPosition: Math.min(position, 2) };
  }

  const secondId = ordered[1];
  if (
    secondId &&
    secondId !== teamId &&
    (myMax > statsMap.get(secondId)!.points ||
      (myMax === statsMap.get(secondId)!.points &&
        ordered.indexOf(teamId) < ordered.indexOf(secondId)))
  ) {
    return { kind: "in_race", position, maxPosition: 2 };
  }

  // Third-place race
  const thirdTable = buildThirdPlaceTable(results, worldRanks);
  const myThird = thirdPlaceCandidates(letter, results, worldRanks).find(
    (r) => r.teamId === teamId
  );

  if (!myThird) {
    return { kind: "eliminated", position, maxPosition: 4 };
  }

  // Best possible third-place rank if team locks 3rd on max stats.
  const hypothetical = thirdTable.map((row) =>
    row.teamId === teamId
      ? {
          ...row,
          points: myThird.maxPoints,
          goalDifference: myThird.maxGoalDifference,
          goalsFor: myThird.maxGoalsFor,
          maxPoints: myThird.maxPoints,
          maxGoalDifference: myThird.maxGoalDifference,
          maxGoalsFor: myThird.maxGoalsFor,
        }
      : row
  );
  hypothetical.sort(compareThirdPlaceMax);
  const bestRank =
    hypothetical.findIndex((r) => r.teamId === teamId) + 1;

  // Worst case: current stats among locked thirds.
  const worstHypothetical = [...thirdTable];
  if (myThird.locked || myStats.played === GROUP_MATCHES) {
    const idx = worstHypothetical.findIndex((r) => r.teamId === teamId);
    if (idx >= 0) {
      worstHypothetical[idx] = {
        ...worstHypothetical[idx],
        points: myStats.points,
        goalDifference: myStats.goalDifference,
        goalsFor: myStats.goalsFor,
      };
    }
  }
  worstHypothetical.sort(compareThirdPlace);
  const worstRank =
    worstHypothetical.findIndex((r) => r.teamId === teamId) + 1;

  if (myThird.locked && worstRank <= 8) {
    return { kind: "clinched_third", position: 3, maxPosition: 3 };
  }
  if (bestRank <= 8 && worstRank > 8) {
    return { kind: "third_bubble", position: position >= 3 ? position : 3, maxPosition: 3 };
  }
  if (worstRank > 8 && bestRank > 8) {
    const remaining = GROUP_MATCHES - myStats.played;
    if (remaining > 0 && position >= 3) {
      return { kind: "third_bubble", position: position >= 3 ? position : 3, maxPosition: 3 };
    }
    return { kind: "eliminated", position, maxPosition: 4 };
  }
  if (bestRank <= 8 && worstRank <= 8) {
    return { kind: "clinched_third", position: 3, maxPosition: 3 };
  }

  return { kind: "third_bubble", position: position >= 3 ? position : 3, maxPosition: 3 };
}

export function groupMatchesRemaining(teamId: string, results: Result[]): number {
  const letter = groupLetterForTeam(teamId);
  if (!letter) return 0;
  const played = statsForTeam(teamId, teamsInGroup(letter), results).played;
  return Math.max(0, GROUP_MATCHES - played);
}
