import type { Band } from "@/lib/scoring";

/** 38 teams in the sweepstake draw — 19 Band A, 19 Band B. */
export const DRAW_POOL_BAND_A = new Set([
  "ARG", "ESP", "FRA", "ENG", "POR", "BRA", "MAR", "NED", "BEL", "GER",
  "CRO", "COL", "MEX", "SEN", "URU", "USA", "JPN", "SUI", "IRN",
]);

export const DRAW_POOL_BAND_B = new Set([
  "TUR", "ECU", "AUT", "KOR", "AUS", "ALG", "EGY", "CAN", "NOR", "CIV",
  "PAN", "SWE", "CZE", "PAR", "SCO", "TUN", "COD", "UZB", "NZL",
]);

export const DRAW_POOL_IDS = new Set([...DRAW_POOL_BAND_A, ...DRAW_POOL_BAND_B]);

export const DRAW_POOL_SIZE = DRAW_POOL_BAND_A.size;

export interface DrawPoolTeam {
  id: string;
  world_rank: number;
}

export interface ActiveDrawPool {
  bandA: string[];
  bandB: string[];
  excluded: string[];
}

/** Keep the best-ranked `count` teams per band; drop the rest (lowest FIFA ranks). */
export function resolveActiveDrawPool(
  participantCount: number,
  teams: DrawPoolTeam[]
): ActiveDrawPool {
  const rankById = new Map(teams.map((t) => [t.id, t.world_rank]));

  function trimBand(fullSet: Set<string>, count: number): { active: string[]; excluded: string[] } {
    const ranked = [...fullSet].sort(
      (a, b) => (rankById.get(a) ?? 999) - (rankById.get(b) ?? 999)
    );
    return {
      active: ranked.slice(0, count),
      excluded: ranked.slice(count),
    };
  }

  const a = trimBand(DRAW_POOL_BAND_A, participantCount);
  const b = trimBand(DRAW_POOL_BAND_B, participantCount);

  return {
    bandA: a.active,
    bandB: b.active,
    excluded: [...a.excluded, ...b.excluded],
  };
}

export function isDrawPoolTeam(teamId: string): boolean {
  return DRAW_POOL_IDS.has(teamId);
}

export function drawBandForTeam(teamId: string): Band | null {
  if (DRAW_POOL_BAND_A.has(teamId)) return "A";
  if (DRAW_POOL_BAND_B.has(teamId)) return "B";
  return null;
}

export function isDrawPoolBandA<T extends { id: string }>(team: T): boolean {
  return DRAW_POOL_BAND_A.has(team.id);
}

export function isDrawPoolBandB<T extends { id: string }>(team: T): boolean {
  return DRAW_POOL_BAND_B.has(team.id);
}
