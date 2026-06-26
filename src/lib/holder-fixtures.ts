import type { Assignment, Participant, Team } from "@/lib/scoring";
import { isGroupRoundName, roundShortLabel, roundFromName } from "@/lib/tournament-rounds";
import { buildTournamentStatusByTeam, isTeamEliminated } from "@/lib/tournament-status";
import type { WcFixture } from "@/lib/wc-fixtures";
import { buildOwnerByTeamId } from "@/lib/ladder-meta";

export interface FixtureSide {
  team: Team;
  holder: string | null;
}

export interface HolderFixtureRow {
  fixtureId: number;
  startTimestamp: number;
  isLive: boolean;
  isKnockout: boolean;
  roundLabel: string;
  home: FixtureSide;
  away: FixtureSide;
}

/** Upcoming matches where at least one alive assigned drawcard is playing. */
export function buildUpcomingHolderFixtures(
  fixtures: WcFixture[],
  assignments: Assignment[],
  participants: Participant[],
  teams: Team[],
  results: import("@/lib/scoring").Result[] = []
): HolderFixtureRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const assigned = new Set(assignments.map((a) => a.team_id));
  const ownerByTeamId = buildOwnerByTeamId(assignments, participants);
  const statusByTeam = buildTournamentStatusByTeam({ teams, results, fixtures });

  const open = fixtures.filter(
    (f) => f.status === "notstarted" || f.status === "inprogress"
  );

  const rows: HolderFixtureRow[] = [];
  for (const f of open) {
    if (!f.homeId || !f.awayId) continue;

    const homeTeam = teamById.get(f.homeId);
    const awayTeam = teamById.get(f.awayId);
    if (!homeTeam || !awayTeam) continue;

    const homeHeld =
      assigned.has(f.homeId) && !isTeamEliminated(homeTeam, statusByTeam.get(f.homeId));
    const awayHeld =
      assigned.has(f.awayId) && !isTeamEliminated(awayTeam, statusByTeam.get(f.awayId));
    if (!homeHeld && !awayHeld) continue;

    const isKnockout = Boolean(f.roundName) && !isGroupRoundName(f.roundName);
    const roundLabel = isKnockout ? roundShortLabel(roundFromName(f.roundName)) : "";

    rows.push({
      fixtureId: f.id,
      startTimestamp: f.startTimestamp,
      isLive: f.status === "inprogress",
      isKnockout,
      roundLabel,
      home: {
        team: homeTeam,
        holder: assigned.has(f.homeId) ? ownerByTeamId.get(f.homeId) ?? null : null,
      },
      away: {
        team: awayTeam,
        holder: assigned.has(f.awayId) ? ownerByTeamId.get(f.awayId) ?? null : null,
      },
    });
  }

  return rows.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return a.startTimestamp - b.startTimestamp;
  });
}
