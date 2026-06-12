import { supaAnon } from "@/lib/supabase";
import {
  computeStandings,
  Participant,
  Assignment,
  Team,
  Result,
} from "@/lib/scoring";

export const dynamic = "force-dynamic";

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
  const leaderTotal = standings[0]?.total ?? 0;
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

      <ol className="mt-8">
        {standings.map((row, i) => (
          <li key={row.participant.id} className="index-row">
            <span className="index-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="display text-xl">{row.participant.name}</span>
            {i === 0 && row.total === leaderTotal && row.total > 0 && (
              <span className="stamp-mark" style={{ color: "var(--yellow)" }}>
                Leader
              </span>
            )}
            <span className="flex flex-wrap gap-1.5 text-sm">
              {row.teams.map(({ team, breakdown, total }) => (
                <span
                  key={team.id}
                  title={[
                    `${team.name} [${team.world_rank}] — ${total} pts`,
                    `Goals: ${breakdown.goals}`,
                    `Clean sheets: ${breakdown.cleanSheet}`,
                    `Cards: ${breakdown.cards}`,
                    breakdown.giantKilling ? `Giant-killing: ${breakdown.giantKilling}` : null,
                    team.is_out ? "(eliminated)" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  style={{ opacity: team.is_out ? 0.35 : 1 }}
                >
                  {team.flag}
                </span>
              ))}
            </span>
            <span className="mono ml-auto text-sm" style={{ color: "var(--dim)" }}>
              {row.alive} alive
            </span>
            <span
              className="mono w-16 text-right text-2xl"
              style={{ color: "var(--yellow)" }}
            >
              {row.total}
            </span>
          </li>
        ))}
      </ol>

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
