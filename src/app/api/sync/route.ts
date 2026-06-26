import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireCron } from "@/lib/auth";
import { supaAdmin } from "@/lib/supabase";
import { syncResultsFromFeed } from "@/lib/sync-results";

/** Vercel cron — GET with CRON_SECRET bearer only. */
export async function GET(req: NextRequest) {
  const denied = await requireCron(req);
  if (denied) return denied;
  return runSync();
}

/** Steward manual sync — POST with passcode cookie. */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  return runSync();
}

async function runSync() {
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
