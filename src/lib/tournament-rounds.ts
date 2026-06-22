/** Knockout / group stages for WC 2026. */
export type TournamentRound =
  | "group"
  | "r32"
  | "r16"
  | "qf"
  | "sf"
  | "third"
  | "final";

export const ROUND_ORDER: TournamentRound[] = [
  "group",
  "r32",
  "r16",
  "qf",
  "sf",
  "third",
  "final",
];

const ROUND_INDEX = new Map(ROUND_ORDER.map((r, i) => [r, i]));

export function roundIndex(round: TournamentRound): number {
  return ROUND_INDEX.get(round) ?? 0;
}

export function maxRound(a: TournamentRound, b: TournamentRound): TournamentRound {
  return roundIndex(a) >= roundIndex(b) ? a : b;
}

export function nextKnockoutRound(round: TournamentRound): TournamentRound | null {
  const i = roundIndex(round);
  if (i < roundIndex("r32") || i >= roundIndex("final")) return null;
  return ROUND_ORDER[i + 1] ?? null;
}

/** Parse SportAPI round / tournament names into our stage slug. */
export function roundFromName(name: string): TournamentRound {
  const n = name.toLowerCase();
  if (n.includes("group")) return "group";
  if (n.includes("round of 32")) return "r32";
  if (n.includes("round of 16")) return "r16";
  if (n.includes("quarter")) return "qf";
  if (n.includes("semi")) return "sf";
  if (n.includes("3rd") || n.includes("third")) return "third";
  if (n.includes("final")) return "final";
  return "group";
}

export function isGroupRoundName(name: string): boolean {
  return roundFromName(name) === "group";
}

/** Short chip label (ARCHIVE mono). */
export function roundShortLabel(round: TournamentRound): string {
  switch (round) {
    case "group":
      return "Group";
    case "r32":
      return "R32";
    case "r16":
      return "R16";
    case "qf":
      return "QF";
    case "sf":
      return "SF";
    case "third":
      return "3rd";
    case "final":
      return "Final";
  }
}

/** Display label for secured / playing status. */
export function roundDisplayLabel(round: TournamentRound): string {
  switch (round) {
    case "group":
      return "Group stage";
    case "r32":
      return "Round of 32";
    case "r16":
      return "Round of 16";
    case "qf":
      return "Quarter-finals";
    case "sf":
      return "Semi-finals";
    case "third":
      return "Third-place play-off";
    case "final":
      return "Final";
  }
}

export function parseFurthestRound(value: string | undefined | null): TournamentRound {
  if (!value) return "group";
  const v = value.toLowerCase();
  if (ROUND_ORDER.includes(v as TournamentRound)) return v as TournamentRound;
  return "group";
}
