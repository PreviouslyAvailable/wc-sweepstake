/** SportAPI score object on a scheduled event. */
export interface SportEventScores {
  homeScore?: { normaltime?: number; current?: number; overtime?: number; penalties?: number };
  awayScore?: { normaltime?: number; current?: number; overtime?: number; penalties?: number };
  status?: { type?: string; description?: string };
}

/** Full-time scores for sweepstake scoring — normal time + ET, never penalties. */
export function ftScoresFromSportEvent(ev: SportEventScores): { scoreA: number; scoreB: number } {
  const desc = (ev.status?.description ?? "").toLowerCase();
  const isPen =
    desc.includes("pen") ||
    ev.homeScore?.penalties != null ||
    ev.awayScore?.penalties != null;

  if (isPen) {
    return {
      scoreA: (ev.homeScore?.normaltime ?? 0) + (ev.homeScore?.overtime ?? 0),
      scoreB: (ev.awayScore?.normaltime ?? 0) + (ev.awayScore?.overtime ?? 0),
    };
  }

  return {
    scoreA:
      (ev.homeScore?.normaltime ?? ev.homeScore?.current ?? 0) +
      (ev.homeScore?.overtime ?? 0),
    scoreB:
      (ev.awayScore?.normaltime ?? ev.awayScore?.current ?? 0) +
      (ev.awayScore?.overtime ?? 0),
  };
}

/** Live or not-yet-filed in-progress score from the API feed. */
export function liveScoresFromSportEvent(ev: SportEventScores): { scoreA: number; scoreB: number } {
  return {
    scoreA: ev.homeScore?.current ?? 0,
    scoreB: ev.awayScore?.current ?? 0,
  };
}
