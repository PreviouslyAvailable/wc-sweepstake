import { fixturePairKey } from "@/lib/fixture-pair-key";
import type { Result } from "@/lib/scoring";
import { WC_GROUPS } from "@/lib/wc-groups";
import type { WcFixture } from "@/lib/wc-fixtures";

const MATCHDAY_UNIX: Record<1 | 2 | 3, number> = {
  1: Math.floor(Date.UTC(2026, 5, 11, 19, 0, 0) / 1000),
  2: Math.floor(Date.UTC(2026, 5, 18, 19, 0, 0) / 1000),
  3: Math.floor(Date.UTC(2026, 5, 24, 19, 0, 0) / 1000),
};

function sportEventId(note: string | null | undefined): number | null {
  if (!note?.startsWith("sport:")) return null;
  const id = Number(note.slice(6));
  return Number.isFinite(id) ? id : null;
}

function syntheticId(group: string, homeId: string, awayId: string): number {
  const key = `${group}:${fixturePairKey(homeId, awayId)}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return 9_000_000 + hash;
}

function inferMatchday(
  group: string,
  homeId: string,
  awayId: string,
  resultsByPair: Map<string, Result>
): 1 | 2 | 3 {
  const key = fixturePairKey(homeId, awayId);
  if (resultsByPair.has(key)) {
    const groupResults = [...resultsByPair.entries()]
      .filter(([k]) => {
        const teams = WC_GROUPS[group];
        if (!teams) return false;
        const [a, b] = k.split(":");
        return teams.includes(a) && teams.includes(b);
      })
      .map(([, r]) => r)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const idx = groupResults.findIndex(
      (r) => fixturePairKey(r.team_a, r.team_b) === key
    );
    if (idx === 0 || idx === 1) return 1;
    if (idx === 2 || idx === 3) return 2;
    return 3;
  }

  const teams = WC_GROUPS[group];
  if (!teams) return 3;
  let played = 0;
  for (const a of teams) {
    for (const b of teams) {
      if (a >= b) continue;
      if (resultsByPair.has(fixturePairKey(a, b))) played++;
    }
  }
  if (played >= 4) return 3;
  if (played >= 2) return 2;
  return 1;
}

function kickoffTimestamp(group: string, matchday: 1 | 2 | 3): number {
  const letters = "ABCDEFGHIJKL";
  const slot = letters.indexOf(group);
  const base = MATCHDAY_UNIX[matchday];
  return base + Math.max(0, slot) * 2 * 3600;
}

/** Group-stage fixture sheet from the filed draw — no paid API required. */
export function buildLocalWcFixtures(results: Result[] = []): WcFixture[] {
  const resultsByPair = new Map<string, Result>();
  for (const r of results) {
    if (r.stage !== "group") continue;
    resultsByPair.set(fixturePairKey(r.team_a, r.team_b), r);
  }

  const fixtures: WcFixture[] = [];

  for (const [group, teams] of Object.entries(WC_GROUPS)) {
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const homeId = teams[i];
        const awayId = teams[j];
        const key = fixturePairKey(homeId, awayId);
        const filed = resultsByPair.get(key);
        const matchday = inferMatchday(group, homeId, awayId, resultsByPair);
        const roundName = `FIFA World Cup, Group ${group}`;
        const id = sportEventId(filed?.note) ?? syntheticId(group, homeId, awayId);

        fixtures.push({
          id,
          status: filed ? "finished" : "notstarted",
          startTimestamp: kickoffTimestamp(group, matchday),
          homeId: filed?.team_a ?? homeId,
          awayId: filed?.team_b ?? awayId,
          roundName,
        });
      }
    }
  }

  return fixtures.sort((a, b) => a.startTimestamp - b.startTimestamp);
}
