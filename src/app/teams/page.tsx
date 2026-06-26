import { supaAnon } from "@/lib/supabase";
import { aggregateTeamScore, computeStandings, formatTeamBreakdownTooltip, Participant, Assignment, Team, Result } from "@/lib/scoring";
import { gamesPlayedForTeam, buildGamesLeftByTeam } from "@/lib/ladder-meta";
import { fetchWcFixtures } from "@/lib/wc-fixtures";
import { buildTournamentStatusByTeam, isTeamEliminated } from "@/lib/tournament-status";

export const dynamic = "force-dynamic";

export default async function WhoHasWho() {
  const db = supaAnon();
  const [p, a, t, r] = await Promise.all([
    db.from("participants").select("*").order("name"),
    db.from("assignments").select("*"),
    db.from("teams").select("*"),
    db.from("results").select("*"),
  ]);

  const participants = (p.data ?? []) as Participant[];
  const assignments = (a.data ?? []) as Assignment[];
  const teams = (t.data ?? []) as Team[];
  const results = (r.data ?? []) as Result[];
  const teamById = new Map(teams.map((tm) => [tm.id, tm]));

  let fixtures: Awaited<ReturnType<typeof fetchWcFixtures>> = [];
  try {
    fixtures = await fetchWcFixtures({ results, teams });
  } catch {
    // fixture sheet unavailable — games left will show 0
  }
  const gamesLeftByTeam = buildGamesLeftByTeam(fixtures);
  const statusByTeam = buildTournamentStatusByTeam({ teams, results, fixtures });

  const issued = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  }).toUpperCase();

  if (!assignments.length) {
    return (
      <div className="empty-slot mx-auto mt-16 max-w-xl">
        <p className="overline">HOLDERS SET · 0 CARDS ISSUED</p>
        <h1 className="display mt-2 text-5xl">Nothing drawn yet</h1>
        <p className="mt-4" style={{ color: "var(--dim)" }}>
          Once the draw runs, every ticket lands here.
        </p>
      </div>
    );
  }

  // The card set: holders in alphabetical order (query orders by name),
  // numbered stably — true collection metadata.
  const holders = participants
    .map((person) => {
      const stubs = assignments
        .filter((as) => as.participant_id === person.id)
        .sort((x, y) => x.position - y.position)
        .map((as) => teamById.get(as.team_id))
        .filter((tm): tm is Team => Boolean(tm));
      return { person, stubs };
    })
    .filter(({ stubs }) => stubs.length > 0);

  const standings = computeStandings(participants, assignments, teams, results);
  const leaderId = standings[0]?.participant.id;
  const leaderTotal = standings[0]?.total ?? 0;

  return (
    <div>
      <p className="overline">
        HOLDER CARDS · {holders.length} ISSUED · AS OF {issued}
      </p>
      <h1 className="display text-5xl" style={{ marginTop: "0.2rem" }}>
        Who&apos;s g<span className="intruder">o</span>t who
      </h1>
      <p className="mt-3 max-w-xl text-sm" style={{ color: "var(--dim)" }}>
        One card per holder — drawcards, points, and tournament status on record.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {holders.map(({ person, stubs }, i) => {
          const alive = stubs.filter((tm) =>
            !isTeamEliminated(tm, statusByTeam.get(tm.id))
          ).length;
          const totalPts = stubs.reduce(
            (sum, tm) => sum + aggregateTeamScore(tm.id, teams, results).total,
            0
          );
          return (
            <section key={person.id} className="profile-card">
              <div className="nameplate">
                <h2 className="nameplate-name">
                  {person.name}
                  {person.id === leaderId && totalPts === leaderTotal && leaderTotal > 0 ? (
                    <span className="stamp-mark stamp-leader">Leader</span>
                  ) : null}
                </h2>
                <div className="nameplate-meta">
                  <span className="card-no">
                    CARD {String(i + 1).padStart(2, "0")} / {String(holders.length).padStart(2, "0")}
                  </span>
                  <span className="nameplate-pts tabular-nums">{totalPts} pts</span>
                </div>
              </div>
              <ul className="profile-card-body holder-card-list">
                {stubs.map((team) => {
                  const breakdown = aggregateTeamScore(team.id, teams, results);
                  const pts = breakdown.total;
                  const bandLabel = `Band ${team.band ?? (team.world_rank <= 20 ? "A" : "B")}`;
                  const gamesPlayed = gamesPlayedForTeam(team.id, results);
                  const gamesLeft = gamesLeftByTeam.get(team.id) ?? 0;
                  const status = statusByTeam.get(team.id);
                  const eliminated = isTeamEliminated(team, status);
                  const progress = status?.detail || `${gamesPlayed} played · ${eliminated ? "done" : `${gamesLeft} left`}`;
                  const tip = formatTeamBreakdownTooltip(team, breakdown);
                  return (
                    <li
                      key={team.id}
                      className={`stub holder-stub has-tip${eliminated ? " out" : ""}`}
                      data-tip={tip}
                      tabIndex={0}
                    >
                      {eliminated ? (
                        <span className="holder-out-stamp" aria-hidden>OUT</span>
                      ) : null}
                      <span className="holder-stub-pts tabular-nums">{pts}</span>
                      <div className="holder-stub-main">
                        <span className="holder-stub-flag" aria-hidden>{team.flag}</span>
                        <div className="holder-stub-body">
                          <span className="stub-name">{team.name}</span>
                          <div className="holder-stub-meta">
                            {status ? (
                              <span
                                className={`round-chip${status.fate === "out" ? " round-chip-out" : ""}${status.secured ? " round-chip-secured" : ""}${status.fate === "bubble" ? " round-chip-bubble" : ""}`}
                              >
                                {status.label}
                              </span>
                            ) : null}
                            <span className="holder-stub-detail">
                              {bandLabel} · {progress}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="card-colophon">
                <span>{alive} of {stubs.length} in play</span>
                <span>WC26</span>
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
