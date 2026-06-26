import type { Result } from "@/lib/scoring";
import { buildThirdPlaceTable, sortGroupTable } from "@/lib/group-standings";
import { groupLetterForTeam, teamsInGroup, WC_GROUPS } from "@/lib/wc-groups";
import { NAME_TO_ID } from "@/lib/team-names";
import { thirdPlaceSourceForWinnerGroup } from "@/lib/third-place-annex";

const GROUP_LETTERS = Object.keys(WC_GROUPS);

export function isGroupStageComplete(groupLetter: string, results: Result[]): boolean {
  const teams = teamsInGroup(groupLetter);
  const set = new Set(teams);
  const played = results.filter(
    (r) => r.stage === "group" && set.has(r.team_a) && set.has(r.team_b)
  ).length;
  return played >= 6;
}

export function allGroupStagesComplete(results: Result[]): boolean {
  return GROUP_LETTERS.every((g) => isGroupStageComplete(g, results));
}

export function teamAtGroupPosition(
  groupLetter: string,
  position: 1 | 2 | 3,
  results: Result[],
  worldRanks: Map<string, number>
): string | null {
  if (!isGroupStageComplete(groupLetter, results)) return null;
  const ordered = sortGroupTable(teamsInGroup(groupLetter), results, worldRanks);
  return ordered[position - 1] ?? null;
}

export type BracketSlot =
  | { kind: "winner"; group: string }
  | { kind: "runner_up"; group: string }
  | { kind: "third"; groups: string[] };

export function parseBracketSlot(label: string): BracketSlot | null {
  const t = label.trim();
  let m = /^Winner Group ([A-L])$/i.exec(t);
  if (m) return { kind: "winner", group: m[1].toUpperCase() };
  m = /^Runner-up Group ([A-L])$/i.exec(t);
  if (m) return { kind: "runner_up", group: m[1].toUpperCase() };
  m = /^3rd Group ([A-L](?:\/[A-L])*)$/i.exec(t);
  if (m) return { kind: "third", groups: m[1].split("/").map((g) => g.toUpperCase()) };
  return null;
}

function qualifyingThirdGroupLetters(
  results: Result[],
  worldRanks: Map<string, number>
): Set<string> | null {
  if (!allGroupStagesComplete(results)) return null;
  const table = buildThirdPlaceTable(results, worldRanks);
  return new Set(table.slice(0, 8).map((r) => r.groupLetter));
}

export function thirdPlaceTeamForWinnerGroup(
  winnerGroup: string,
  results: Result[],
  worldRanks: Map<string, number>
): string | null {
  const qualifying = qualifyingThirdGroupLetters(results, worldRanks);
  if (!qualifying) return null;
  const sourceGroup = thirdPlaceSourceForWinnerGroup(winnerGroup, qualifying);
  if (!sourceGroup || !qualifying.has(sourceGroup)) return null;
  return teamAtGroupPosition(sourceGroup, 3, results, worldRanks);
}

export function winnerGroupLetterFromSide(
  nameEn: string | undefined,
  label: string | undefined,
  results: Result[],
  worldRanks: Map<string, number>
): string | null {
  if (label) {
    const slot = parseBracketSlot(label);
    if (slot?.kind === "winner") return slot.group;
  }
  if (nameEn) {
    const id = NAME_TO_ID[nameEn];
    if (id) {
      const letter = groupLetterForTeam(id);
      if (letter && isGroupStageComplete(letter, results)) {
        const pos =
          sortGroupTable(teamsInGroup(letter), results, worldRanks).indexOf(id) + 1;
        if (pos === 1) return letter;
      }
    }
  }
  return null;
}

export interface ResolveKnockoutContext {
  results: Result[];
  worldRanks: Map<string, number>;
  opponentWinnerGroup?: string | null;
}

export function resolveKnockoutSlot(
  nameEn: string | undefined,
  label: string | undefined,
  ctx: ResolveKnockoutContext
): string | null {
  if (nameEn && NAME_TO_ID[nameEn]) return NAME_TO_ID[nameEn];
  if (!label) return null;

  const slot = parseBracketSlot(label);
  if (!slot) return null;

  if (slot.kind === "winner") {
    return teamAtGroupPosition(slot.group, 1, ctx.results, ctx.worldRanks);
  }
  if (slot.kind === "runner_up") {
    return teamAtGroupPosition(slot.group, 2, ctx.results, ctx.worldRanks);
  }
  if (slot.kind === "third" && ctx.opponentWinnerGroup) {
    return thirdPlaceTeamForWinnerGroup(
      ctx.opponentWinnerGroup,
      ctx.results,
      ctx.worldRanks
    );
  }
  return null;
}

export function displayLabel(
  nameEn: string | undefined,
  label: string | undefined
): string | undefined {
  return nameEn || label || undefined;
}
