import { supaAnon } from "@/lib/supabase";
import { Participant, Assignment, Team, Result, matchBreakdownForTeam } from "@/lib/scoring";

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

  return (
    <div>
      <p className="overline">
        HOLDER CARDS · {holders.length} OF {holders.length} ISSUED · WORLD CUP 2026
      </p>
      <h1 className="display text-5xl" style={{ marginTop: "0.2rem" }}>
        Who&apos;s g<span className="intruder">o</span>t who
      </h1>

      {/* Album grid — one card per holder */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {holders.map(({ person, stubs }, i) => {
          const alive = stubs.filter((tm) => !tm.is_out).length;
          return (
            // Loose hand: each card leans fractionally off-true, by index
            <section key={person.id} className={`profile-card lean-${i % 4}`}>
              <div className="nameplate">
                <h2 className="nameplate-name">{person.name}</h2>
                <span className="card-no">
                  HOLDER CARD {String(i + 1).padStart(2, "0")} OF {String(holders.length).padStart(2, "0")}
                </span>
              </div>
              <ul className="profile-card-body space-y-2">
                {stubs.map((team, j) => {
                  let goals = 0, cleanSheet = 0, cards = 0, giantKilling = 0;
                  for (const res of results) {
                    const m = matchBreakdownForTeam(team.id, res, teamById);
                    goals += m.goals;
                    cleanSheet += m.cleanSheet;
                    cards += m.cards;
                    giantKilling += m.giantKilling;
                  }
                  const pts = goals + cleanSheet + cards + giantKilling;
                  const bandLabel = `Band ${team.band ?? (team.world_rank <= 20 ? "A" : "B")}`;
                  return (
                    <li
                      key={team.id}
                      className={`stub flex items-center gap-2 ${team.is_out ? "out" : ""}`}
                      title={[
                        `Goals: ${goals}`,
                        `Clean sheets: ${cleanSheet}`,
                        `Cards: ${cards}`,
                        giantKilling ? `Giant-killing: ${giantKilling}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <span aria-hidden>{team.flag}</span>
                      <span className="stub-name text-sm font-semibold">{team.name}</span>
                      {team.is_out ? (
                        <span className={`stamp-mark ml-auto tilt-${(i + j) % 4}`}>Out</span>
                      ) : (
                        <span className="mono ml-auto text-xs opacity-70">{bandLabel}</span>
                      )}
                      <span className="mono text-sm font-bold">{pts}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="card-colophon">
                <span>{alive} of {stubs.length} drawcards in play</span>
                <span>WC26</span>
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
