import type { Result } from "@/lib/scoring";
import type { SportEvent } from "@/lib/sportapi-events";
import type { WorldCup26Game } from "@/lib/worldcup26";
import { parseFurthestRound, type TournamentRound } from "@/lib/tournament-rounds";

const PEN_WINNER_RE = /\|pen:([A-Z]{3})/;

export function penWinnerFromNote(note: string | null | undefined): string | null {
  const m = note?.match(PEN_WINNER_RE);
  return m?.[1] ?? null;
}

export function noteWithPenWinner(note: string | null | undefined, winnerId: string): string {
  const base = note?.replace(PEN_WINNER_RE, "") ?? "";
  return `${base}|pen:${winnerId}`;
}

export function isKnockoutStage(stage: string): boolean {
  return parseFurthestRound(stage) !== "group";
}

export type KnockoutOutcome = "win" | "loss" | "draw" | null;

/** Who won/lost a knockout match — handles penalty shootouts via `|pen:TEAM` in note. */
export function knockoutOutcomeForTeam(result: Result, teamId: string): KnockoutOutcome {
  if (!isKnockoutStage(result.stage)) return null;
  const isA = result.team_a === teamId;
  const isB = result.team_b === teamId;
  if (!isA && !isB) return null;

  const penWinner = penWinnerFromNote(result.note);
  if (penWinner) {
    if (penWinner === teamId) return "win";
    if (penWinner === result.team_a || penWinner === result.team_b) return "loss";
  }

  const myScore = isA ? result.score_a : result.score_b;
  const theirScore = isA ? result.score_b : result.score_a;
  if (myScore > theirScore) return "win";
  if (myScore < theirScore) return "loss";
  return "draw";
}

export function lostKnockoutRound(teamId: string, results: Result[]): TournamentRound | null {
  for (const r of results) {
    if (knockoutOutcomeForTeam(r, teamId) === "loss") {
      return parseFurthestRound(r.stage);
    }
  }
  return null;
}

export function wonKnockoutRound(
  teamId: string,
  round: TournamentRound,
  results: Result[]
): boolean {
  for (const r of results) {
    if (parseFurthestRound(r.stage) !== round) continue;
    if (knockoutOutcomeForTeam(r, teamId) === "win") return true;
  }
  return false;
}

export function penWinnerFromSportEvent(
  ev: SportEvent,
  homeId: string,
  awayId: string
): string | null {
  const desc = ev.status?.description?.toLowerCase() ?? "";
  const homePen = ev.homeScore?.penalties;
  const awayPen = ev.awayScore?.penalties;
  const isPen =
    desc.includes("pen") || homePen != null || awayPen != null;

  if (!isPen) return null;
  if (homePen != null && awayPen != null) {
    if (homePen > awayPen) return homeId;
    if (awayPen > homePen) return awayId;
  }
  return null;
}

/** WC26 feed: explicit penalty shootout scores on the game object. */
export function penWinnerFromWorldCup26Game(
  game: WorldCup26Game,
  homeId: string,
  awayId: string
): string | null {
  const homePen = game.home_penalty_score;
  const awayPen = game.away_penalty_score;
  if (homePen == null || awayPen == null || homePen === "" || awayPen === "") {
    return null;
  }
  const h = Number(homePen);
  const a = Number(awayPen);
  if (!Number.isFinite(h) || !Number.isFinite(a) || h === a) return null;
  return h > a ? homeId : awayId;
}

/** WC26 feed: higher score after level FT in knockout often means pen winner (feed-dependent). */
export function penWinnerFromWc26Scores(
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number,
  stage: string,
  timeElapsed: string
): string | null {
  if (!isKnockoutStage(stage)) return null;
  const elapsed = timeElapsed.toLowerCase();
  if (!elapsed.includes("pen") && elapsed !== "finished") return null;
  if (homeScore === awayScore) return null;
  return homeScore > awayScore ? homeId : awayId;
}
