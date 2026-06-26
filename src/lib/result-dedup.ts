import { fixturePairKey } from "@/lib/fixture-pair-key";
import type { Result } from "@/lib/scoring";

function resultRank(r: Result): number {
  let rank = 0;
  if (r.note?.startsWith("wc26:")) rank += 4;
  else if (r.note?.startsWith("sport:")) rank += 3;
  else if (r.note) rank += 2;
  rank += 1; // prefer later filed
  return rank;
}

/** One result per fixture pair — prefer feed-linked rows, then newest. */
export function dedupeResults(results: Result[]): Result[] {
  const byPair = new Map<string, Result>();
  for (const r of results) {
    const key = fixturePairKey(r.team_a, r.team_b);
    const prev = byPair.get(key);
    if (!prev) {
      byPair.set(key, r);
      continue;
    }
    const keep =
      resultRank(r) > resultRank(prev) ||
      (resultRank(r) === resultRank(prev) &&
        r.created_at.localeCompare(prev.created_at) >= 0)
        ? r
        : prev;
    byPair.set(key, keep);
  }
  return [...byPair.values()];
}
