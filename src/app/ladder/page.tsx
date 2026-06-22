import { supaAnon } from "@/lib/supabase";
import {
  buildNextFixtureByTeam,
  buildGamesLeftByTeam,
  buildOwnerByTeamId,
  ladderRowMeta,
} from "@/lib/ladder-meta";
import {
  computeStandings,
  computeUnclaimedTeamScores,
  formatBreakdownTooltip,
  Participant,
  Assignment,
  Team,
  Result,
  StandingRow,
} from "@/lib/scoring";
import { fetchWcFixtures } from "@/lib/wc-fixtures";
import { buildTournamentStatusByTeam } from "@/lib/tournament-status";

import { formatTipSections } from "@/lib/tooltip-format";

export const dynamic = "force-dynamic";

function holderPtsTooltip(row: StandingRow): string {
  const breakdown = {
    goals: row.teams.reduce((s, t) => s + t.breakdown.goals, 0),
    cleanSheet: row.teams.reduce((s, t) => s + t.breakdown.cleanSheet, 0),
    cards: row.teams.reduce((s, t) => s + t.breakdown.cards, 0),
    giantKilling: row.teams.reduce((s, t) => s + t.breakdown.giantKilling, 0),
    total: row.total,
  };
  return formatTipSections([
    {
      heading: `${row.participant.name} — ${row.total} pts`,
      lines: [
        ...row.teams.map(
          ({ team, total }) =>
            `${team.flag} ${team.name} +${total}${team.is_out ? " (out)" : ""}`
        ),
        `Goals: ${breakdown.goals}`,
        `Clean sheets: ${breakdown.cleanSheet}`,
        `Cards: ${breakdown.cards}`,
        breakdown.giantKilling ? `Giant-killing: ${breakdown.giantKilling}` : null,
      ],
    },
  ]);
}

