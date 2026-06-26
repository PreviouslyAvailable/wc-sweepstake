import { ANNEX_C_ROWS, ANNEX_C_WINNERS } from "@/lib/third-place-annex-rows";

/** Which third-place source group faces each group winner (Annex C column order). */
export function thirdPlaceSourceForWinnerGroup(
  winnerGroup: string,
  qualifyingThirdGroups: Set<string>
): string | null {
  const key = [...qualifyingThirdGroups].sort().join("");
  for (const row of ANNEX_C_ROWS) {
    const rowSet = new Set(row.split(""));
    if (rowSet.size !== 8) continue;
    if ([...rowSet].sort().join("") !== key) continue;
    const col = ANNEX_C_WINNERS.indexOf(
      winnerGroup as (typeof ANNEX_C_WINNERS)[number]
    );
    if (col < 0) return null;
    return row[col] ?? null;
  }
  return null;
}
