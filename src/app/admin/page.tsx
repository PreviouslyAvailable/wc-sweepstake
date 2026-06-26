"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { roundIndex, type TournamentRound } from "@/lib/tournament-rounds";

interface T {
  id: string;
  name: string;
  flag: string;
  band: string;
  world_rank: number;
  is_out: boolean;
  furthest_round: string;
}
interface R {
  id: string;
  stage: string;
  team_a: string;
  team_b: string;
  score_a: number;
  score_b: number;
  yellow_a: number;
  red_a: number;
  yellow_b: number;
  red_b: number;
  created_at: string;
}

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const ROUND_OPTIONS = [
  { value: "group", label: "Group" },
  { value: "r32", label: "R32" },
  { value: "r16", label: "R16" },
  { value: "qf", label: "QF" },
  { value: "sf", label: "SF" },
  { value: "third", label: "3rd" },
  { value: "final", label: "Final" },
];

function stageOrder(stage: string): number {
  return roundIndex(
    ROUND_OPTIONS.some((o) => o.value === stage)
      ? (stage as TournamentRound)
      : "group"
  );
}

export default function ResultsDesk() {
  const [admin, setAdmin] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [teams, setTeams] = useState<T[]>([]);
  const [results, setResults] = useState<R[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [cardSyncMsg, setCardSyncMsg] = useState<string | null>(null);
  const [cardSyncing, setCardSyncing] = useState(false);

  const load = useCallback(async () => {
    const db = supa();
    const [t, r, auth] = await Promise.all([
      db.from("teams").select("*").order("band").order("world_rank"),
      db.from("results").select("*").order("created_at", { ascending: true }),
      fetch("/api/login").then((res) => res.json()),
    ]);
    setTeams((t.data ?? []) as T[]);
    setResults((r.data ?? []) as R[]);
    setAdmin(Boolean(auth.admin));
  }, []);

  const sortedResults = useMemo(
    () =>
      [...results].sort(
        (a, b) =>
          stageOrder(a.stage) - stageOrder(b.stage) ||
          a.created_at.localeCompare(b.created_at)
      ),
    [results]
  );

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncMsg("Pulling results from the World Cup feed…");
    setSyncWarnings([]);
    try {
      const r = await fetch("/api/sync");
      const data = await r.json();
      if (r.status === 401) {
        setAdmin(false);
        setSyncMsg("Session expired — enter the steward passcode again.");
        return;
      }
      if (data.error) {
        setSyncMsg(`Sync error: ${data.error}`);
      } else if (typeof data.onFile === "number" && typeof data.finishedInFeed === "number") {
        const gap = data.finishedInFeed - data.onFile;
        if (gap > 0) {
          setSyncMsg(
            `${data.onFile} of ${data.finishedInFeed} finished matches on file${data.synced ? ` · ${data.synced} just added` : ""}`
          );
        } else if (data.synced > 0) {
          setSyncMsg(`Synced ${data.synced} result${data.synced === 1 ? "" : "s"} · ${data.onFile} on file`);
        } else {
          setSyncMsg(`${data.onFile} results on file · up to date`);
        }
      } else if (data.synced > 0) {
        setSyncMsg(`Synced ${data.synced} new result${data.synced === 1 ? "" : "s"}`);
      } else if (data.message) {
        setSyncMsg(data.message);
      } else {
        setSyncMsg("Up to date");
      }
      if (Array.isArray(data.warnings) && data.warnings.length) {
        setSyncWarnings(data.warnings);
      }
    } catch {
      setSyncMsg("Sync unavailable");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await load();
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!admin) return;
    runSync();
    const t = setInterval(runSync, 5 * 60_000);
    return () => clearInterval(t);
  }, [admin, runSync]);

  async function login() {
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) {
      setError("Wrong passcode");
      return;
    }
    setAdmin(true);
  }

  async function runCardSync() {
    if (cardSyncing) return;
    setCardSyncing(true);
    setCardSyncMsg("Re-fetching cards from API…");
    try {
      const res = await fetch("/api/sync-cards", { method: "POST" });
      const data = await res.json();
      if (res.status === 401) {
        setAdmin(false);
        setCardSyncMsg("Session expired — enter the steward passcode again.");
        return;
      }
      if (data.error) {
        setCardSyncMsg(`Error: ${data.error}`);
      } else {
        setCardSyncMsg(`Done — ${data.updated} updated, ${data.skipped} skipped`);
        await load();
      }
    } catch {
      setCardSyncMsg("Card sync unavailable");
    } finally {
      setCardSyncing(false);
    }
  }

  async function toggleOut(team: T) {
    const next = !team.is_out;
    setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, is_out: next } : t)));
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team_id: team.id, is_out: next }),
    });
    if (!res.ok) {
      const data = await res.json();
      if (res.status === 401) setAdmin(false);
      setError(data.error ?? "Update failed");
      load();
    }
  }

  async function setTeamRound(team: T, furthest_round: string) {
    setTeams((prev) =>
      prev.map((t) => (t.id === team.id ? { ...t, furthest_round } : t))
    );
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team_id: team.id, furthest_round }),
    });
    if (!res.ok) {
      const data = await res.json();
      if (res.status === 401) setAdmin(false);
      setError(data.error ?? "Update failed");
      load();
    }
  }

  const teamName = (id: string) => {
    const t = teams.find((x) => x.id === id);
    return t ? `${t.flag} ${t.name}` : id;
  };

  const cardSummary = (r: R) => {
    const parts = [];
    if (r.yellow_a || r.red_a) parts.push(`${teamName(r.team_a)}: ${r.yellow_a}Y ${r.red_a}R`);
    if (r.yellow_b || r.red_b) parts.push(`${teamName(r.team_b)}: ${r.yellow_b}Y ${r.red_b}R`);
    return parts.join(" · ");
  };

  const bandATeams = teams.filter((t) => t.band === "A");
  const bandBTeams = teams.filter((t) => t.band === "B");

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="overline">
            OFFICIAL ENTRY · {results.length} {results.length === 1 ? "RESULT" : "RESULTS"} ON FILE
          </p>
          <h1 className="display text-5xl" style={{ marginTop: "0.2rem" }}>
            Results d<span className="intruder">e</span>sk
          </h1>
          <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
            {admin
              ? "Results sync automatically from the World Cup feed when you open this page, then every five minutes."
              : "Enter the steward passcode to open the results desk."}
          </p>
        </div>
        {admin && syncMsg && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono text-xs uppercase" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
              {syncMsg}
            </span>
            <button
              className="text-xs underline"
              style={{ color: "var(--dim)" }}
              onClick={runSync}
              disabled={syncing}
            >
              {syncing ? "syncing…" : "sync now"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm" style={{ color: "var(--red)" }}>{error}</p>}

      {!admin && (
        <div className="mt-8 max-w-sm">
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            Filing, sync, and elimination controls are steward-only. Enter the passcode to unlock the desk.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              className="field flex-1"
              type="password"
              placeholder="Steward passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
            />
            <button className="btn" onClick={login}>Unlock</button>
          </div>
        </div>
      )}

      {admin && syncWarnings.length > 0 && (
        <div className="ruled-box mt-6 max-w-3xl">
          <p className="ruled-box-label">Sync notes</p>
          <ul className="mono mt-2 space-y-1 text-xs" style={{ color: "var(--dim)", letterSpacing: "0.04em" }}>
            {syncWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {admin && (
      <>
      <section className="ruled-box mt-8">
        <p className="ruled-box-label">Form 1 — filed record</p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-2xl">Filed results</h2>
          <div className="flex items-center gap-3">
            {cardSyncMsg && (
              <span className="mono text-xs uppercase" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
                {cardSyncMsg}
              </span>
            )}
            <button
              className="text-xs underline"
              style={{ color: "var(--dim)" }}
              onClick={runCardSync}
              disabled={cardSyncing}
            >
              {cardSyncing ? "re-syncing cards…" : "re-sync all cards"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
          Every finished match from the feed. Card counts can be pulled from SportAPI if enabled.
        </p>

        <ul className="mt-5 space-y-1">
          {sortedResults.map((r) => (
            <li key={r.id} className="rule-faint flex flex-wrap items-center gap-3 pb-1.5 text-sm">
              <span className="mono text-xs uppercase" style={{ color: "var(--dim)" }}>{r.stage}</span>
              <span>{teamName(r.team_a)}</span>
              <span className="mono font-bold">{r.score_a}–{r.score_b}</span>
              <span>{teamName(r.team_b)}</span>
              {(r.yellow_a || r.red_a || r.yellow_b || r.red_b) ? (
                <span className="text-xs" style={{ color: "var(--dim)" }}>{cardSummary(r)}</span>
              ) : null}
              <span className="mono ml-auto text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
                FILED {new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()}
              </span>
            </li>
          ))}
          {!results.length && (
            <li className="text-sm" style={{ color: "var(--dim)" }}>
              {syncing ? "SETTING THE TYPE…" : "No results on file yet."}
            </li>
          )}
        </ul>
      </section>

      <section className="ruled-box mt-12">
        <p className="ruled-box-label">Form 2 — round &amp; elimination record</p>
        <h2 className="display text-2xl">Progress desk</h2>
        <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
          Round advances automatically from fixtures and group standings. Override the reached round
          if needed, and tick a team out once eliminated.
        </p>
        <div className="mt-4 grid gap-x-8 gap-y-0 md:grid-cols-2">
          <p className="col-span-full mb-2 text-xs font-semibold uppercase" style={{ color: "var(--yellow)" }}>
            Band A — Contenders
          </p>
          {bandATeams.map((t) => (
            <div
              key={t.id}
              className="rule-faint flex flex-wrap items-center gap-2 pb-1.5 text-sm"
              style={{ opacity: t.is_out ? 0.55 : 1 }}
            >
              <span className="w-6 text-center">{t.flag}</span>
              <span style={{ textDecoration: t.is_out ? "line-through" : "none", minWidth: "6rem" }}>{t.name}</span>
              <span className="mono text-xs" style={{ color: "var(--dim)" }}>[{t.world_rank}]</span>
              <select
                className="field mono ml-auto text-xs"
                value={t.furthest_round ?? "group"}
                disabled={t.is_out}
                onChange={(e) => setTeamRound(t, e.target.value)}
                aria-label={`Round reached for ${t.name}`}
              >
                {ROUND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <label className="mono flex items-center gap-1 text-xs" style={{ color: "var(--dim)" }}>
                <input
                  type="checkbox"
                  checked={t.is_out}
                  onChange={() => toggleOut(t)}
                />
                {t.is_out ? "out" : "in"}
              </label>
            </div>
          ))}
          <p className="col-span-full mb-2 mt-6 text-xs font-semibold uppercase" style={{ color: "var(--yellow)" }}>
            Band B — Wildcards
          </p>
          {bandBTeams.map((t) => (
            <div
              key={t.id}
              className="rule-faint flex flex-wrap items-center gap-2 pb-1.5 text-sm"
              style={{ opacity: t.is_out ? 0.55 : 1 }}
            >
              <span className="w-6 text-center">{t.flag}</span>
              <span style={{ textDecoration: t.is_out ? "line-through" : "none", minWidth: "6rem" }}>{t.name}</span>
              <span className="mono text-xs" style={{ color: "var(--dim)" }}>[{t.world_rank}]</span>
              <select
                className="field mono ml-auto text-xs"
                value={t.furthest_round ?? "group"}
                disabled={t.is_out}
                onChange={(e) => setTeamRound(t, e.target.value)}
                aria-label={`Round reached for ${t.name}`}
              >
                {ROUND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <label className="mono flex items-center gap-1 text-xs" style={{ color: "var(--dim)" }}>
                <input
                  type="checkbox"
                  checked={t.is_out}
                  onChange={() => toggleOut(t)}
                />
                {t.is_out ? "out" : "in"}
              </label>
            </div>
          ))}
        </div>
      </section>
      </>
      )}
    </div>
  );
}
