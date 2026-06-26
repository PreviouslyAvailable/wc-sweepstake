import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody, requireId } from "@/lib/api-json";
import { requireAdmin } from "@/lib/auth";
import { supaAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (await drawLocked()) {
    return NextResponse.json({ error: "Draw already run — names are locked" }, { status: 409 });
  }

  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const { name } = parsed.body as { name?: unknown };
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const { data, error } = await supaAdmin()
    .from("participants").insert({ name: trimmed }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ participant: data });
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (await drawLocked()) {
    return NextResponse.json({ error: "Draw already run — names are locked" }, { status: 409 });
  }

  const parsed = await parseJsonBody(req);
  if ("error" in parsed) return parsed.error;
  const idCheck = requireId((parsed.body as { id?: unknown }).id);
  if ("error" in idCheck) return idCheck.error;

  const { data, error } = await supaAdmin()
    .from("participants")
    .delete()
    .eq("id", idCheck.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

async function drawLocked(): Promise<boolean> {
  const { data } = await supaAdmin()
    .from("settings").select("value").eq("key", "draw_locked").single();
  return data?.value === true;
}
