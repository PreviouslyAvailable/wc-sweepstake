"use client";

import { useEffect, useState, useCallback } from "react";
import { fmtFixtureDate, fmtFixtureKickoff } from "@/lib/match-dates";

interface TeamSide {
  teamId: string | null;
  name: string;
  flag: string;
  worldRank: number;
  score: number;
  owner: string | null;
  pts: number;
}

interface Match {
  id: number;
  status: string;
  statusLabel: string;
  startTimestamp: number;
  round: string;
  home: TeamSide;
  away: TeamSide;
}

interface LiveData {
  matches: Match[];
  asOf: string;
}

/* ── Perimeter Chant ──────────────────────────────────
   Text repeats edge-to-edge on all four sides of a
   containing element (must be position:relative).
   The ticker never resolves neatly — it continues
   beyond the frame.                                   */
function PerimeterChant({ text }: { text: string }) {
  const chantText = (text + " · ").repeat(16);
  const monoStyle: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.46rem",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--cream-18)",
    lineHeight: "1",
    display: "block",
  };
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      {/* Top edge */}
      <div className="chant-edge chant-edge-top">
        <span className="chant-h" style={{ ...monoStyle, paddingTop: "2px" }}>{chantText}</span>
      </div>
      {/* Bottom edge */}
      <div className="chant-edge chant-edge-bottom">
        <span className="chant-h reverse" style={{ ...monoStyle, paddingBottom: "2px" }}>{chantText}</span>
      </div>
      {/* Left edge */}
      <div className="chant-edge chant-edge-left">
        <span className="chant-v" style={{ ...monoStyle, writingMode: "vertical-rl", transform: "rotate(180deg)", paddingLeft: "2px" }}>
          {chantText}
        </span>
      </div>
      {/* Right edge */}
      <div className="chant-edge chant-edge-right">
        <span className="chant-v reverse" style={{ ...monoStyle, writingMode: "vertical-rl", paddingRight: "2px" }}>
          {chantText}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ match }: { match: Match }) {
  const isLive = match.status === "inprogress";
  const isFt   = match.status === "finished";
  const label  = match.statusLabel || (match.status === "notstarted" ? fmtFixtureKickoff(match.startTimestamp) : "");

  if (isLive) {
    return (
      <span className="status-badge is-live">
        {/* whistle_red dot — the ONE red element on this page */}
        <span className="live-dot" />
        {label || "LIVE"}
      </span>
    );
  }
  if (isFt) return <span className="status-badge is-ft">{label || "FT"}</span>;
  return <span className="status-badge">{label}</span>;
}

