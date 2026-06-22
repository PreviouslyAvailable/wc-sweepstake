import { NextResponse } from "next/server";
import { supaAnon } from "@/lib/supabase";
import { NAME_TO_ID } from "@/lib/team-names";
import { liveFixtureDates } from "@/lib/tournament-dates";
import {
  matchBreakdownForTeam,
  type Result,
  type Team,
} from "@/lib/scoring";
import { ftScoresFromSportEvent, liveScoresFromSportEvent } from "@/lib/sportapi-scores";

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

export interface Breakdown {
  goals: number;
  cleanSheet: number;
  yellows: number;
  reds: number;
  cards: number;
  giantKilling: number;
  total: number;
}

function breakdownWithCards(
  teamId: string,
  result: Result,
  teamById: Map<string, Team>
): Breakdown {
  const m = matchBreakdownForTeam(teamId, result, teamById);
  const isA = result.team_a === teamId;
  return {
    ...m,
    yellows: isA ? (result.yellow_a ?? 0) : (result.yellow_b ?? 0),
    reds: isA ? (result.red_a ?? 0) : (result.red_b ?? 0),
  };
}

function breakdownFromApi(
  myScore: number,
  theirScore: number,
  myRank: number,
  theirRank: number,
  myYellows = 0,
  myReds = 0
): Breakdown {
  const goals = myScore;
  const cleanSheet = theirScore === 0 ? 3 : 0;
  const cards = myYellows * 1 + myReds * 3;
  let giantKilling = 0;
  if (myScore > theirScore) {
    const gap = myRank - theirRank;
    if (gap > 0) giantKilling = Math.floor(gap / 10);
  }
  return { goals, cleanSheet, yellows: myYellows, reds: myReds, cards, giantKilling, total: goals + cleanSheet + cards + giantKilling };
}

export async function GET() {
  const apiKey = process.env.RAPIDAPI_KEY;

  const now = new Date();
  const dates = liveFixtureDates(now);

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

  const finishedNotes = rawEvents
    .filter((ev) => ev.status?.type === "finished")
    .map((ev) => `sport:${ev.id}`);

  const [
    { data: assignments },
    { data: participants },
    { data: teams },
    { data: dbResults },
    { data: allResults },
  ] = await Promise.all([
    db.from("assignments").select("participant_id, team_id"),
    db.from("participants").select("id, name"),
    db.from("teams").select("*"),
    finishedNotes.length
      ? db.from("results").select("note, yellow_a, red_a, yellow_b, red_b").in("note", finishedNotes)
      : Promise.resolve({ data: [] }),
    db.from("results").select("*"),
  ]);

  const participantById = new Map((participants ?? []).map((p) => [p.id, p.name as string]));
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const ownerByTeamId = new Map(
    (assignments ?? []).map((a) => [a.team_id, participantById.get(a.participant_id) ?? null])
  );
  const cardsByNote = new Map(
    (dbResults ?? []).map((r: { note: string; yellow_a: number; red_a: number; yellow_b: number; red_b: number }) => [r.note, r])
  );
  const resultsByNote = new Map(
    (allResults ?? [])
      .filter((r): r is Result & { note: string } => typeof r.note === "string")
      .map((r) => [r.note, r])
  );

  const matches = rawEvents.map((ev) => {
    const homeApiName: string = ev.homeTeam?.name ?? "";
    const awayApiName: string = ev.awayTeam?.name ?? "";
    const homeId = NAME_TO_ID[homeApiName];
    const awayId = NAME_TO_ID[awayApiName];
    const homeTeam = homeId ? teamById.get(homeId) : null;
    const awayTeam = awayId ? teamById.get(awayId) : null;

    const isFinished = ev.status?.type === "finished";

    const homeRank = (homeTeam as { world_rank?: number } | null)?.world_rank ?? 99;
    const awayRank = (awayTeam as { world_rank?: number } | null)?.world_rank ?? 99;

    const roundName: string = ev.roundInfo?.name ?? ev.tournament?.name ?? "";

    const note = `sport:${ev.id}`;
    const filedResult = isFinished ? resultsByNote.get(note) : null;

    let homeScore: number;
    let awayScore: number;
    let homeBd: Breakdown;
    let awayBd: Breakdown;

    if (filedResult && homeId && awayId) {
      homeScore = filedResult.score_a;
      awayScore = filedResult.score_b;
      homeBd = breakdownWithCards(homeId, filedResult, teamById);
      awayBd = breakdownWithCards(awayId, filedResult, teamById);
    } else {
      const scores = isFinished ? ftScoresFromSportEvent(ev) : liveScoresFromSportEvent(ev);
      homeScore = scores.scoreA;
      awayScore = scores.scoreB;
      const dbCards = isFinished ? cardsByNote.get(note) : null;
      homeBd = breakdownFromApi(
        homeScore, awayScore, homeRank, awayRank,
        dbCards?.yellow_a ?? 0, dbCards?.red_a ?? 0
      );
      awayBd = breakdownFromApi(
        awayScore, homeScore, awayRank, homeRank,
        dbCards?.yellow_b ?? 0, dbCards?.red_b ?? 0
      );
    }

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
        pts: homeBd.total,
        breakdown: homeBd,
      },
      away: {
        teamId: awayId ?? null,
        name: (awayTeam as { name?: string } | null)?.name ?? awayApiName,
        flag: (awayTeam as { flag?: string } | null)?.flag ?? "🏳️",
        worldRank: awayRank,
        score: awayScore,
        owner: awayId ? (ownerByTeamId.get(awayId) ?? null) : null,
        pts: awayBd.total,
        breakdown: awayBd,
      },
    };
  });

  return NextResponse.json({ matches, asOf: now.toISOString() });
}
