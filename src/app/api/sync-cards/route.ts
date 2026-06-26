import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isCardSyncEnabled } from "@/lib/api-football-config";
import { supaAdmin } from "@/lib/supabase";
import { syncCardsFromFeed } from "@/lib/sync-cards";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!isCardSyncEnabled()) {
    return NextResponse.json({
      error: "Card sync off — set API_FOOTBALL_KEY or enable SportAPI.",
    });
  }
  const outcome = await syncCardsFromFeed(supaAdmin(), { onlyMissing: false });
  return NextResponse.json(outcome);
}
