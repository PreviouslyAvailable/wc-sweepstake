import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api-json";
import { requireAdmin } from "@/lib/auth";
import { addProgressOverride } from "@/lib/steward-overrides";
import { supaAdmin } from "@/lib/supabase";
import { ROUND_ORDER, type TournamentRound } from "@/lib/tournament-rounds";

const VALID_ROUNDS = new Set<string>(ROUND_ORDER);

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const { team_id, is_out, furthest_round } = parsed.body as {
    team_id?: unknown;
    is_out?: unknown;
    furthest_round?: unknown;
  };

  if (typeof team_id !== "string" || !team_id.trim()) {
    return NextResponse.json({ error: "team_id required" }, { status: 400 });
  }

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

  const db = supaAdmin();
  const { error } = await db.from("teams").update(patch).eq("id", team_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await addProgressOverride(db, team_id);
  return NextResponse.json({ ok: true });
}
