import { NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { resyncCardsFromApi } from "@/lib/sync-results";

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return NextResponse.json({ error: "RAPIDAPI_KEY not set" }, { status: 500 });
  const outcome = await resyncCardsFromApi(supaAdmin(), apiKey);
  return NextResponse.json(outcome);
}
