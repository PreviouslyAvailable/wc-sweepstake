import { NAME_TO_ID } from "@/lib/team-names";
import { nextFixtureDates } from "@/lib/tournament-dates";

const HOST = "sportapi7.p.rapidapi.com";
const WC_KEYWORD = "World Cup";
const FETCH_TIMEOUT_MS = 6_000;

export interface WcFixture {
  id: number;
  status: string;
  startTimestamp: number;
  homeId: string | null;
  awayId: string | null;
  roundName: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEvent(ev: any): WcFixture | null {
  const homeApiName: string = ev.homeTeam?.name ?? "";
  const awayApiName: string = ev.awayTeam?.name ?? "";
  return {
    id: ev.id as number,
    status: (ev.status?.type ?? "") as string,
    startTimestamp: (ev.startTimestamp ?? 0) as number,
    homeId: NAME_TO_ID[homeApiName] ?? null,
    awayId: NAME_TO_ID[awayApiName] ?? null,
    roundName: (ev.roundInfo?.name ?? ev.tournament?.name ?? "") as string,
  };
}

async function fetchDateEvents(
  date: string,
  apiKey: string,
  signal: AbortSignal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const res = await fetch(`https://${HOST}/api/v1/sport/football/scheduled-events/${date}`, {
    headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": HOST },
    signal,
    next: { revalidate: 120 },
  });
  if (!res.ok) return [];
  const { events = [] } = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (events as any[]).filter((ev) =>
    (ev.tournament?.uniqueTournament?.name ?? "").includes(WC_KEYWORD)
  );
}

export async function fetchWcFixtures(
  apiKey: string,
  dates = nextFixtureDates()
): Promise<WcFixture[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const batches = await Promise.all(
      dates.map((date) => fetchDateEvents(date, apiKey, controller.signal).catch(() => []))
    );

    const seen = new Set<number>();
    const fixtures: WcFixture[] = [];
    for (const events of batches) {
      for (const ev of events) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        const parsed = parseEvent(ev);
        if (parsed) fixtures.push(parsed);
      }
    }
    return fixtures;
  } finally {
    clearTimeout(timer);
  }
}
