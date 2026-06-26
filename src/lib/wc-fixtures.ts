import { fixturePairKey } from "@/lib/fixture-pair-key";
import { isSportApiEnabled } from "@/lib/sportapi-config";
import { fetchWcSportEvents, type SportEvent } from "@/lib/sportapi-events";
import { buildLocalWcFixtures } from "@/lib/wc-local-schedule";
import {
  fetchWorldCup26Fixtures,
  fetchWorldCup26Games,
  isWorldCup26Enabled,
  type WorldCup26Game,
} from "@/lib/worldcup26";
import { NAME_TO_ID } from "@/lib/team-names";
import type { Result, Team } from "@/lib/scoring";
import { nextFixtureDates } from "@/lib/tournament-dates";

export interface WcFixture {
  id: number;
  status: string;
  startTimestamp: number;
  homeId: string | null;
  awayId: string | null;
  homeLabel?: string;
  awayLabel?: string;
  roundName: string;
}

export interface WcFixtureSources {
  sportEventsById: Map<number, SportEvent>;
  worldCupGamesById: Map<number, WorldCup26Game>;
}

function parseEvent(ev: SportEvent): WcFixture | null {
  const homeApiName: string = ev.homeTeam?.name ?? "";
  const awayApiName: string = ev.awayTeam?.name ?? "";
  return {
    id: ev.id,
    status: ev.status?.type ?? "",
    startTimestamp: ev.startTimestamp ?? 0,
    homeId: NAME_TO_ID[homeApiName] ?? null,
    awayId: NAME_TO_ID[awayApiName] ?? null,
    roundName: ev.roundInfo?.name ?? ev.tournament?.name ?? "",
  };
}

function eventDate(ts: number): string {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

function filterByDates(fixtures: WcFixture[], dates: string[]): WcFixture[] {
  if (!dates.length) return fixtures;
  const allowed = new Set(dates);
  return fixtures.filter((f) => allowed.has(eventDate(f.startTimestamp)));
}

function mergeFixtures(primary: WcFixture[], overlay: WcFixture[]): WcFixture[] {
  const out = [...primary];
  const byId = new Map(out.map((f) => [f.id, f]));
  const byPair = new Map(
    out
      .filter((f) => f.homeId && f.awayId)
      .map((f) => [fixturePairKey(f.homeId!, f.awayId!), f] as const)
  );

  for (const f of overlay) {
    if (f.homeId && f.awayId) {
      const key = fixturePairKey(f.homeId, f.awayId);
      const prev = byPair.get(key);
      if (prev) {
        const idx = out.indexOf(prev);
        if (idx >= 0) out[idx] = f;
        byPair.set(key, f);
        byId.set(f.id, f);
        continue;
      }
    }
    if (byId.has(f.id)) {
      const idx = out.findIndex((x) => x.id === f.id);
      if (idx >= 0) out[idx] = f;
    } else {
      out.push(f);
    }
    byId.set(f.id, f);
    if (f.homeId && f.awayId) {
      byPair.set(fixturePairKey(f.homeId, f.awayId), f);
    }
  }

  return out.sort((a, b) => a.startTimestamp - b.startTimestamp);
}

export interface FetchWcFixturesOptions {
  results?: Result[];
  dates?: string[];
  teams?: Team[];
}

export async function fetchWcFixturesBundle(
  options: FetchWcFixturesOptions = {}
): Promise<{ fixtures: WcFixture[]; sources: WcFixtureSources }> {
  const dates = options.dates ?? nextFixtureDates();
  const from = dates[0];
  const to = dates[dates.length - 1];

  let fixtures = buildLocalWcFixtures(options.results ?? []);
  const sportEventsById = new Map<number, SportEvent>();
  const worldCupGamesById = new Map<number, WorldCup26Game>();

  if (isWorldCup26Enabled()) {
    try {
      const [games, remote] = await Promise.all([
        fetchWorldCup26Games({ next: { revalidate: 60 } }),
        fetchWorldCup26Fixtures(
          { next: { revalidate: 60 } },
          { results: options.results ?? [], teams: options.teams }
        ),
      ]);
      for (const game of games) worldCupGamesById.set(Number(game.id), game);
      if (remote.length) fixtures = mergeFixtures(fixtures, remote);
    } catch {
      // keep local schedule
    }
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (isSportApiEnabled() && apiKey) {
    try {
      const events = await fetchWcSportEvents(apiKey, {
        from,
        to,
        dates,
        next: { revalidate: 120 },
      });
      const apiFixtures: WcFixture[] = [];
      for (const ev of events) {
        sportEventsById.set(ev.id, ev);
        const parsed = parseEvent(ev);
        if (parsed) apiFixtures.push(parsed);
      }
      if (apiFixtures.length) fixtures = mergeFixtures(fixtures, apiFixtures);
    } catch {
      // keep existing fixtures
    }
  }

  return {
    fixtures: filterByDates(fixtures, dates),
    sources: { sportEventsById, worldCupGamesById },
  };
}

export async function fetchWcFixtures(
  options: FetchWcFixturesOptions | Result[] = {}
): Promise<WcFixture[]> {
  const opts: FetchWcFixturesOptions = Array.isArray(options)
    ? { results: options }
    : options;
  const { fixtures } = await fetchWcFixturesBundle(opts);
  return fixtures;
}
