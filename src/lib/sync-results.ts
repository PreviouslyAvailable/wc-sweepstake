import type { SupabaseClient } from "@supabase/supabase-js";
import { NAME_TO_ID, OPPONENT_TEAMS } from "@/lib/team-names";

const HOST = "sportapi7.p.rapidapi.com";
const WC_START = "2026-06-11";
const LOOKBACK_DAYS = 7;

function nameToStage(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("group")) return "group";
  if (n.includes("round of 32")) return "r32";
  if (n.includes("round of 16")) return "r16";
  if (n.includes("quarter")) return "qf";
  if (n.includes("semi")) return "sf";
  if (n.includes("3rd") || n.includes("third")) return "third";
  if (n.includes("final")) return "final";
  return "group";
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(to);
  for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function scanFromDate(today: string): string {
  const lookback = new Date(today);
  lookback.setDate(lookback.getDate() - LOOKBACK_DAYS);
  const fromLookback = lookback.toISOString().split("T")[0];
  return fromLookback < WC_START ? WC_START : fromLookback;
}

function apif(path: string, key: string) {
  return fetch(`https://${HOST}/${path}`, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
    cache: "no-store",
  });
}

async function ensureOpponentTeam(
  db: SupabaseClient,
  teamId: string
): Promise<void> {
  const meta = OPPONENT_TEAMS[teamId];
  if (!meta) return;
  await db.from("teams").upsert(
    {
      id: teamId,
      name: meta.name,
      flag: meta.flag,
      band: "O", // opponent — not in the draw pool (Band A/B)
      world_rank: meta.world_rank,
      is_out: false,
      group_letter: "",
      furthest_round: "group",
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
}

export interface SyncOutcome {
  synced: number;
  checked: number;
  skipped: number;
  warnings: string[];
  message?: string;
}

export async function syncResultsFromApi(
  db: SupabaseClient,
  apiKey: string,
  wcKeyword = "world cup"
): Promise<SyncOutcome> {
  const today = new Date().toISOString().split("T")[0];
  const dates = dateRange(scanFromDate(today), today);

  const { data: existing } = await db.from("results").select("note");
  const syncedIds = new Set(
    (existing ?? [])
      .map((r: { note: string | null }) => r.note)
      .filter((n): n is string => typeof n === "string" && n.startsWith("sport:"))
      .map((n) => n.slice(6))
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toSync: any[] = [];
  for (const date of dates) {
    try {
      const res = await apif(`api/v1/sport/football/scheduled-events/${date}`, apiKey);
      if (!res.ok) continue;
      const { events = [] } = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const ev of events as any[]) {
        const isFinished = ev.status?.type === "finished";
        const isWC = (ev.tournament?.uniqueTournament?.name ?? "")
          .toLowerCase()
          .includes(wcKeyword);
        const isNew = !syncedIds.has(String(ev.id));
        if (isFinished && isWC && isNew) toSync.push(ev);
      }
    } catch {
      // skip failed date silently
    }
  }

  let synced = 0;
  let skipped = 0;
  const warnings: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ev of toSync as any[]) {
    const homeTeamName: string = ev.homeTeam?.name ?? "";
    const awayTeamName: string = ev.awayTeam?.name ?? "";
    const homeId = NAME_TO_ID[homeTeamName];
    const awayId = NAME_TO_ID[awayTeamName];
    if (!homeId || !awayId) {
      skipped++;
      warnings.push(`Skipped ${homeTeamName} vs ${awayTeamName} — unmapped team name`);
      continue;
    }

    await Promise.all([
      OPPONENT_TEAMS[homeId] ? ensureOpponentTeam(db, homeId) : Promise.resolve(),
      OPPONENT_TEAMS[awayId] ? ensureOpponentTeam(db, awayId) : Promise.resolve(),
    ]);

    const note = `sport:${ev.id}`;
    const { data: already } = await db.from("results").select("id").eq("note", note).maybeSingle();
    if (already) continue;

    const scoreA =
      (ev.homeScore?.normaltime ?? ev.homeScore?.current ?? 0) +
      (ev.homeScore?.overtime ?? 0);
    const scoreB =
      (ev.awayScore?.normaltime ?? ev.awayScore?.current ?? 0) +
      (ev.awayScore?.overtime ?? 0);

    const roundName: string = ev.roundInfo?.name ?? ev.tournament?.name ?? "";
    const stage = nameToStage(roundName);

    let yellow_a = 0, red_a = 0, yellow_b = 0, red_b = 0;
    try {
      const incRes = await apif(`api/v1/event/${ev.id}/incidents`, apiKey);
      if (incRes.ok) {
        const { incidents = [] } = await incRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const inc of incidents as any[]) {
          if (inc.incidentType !== "card") continue;
          const cls: string = inc.incidentClass ?? "";
          const isHome = inc.teamSide === "home";
          const isYellow = cls === "yellow" || cls === "yellowRed";
          const isDirectRed = cls === "red";
          if (isHome) {
            if (isYellow) yellow_a++;
            else if (isDirectRed) red_a++;
          } else {
            if (isYellow) yellow_b++;
            else if (isDirectRed) red_b++;
          }
        }
      }
    } catch {
      warnings.push(`Cards unavailable for event ${ev.id} — saved with 0 cards`);
    }

    const { error } = await db.from("results").insert({
      team_a: homeId,
      team_b: awayId,
      score_a: scoreA,
      score_b: scoreB,
      yellow_a, red_a,
      yellow_b, red_b,
      stage,
      note,
    });

    if (error) {
      warnings.push(`DB insert failed for event ${ev.id}: ${error.message}`);
    } else {
      synced++;
    }
  }

  await db.from("settings").upsert({ key: "sportapi_last_date", value: today });

  return { synced, checked: dates.length, skipped, warnings };
}
