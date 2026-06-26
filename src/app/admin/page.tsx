"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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
  const [editingCardsId, setEditingCardsId] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState({ yellow_a: 0, red_a: 0, yellow_b: 0, red_b: 0 });
  const [savingCards, setSavingCards] = useState(false);

  const load = useCallback(async () => {
    const db = supa();
    const [t, r, auth] = await Promise.all([
      db.from("teams").select("*").order("band").order("world_rank"),
      db.from("results").select("*").order("created_at", { ascending: false }),
      fetch("/api/login").then((res) => res.json()),
    ]);
    setTeams((t.data ?? []) as T[]);
    setResults((r.data ?? []) as R[]);
    setAdmin(Boolean(auth.admin));
  }, []);

  const sortedResults = useMemo(
    () =>
      [...results].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [results]
  );

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncMsg("Pulling results from the World Cup feed…");
    setSyncWarnings([]);
    try {
      const r = await fetch("/api/sync", { method: "POST" });
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
        const progressNote =
          typeof data.progressUpdated === "number" && data.progressUpdated > 0
            ? ` · ${data.progressUpdated} team${data.progressUpdated === 1 ? "" : "s"} progress updated`
            : "";
        const tail = progressNote;
        if (gap > 0) {
          setSyncMsg(
            `${data.onFile} of ${data.finishedInFeed} finished matches on file${data.synced ? ` · ${data.synced} just added` : ""}${tail}`
          );
        } else if (data.synced > 0) {
          setSyncMsg(`Synced ${data.synced} result${data.synced === 1 ? "" : "s"} · ${data.onFile} on file${tail}`);
        } else {
          setSyncMsg(`${data.onFile} results on file · up to date${tail}`);
        }
      } else if (data.synced > 0) {
        const progressNote =
          typeof data.progressUpdated === "number" && data.progressUpdated > 0
            ? ` · ${data.progressUpdated} team${data.progressUpdated === 1 ? "" : "s"} progress updated`
            : "";
        setSyncMsg(`Synced ${data.synced} new result${data.synced === 1 ? "" : "s"}${progressNote}`);
      } else if (data.message) {
        setSyncMsg(data.message);
      } else if (typeof data.progressUpdated === "number" && data.progressUpdated > 0) {
        setSyncMsg(
          `Progress updated for ${data.progressUpdated} team${data.progressUpdated === 1 ? "" : "s"} · up to date`
        );
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

  function openCardEdit(r: R) {
    if (editingCardsId === r.id) {
      setEditingCardsId(null);
      return;
    }
    setEditingCardsId(r.id);
    setCardDraft({
      yellow_a: r.yellow_a,
      red_a: r.red_a,
      yellow_b: r.yellow_b,
      red_b: r.red_b,
    });
    setError(null);
  }

  async function saveCards(resultId: string) {
    setSavingCards(true);
    setError(null);
    try {
      const res = await fetch("/api/results", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: resultId, ...cardDraft }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setAdmin(false);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Could not save cards");
        return;
      }
      setResults((prev) =>
        prev.map((r) => (r.id === resultId ? { ...r, ...cardDraft } : r))
      );
      setEditingCardsId(null);
    } catch {
      setError("Could not save cards");
    } finally {
      setSavingCards(false);
    }
  }

  function cardField(
    label: string,
    key: keyof typeof cardDraft,
    value: number,
    onChange: (n: number) => void
  ) {
    return (
      <label className="flex flex-col gap-0.5">
        <span className="mono text-xs uppercase" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
          {label}
        </span>
        <input
          className="field mono w-14 text-center text-xs"
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
          onClick={(e) => e.stopPropagation()}
        />
      </label>
    );
  }

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
              ? "Results and progress sync from the World Cup feed when you open this page, then every five minutes."
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
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
          Click a row to file yellow and red card counts. Scores sync from the feed; cards are
          steward-entered unless API card sync is enabled.
        </p>

        <ul className="mt-5 space-y-0">
          {sortedResults.map((r) => {
            const editing = editingCardsId === r.id;
            const teamA = teams.find((t) => t.id === r.team_a);
            const teamB = teams.find((t) => t.id === r.team_b);
            return (
              <li key={r.id} className="rule-faint">
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-3 pb-1.5 pt-1.5 text-left text-sm"
                  style={{
                    cursor: "pointer",
                    background: editing ? "var(--surface-raised)" : "transparent",
                    border: "none",
                    color: "inherit",
                    font: "inherit",
                  }}
                  onClick={() => openCardEdit(r)}
                  aria-expanded={editing}
                >
                  <span className="mono text-xs uppercase" style={{ color: "var(--dim)" }}>{r.stage}</span>
                  <span>{teamName(r.team_a)}</span>
                  <span className="mono font-bold">{r.score_a}–{r.score_b}</span>
                  <span>{teamName(r.team_b)}</span>
                  {(r.yellow_a || r.red_a || r.yellow_b || r.red_b) ? (
                    <span className="text-xs" style={{ color: "var(--dim)" }}>{cardSummary(r)}</span>
                  ) : (
                    <span className="mono text-xs" style={{ color: "var(--cream-18)", letterSpacing: "0.06em" }}>
                      + ADD CARDS
                    </span>
                  )}
                  <span className="mono ml-auto text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
                    FILED {new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()}
                  </span>
                </button>
                {editing && (
                  <div
                    className="flex flex-wrap items-end gap-4 px-1 pb-3 pt-1"
                    style={{ borderTop: "1px solid var(--cream-10)" }}
                  >
                    <div>
                      <p className="mono mb-2 text-xs uppercase" style={{ color: "var(--dim)", letterSpacing: "0.08em" }}>
                        {teamA?.flag} {teamA?.name ?? r.team_a}
                      </p>
                      <div className="flex gap-3">
                        {cardField("Yellow", "yellow_a", cardDraft.yellow_a, (n) =>
                          setCardDraft((d) => ({ ...d, yellow_a: n }))
                        )}
                        {cardField("Red", "red_a", cardDraft.red_a, (n) =>
                          setCardDraft((d) => ({ ...d, red_a: n }))
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="mono mb-2 text-xs uppercase" style={{ color: "var(--dim)", letterSpacing: "0.08em" }}>
                        {teamB?.flag} {teamB?.name ?? r.team_b}
                      </p>
                      <div className="flex gap-3">
                        {cardField("Yellow", "yellow_b", cardDraft.yellow_b, (n) =>
                          setCardDraft((d) => ({ ...d, yellow_b: n }))
                        )}
                        {cardField("Red", "red_b", cardDraft.red_b, (n) =>
                          setCardDraft((d) => ({ ...d, red_b: n }))
                        )}
                      </div>
                    </div>
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        className="text-xs underline"
                        style={{ color: "var(--dim)" }}
                        onClick={() => setEditingCardsId(null)}
                        disabled={savingCards}
                      >
                        cancel
                      </button>
                      <button
                        type="button"
                        className="btn text-xs"
                        onClick={() => saveCards(r.id)}
                        disabled={savingCards}
                      >
                        {savingCards ? "filing…" : "file cards"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
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
          Round and elimination status updates automatically after each sync. Override a reached
          round or out flag here only when the feed needs a manual correction.
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
