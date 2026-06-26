import type { Result, Team } from "@/lib/scoring";
import type { WcFixture } from "@/lib/wc-fixtures";
import {
  lostKnockoutRound,
  wonKnockoutRound,
} from "@/lib/knockout-result";
import {
  analyzeGroupFate,
  groupMatchesRemaining,
  statsForTeam,
  sortGroupTable,
} from "@/lib/group-standings";
import { groupLetterForTeam, teamsInGroup } from "@/lib/wc-groups";
import {
  isGroupRoundName,
  maxRound,
  nextKnockoutRound,
  parseFurthestRound,
  roundDisplayLabel,
  roundFromName,
  roundShortLabel,
  type TournamentRound,
} from "@/lib/tournament-rounds";

export type TournamentFate = "in" | "out" | "bubble";

export function isTeamEliminated(
  team: Team,
  status: TeamTournamentStatus | undefined
): boolean {
  return team.is_out || status?.fate === "out";
}

export interface TeamTournamentStatus {
  playing: TournamentRound;
  secured: TournamentRound | null;
  fate: TournamentFate;
  groupLetter: string | null;
  groupPosition: number | null;
  label: string;
  detail: string;
  chip: string;
}

export interface TournamentStatusInput {
  teams: Team[];
  results: Result[];
  fixtures: WcFixture[];
}

function worldRankMap(teams: Team[]): Map<string, number> {
  return new Map(teams.map((t) => [t.id, t.world_rank]));
}

function openFixturesForTeam(teamId: string, fixtures: WcFixture[]): WcFixture[] {
  return fixtures
    .filter(
      (f) =>
        (f.status === "notstarted" || f.status === "inprogress") &&
        (f.homeId === teamId || f.awayId === teamId)
    )
    .sort((a, b) => a.startTimestamp - b.startTimestamp);
}

function fixtureSecuredRound(
  teamId: string,
  fixtures: WcFixture[],
  results: Result[]
): TournamentRound | null {
  const open = openFixturesForTeam(teamId, fixtures);
  const hasOpenGroup = open.some((f) => isGroupRoundName(f.roundName));
  // Knockout placeholders on the fixture sheet must not clinch R32 while group games remain.
  if (hasOpenGroup || groupMatchesRemaining(teamId, results) > 0) return null;

  const knockoutRounds = open
    .filter((f) => !isGroupRoundName(f.roundName))
    .map((f) => roundFromName(f.roundName))
    .filter((r) => r !== "group");

  if (!knockoutRounds.length) return null;
  return knockoutRounds.sort(
    (a, b) =>
      ["group", "r32", "r16", "qf", "sf", "third", "final"].indexOf(a) -
      ["group", "r32", "r16", "qf", "sf", "third", "final"].indexOf(b)
  )[0];
}

function playingRoundFromFixtures(
  teamId: string,
  fixtures: WcFixture[],
  results: Result[]
): TournamentRound | null {
  const open = openFixturesForTeam(teamId, fixtures);
  if (groupMatchesRemaining(teamId, results) > 0) {
    const nextGroup = open.find((f) => isGroupRoundName(f.roundName));
    if (nextGroup) return "group";
  }
  const next = open[0];
  if (!next) return null;
  return roundFromName(next.roundName);
}

function highestPlayedRound(teamId: string, results: Result[]): TournamentRound {
  const order: TournamentRound[] = [
    "group",
    "r32",
    "r16",
    "qf",
    "sf",
    "third",
    "final",
  ];
  let highest: TournamentRound = "group";
  for (const r of results) {
    if (r.team_a !== teamId && r.team_b !== teamId) continue;
    if (r.stage === "group") continue;
    const stage = parseFurthestRound(r.stage);
    if (order.indexOf(stage) > order.indexOf(highest)) highest = stage;
  }
  return highest;
}

function advancedToRound(
  teamId: string,
  results: Result[]
): TournamentRound | null {
  const played = highestPlayedRound(teamId, results);
  if (played === "group") return null;
  if (wonKnockoutRound(teamId, played, results)) {
    return nextKnockoutRound(played);
  }
  return null;
}

function standingsSecuredRound(
  teamId: string,
  results: Result[],
  worldRanks: Map<string, number>
): TournamentRound | null {
  const fate = analyzeGroupFate(teamId, results, worldRanks);
  if (!fate) return null;
  if (fate.kind === "clinched_top2" || fate.kind === "clinched_third") return "r32";
  return null;
}

function groupDetail(
  teamId: string,
  results: Result[],
  worldRanks: Map<string, number>
): string {
  const letter = groupLetterForTeam(teamId);
  if (!letter) return "";

  const ordered = sortGroupTable(teamsInGroup(letter), results, worldRanks);
  const position = ordered.indexOf(teamId) + 1;
  const stats = statsForTeam(teamId, teamsInGroup(letter), results);
  const remaining = groupMatchesRemaining(teamId, results);

  const ordinals = ["1st", "2nd", "3rd", "4th"];
  const posLabel = ordinals[position - 1] ?? `${position}th`;
  const pts = `${stats.points} pt${stats.points === 1 ? "" : "s"}`;

  if (remaining > 0) {
    return `${posLabel} · Group ${letter} · ${pts} · ${remaining} group game${remaining === 1 ? "" : "s"} left`;
  }
  return `${posLabel} · Group ${letter} · ${pts}`;
}