function MatchCard({ match }: { match: Match }) {
  const isLive     = match.status === "inprogress";
  const isFinished = match.status === "finished";
  const showScore  = isLive || isFinished;
  const homeWins   = showScore && match.home.score > match.away.score;
  const awayWins   = showScore && match.away.score > match.home.score;
  const hasFoot    = match.home.owner || match.away.owner;

  return (
    <div className={`match-card stamp${isLive ? " is-live" : ""}`}>
      <div className="match-card-head">
        <div className="match-card-meta">
          <span className="match-date-label">{fmtFixtureDate(match.startTimestamp)}</span>
          <span className="round-label">{match.round || "WORLD CUP 2026"}</span>
        </div>
        <StatusBadge match={match} />
      </div>

      <div className="match-card-body">
        <div className="match-team">
          <span className="match-team-flag">{match.home.flag}</span>
          <span className="match-team-name">{match.home.name}</span>
          <span className="match-team-rank">#{match.home.worldRank}</span>
        </div>

        <div className="match-center">
          {showScore ? (
            <>
              <span className={`match-score-num${awayWins ? " dim" : ""}`}>{match.home.score}</span>
              <span className="match-score-sep">–</span>
              <span className={`match-score-num${homeWins ? " dim" : ""}`}>{match.away.score}</span>
            </>
          ) : (
            <div className="match-kickoff-block">
              <span className="match-kickoff-time">{fmtFixtureKickoff(match.startTimestamp)}</span>
              <span className="match-kickoff-vs">KO</span>
            </div>
          )}
        </div>

        <div className="match-team away">
          <span className="match-team-flag">{match.away.flag}</span>
          <span className="match-team-name">{match.away.name}</span>
          <span className="match-team-rank">#{match.away.worldRank}</span>
        </div>
      </div>

      {hasFoot && (
        <div className="match-card-foot">
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
            {match.home.owner ? (
              <>
                <span className="owner-pill">{match.home.owner}</span>
                {showScore && <span className="pts-preview">+{match.home.pts}</span>}
              </>
            ) : (
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.56rem", color: "var(--cream-18)" }}>UNCLAIMED</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0, flexDirection: "row-reverse" }}>
            {match.away.owner ? (
              <>
                <span className="owner-pill">{match.away.owner}</span>
                {showScore && <span className="pts-preview">+{match.away.pts}</span>}
              </>
            ) : (
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.56rem", color: "var(--cream-18)" }}>UNCLAIMED</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchSection({
  title,
  object,
  matches,
  active,
}: {
  title: string;
  object: string;
  matches: Match[];
  active?: boolean;
}) {
  if (!matches.length) return null;
  return (
    <section className="live-section">
      <div className="live-section-head">
        <h2 className={`live-section-title${active ? " is-active" : ""}`}>{title}</h2>
        {active && <span className="live-dot" style={{ width: "9px", height: "9px" }} />}
        <span className="live-section-count">
          {object} · {matches.length} {matches.length === 1 ? "MATCH" : "MATCHES"}
        </span>
      </div>
      <div className="matches-grid">
        {matches.map((m) => <MatchCard key={m.id} match={m} />)}
      </div>
    </section>
  );
}

export default function LivePage() {
  const [data, setData]           = useState<LiveData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/live")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<LiveData>; })
      .then((d) => { setData(d); setRefreshed(new Date()); setErr(null); })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 90_000);
    return () => clearInterval(t);
  }, [refresh]);

  const live     = data?.matches.filter((m) => m.status === "inprogress") ?? [];
  const finished = data?.matches.filter((m) => m.status === "finished")   ?? [];
  const upcoming = data?.matches.filter((m) => m.status === "notstarted") ?? [];
  const hasAny   = live.length + finished.length + upcoming.length > 0;
  const isLiveNow = live.length > 0;

  /* Perimeter chant text — never resolves neatly */
  const chantText = "MATCHKIT · WORLD CUP 2026 · OFFICIAL SWEEPSTAKE RECORD";

  return (
    <div className="live-page">

      {/* ── Page header — ROAR at full volume ─────────
          Italic Intruder: "LI<i>V</i>E" — synthetic skew
          on Anton (no true italic). One letter per headline.
          Headline fills canvas; negative leading enforced.  */}
      <div
        className="perimeter-wrap"
        style={{ marginBottom: "3rem", paddingBottom: "2.5rem", borderBottom: "1px solid var(--cream-10)", paddingTop: "1.5rem" }}
      >
        <PerimeterChant text={chantText} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", padding: "1rem 1.5rem" }}>
          <div>
            <h1
              className="compressed"
              style={{
                fontSize: "clamp(4rem, 14vw, 8rem)",
                lineHeight: 0.88,
                color: isLiveNow ? "var(--yellow)" : "var(--cream)",
              }}
            >
              {isLiveNow ? (
                /* Italic Intruder on 'V' */
                <>LI<span className="intruder synth">V</span>E</>
              ) : (
                /* Italic Intruder on 'O' */
                <>SC<span className="intruder synth">O</span>RES</>
              )}
            </h1>
            <p className="mono" style={{ fontSize: "0.58rem", color: "var(--cream-30)", letterSpacing: "0.12em", marginTop: "0.6rem" }}>
              FIFA WORLD CUP 2026 — SWEEPSTAKE RECORD
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            {refreshed && (
              <p className="mono" style={{ fontSize: "0.56rem", color: "var(--cream-18)", letterSpacing: "0.08em" }}>
                AS OF {refreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            )}
            <p className="mono" style={{ fontSize: "0.52rem", color: "var(--cream-18)", opacity: 0.6, marginTop: "0.2rem", letterSpacing: "0.08em" }}>
              AUTO-REFRESHES · 90S
            </p>
          </div>
        </div>
      </div>

      {/* Loading — print metaphor, never a generic spinner */}
      {loading && (
        <p className="mono" style={{ fontSize: "0.7rem", color: "var(--cream-30)", letterSpacing: "0.1em" }}>INKING THE PLATES…</p>
      )}

      {/* Error */}
      {err && (
        <div style={{ padding: "0.75rem 1rem", border: "1px solid rgba(224,16,58,0.3)", marginBottom: "2rem" }}>
          <p className="mono" style={{ fontSize: "0.7rem", color: "var(--red)" }}>{err}</p>
        </div>
      )}

      {/* Sections */}
      {!loading && hasAny && (
        <>
          <MatchSection title="LIVE NOW"  object="SCOREBOARD"    matches={live}     active />
          <MatchSection title="RESULTS"   object="RESULT STUBS"  matches={finished} />
          <MatchSection title="COMING UP" object="FIXTURE SHEET" matches={upcoming} />
        </>
      )}

      {/* Empty */}
      {!loading && !err && !hasAny && (
        <div style={{ paddingTop: "5rem" }}>
          <p className="compressed" style={{ fontSize: "3rem", color: "var(--cream-18)" }}>
            NO MATCHES IN RANGE
          </p>
          <p className="mono" style={{ fontSize: "0.6rem", color: "var(--cream-18)", letterSpacing: "0.1em", marginTop: "0.75rem" }}>
            FIXTURES APPEAR HERE DURING WORLD CUP 2026
          </p>
        </div>
      )}

      {/* Annotation footnote — patent-clerk voice */}
      {!loading && hasAny && (finished.length > 0 || live.length > 0) && (
        <p className="mono" style={{ marginTop: "3rem", fontSize: "0.56rem", color: "var(--cream-18)", letterSpacing: "0.07em" }}>
          FIG. 2 — PREVIEW PTS = GOALS + CLEAN SHEET + GIANT-KILLING · CARD PTS FILE AFTER AUTO-SYNC
        </p>
      )}
    </div>
  );
}
