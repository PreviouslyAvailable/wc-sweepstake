import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supaAdmin } from "@/lib/supabase";
import { ROUND_ORDER, type TournamentRound } from "@/lib/tournament-rounds";

const VALID_ROUNDS = new Set<string>(ROUND_ORDER);

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { team_id, is_out, furthest_round } = await req.json();
  if (!team_id) return NextResponse.json({ error: "team_id required" }, { status: 400 });

  const patch: { is_out?: boolean; furthest_round?: string } = {};
  if (typeof is_out === "boolean") patch.is_out = is_out;
  if (typeof furthest_round === "string") {
    if (!VALID_ROUNDS.has(furthest_round)) {
      return NextResponse.json({ error: "Invalid furthest_round" }, { status: 400 });
    }
    patch.furthest_round = furthest_round as TournamentRound;
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await supaAdmin()
    .from("teams")
    .update(patch)
    .eq("id", team_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
