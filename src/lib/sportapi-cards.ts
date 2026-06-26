import { sportApiFetch } from "@/lib/sportapi-client";
import type {
  SportApiIncidentsResponse,
  SportApiResultNote,
  SportApiStatisticsResponse,
} from "@/lib/sportapi-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CardCounts {
  yellow_a: number;
  red_a: number;
  yellow_b: number;
  red_b: number;
}

function parseCardsFromStats(statistics: SportApiStatisticsResponse["statistics"]): CardCounts | null {
  const periods = statistics ?? [];
  const period = periods.find((p) => p.period === "ALL") ?? periods[0];
  if (!period) return null;

  let yellow_a = 0;
  let red_a = 0;
  let yellow_b = 0;
  let red_b = 0;
  let found = false;

  for (const group of period.groups ?? []) {
    for (const item of group.statisticsItems ?? []) {
      const name: string = (item.name ?? "").toLowerCase();
      const h = parseInt(item.home ?? "0", 10) || 0;
      const a = parseInt(item.away ?? "0", 10) || 0;
      if (name === "yellow cards") {
        yellow_a += h;
        yellow_b += a;
        found = true;
      } else if (name === "yellow-red cards") {
        yellow_a += h;
        yellow_b += a;
        found = true;
      } else if (name === "red cards") {
        red_a += h;
        red_b += a;
        found = true;
      }
    }
  }

  return found ? { yellow_a, red_a, yellow_b, red_b } : null;
}

function parseCardsFromIncidents(incidents: SportApiIncidentsResponse["incidents"]): CardCounts {
  const list = incidents ?? [];
  let yellowRedHome = 0;
  let yellowRedAway = 0;
  for (const inc of list) {
    if (inc.incidentType !== "card" || inc.incidentClass !== "yellowRed") continue;
    if (inc.teamSide === "home") yellowRedHome++;
    else if (inc.teamSide === "away") yellowRedAway++;
  }

  let yellow_a = 0;
  let red_a = 0;
  let yellow_b = 0;
  let red_b = 0;
  let skipRedHome = yellowRedHome;
  let skipRedAway = yellowRedAway;

  for (const inc of list) {
    if (inc.incidentType !== "card") continue;
    const cls: string = inc.incidentClass ?? "";
    const side: string = inc.teamSide ?? "";
    if (side !== "home" && side !== "away") continue;
    const isHome = side === "home";

    if (cls === "yellow" || cls === "yellowRed") {
      if (isHome) yellow_a++;
      else yellow_b++;
    } else if (cls === "red") {
      if (isHome) {
        if (skipRedHome > 0) skipRedHome--;
        else red_a++;
      } else {
        if (skipRedAway > 0) skipRedAway--;
        else red_b++;
      }
    }
  }

  return { yellow_a, red_a, yellow_b, red_b };
}

/** Fetch card counts for a SportAPI event. */
export async function fetchCardsForSportApiEvent(
  eventId: string,
  apiKey: string
): Promise<CardCounts | null> {
  try {
    const statsRes = await sportApiFetch(`api/v1/event/${eventId}/statistics`, apiKey, {
      cache: "no-store",
    });
    if (statsRes.ok) {
      const data = (await statsRes.json()) as SportApiStatisticsResponse;
      const cards = parseCardsFromStats(data.statistics);
      if (cards) return cards;
    }
  } catch {
    // fall through
  }

  try {
    const incRes = await sportApiFetch(`api/v1/event/${eventId}/incidents`, apiKey, {
      cache: "no-store",
    });
    if (incRes.ok) {
      const data = (await incRes.json()) as SportApiIncidentsResponse;
      return parseCardsFromIncidents(data.incidents);
    }
  } catch {
    // fall through
  }

  return null;
}

export interface CardResyncOutcome {
  updated: number;
  skipped: number;
  warnings: string[];
}

export async function resyncCardsFromSportApi(
  db: SupabaseClient,
  apiKey: string
): Promise<CardResyncOutcome> {
  const { data: results } = await db
    .from("results")
    .select("id, note")
    .like("note", "sport:%");

  if (!results?.length) return { updated: 0, skipped: 0, warnings: [] };

  let updated = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const result of results as SportApiResultNote[]) {
    const eventId: string = result.note.slice(6);
    const cards = await fetchCardsForSportApiEvent(eventId, apiKey);

    if (!cards) {
      warnings.push(`Cards unavailable for event ${eventId}`);
      skipped++;
      continue;
    }

    const { error } = await db.from("results").update(cards).eq("id", result.id);

    if (error) {
      warnings.push(`Update failed for event ${eventId}: ${error.message}`);
      skipped++;
    } else {
      updated++;
    }
  }

  return { updated, skipped, warnings };
}
