import type { SupabaseClient } from "@supabase/supabase-js";
import { getProgressOverrides } from "@/lib/steward-overrides";
import type { Result, Team } from "@/lib/scoring";
import { deriveTeamProgressFields } from "@/lib/tournament-status";
import { fetchWcFixturesBundle } from "@/lib/wc-fixtures";

export interface ProgressSyncOutcome {
  updated: number;
  warnings: string[];
}

/** Push is_out / furthest_round from standings + fixtures into the teams table. */
export async function syncTeamProgress(db: SupabaseClient): Promise<ProgressSyncOutcome> {
  const [{ data: teamRows }, { data: resultRows }, progressOverrides] = await Promise.all([
    db.from("teams").select("*").in("band", ["A", "B"]),
    db.from("results").select("*"),
    getProgressOverrides(db),
  ]);

  const teams = (teamRows ?? []) as Team[];
  const results = (resultRows ?? []) as Result[];
  if (!teams.length) return { updated: 0, warnings: [] };

  const worldRanks = new Map(teams.map((t) => [t.id, t.world_rank]));
  const { fixtures } = await fetchWcFixturesBundle({ results, teams });

  let updated = 0;
  const warnings: string[] = [];

  for (const team of teams) {
    if (progressOverrides.has(team.id)) continue;

    const derived = deriveTeamProgressFields(team, results, fixtures, worldRanks);
    const storedRound = team.furthest_round ?? "group";
    const patch: { is_out?: boolean; furthest_round?: string } = {};

    if (team.is_out !== derived.is_out) patch.is_out = derived.is_out;
    if (storedRound !== derived.furthest_round) patch.furthest_round = derived.furthest_round;

    if (!Object.keys(patch).length) continue;

    const { error } = await db.from("teams").update(patch).eq("id", team.id);
    if (error) {
      warnings.push(`Progress update failed for ${team.id}: ${error.message}`);
    } else {
      updated++;
    }
  }

  return { updated, warnings };
}
