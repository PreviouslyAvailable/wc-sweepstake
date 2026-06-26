import { NextRequest, NextResponse } from "next/server";
import { requireCronOrAdmin } from "@/lib/auth";
import { supaAdmin } from "@/lib/supabase";
import { syncResultsFromFeed } from "@/lib/sync-results";

export async function GET(req: NextRequest) {
  const denied = await requireCronOrAdmin(req);
  if (denied) return denied;

  const outcome = await syncResultsFromFeed(supaAdmin());

  return NextResponse.json({
    ...outcome,
    ...(outcome.warnings.length ? { warnings: outcome.warnings } : {}),
    ...(outcome.synced === 0 && outcome.skipped === 0 && outcome.message
      ? { message: outcome.message }
      : outcome.synced === 0 && outcome.skipped === 0
        ? { message: "Up to date" }
        : {}),
  });
}
