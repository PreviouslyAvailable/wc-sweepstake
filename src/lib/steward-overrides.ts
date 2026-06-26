import type { SupabaseClient } from "@supabase/supabase-js";
import { fixturePairKey } from "@/lib/fixture-pair-key";

const PROGRESS_KEY = "progress_overrides";
const RESULT_PAIRS_KEY = "locked_result_pairs";

async function readStringList(db: SupabaseClient, key: string): Promise<Set<string>> {
  const { data } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  const raw = data?.value;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((v): v is string => typeof v === "string"));
}

async function writeStringList(db: SupabaseClient, key: string, values: Set<string>): Promise<void> {
  await db.from("settings").upsert({ key, value: [...values] });
}

export async function getProgressOverrides(db: SupabaseClient): Promise<Set<string>> {
  return readStringList(db, PROGRESS_KEY);
}

export async function addProgressOverride(db: SupabaseClient, teamId: string): Promise<void> {
  const set = await readStringList(db, PROGRESS_KEY);
  set.add(teamId);
  await writeStringList(db, PROGRESS_KEY, set);
}

export async function getLockedResultPairs(db: SupabaseClient): Promise<Set<string>> {
  return readStringList(db, RESULT_PAIRS_KEY);
}

export async function lockResultPair(
  db: SupabaseClient,
  teamA: string,
  teamB: string
): Promise<void> {
  const set = await readStringList(db, RESULT_PAIRS_KEY);
  set.add(fixturePairKey(teamA, teamB));
  await writeStringList(db, RESULT_PAIRS_KEY, set);
}
