import type {
  Assignment,
  Participant,
  Result,
  StandingRow,
  Team,
} from "@/lib/scoring";
import { fmtFixtureNzstDate, fmtFixtureNzstDateTime, fmtFixtureNzstTime } from "@/lib/match-dates";
import { formatTipLines } from "@/lib/tooltip-format";
import type { WcFixture } from "@/lib/wc-fixtures";
import type { TeamTournamentStatus } from "@/lib/tournament-status";
import { isTeamEliminated } from "@/lib/tournament-status";
import { isGroupRoundName } from "@/lib/tournament-rounds";

export interface TeamNextFixture {
  teamFlag: string;
  opponentLabel: string;
  isLive: boolean;
  startTimestamp: number;
}

export interface LadderRowMeta {
  gamesPlayed: number;
  gamesLeft: number;
  gamesTooltip: string;
  nextLabel: string;
  nextTitle: string;
  nextTime: string;
  nextTimeTitle: string;
  nextDate: string;
  nextDateTitle: string;
}

export function gamesPlayedForTeam(teamId: string, results: Result[]): number {
  return results.filter((r) => r.team_a === teamId || r.team_b === teamId).length;
}

export function buildOwnerByTeamId(
  assignments: Assignment[],
  participants: Participant[]
): Map<string, string> {
  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  return new Map(
    assignments.map((a) => [a.team_id, nameById.get(a.participant_id) ?? ""])
  );
}

function fixtureForTeam(
  teamId: string,
  fixture: WcFixture,
  teamById: Map<string, Team>,
  ownerByTeamId: Map<string, string>
): TeamNextFixture | null {
  const opponentId =
    fixture.homeId === teamId ? fixture.awayId : fixture.homeId;
  if (!opponentId) return null;

  const opponent = teamById.get(opponentId);
  if (!opponent) return null;

  const team = teamById.get(teamId);
  const holder = ownerByTeamId.get(opponentId);

  return {
    teamFlag: team?.flag ?? "🏳️",
    opponentLabel: holder || opponent.name,
    isLive: fixture.status === "inprogress",
    startTimestamp: fixture.startTimestamp,
  };
}

export function buildGamesLeftByTeam(fixtures: WcFixture[]): Map<string, number> {
  const remaining = fixtures.filter(
    (f) => f.status === "notstarted" || f.status === "inprogress"
  );
  // During the group stage, only count group-stage fixtures so that already-scheduled
  // knockout games (where teams have clinched their spot) don't inflate the count.
  // Once no group-stage games remain, fall back to all remaining fixtures.
  const groupStage = remaining.filter((f) => isGroupRoundName(f.roundName));
  const toCount = groupStage.length > 0 ? groupStage : remaining;
  const counts = new Map<string, number>();
  for (const f of toCount) {
    for (const teamId of [f.homeId, f.awayId]) {
      if (!teamId) continue;
      counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    }
  }
  return counts;
}

export function buildNextFixtureByTeam(
  fixtures: WcFixture[],
  ownerByTeamId: Map<string, string>,
  teamById: Map<string, Team>
): Map<string, TeamNextFixture> {
  const open = fixtures.filter(
    (f) => f.status === "notstarted" || f.status === "inprogress"
  );

  const byTeam = new Map<string, WcFixture[]>();
  for (const f of open) {
    for (const teamId of [f.homeId, f.awayId]) {
      if (!teamId) continue;
      const list = byTeam.get(teamId) ?? [];
      list.push(f);
      byTeam.set(teamId, list);
    }
  }

  const next = new Map<string, TeamNextFixture>();
  for (const [teamId, list] of byTeam) {
    const sorted = [...list].sort((a, b) => a.startTimestamp - b.startTimestamp);
    for (const fixture of sorted) {
      const resolved = fixtureForTeam(teamId, fixture, teamById, ownerByTeamId);
      if (resolved) {
        next.set(teamId, resolved);
        break;
      }
    }
  }
  return next;
}

export function ladderRowMeta(
  row: StandingRow,
  results: Result[],
  nextByTeam: Map<string, TeamNextFixture>,
  gamesLeftByTeam: Map<string, number>,
  statusByTeam?: Map<string, TeamTournamentStatus>
): LadderRowMeta {
  let gamesPlayed = 0;
  let gamesLeft = 0;
  const gameParts: string[] = [];

  for (const { team } of row.teams) {
    const played = gamesPlayedForTeam(team.id, results);
    const left = gamesLeftByTeam.get(team.id) ?? 0;
    const eliminated = isTeamEliminated(team, statusByTeam?.get(team.id));
    gamesPlayed += played;
    if (!eliminated) gamesLeft += left;
    const matchLine = eliminated
      ? `${team.flag} ${team.name}: ${played} played · out`
      : `${team.flag} ${team.name}: ${played} played · ${left} left`;
    gameParts.push(matchLine);
  }

  const alive = row.teams.filter(({ team }) => {
    const eliminated = isTeamEliminated(team, statusByTeam?.get(team.id));
    return !eliminated;
  });
  const upcoming = alive
    .map(({ team }) => {
      const fixture = nextByTeam.get(team.id);
      return fixture ? { team, fixture } : null;
    })
    .filter((x): x is { team: Team; fixture: TeamNextFixture } => Boolean(x))
    .sort((a, b) => a.fixture.startTimestamp - b.fixture.startTimestamp);

  if (!alive.length) {
    return {
      gamesPlayed,
      gamesLeft: 0,
      gamesTooltip: gameParts.length ? formatTipLines(...gameParts) : formatTipLines("No matches filed"),
      nextLabel: "Out",
      nextTitle: "Both drawcards eliminated",
      nextTime: "—",
      nextTimeTitle: "",
      nextDate: "—",
      nextDateTitle: "",
    };
  }

  if (!upcoming.length) {
    return {
      gamesPlayed,
      gamesLeft,
      gamesTooltip: gameParts.length ? formatTipLines(...gameParts) : formatTipLines("No matches filed"),
      nextLabel: "—",
      nextTitle: "No upcoming fixture on the sheet",
      nextTime: "—",
      nextTimeTitle: "",
      nextDate: "—",
      nextDateTitle: "",
    };
  }

  const labels = upcoming.map(({ fixture }) =>
    fixture.isLive
      ? `${fixture.teamFlag} vs ${fixture.opponentLabel} · LIVE`
      : `${fixture.teamFlag} vs ${fixture.opponentLabel}`
  );

  const fixtureLines = upcoming.map(({ fixture }) => {
    const opponent = fixture.isLive
      ? `${fixture.teamFlag} vs ${fixture.opponentLabel} · LIVE`
      : `${fixture.teamFlag} vs ${fixture.opponentLabel}`;
    const when = fixture.isLive
      ? ""
      : ` · ${fmtFixtureNzstDateTime(fixture.startTimestamp)}`;
    return `${opponent}${when}`;
  });

  const primary = upcoming[0].fixture;

  return {
    gamesPlayed,
    gamesLeft,
    gamesTooltip: gameParts.length ? formatTipLines(...gameParts) : formatTipLines("No matches filed"),
    nextLabel: labels[0],
    nextTitle: formatTipLines(...fixtureLines),
    nextTime: primary.isLive ? "LIVE" : fmtFixtureNzstTime(primary.startTimestamp),
    nextTimeTitle: "",
    nextDate: fmtFixtureNzstDate(primary.startTimestamp),
    nextDateTitle: "",
  };
}
