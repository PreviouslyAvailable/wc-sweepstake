import {
  API_FOOTBALL_BASE,
  API_FOOTBALL_HOST,
  API_FOOTBALL_WC_LEAGUE,
  API_FOOTBALL_WC_SEASON,
  isApiFootballEnabled,
} from "@/lib/api-football-config";
import { fixturePairKey } from "@/lib/fixture-pair-key";
import { NAME_TO_ID } from "@/lib/team-names";

export interface ApiFootballCardCounts {
  yellow_a: number;
  red_a: number;
  yellow_b: number;
  red_b: number;
}

interface ApiFootballEnvelope<T> {
  response: T;
  errors?: Record<string, string>;
}

interface ApiFootballFixtureRow {
  fixture: { id: number; timestamp: number; status?: { short?: string } };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

interface ApiFootballEvent {
  team: { id: number; name: string };
  type: string;
  detail: string;
}

interface ApiFootballStat {
  type: string;
  value: number | string | null;
}

interface ApiFootballTeamStats {
  team: { id: number; name: string };
  statistics: ApiFootballStat[];
}

function apiFootballKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY not set");
  return key;
}

function apiFootballHeaders(): HeadersInit {
  return {
    "x-apisports-key": apiFootballKey(),
    Accept: "application/json",
  };
}

async function apiFootballFetch<T>(
  path: string
): Promise<{ data: T | null; error: string | null }> {
  const url = path.startsWith("http")
    ? path
    : `${API_FOOTBALL_BASE}/${path.replace(/^\//, "")}`;

  try {
    const res = await fetch(url, {
      headers: apiFootballHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
    const body = (await res.json()) as ApiFootballEnvelope<T>;
    if (body.errors && Object.keys(body.errors).length) {
      return { data: null, error: Object.values(body.errors).join(" ") };
    }
    return { data: body.response, error: null };
  } catch {
    return { data: null, error: "API-Football request failed" };
  }
}

let lastFixtureIndexError: string | null = null;

export function lastApiFootballFixtureIndexError(): string | null {
  return lastFixtureIndexError;
}

export function teamIdFromApiFootballName(name: string): string | null {
  return NAME_TO_ID[name] ?? null;
}

export interface ApiFootballFixtureRef {
  fixtureId: number;
  homeApiName: string;
  awayApiName: string;
  homeId: string;
  awayId: string;
}

/** All World Cup 2026 fixtures keyed by canonical team pair. */
export async function fetchApiFootballFixtureIndex(): Promise<Map<string, ApiFootballFixtureRef>> {
  if (!isApiFootballEnabled()) return new Map();

  lastFixtureIndexError = null;
  const index = new Map<string, ApiFootballFixtureRef>();
  let page = 1;

  while (page <= 10) {
    const { data: rows, error } = await apiFootballFetch<ApiFootballFixtureRow[]>(
      `/fixtures?league=${API_FOOTBALL_WC_LEAGUE}&season=${API_FOOTBALL_WC_SEASON}&page=${page}`
    );
    if (error) {
      lastFixtureIndexError = error;
      break;
    }
    if (!rows?.length) break;

    for (const row of rows) {
      const homeId = teamIdFromApiFootballName(row.teams.home.name);
      const awayId = teamIdFromApiFootballName(row.teams.away.name);
      if (!homeId || !awayId) continue;
      index.set(fixturePairKey(homeId, awayId), {
        fixtureId: row.fixture.id,
        homeApiName: row.teams.home.name,
        awayApiName: row.teams.away.name,
        homeId,
        awayId,
      });
    }

    if (rows.length < 100) break;
    page++;
  }

  return index;
}

function statValue(stats: ApiFootballStat[], type: string): number {
  const row = stats.find((s) => s.type.toLowerCase() === type.toLowerCase());
  if (!row || row.value == null) return 0;
  const n = typeof row.value === "number" ? row.value : parseInt(String(row.value), 10);
  return Number.isFinite(n) ? n : 0;
}

function cardsFromEvents(
  events: ApiFootballEvent[],
  homeApiName: string,
  awayApiName: string,
  homeIsA: boolean
): ApiFootballCardCounts {
  let homeYellows = 0;
  let homeReds = 0;
  let awayYellows = 0;
  let awayReds = 0;

  for (const ev of events) {
    if (ev.type !== "Card") continue;
    const detail = ev.detail.toLowerCase();
    const isHome = ev.team.name === homeApiName;

    if (detail.includes("yellow")) {
      if (isHome) homeYellows++;
      else awayYellows++;
    } else if (detail === "red card") {
      if (isHome) homeReds++;
      else awayReds++;
    }
  }

  return homeIsA
    ? { yellow_a: homeYellows, red_a: homeReds, yellow_b: awayYellows, red_b: awayReds }
    : { yellow_a: awayYellows, red_a: awayReds, yellow_b: homeYellows, red_b: homeReds };
}

function cardsFromStatistics(
  stats: ApiFootballTeamStats[],
  homeApiName: string,
  awayApiName: string,
  homeIsA: boolean
): ApiFootballCardCounts | null {
  const home = stats.find((s) => s.team.name === homeApiName);
  const away = stats.find((s) => s.team.name === awayApiName);
  if (!home || !away) return null;

  const homeYellows = statValue(home.statistics, "Yellow Cards");
  const awayYellows = statValue(away.statistics, "Yellow Cards");
  const homeReds = statValue(home.statistics, "Red Cards");
  const awayReds = statValue(away.statistics, "Red Cards");

  if (!homeYellows && !awayYellows && !homeReds && !awayReds) return null;

  return homeIsA
    ? { yellow_a: homeYellows, red_a: homeReds, yellow_b: awayYellows, red_b: awayReds }
    : { yellow_a: awayYellows, red_a: awayReds, yellow_b: homeYellows, red_b: homeReds };
}

export async function fetchApiFootballCardsForFixture(
  fixtureId: number,
  homeApiName: string,
  awayApiName: string,
  homeIsA: boolean
): Promise<ApiFootballCardCounts | null> {
  const { data: events } = await apiFootballFetch<ApiFootballEvent[]>(
    `/fixtures/events?fixture=${fixtureId}`
  );
  if (events?.length) {
    const fromEvents = cardsFromEvents(events, homeApiName, awayApiName, homeIsA);
    const total =
      fromEvents.yellow_a +
      fromEvents.red_a +
      fromEvents.yellow_b +
      fromEvents.red_b;
    if (total > 0) return fromEvents;
  }

  const { data: stats } = await apiFootballFetch<ApiFootballTeamStats[]>(
    `/fixtures/statistics?fixture=${fixtureId}`
  );
  if (!stats?.length) return null;
  return cardsFromStatistics(stats, homeApiName, awayApiName, homeIsA);
}

export type ApiFootballFixtureLookup = Map<string, ApiFootballFixtureRef>;

export function resolveApiFootballFixture(
  teamA: string,
  teamB: string,
  index: ApiFootballFixtureLookup
): {
  fixtureId: number;
  homeApiName: string;
  awayApiName: string;
  homeIsA: boolean;
} | null {
  const ref = index.get(fixturePairKey(teamA, teamB));
  if (!ref) return null;
  return {
    fixtureId: ref.fixtureId,
    homeApiName: ref.homeApiName,
    awayApiName: ref.awayApiName,
    homeIsA: ref.homeId === teamA,
  };
}

export { API_FOOTBALL_HOST };
