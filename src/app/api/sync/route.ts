import { NextRequest, NextResponse } from "next/server";
import { supaAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { syncResultsFromApi } from "@/lib/sync-results";

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const cron = isCronAuthorized(req);
  if (!cron && !(await isAdmin())) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return NextResponse.json({ synced: 0, message: "RAPIDAPI_KEY not set — add it to .env.local" });
  }

  const wcKeyword = (process.env.SPORTAPI_TOURNAMENT_KEYWORD ?? "World Cup").toLowerCase();
  const outcome = await syncResultsFromApi(supaAdmin(), apiKey, wcKeyword);

  return NextResponse.json({
    ...outcome,
    ...(outcome.warnings.length ? { warnings: outcome.warnings } : {}),
    ...(outcome.synced === 0 && outcome.skipped === 0
      ? { message: "Up to date" }
      : {}),
  });
}
