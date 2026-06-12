"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface T {
  id: string;
  name: string;
  flag: string;
  band: string;
  world_rank: number;
  is_out: boolean;
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

const STAGES = [
  { value: "group", label: "Group stage" },
  { value: "r32", label: "Round of 32" },
  { value: "r16", label: "Round of 16" },
  { value: "qf", label: "Quarter-final" },
  { value: "sf", label: "Semi-final" },
  { value: "third", label: "Third place" },
  { value: "final", label: "Final" },
];

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function CardInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mono flex items-center gap-1 text-xs" style={{ color: "var(--dim)" }}>
      {label}
      <input
        className="field w-10 text-center"
        inputMode="numeric"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function ResultsDesk() {
  const [admin, setAdmin] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [teams, setTeams] = useState<T[]>([]);
  const [results, setResults] = useState<R[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // result form
  const [stage, setStage] = useState("group");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [yellowA, setYellowA] = useState("");
  const [redA, setRedA] = useState("");
  const [yellowB, setYellowB] = useState("");
  const [redB, setRedB] = useState("");

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

  useEffect(() => { load(); }, [load]);

  // Auto-sync results from API-Football whenever admin becomes true
  useEffect(() => {
    if (!admin) return;
    setSyncMsg("Checking for new results…");
    fetch("/api/sync")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setSyncMsg(`Sync error: ${data.error}`);
        } else if (data.message) {
          setSyncMsg(data.message);
        } else if (data.synced > 0) {
          setSyncMsg(`Synced ${data.synced} new result${data.synced === 1 ? "" : "s"}`);
          load();
        } else {
          setSyncMsg(`Up to date`);
        }
      })
      .catch(() => setSyncMsg("Sync unavailable"));
  // Only run when admin status first becomes true, not on every load() change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  async function login() {
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) { setError("Wrong passcode"); return; }
    setAdmin(true);
  }

  async function addResult() {
    setError(null);
    const res = await fetch("/api/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stage,
        team_a: teamA, team_b: teamB,
        score_a: scoreA, score_b: scoreB,
        yellow_a: yellowA || 0, red_a: redA || 0,
        yellow_b: yellowB || 0, red_b: redB || 0,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setScoreA(""); setScoreB("");
    setTeamA(""); setTeamB("");
    setYellowA(""); setRedA(""); setYellowB(""); setRedB("");
    setResults((prev) => [data.result, ...prev]);
  }

  async function deleteResult(id: string) {
    const res = await fetch("/api/results", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setResults((prev) => prev.filter((r) => r.id !== id));
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

  if (!admin) {
    return (
      <div className="max-w-sm">
        <p className="overline">OFFICIAL ENTRY · RESTRICTED</p>
        <h1 className="display text-5xl" style={{ marginTop: "0.2rem" }}>
          Results d<span className="intruder">e</span>sk
        </h1>
        <p className="mt-4 text-sm" style={{ color: "var(--dim)" }}>
          Steward passcode required to open the desk.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className="field flex-1"
            type="password"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
          <button className="btn" onClick={login}>Unlock</button>
        </div>
        {error && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{error}</p>}
      </div>
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
        </div>
        {syncMsg && (
          <span className="mono text-xs uppercase" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
            {syncMsg}
          </span>
        )}
      </div>

      <section className="ruled-box mt-8">
        <p className="ruled-box-label">Form 1 — match result entry</p>
        <h2 className="display text-2xl">Record a match</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="field" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="field" value={teamA} onChange={(e) => setTeamA(e.target.value)}>
            <option value="">Team A</option>
            <optgroup label="Band A">
              {bandATeams.map((t) => <option key={t.id} value={t.id}>{t.flag} {t.name}</option>)}
            </optgroup>
            <optgroup label="Band B">
              {bandBTeams.map((t) => <option key={t.id} value={t.id}>{t.flag} {t.name}</option>)}
            </optgroup>
          </select>
          <input className="field w-16" inputMode="numeric" placeholder="0" value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
          <span className="mono" style={{ color: "var(--dim)" }}>–</span>
          <input className="field w-16" inputMode="numeric" placeholder="0" value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
          <select className="field" value={teamB} onChange={(e) => setTeamB(e.target.value)}>
            <option value="">Team B</option>
            <optgroup label="Band A">
              {bandATeams.map((t) => <option key={t.id} value={t.id}>{t.flag} {t.name}</option>)}
            </optgroup>
            <optgroup label="Band B">
              {bandBTeams.map((t) => <option key={t.id} value={t.id}>{t.flag} {t.name}</option>)}
            </optgroup>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <span className="text-xs" style={{ color: "var(--dim)" }}>Cards (normal+ET only):</span>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            {teamA ? teamName(teamA) : "Team A"}:
          </span>
          <CardInput label="Y" value={yellowA} onChange={setYellowA} />
          <CardInput label="R" value={redA} onChange={setRedA} />
          <span className="mx-2 text-xs" style={{ color: "var(--dim)" }}>|</span>
          <span className="text-xs" style={{ color: "var(--dim)" }}>
            {teamB ? teamName(teamB) : "Team B"}:
          </span>
          <CardInput label="Y" value={yellowB} onChange={setYellowB} />
          <CardInput label="R" value={redB} onChange={setRedB} />
          <button className="btn" onClick={addResult}>Save result</button>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
          Scores and cards cover normal time + extra time only. Penalty shootouts don&apos;t count.
          Two yellows = enter 2 yellows (not a red). Straight red = 1 red.
        </p>
        {error && <p className="mt-2 text-sm" style={{ color: "var(--red)" }}>{error}</p>}

        <ul className="mt-5 space-y-1">
          {results.map((r) => (
            <li key={r.id} className="rule-faint flex flex-wrap items-center gap-3 pb-1.5 text-sm">
              <span className="mono text-xs uppercase" style={{ color: "var(--dim)" }}>{r.stage}</span>
              <span>{teamName(r.team_a)}</span>
              <span className="mono font-bold">{r.score_a}–{r.score_b}</span>
              <span>{teamName(r.team_b)}</span>
              {(r.yellow_a || r.red_a || r.yellow_b || r.red_b) ? (
                <span className="text-xs" style={{ color: "var(--dim)" }}>{cardSummary(r)}</span>
              ) : null}
              {/* Time as material — the stub records when it was filed */}
              <span className="mono ml-auto text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
                FILED {new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase()}
              </span>
              <button
                className="text-xs underline"
                style={{ color: "var(--dim)" }}
                onClick={() => deleteResult(r.id)}
              >
                delete
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="text-sm" style={{ color: "var(--dim)" }}>
              No results yet — first whistle is coming.
            </li>
          )}
        </ul>
      </section>

      <section className="ruled-box mt-12">
        <p className="ruled-box-label">Form 2 — elimination record</p>
        <h2 className="display text-2xl">Elimination desk</h2>
        <p className="mt-2 text-xs" style={{ color: "var(--dim)" }}>
          Tick a team out once they&apos;re eliminated. They stop earning points immediately.
        </p>
        <div className="mt-4 grid gap-x-8 gap-y-0 md:grid-cols-2">
          <p className="col-span-full mb-2 text-xs font-semibold uppercase" style={{ color: "var(--yellow)" }}>
            Band A — Contenders
          </p>
          {bandATeams.map((t) => (
            <label
              key={t.id}
              className="rule-faint flex cursor-pointer items-center gap-3 pb-1.5 text-sm"
              style={{ opacity: t.is_out ? 0.55 : 1 }}
            >
              <span className="w-6 text-center">{t.flag}</span>
              <span style={{ textDecoration: t.is_out ? "line-through" : "none" }}>{t.name}</span>
              <span className="mono text-xs" style={{ color: "var(--dim)" }}>[{t.world_rank}]</span>
              <input
                type="checkbox"
                className="ml-auto"
                checked={t.is_out}
                onChange={() => toggleOut(t)}
              />
              <span className="mono w-8 text-xs uppercase" style={{ color: "var(--dim)" }}>
                {t.is_out ? "out" : "in"}
              </span>
            </label>
          ))}
          <p className="col-span-full mb-2 mt-6 text-xs font-semibold uppercase" style={{ color: "var(--yellow)" }}>
            Band B — Wildcards
          </p>
          {bandBTeams.map((t) => (
            <label
              key={t.id}
              className="rule-faint flex cursor-pointer items-center gap-3 pb-1.5 text-sm"
              style={{ opacity: t.is_out ? 0.55 : 1 }}
            >
              <span className="w-6 text-center">{t.flag}</span>
              <span style={{ textDecoration: t.is_out ? "line-through" : "none" }}>{t.name}</span>
              <span className="mono text-xs" style={{ color: "var(--dim)" }}>[{t.world_rank}]</span>
              <input
                type="checkbox"
                className="ml-auto"
                checked={t.is_out}
                onChange={() => toggleOut(t)}
              />
              <span className="mono w-8 text-xs uppercase" style={{ color: "var(--dim)" }}>
                {t.is_out ? "out" : "in"}
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
