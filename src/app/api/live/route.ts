import { NextResponse } from "next/server";
import { supaAnon } from "@/lib/supabase";
import { buildLiveMatches } from "@/lib/live-matches";
import type { Result, Team } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supaAnon();
  const [
    { data: assignments },
    { data: participants },
    { data: teams },
    { data: allResults },
  ] = await Promise.all([
    db.from("assignments").select("participant_id, team_id"),
    db.from("participants").select("id, name"),
    db.from("teams").select("*"),
    db.from("results").select("*"),
  ]);

  const { matches, asOf } = await buildLiveMatches({
    results: (allResults ?? []) as Result[],
    assignments: assignments ?? [],
    participants: participants ?? [],
    teams: (teams ?? []) as Team[],
  });

  return NextResponse.json({ matches, asOf });
}
