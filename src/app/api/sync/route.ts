import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { NAME_TO_ID } from "@/lib/team-names";

// WC 2026 starts June 11 — we scan from here forward
const WC_START = "2026-06-11";

// Maps SportAPI tournament/round name to our stage value
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

// Generate every date string from `from` to `to` inclusive
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(to);
  for (let d = new Date(from); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

const HOST = "sportapi7.p.rapidapi.com";

function apif(path: string, key: string) {
  return fetch(`https://${HOST}/${path}`, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
    cache: "no-store",
  });
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({ synced: 0, message: "RAPIDAPI_KEY not set — add it to .env.local" });
  }

  const wcKeyword = (process.env.SPORTAPI_TOURNAMENT_KEYWORD ?? "World Cup").toLowerCase();
  const db = supaAdmin();
  const today = new Date().toISOString().split("T")[0];

  // Track last-scanned date so we only fetch new days on subsequent syncs
  const { data: syncState } = await db
    .from("settings")
    .select("value")
    .eq("key", "sportapi_last_date")
    .single();
  const fromDate = (syncState?.value as string | null) ?? WC_START;
  const dates = dateRange(fromDate, today);

  // Already-imported event IDs (stored as "sport:{id}" in the note field)
  const { data: existing } = await db.from("results").select("note");
  const syncedIds = new Set(
    (existing ?? [])
      .map((r: { note: string | null }) => r.note)
      .filter((n): n is string => typeof n === "string" && n.startsWith("sport:"))
      .map((n) => n.slice(6))
  );

  // Scan each date for finished WC events not yet imported
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
        const isWC = (ev.tournament?.uniqueTournament?.name ?? "").toLowerCase().includes(wcKeyword);
        const isNew = !syncedIds.has(String(ev.id));
        if (isFinished && isWC && isNew) toSync.push(ev);
      }
    } catch {
      // skip failed date silently
    }
  }

  let synced = 0;
  const warnings: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ev of toSync as any[]) {
    const homeTeamName: string = ev.homeTeam?.name ?? "";
    const awayTeamName: string = ev.awayTeam?.name ?? "";
    const homeId = NAME_TO_ID[homeTeamName];
    const awayId = NAME_TO_ID[awayTeamName];
    if (!homeId || !awayId) continue; // team not in our 38-team pool

    // Goals = normaltime + overtime only (penalty shootout goals don't count)
    const scoreA =
      (ev.homeScore?.normaltime ?? ev.homeScore?.current ?? 0) +
      (ev.homeScore?.overtime ?? 0);
    const scoreB =
      (ev.awayScore?.normaltime ?? ev.awayScore?.current ?? 0) +
      (ev.awayScore?.overtime ?? 0);

    // Stage from tournament or round name
    const roundName: string =
      ev.roundInfo?.name ?? ev.tournament?.name ?? "";
    const stage = nameToStage(roundName);

    // Fetch card incidents for this event
    // incidentClass: "yellow" = yellow (+1), "yellowRed" = 2nd yellow (+1), "red" = straight red (+3)
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
          // "yellow" and "yellowRed" (2nd yellow) both count as a yellow card (+1)
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
      note: `sport:${ev.id}`,
    });

    if (error) {
      warnings.push(`DB insert failed for event ${ev.id}: ${error.message}`);
    } else {
      synced++;
    }
  }

  // Mark today as last-scanned so next sync only checks new dates
  await db.from("settings").upsert({ key: "sportapi_last_date", value: today });

  return NextResponse.json({
    synced,
    checked: dates.length,
    ...(warnings.length ? { warnings } : {}),
  });
}
