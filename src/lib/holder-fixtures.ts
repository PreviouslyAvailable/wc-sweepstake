import type { Assignment, Participant, Team } from "@/lib/scoring";
import { isGroupRoundName } from "@/lib/tournament-rounds";
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
  home: FixtureSide;
  away: FixtureSide;
}

/** Upcoming matches where at least one alive assigned drawcard is playing. */
export function buildUpcomingHolderFixtures(
  fixtures: WcFixture[],
  assignments: Assignment[],
  participants: Participant[],
  teams: Team[]
): HolderFixtureRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const assigned = new Set(assignments.map((a) => a.team_id));
  const ownerByTeamId = buildOwnerByTeamId(assignments, participants);

  const open = fixtures.filter(
    (f) => f.status === "notstarted" || f.status === "inprogress"
  );

  const rows: HolderFixtureRow[] = [];
  for (const f of open) {
    if (!f.homeId || !f.awayId) continue;

    const homeTeam = teamById.get(f.homeId);
    const awayTeam = teamById.get(f.awayId);
    if (!homeTeam || !awayTeam) continue;

    const homeHeld = assigned.has(f.homeId) && !homeTeam.is_out;
    const awayHeld = assigned.has(f.awayId) && !awayTeam.is_out;
    if (!homeHeld && !awayHeld) continue;

    rows.push({
      fixtureId: f.id,
      startTimestamp: f.startTimestamp,
      isLive: f.status === "inprogress",
      isKnockout: !isGroupRoundName(f.roundName),
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
