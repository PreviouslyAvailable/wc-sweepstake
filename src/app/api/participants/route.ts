import { NextRequest, NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

async function drawLocked(): Promise<boolean> {
  const { data } = await supaAdmin()
    .from("settings").select("value").eq("key", "draw_locked").single();
  return data?.value === true;
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  if (await drawLocked()) return NextResponse.json({ error: "Draw already run — names are locked" }, { status: 409 });
  const { name } = await req.json();
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const { data, error } = await supaAdmin()
    .from("participants").insert({ name: trimmed }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ participant: data });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  if (await drawLocked()) return NextResponse.json({ error: "Draw already run — names are locked" }, { status: 409 });
  const { id } = await req.json();
  const { error } = await supaAdmin().from("participants").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