function buildLabelAndDetail(
  playing: TournamentRound,
  secured: TournamentRound | null,
  fate: TournamentFate,
  groupDetailText: string
): { label: string; detail: string; chip: string } {
  if (fate === "out") {
    return {
      label: "Out",
      detail: groupDetailText || "Eliminated",
      chip: "Out",
    };
  }

  if (fate === "bubble") {
    return {
      label: "Third-place race",
      detail: groupDetailText,
      chip: "3rd?",
    };
  }

  if (secured && playing === "group") {
    const remainingMatch = groupDetailText.match(/(\d+) group game/);
    const gamesLeft = remainingMatch?.[1];
    return {
      label: `Through · ${roundShortLabel(secured)}`,
      detail: gamesLeft
        ? `${gamesLeft} group game${gamesLeft === "1" ? "" : "s"} left`
        : groupDetailText,
      chip: roundShortLabel(secured),
    };
  }

  if (playing !== "group") {
    return {
      label: roundDisplayLabel(playing),
      detail: secured ? `Through · ${roundDisplayLabel(secured)}` : groupDetailText,
      chip: roundShortLabel(playing),
    };
  }

  return {
    label: roundDisplayLabel("group"),
    detail: groupDetailText,
    chip: "Group",
  };
}

export function computeTeamTournamentStatus(
  team: Team,
  results: Result[],
  fixtures: WcFixture[],
  worldRanks: Map<string, number>
): TeamTournamentStatus {
  const letter = groupLetterForTeam(team.id);
  const groupDetailText = letter
    ? groupDetail(team.id, results, worldRanks)
    : "";

  const knockoutLoss = lostKnockoutRound(team.id, results);
  const eliminated = team.is_out || Boolean(knockoutLoss);

  if (eliminated) {
    const { label, detail, chip } = buildLabelAndDetail(
      "group",
      null,
      "out",
      groupDetailText
    );
    return {
      playing: "group",
      secured: null,
      fate: "out",
      groupLetter: letter,
      groupPosition: letter
        ? sortGroupTable(teamsInGroup(letter), results, worldRanks).indexOf(team.id) + 1
        : null,
      label,
      detail: knockoutLoss
        ? `Lost · ${roundDisplayLabel(knockoutLoss)}`
        : detail,
      chip,
    };
  }

  const groupFate = analyzeGroupFate(team.id, results, worldRanks);
  let fate: TournamentFate = "in";
  if (groupFate?.kind === "third_bubble") fate = "bubble";
  if (groupFate?.kind === "eliminated") fate = "out";

  const groupRemaining = groupMatchesRemaining(team.id, results);
  const tablePosition = letter
    ? sortGroupTable(teamsInGroup(letter), results, worldRanks).indexOf(team.id) + 1
    : null;

  // Standings math can call a team out before the group stage ends — keep them
  // in play while group fixtures remain unless they're locked in 4th.
  if (fate === "out" && groupRemaining > 0) {
    if (tablePosition === 3 || groupFate?.kind === "third_bubble") {
      fate = "bubble";
    } else if (tablePosition !== null && tablePosition <= 2) {
      fate = "in";
    }
  }

  if (
    fate === "in" &&
    groupRemaining > 0 &&
    tablePosition === 3 &&
    groupFate?.kind !== "clinched_top2" &&
    groupFate?.kind !== "clinched_third"
  ) {
    fate = "bubble";
  }

  const fixtureSecured = fixtureSecuredRound(team.id, fixtures, results);
  const standingsSecured = standingsSecuredRound(team.id, results, worldRanks);
  const adminSecured = parseFurthestRound(team.furthest_round);
  const adminRound = adminSecured !== "group" ? adminSecured : null;

  let secured: TournamentRound | null = null;
  for (const candidate of [fixtureSecured, standingsSecured, adminRound]) {
    if (candidate) secured = secured ? maxRound(secured, candidate) : candidate;
  }

  const advanced = advancedToRound(team.id, results);
  if (advanced) {
    secured = secured ? maxRound(secured, advanced) : advanced;
  }

  let playing =
    playingRoundFromFixtures(team.id, fixtures, results) ??
    advanced ??
    secured ??
    highestPlayedRound(team.id, results);

  if (groupRemaining > 0 && playing !== "group") {
    playing = "group";
  }

  if (playing === "group" && secured && secured !== "group") {
    playing = "group";
  }

  if (fate === "out") {
    secured = null;
    playing = "group";
  }

  const position = tablePosition;

  const { label, detail, chip } = buildLabelAndDetail(
    playing,
    secured,
    fate,
    groupDetailText
  );

  return {
    playing,
    secured,
    fate,
    groupLetter: letter,
    groupPosition: position,
    label,
    detail,
    chip,
  };
}

export function buildTournamentStatusByTeam(
  input: TournamentStatusInput
): Map<string, TeamTournamentStatus> {
  const worldRanks = worldRankMap(input.teams);
  const map = new Map<string, TeamTournamentStatus>();
  for (const team of input.teams) {
    map.set(
      team.id,
      computeTeamTournamentStatus(team, input.results, input.fixtures, worldRanks)
    );
  }
  return map;
}

/** Derive DB progress fields from results + fixtures (ignores stored is_out / furthest_round). */
export function deriveTeamProgressFields(
  team: Team,
  results: Result[],
  fixtures: WcFixture[],
  worldRanks: Map<string, number>
): { is_out: boolean; furthest_round: TournamentRound } {
  const baseline: Team = { ...team, is_out: false, furthest_round: "group" };
  const status = computeTeamTournamentStatus(baseline, results, fixtures, worldRanks);

  if (status.fate === "out") {
    const loss = lostKnockoutRound(team.id, results);
    return { is_out: true, furthest_round: loss ?? "group" };
  }

  let furthest: TournamentRound = status.secured ?? "group";
  const played = highestPlayedRound(team.id, results);
  if (played !== "group") furthest = maxRound(furthest, played);
  const advanced = advancedToRound(team.id, results);
  if (advanced) furthest = maxRound(furthest, advanced);
  if (status.playing !== "group") furthest = maxRound(furthest, status.playing);

  return { is_out: false, furthest_round: furthest };
}
