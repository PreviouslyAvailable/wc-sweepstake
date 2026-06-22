/**
 * FIFA World Cup 2026 group-stage draw (48 teams · 12 groups).
 * Playoff slots use the qualified team ID where known (Mar 2026).
 */
export const WC_GROUPS: Record<string, readonly string[]> = {
  A: ["MEX", "RSA", "KOR", "CZE"],
  B: ["CAN", "SUI", "QAT", "BIH"],
  C: ["BRA", "MAR", "SCO", "HAI"],
  D: ["USA", "AUS", "PAR", "TUR"],
  E: ["GER", "ECU", "CIV", "CUW"],
  F: ["NED", "JPN", "SWE", "TUN"],
  G: ["BEL", "IRN", "EGY", "NZL"],
  H: ["ESP", "URU", "KSA", "CPV"],
  I: ["FRA", "SEN", "NOR", "IRQ"],
  J: ["ARG", "AUT", "ALG", "JOR"],
  K: ["POR", "COL", "UZB", "COD"],
  L: ["ENG", "CRO", "PAN", "GHA"],
};

const TEAM_TO_GROUP = new Map<string, string>();

for (const [letter, ids] of Object.entries(WC_GROUPS)) {
  for (const id of ids) {
    TEAM_TO_GROUP.set(id, letter);
  }
}

export function groupLetterForTeam(teamId: string): string | null {
  return TEAM_TO_GROUP.get(teamId) ?? null;
}

export function teamsInGroup(letter: string): readonly string[] {
  return WC_GROUPS[letter.toUpperCase()] ?? [];
}

export function allGroupTeamIds(): string[] {
  return Object.values(WC_GROUPS).flatMap((g) => [...g]);
}

export function teamsShareGroup(a: string, b: string): boolean {
  const ga = groupLetterForTeam(a);
  const gb = groupLetterForTeam(b);
  return Boolean(ga && gb && ga === gb);
}