export default async function Ladder() {
  const db = supaAnon();
  const [p, a, t, r] = await Promise.all([
    db.from("participants").select("*"),
    db.from("assignments").select("*"),
    db.from("teams").select("*"),
    db.from("results").select("*"),
  ]);

  const participants = (p.data ?? []) as Participant[];
  const assignments = (a.data ?? []) as Assignment[];
  const teams = (t.data ?? []) as Team[];
  const results = (r.data ?? []) as Result[];
  const teamById = new Map(teams.map((tm) => [tm.id, tm]));

  if (!assignments.length) {
    return (
      <div className="empty-slot mx-auto mt-16 max-w-xl">
        <p className="overline">THIS SLOT AWAITS ITS FIRST ENTRY</p>
        <h1 className="display mt-2 text-5xl">No names in the hat yet</h1>
        <p className="mt-4" style={{ color: "var(--dim)" }}>
          Head to <a className="underline" href="/draw">the draw</a> to add everyone and deal the teams.
        </p>
      </div>
    );
  }

  const standings = computeStandings(participants, assignments, teams, results);
  const unclaimed = computeUnclaimedTeamScores(assignments, teams, results);
  const leaderTotal = standings[0]?.total ?? 0;

  const apiKey = process.env.RAPIDAPI_KEY;
  let fixtures: Awaited<ReturnType<typeof fetchWcFixtures>> = [];
  if (apiKey) {
    try {
      fixtures = await fetchWcFixtures(apiKey);
    } catch {
      // Fixture sheet unavailable — GP and standings still render
    }
  }
  const ownerByTeamId = buildOwnerByTeamId(assignments, participants);
  const nextByTeam = buildNextFixtureByTeam(fixtures, ownerByTeamId, teamById);
  const gamesLeftByTeam = buildGamesLeftByTeam(fixtures);
  const statusByTeam = buildTournamentStatusByTeam({ teams, results, fixtures });

  const issued = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  }).toUpperCase();

  return (
    <div>
      <div>
        {/* Filing label — true issue data */}
        <p className="overline">
          STANDINGS INDEX · {standings.length} HOLDERS · AS OF {issued}
        </p>
        {/* Italic Intruder: one slanted letter in the Instrument Serif heading */}
        <h1 className="display text-5xl" style={{ marginTop: "0.2rem" }}>
          The la<span className="intruder">d</span>der
        </h1>
      </div>

      <div className="mt-8">
        <div className="ladder-row ladder-head">
          <span>#</span>
          <span>Holder</span>
          <div className="ladder-head-fixture">
            <span>Next vs</span>
            <span>Date</span>
            <span>NZST</span>
          </div>
          <span className="ladder-num ladder-gp">Games left to play</span>
          <span className="ladder-num ladder-gp">Games played</span>
          <span className="ladder-num">Alive</span>
          <span className="ladder-num">Pts</span>
        </div>
        <ol>
          {standings.map((row, i) => {
            const meta = ladderRowMeta(row, results, nextByTeam, gamesLeftByTeam);
            return (
              <li key={row.participant.id} className="ladder-row">
                <span className="index-num">{String(i + 1).padStart(2, "0")}</span>
                <div className="ladder-holder-block">
                  <span className="ladder-holder-name display text-xl">
                    {row.participant.name}
                    {i === 0 && row.total === leaderTotal && row.total > 0 && (
                      <span className="stamp-mark" style={{ color: "var(--yellow)" }}>
                        Leader
                      </span>
                    )}
                  </span>
                  <span className="ladder-drawcards text-sm">
                    {row.teams.map(({ team, breakdown, total }) => {
                      const status = statusByTeam.get(team.id);
                      const tip = formatBreakdownTooltip(
                        breakdown,
                        [
                          `${team.name} [${team.world_rank}] — ${total} pts`,
                          status ? `${status.label} · ${status.detail}` : null,
                          team.is_out ? "(eliminated)" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      );
                      return (
                      <span
                        key={team.id}
                        className="has-tip ladder-team-chip"
                        data-tip={tip}
                        tabIndex={0}
                        style={{ opacity: team.is_out ? 0.35 : 1 }}
                      >
                        <span aria-hidden>{team.flag}</span>
                        {status && !team.is_out ? (
                          <span
                            className={`mono round-chip-sm${status.secured ? " round-chip-secured" : ""}${status.fate === "bubble" ? " round-chip-bubble" : ""}`}
                          >
                            {status.chip}
                          </span>
                        ) : null}
                      </span>
                      );
                    })}
                  </span>
                </div>
                <div className="ladder-fixture">
                  <span className="ladder-next has-tip" data-tip={meta.nextTitle} tabIndex={0}>
                    {meta.nextLabel}
                  </span>
                  {meta.nextDateTitle ? (
                    <span className="ladder-date tabular-nums has-tip" data-tip={meta.nextDateTitle} tabIndex={0}>
                      {meta.nextDate}
                    </span>
                  ) : (
                    <span className="ladder-date tabular-nums">{meta.nextDate}</span>
                  )}
                  {meta.nextTimeTitle ? (
                    <span className="ladder-time tabular-nums has-tip" data-tip={meta.nextTimeTitle} tabIndex={0}>
                      {meta.nextTime}
                    </span>
                  ) : (
                    <span className="ladder-time tabular-nums">{meta.nextTime}</span>
                  )}
                </div>
                <span className="ladder-num text-sm" style={{ color: "var(--dim)" }}>
                  {meta.gamesLeft}
                </span>
                <span
                  className="ladder-num text-sm has-tip"
                  style={{ color: "var(--dim)" }}
                  data-tip={meta.gamesTooltip}
                  tabIndex={0}
                >
                  {meta.gamesPlayed}
                </span>
                <span className="ladder-num text-sm" style={{ color: "var(--dim)" }}>
                  {row.alive}
                </span>
                <span
                  className="ladder-num text-2xl has-tip"
                  style={{ color: "var(--yellow)" }}
                  data-tip={holderPtsTooltip(row)}
                  tabIndex={0}
                >
                  {row.total}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {unclaimed.length > 0 && (
        <section className="ruled-box mt-12 max-w-xl">
          <p className="ruled-box-label">Unclaimed record — no holder issued</p>
          <h2 className="display text-2xl" style={{ marginBottom: "0.75rem" }}>
            Points <span className="intruder">l</span>eft on the table
          </h2>
          <p className="mono mb-4 text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
            Opponents and held-out draw teams · scored under the schedule but not on any holder card
          </p>
          <ul>
            {unclaimed.map(({ team, breakdown, total }) => {
              const tip = formatBreakdownTooltip(
                breakdown,
                `${team.name} [${team.world_rank}] — ${total} pts`
              );
              return (
              <li
                key={team.id}
                className="index-row has-tip"
                style={{ borderColor: "var(--rule)" }}
                data-tip={tip}
                tabIndex={0}
              >
                <span className="text-lg">{team.flag}</span>
                <span className="display text-lg">{team.name}</span>
                <span className="mono text-xs" style={{ color: "var(--dim)" }}>
                  [{team.world_rank}]
                </span>
                <span className="mono ml-auto text-xl" style={{ color: "var(--cream)" }}>
                  {total}
                </span>
              </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Scoring rules — ARCHIVE register, patent-clerk deadpan, no emoji */}
      <section className="ruled-box mt-12 max-w-xl">
        <p className="ruled-box-label">Schedule of points — issued under matchday conditions</p>
        <h2 className="display text-2xl" style={{ marginBottom: "1rem" }}>
          Point<span className="intruder">s</span> schedule
        </h2>
        <dl className="mono" style={{ fontSize: "0.65rem", letterSpacing: "0.07em", color: "var(--dim)", lineHeight: 2 }}>
          <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--rule)", paddingBottom: "0.4rem", marginBottom: "0.4rem" }}>
            <dt style={{ minWidth: "9rem", color: "var(--cream)" }}>FIG. 1 — GOAL</dt>
            <dd>+1 PER GOAL IN NORMAL TIME OR EXTRA TIME</dd>
          </div>
          <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--rule)", paddingBottom: "0.4rem", marginBottom: "0.4rem" }}>
            <dt style={{ minWidth: "9rem", color: "var(--cream)" }}>FIG. 2 — CLEAN SHEET</dt>
            <dd>+3 IF ZERO CONCEDED IN NORMAL + ET · BOTH SIDES CLAIM IN A 0–0 DRAW</dd>
          </div>
          <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--rule)", paddingBottom: "0.4rem", marginBottom: "0.4rem" }}>
            <dt style={{ minWidth: "9rem", color: "var(--cream)" }}>FIG. 3 — YELLOW CARD</dt>
            <dd>+1 PER CAUTION · TWO YELLOWS = +2 · STRAIGHT RED = +3</dd>
          </div>
          <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--rule)", paddingBottom: "0.4rem", marginBottom: "0.4rem" }}>
            <dt style={{ minWidth: "9rem", color: "var(--cream)" }}>FIG. 4 — GIANT-KILLING</dt>
            <dd>+1 PER FULL 10-RANK GAP ON WINS ONLY · DRAWS DO NOT QUALIFY</dd>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <dt style={{ minWidth: "9rem", color: "var(--cream)" }}>FIG. 5 — PENALTIES</dt>
            <dd>SHOOTOUT GOALS AND CLEAN SHEETS: NOT SCORED · WORLD RANKS FROZEN AT SEEDING</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
