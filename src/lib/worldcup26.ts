import { NAME_TO_ID } from "@/lib/team-names";
import { venueLocalToUtcEpoch } from "@/lib/stadium-timezones";
import { roundFromName } from "@/lib/tournament-rounds";
import type { WcFixture } from "@/lib/wc-fixtures";
import type { Result, Team } from "@/lib/scoring";
import {
  displayLabel,
  resolveKnockoutSlot,
  winnerGroupLetterFromSide,
} from "@/lib/knockout-slots";

export const WORLDCUP26_BASE =
  process.env.WORLDCUP26_API_URL ?? "https://worldcup26.ir";

/** Live feed from worldcup26.ir — free, no API key. Set WORLDCUP26_DISABLED=true to turn off. */
export function isWorldCup26Enabled(): boolean {
  return process.env.WORLDCUP26_DISABLED !== "true";
}

export const WORLDCUP26_NOTE_PREFIX = "wc26:";

export interface WorldCup26Game {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  group: string;
  matchday: string;
  local_date: string;
  stadium_id?: string;
  finished: string;
  time_elapsed: string;
  type: string;
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_team_label?: string;
  away_team_label?: string;
}

type FetchInit = Pick<RequestInit, "cache" | "next">;

function parseLocalDate(localDate: string, stadiumId?: string): number {
  // MM/DD/YYYY HH:mm — kickoff in the host stadium's local timezone
  return venueLocalToUtcEpoch(localDate, stadiumId);
}

function teamIdFromName(name: string | undefined): string | null {
  if (!name) return null;
  return NAME_TO_ID[name] ?? null;
}

function gameStatus(game: WorldCup26Game): string {
  const elapsed = (game.time_elapsed ?? "").toLowerCase();
  if (game.finished === "TRUE" || elapsed === "finished") return "finished";
  if (elapsed === "notstarted" || !elapsed) return "notstarted";
  return "inprogress";
}

function roundNameFromGame(game: WorldCup26Game): string {
  if (game.type === "group") return `FIFA World Cup, Group ${game.group}`;
  const labels: Record<string, string> = {
    r32: "Round of 32",
    r16: "Round of 16",
    qf: "Quarter-finals",
    sf: "Semi-finals",
    third: "Third place",
    final: "Final",
  };
  return labels[game.type] ?? game.group ?? game.type;
}

export function worldCup26GameToFixture(
  game: WorldCup26Game,
  context?: { results: Result[]; worldRanks: Map<string, number> }
): WcFixture | null {
  const isKnockout = game.type !== "group";
  const homeWinnerGroup = context
    ? winnerGroupLetterFromSide(
        game.home_team_name_en,
        game.home_team_label,
        context.results,
        context.worldRanks
      )
    : null;
  const awayWinnerGroup = context
    ? winnerGroupLetterFromSide(
        game.away_team_name_en,
        game.away_team_label,
        context.results,
        context.worldRanks
      )
    : null;

  const resolveCtx = context
    ? {
        results: context.results,
        worldRanks: context.worldRanks,
      }
    : null;

  const homeId = resolveCtx
    ? resolveKnockoutSlot(game.home_team_name_en, game.home_team_label, {
        ...resolveCtx,
        opponentWinnerGroup: awayWinnerGroup,
      })
    : teamIdFromName(game.home_team_name_en);
  const awayId = resolveCtx
    ? resolveKnockoutSlot(game.away_team_name_en, game.away_team_label, {
        ...resolveCtx,
        opponentWinnerGroup: homeWinnerGroup,
      })
    : teamIdFromName(game.away_team_name_en);

  const homeLabel = displayLabel(game.home_team_name_en, game.home_team_label);
  const awayLabel = displayLabel(game.away_team_name_en, game.away_team_label);

  if (!homeId && !awayId && !isKnockout) return null;
  if (isKnockout && !homeId && !awayId && !homeLabel && !awayLabel) return null;

  return {
    id: Number(game.id),
    status: gameStatus(game),
    startTimestamp: parseLocalDate(game.local_date, game.stadium_id),
    homeId,
    awayId,
    homeLabel: homeId ? undefined : homeLabel,
    awayLabel: awayId ? undefined : awayLabel,
    roundName: roundNameFromGame(game),
  };
}

export function worldCup26Stage(game: WorldCup26Game): string {
  if (game.type === "group") return "group";
  return roundFromName(game.type);
}

export function worldCup26Note(gameId: string | number): string {
  return `${WORLDCUP26_NOTE_PREFIX}${gameId}`;
}

export function isWorldCup26Note(note: string | null | undefined): boolean {
  return typeof note === "string" && note.startsWith(WORLDCUP26_NOTE_PREFIX);
}

async function fetchJson<T>(path: string, init: FetchInit = {}): Promise<T | null> {
  try {
    const res = await fetch(`${WORLDCUP26_BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchWorldCup26Games(init: FetchInit = {}): Promise<WorldCup26Game[]> {
  const body = await fetchJson<{ games?: WorldCup26Game[] } | WorldCup26Game[]>(
    "/get/games",
    init
  );
  if (!body) return [];
  if (Array.isArray(body)) return body;
  return body.games ?? [];
}

export interface WorldCup26FixtureContext {
  results: Result[];
  teams?: Team[];
}

function worldRanksFromTeams(teams: Team[] | undefined): Map<string, number> {
  return new Map((teams ?? []).map((t) => [t.id, t.world_rank]));
}

export async function fetchWorldCup26Fixtures(
  init: FetchInit = {},
  context?: WorldCup26FixtureContext
): Promise<WcFixture[]> {
  const games = await fetchWorldCup26Games(init);
  const worldRanks = worldRanksFromTeams(context?.teams);
  const resolveCtx = context
    ? { results: context.results, worldRanks }
    : undefined;
  const fixtures: WcFixture[] = [];
  for (const game of games) {
    const parsed = worldCup26GameToFixture(game, resolveCtx);
    if (parsed) fixtures.push(parsed);
  }
  return fixtures;
}

export function statusLabelFromGame(game: WorldCup26Game): string {
  const status = gameStatus(game);
  if (status === "notstarted") return "";
  if (status === "finished") return "FT";
  const elapsed = game.time_elapsed ?? "";
  if (/half/i.test(elapsed) || elapsed === "HT") return "HT";
  if (elapsed && elapsed !== "notstarted" && elapsed !== "finished") return elapsed;
  return "LIVE";
}
