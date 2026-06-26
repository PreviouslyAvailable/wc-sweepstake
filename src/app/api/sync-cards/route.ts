import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supaAdmin } from "@/lib/supabase";
import { isSportApiEnabled } from "@/lib/sportapi-config";
import { resyncCardsFromApi } from "@/lib/sync-results";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!isSportApiEnabled()) {
    return NextResponse.json({ error: "Live feed sync is off — enter card counts when filing results." });
  }
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return NextResponse.json({ error: "RAPIDAPI_KEY not set" }, { status: 500 });
  const outcome = await resyncCardsFromApi(supaAdmin(), apiKey);
  return NextResponse.json(outcome);
}
