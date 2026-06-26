import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchApiFootballCardsForFixture,
  fetchApiFootballFixtureIndex,
  lastApiFootballFixtureIndexError,
  resolveApiFootballFixture,
} from "@/lib/api-football";
import { isApiFootballEnabled } from "@/lib/api-football-config";
import { isSportApiEnabled } from "@/lib/sportapi-config";
import { resyncCardsFromSportApi } from "@/lib/sportapi-cards";

export interface CardSyncOutcome {
  updated: number;
  skipped: number;
  warnings: string[];
  provider?: "api-football" | "sportapi";
}

interface ResultRow {
  id: string;
  team_a: string;
  team_b: string;
  yellow_a: number;
  red_a: number;
  yellow_b: number;
  red_b: number;
  note: string | null;
}

const CARD_REQUEST_DELAY_MS = 120;

function hasCards(r: ResultRow): boolean {
  return Boolean(r.yellow_a || r.red_a || r.yellow_b || r.red_b);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncCardsFromApiFootball(
  db: SupabaseClient,
  onlyMissing: boolean
): Promise<CardSyncOutcome> {
  const { data: results } = await db
    .from("results")
    .select("id, team_a, team_b, yellow_a, red_a, yellow_b, red_b, note");

  const rows = (results ?? []) as ResultRow[];
  if (!rows.length) return { updated: 0, skipped: 0, warnings: [], provider: "api-football" };

  const index = await fetchApiFootballFixtureIndex();
  if (!index.size) {
    const planErr = lastApiFootballFixtureIndexError();
    return {
      updated: 0,
      skipped: rows.length,
      warnings: [
        planErr ??
          "API-Football fixture list unavailable — check API_FOOTBALL_KEY",
      ],
      provider: "api-football",
    };
  }

  let updated = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const result of rows) {
    if (onlyMissing && hasCards(result)) {
      skipped++;
      continue;
    }

    const match = resolveApiFootballFixture(result.team_a, result.team_b, index);
    if (!match) {
      warnings.push(`No API-Football fixture for ${result.team_a} vs ${result.team_b}`);
      skipped++;
      continue;
    }

    const cards = await fetchApiFootballCardsForFixture(
      match.fixtureId,
      match.homeApiName,
      match.awayApiName,
      match.homeIsA
    );

    if (!cards) {
      warnings.push(`Cards unavailable for fixture ${match.fixtureId}`);
      skipped++;
      continue;
    }

    const unchanged =
      result.yellow_a === cards.yellow_a &&
      result.red_a === cards.red_a &&
      result.yellow_b === cards.yellow_b &&
      result.red_b === cards.red_b;

    if (unchanged) {
      skipped++;
      continue;
    }

    const { error } = await db.from("results").update(cards).eq("id", result.id);
    if (error) {
      warnings.push(`Card update failed for ${result.id}: ${error.message}`);
      skipped++;
    } else {
      updated++;
    }

    await sleep(CARD_REQUEST_DELAY_MS);
  }

  return { updated, skipped, warnings, provider: "api-football" };
}

/** Pull card counts — API-Football first, then SportAPI fallback. */
export async function syncCardsFromFeed(
  db: SupabaseClient,
  options: { onlyMissing?: boolean } = {}
): Promise<CardSyncOutcome> {
  const onlyMissing = options.onlyMissing ?? false;

  if (isApiFootballEnabled()) {
    const outcome = await syncCardsFromApiFootball(db, onlyMissing);
    if (outcome.updated > 0 || !isSportApiEnabled()) return outcome;

    const planBlocked = outcome.warnings.some((w) =>
      w.toLowerCase().includes("free plans do not have access")
    );
    if (planBlocked || outcome.updated === 0) {
      const apiKey = process.env.RAPIDAPI_KEY;
      if (apiKey && isSportApiEnabled()) {
        const sport = await resyncCardsFromSportApi(db, apiKey);
        return {
          ...sport,
          warnings: [...outcome.warnings, ...sport.warnings],
          provider: "sportapi",
        };
      }
    }
    return outcome;
  }

  if (isSportApiEnabled()) {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      return {
        updated: 0,
        skipped: 0,
        warnings: ["RAPIDAPI_KEY not set"],
        provider: "sportapi",
      };
    }
    const outcome = await resyncCardsFromSportApi(db, apiKey);
    return { ...outcome, provider: "sportapi" };
  }

  return {
    updated: 0,
    skipped: 0,
    warnings: ["Card sync off — set API_FOOTBALL_KEY or enable SportAPI"],
  };
}
