import { NextRequest, NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const { team_id, is_out } = await req.json();
  if (!team_id) return NextResponse.json({ error: "team_id required" }, { status: 400 });
  const { error } = await supaAdmin()
    .from("teams")
    .update({ is_out: Boolean(is_out) })
    .eq("id", team_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
