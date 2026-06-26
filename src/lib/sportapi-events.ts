import { sportApiFetch } from "@/lib/sportapi-client";

/** FIFA World Cup on SportAPI (Sofascore unique tournament). */
const WC_UNIQUE_TOURNAMENT_ID = Number(process.env.SPORTAPI_WC_TOURNAMENT_ID ?? "16");
const WC_SEASON_ID = Number(process.env.SPORTAPI_WC_SEASON_ID ?? "58210");
/** International "World" category — per-date schedule fallback. */
const WC_WORLD_CATEGORY_ID = Number(process.env.SPORTAPI_WORLD_CATEGORY_ID ?? "1468");
const MAX_ROUNDS = 24;
const ROUND_FETCH_DELAY_MS = 150;

export type SportEvent = {
  id: number;
  startTimestamp?: number;
  status?: { type?: string; description?: string };
  homeTeam?: { name?: string };
  awayTeam?: { name?: string };
  tournament?: { name?: string; uniqueTournament?: { name?: string } };
  roundInfo?: { name?: string };
  homeScore?: {
    normaltime?: number;
    current?: number;
    overtime?: number;
    penalties?: number;
  };
  awayScore?: {
    normaltime?: number;
    current?: number;
    overtime?: number;
    penalties?: number;
  };
  time?: { current?: number; injuryTime?: number };
};

export interface FetchWcEventsOptions {
  from?: string;
  to?: string;
  dates?: string[];
  keyword?: string;
  next?: { revalidate?: number };
  cache?: RequestCache;
}

function eventDate(ev: SportEvent): string {
  return new Date((ev.startTimestamp ?? 0) * 1000).toISOString().split("T")[0];
}

export function isWcSportEvent(ev: SportEvent, keyword = "world cup"): boolean {
  const name = (ev.tournament?.uniqueTournament?.name ?? ev.tournament?.name ?? "").toLowerCase();
  return name.includes(keyword.toLowerCase());
}

function inDateRange(ev: SportEvent, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const d = eventDate(ev);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function dedupeEvents(events: SportEvent[]): SportEvent[] {
  const seen = new Set<number>();
  const out: SportEvent[] = [];
  for (const ev of events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    out.push(ev);
  }
  return out;
}

type FetchInit = Pick<RequestInit, "cache" | "next">;

function fetchInit(opts?: FetchWcEventsOptions): FetchInit {
  const init: FetchInit = {};
  if (opts?.cache) init.cache = opts.cache;
  if (opts?.next) init.next = opts.next;
  return init;
}

async function parseEvents(res: Response): Promise<SportEvent[]> {
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body.events) ? (body.events as SportEvent[]) : [];
}

/**
 * Primary source: all cup rounds for the WC season (3 group matchdays + knockouts).
 * Three calls cover the full group stage vs one call per tournament day.
 */
async function fetchFromUniqueTournamentRounds(
  apiKey: string,
  init: FetchInit
): Promise<SportEvent[]> {
  const collected: SportEvent[] = [];

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const res = await sportApiFetch(
      `api/v1/unique-tournament/${WC_UNIQUE_TOURNAMENT_ID}/season/${WC_SEASON_ID}/events/round/${round}`,
      apiKey,
      init
    );
    if (res.status === 404 || res.status === 429) break;
    const events = await parseEvents(res);
    if (!events.length) break;
    collected.push(...events);
    await new Promise((r) => setTimeout(r, ROUND_FETCH_DELAY_MS));
  }

  return collected;
}

/** Per-date fallback via the international World category schedule. */
async function fetchFromWorldCategoryDates(
  apiKey: string,
  dates: string[],
  init: FetchInit
): Promise<SportEvent[]> {
  const collected: SportEvent[] = [];
  for (const date of dates) {
    const res = await sportApiFetch(
      `api/v1/category/${WC_WORLD_CATEGORY_ID}/scheduled-events/${date}`,
      apiKey,
      init
    );
    if (res.status === 429) break;
    collected.push(...(await parseEvents(res)));
  }
  return collected;
}

/** Legacy global schedule — kept in case SportAPI restores the endpoint. */
async function fetchFromScheduledDates(
  apiKey: string,
  dates: string[],
  init: FetchInit
): Promise<SportEvent[]> {
  const collected: SportEvent[] = [];
  for (const date of dates) {
    const res = await sportApiFetch(
      `api/v1/sport/football/scheduled-events/${date}`,
      apiKey,
      init
    );
    if (res.status === 429) break;
    collected.push(...(await parseEvents(res)));
  }
  return collected;
}

/** Supplement in-progress fixtures that may lag round caches. */
async function fetchLiveWcEvents(
  apiKey: string,
  keyword: string,
  init: FetchInit
): Promise<SportEvent[]> {
  const res = await sportApiFetch("api/v1/sport/football/events/live", apiKey, init);
  const events = await parseEvents(res);
  return events.filter((ev) => isWcSportEvent(ev, keyword));
}

/**
 * Fetch World Cup match events for a date range.
 * Tries tournament rounds first, then category + legacy date feeds, then live.
 */
export async function fetchWcSportEvents(
  apiKey: string,
  opts: FetchWcEventsOptions = {}
): Promise<SportEvent[]> {
  const keyword = opts.keyword ?? "world cup";
  const init = fetchInit(opts);
  const dates = opts.dates ?? [];

  let events = await fetchFromUniqueTournamentRounds(apiKey, init);

  if (!events.length && dates.length) {
    events = await fetchFromWorldCategoryDates(apiKey, dates, init);
  }
  if (!events.length && dates.length) {
    events = await fetchFromScheduledDates(apiKey, dates, init);
  }

  const live = await fetchLiveWcEvents(apiKey, keyword, init);
  events = dedupeEvents([...events, ...live]);

  return events.filter(
    (ev) => isWcSportEvent(ev, keyword) && inDateRange(ev, opts.from, opts.to)
  );
}
