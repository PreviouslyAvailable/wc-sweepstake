import { NextRequest, NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const body = await req.json();
  const {
    team_a, team_b, score_a, score_b,
    yellow_a = 0, red_a = 0, yellow_b = 0, red_b = 0,
    stage = "group", note = null,
  } = body;

  if (!team_a || !team_b || team_a === team_b) {
    return NextResponse.json({ error: "Pick two different teams" }, { status: 400 });
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
    .insert({ team_a, team_b, score_a: a, score_b: b, yellow_a: ya, red_a: ra, yellow_b: yb, red_b: rb, stage, note })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { id } = await req.json();
  const { error } = await supaAdmin().from("results").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
