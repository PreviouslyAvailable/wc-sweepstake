import { NextResponse } from "next/server";
import { supaAnon } from "@/lib/supabase";
import { NAME_TO_ID } from "@/lib/team-names";

// Cache the SportAPI response server-side — all page polls within 60s share one API call
export const revalidate = 60;

const HOST = "sportapi7.p.rapidapi.com";
const WC_KEYWORD = "World Cup";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function statusLabel(ev: any): string {
  const type: string = ev.status?.type ?? "";
  const desc: string = ev.status?.description ?? "";
  const minute: number | null = ev.time?.current ?? null;
  const injury: number | null = ev.time?.injuryTime ?? null;

  if (type === "notstarted") return ""; // caller uses startTimestamp
  if (type === "finished") {
    if (desc.toLowerCase().includes("pen") || ev.homeScore?.penalties != null) return "PEN";
    if (desc.toLowerCase().includes("extra") || desc.toLowerCase().includes("aet")) return "AET";
    return "FT";
  }
  // inprogress
  if (desc.toLowerCase().includes("half time") || desc === "HT") return "HT";
  if (minute !== null) return injury ? `${minute}+${injury}'` : `${minute}'`;
  return "LIVE";
}

function matchPts(myScore: number, theirScore: number, myRank: number, theirRank: number): number {
  const goals = myScore;
  const cs = theirScore === 0 ? 3 : 0;
  let gk = 0;
  if (myScore > theirScore) {
    const gap = myRank - theirRank;
    if (gap > 0) gk = Math.floor(gap / 10);
  }
  return goals + cs + gk;
}

export async function GET() {
  const apiKey = process.env.RAPIDAPI_KEY;

  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const dates = [
    fmt(new Date(now.getTime() - 86400000)), // yesterday — in case page loads before midnight
    fmt(now),
    fmt(new Date(now.getTime() + 86400000)), // tomorrow — show upcoming fixtures
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEvents: any[] = [];

  if (apiKey) {
    for (const date of dates) {
      try {
        const res = await fetch(
          `https://${HOST}/api/v1/sport/football/scheduled-events/${date}`,
          {
            headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": HOST },
            next: { revalidate: 60 },
          }
        );
        if (!res.ok) continue;
        const { events = [] } = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ev of events as any[]) {
          if ((ev.tournament?.uniqueTournament?.name ?? "").includes(WC_KEYWORD)) {
            rawEvents.push(ev);
          }
        }
      } catch {
        // skip a failed date silently
      }
    }
  }

  // Dedup by event ID (same event can appear across multiple date fetches)
  const seenIds = new Set<number>();
  const uniqueEvents = rawEvents.filter((ev) => {
    if (seenIds.has(ev.id)) return false;
    seenIds.add(ev.id);
    return true;
  });
  rawEvents.length = 0;
  rawEvents.push(...uniqueEvents);

  // Sort: live first → upcoming (by kickoff) → finished (most recent first)
  rawEvents.sort((a, b) => {
    const order: Record<string, number> = { inprogress: 0, notstarted: 1, finished: 2 };
    const ao = order[a.status?.type] ?? 3;
    const bo = order[b.status?.type] ?? 3;
    if (ao !== bo) return ao - bo;
    if (a.status?.type === "finished") {
      return (b.startTimestamp ?? 0) - (a.startTimestamp ?? 0); // newest first
    }
    return (a.startTimestamp ?? 0) - (b.startTimestamp ?? 0); // soonest first
  });

  // Sweepstake enrichment
  const db = supaAnon();
  const [{ data: assignments }, { data: participants }, { data: teams }] = await Promise.all([
    db.from("assignments").select("participant_id, team_id"),
    db.from("participants").select("id, name"),
    db.from("teams").select("id, name, flag, world_rank"),
  ]);

  const participantById = new Map((participants ?? []).map((p) => [p.id, p.name as string]));
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const ownerByTeamId = new Map(
    (assignments ?? []).map((a) => [a.team_id, participantById.get(a.participant_id) ?? null])
  );

  const matches = rawEvents.map((ev) => {
    const homeApiName: string = ev.homeTeam?.name ?? "";
    const awayApiName: string = ev.awayTeam?.name ?? "";
    const homeId = NAME_TO_ID[homeApiName];
    const awayId = NAME_TO_ID[awayApiName];
    const homeTeam = homeId ? teamById.get(homeId) : null;
    const awayTeam = awayId ? teamById.get(awayId) : null;

    // For finished PEN: show score at end of normal+ET, not the shootout
    const isPen =
      ev.status?.description?.toLowerCase().includes("pen") ||
      ev.homeScore?.penalties != null;
    const isFinished = ev.status?.type === "finished";

    const homeScore = isFinished && isPen
      ? (ev.homeScore?.normaltime ?? 0) + (ev.homeScore?.overtime ?? 0)
      : (ev.homeScore?.current ?? 0);
    const awayScore = isFinished && isPen
      ? (ev.awayScore?.normaltime ?? 0) + (ev.awayScore?.overtime ?? 0)
      : (ev.awayScore?.current ?? 0);

    const homeRank = (homeTeam as { world_rank?: number } | null)?.world_rank ?? 99;
    const awayRank = (awayTeam as { world_rank?: number } | null)?.world_rank ?? 99;

    const roundName: string = ev.roundInfo?.name ?? ev.tournament?.name ?? "";

    return {
      id: ev.id as number,
      status: ev.status?.type as string,
      statusLabel: statusLabel(ev),
      startTimestamp: (ev.startTimestamp ?? 0) as number,
      round: roundName,
      home: {
        teamId: homeId ?? null,
        name: (homeTeam as { name?: string } | null)?.name ?? homeApiName,
        flag: (homeTeam as { flag?: string } | null)?.flag ?? "🏳️",
        worldRank: homeRank,
        score: homeScore,
        owner: homeId ? (ownerByTeamId.get(homeId) ?? null) : null,
        pts: matchPts(homeScore, awayScore, homeRank, awayRank),
      },
      away: {
        teamId: awayId ?? null,
        name: (awayTeam as { name?: string } | null)?.name ?? awayApiName,
        flag: (awayTeam as { flag?: string } | null)?.flag ?? "🏳️",
        worldRank: awayRank,
        score: awayScore,
        owner: awayId ? (ownerByTeamId.get(awayId) ?? null) : null,
        pts: matchPts(awayScore, homeScore, awayRank, homeRank),
      },
    };
  });

  return NextResponse.json({ matches, asOf: now.toISOString() });
}
