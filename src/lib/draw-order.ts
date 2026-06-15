export interface DrawAssignment {
  participant_id: string;
  team_id: string;
  position: number;
}

export interface DrawPerson {
  id: string;
  name: string;
}

export interface DrawTeam {
  id: string;
  name: string;
  flag: string;
  band: string;
  world_rank: number;
}

export interface ParticipantReveal {
  participantId: string;
  name: string;
  cardA: DrawTeam;
  cardB: DrawTeam;
}

/** Build per-participant reveal queue from persisted shuffle order. */
export function buildParticipantReveals(
  assignments: DrawAssignment[],
  people: DrawPerson[],
  teams: DrawTeam[],
  participantOrder?: string[] | null
): ParticipantReveal[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  const byParticipant = new Map<string, { a?: DrawTeam; b?: DrawTeam }>();
  for (const row of assignments) {
    const team = teamById.get(row.team_id);
    if (!team) continue;
    const slot = byParticipant.get(row.participant_id) ?? {};
    if (row.position === 0) slot.a = team;
    else slot.b = team;
    byParticipant.set(row.participant_id, slot);
  }

  const order =
    participantOrder?.length
      ? participantOrder.filter((id) => byParticipant.has(id))
      : people.map((p) => p.id).filter((id) => byParticipant.has(id));

  return order
    .map((participantId) => {
      const slot = byParticipant.get(participantId);
      if (!slot?.a || !slot?.b) return null;
      return {
        participantId,
        name: nameById.get(participantId) ?? participantId,
        cardA: slot.a,
        cardB: slot.b,
      };
    })
    .filter((r): r is ParticipantReveal => r !== null);
}

/** Ticket list order for the archive grid (Band A, then Band B). */
export function buildDealOrder(
  assignments: DrawAssignment[],
  people: DrawPerson[]
): DrawAssignment[] {
  return [...assignments].sort(
    (a, b) =>
      a.position - b.position ||
      people.findIndex((p) => p.id === a.participant_id) -
        people.findIndex((p) => p.id === b.participant_id)
  );
}
