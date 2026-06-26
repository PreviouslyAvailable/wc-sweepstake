import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody, requireId } from "@/lib/api-json";
import { requireAdmin } from "@/lib/auth";
import { lockResultPair } from "@/lib/steward-overrides";
import { supaAdmin } from "@/lib/supabase";
import { ROUND_ORDER, type TournamentRound } from "@/lib/tournament-rounds";

const VALID_ROUNDS = new Set<string>(ROUND_ORDER);

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const {
    team_a, team_b, score_a, score_b,
    yellow_a = 0, red_a = 0, yellow_b = 0, red_b = 0,
    stage = "group", note = null,
  } = parsed.body as Record<string, unknown>;

  if (!team_a || !team_b || team_a === team_b) {
    return NextResponse.json({ error: "Pick two different teams" }, { status: 400 });
  }
  if (typeof stage === "string" && !VALID_ROUNDS.has(stage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }
  const a = Number(score_a), b = Number(score_b);
  const ya = Number(yellow_a), ra = Number(red_a);
  const yb = Number(yellow_b), rb = Number(red_b);
  if (
    !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 ||
    !Number.isInteger(ya) || !Number.isInteger(ra) || ya < 0 || ra < 0 ||
    !Number.isInteger(yb) || !Number.isInteger(rb) || yb < 0 || rb < 0
  ) {
    return NextResponse.json({ error: "Scores and card counts must be non-negative whole numbers" }, { status: 400 });
  }

  const { data, error } = await supaAdmin()
    .from("results")
    .insert({
      team_a,
      team_b,
      score_a: a,
      score_b: b,
      yellow_a: ya,
      red_a: ra,
      yellow_b: yb,
      red_b: rb,
      stage,
      note,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await lockResultPair(supaAdmin(), String(team_a), String(team_b));
  return NextResponse.json({ result: data });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const idCheck = requireId((parsed.body as { id?: unknown }).id);
  if ("error" in idCheck) return idCheck.error;

  const { data, error } = await supaAdmin()
    .from("results")
    .delete()
    .eq("id", idCheck.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const { id, yellow_a, red_a, yellow_b, red_b } = parsed.body as {
    id?: unknown;
    yellow_a?: unknown;
    red_a?: unknown;
    yellow_b?: unknown;
    red_b?: unknown;
  };
  const idCheck = requireId(id);
  if ("error" in idCheck) return idCheck.error;

  const patch: Record<string, number> = {};
  for (const [key, val] of [
    ["yellow_a", yellow_a],
    ["red_a", red_a],
    ["yellow_b", yellow_b],
    ["red_b", red_b],
  ] as const) {
    if (val === undefined) continue;
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "Card counts must be non-negative whole numbers" }, { status: 400 });
    }
    patch[key] = n;
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supaAdmin()
    .from("results")
    .update(patch)
    .eq("id", idCheck.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}
