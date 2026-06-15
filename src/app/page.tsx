import Link from "next/link";
import { supaAnon } from "@/lib/supabase";
import { buildUpcomingHolderFixtures } from "@/lib/holder-fixtures";
import { fmtFixtureNzstDate, fmtFixtureNzstTime } from "@/lib/match-dates";
import {
  computeStandings,
  Participant,
  Assignment,
  Team,
  Result,
} from "@/lib/scoring";
import { fetchWcFixtures } from "@/lib/wc-fixtures";

export const dynamic = "force-dynamic";

/* Front page — matchday programme cover, ARCHIVE register
   with one ROAR moment (the title). Required programme
   sections: header band + issuing body (site masthead),
   event title, central illustration, date, price, edition
   number, footer colophon (site footer). */

const ROOMS = [
  {
    href: "/ladder",
    name: "The ladder",
    desc: "STANDINGS INDEX — WHO IS WINNING, AND BY HOW MUCH",
  },
  {
    href: "/live",
    name: "Live",
    desc: "THE SCOREBOARD — MATCHES AS THEY HAPPEN",
  },
  {
    href: "/teams",
    name: "Who’s got who",
    desc: "HOLDER CARDS — EVERY NAME AND THEIR TWO TEAMS",
  },
  {
    href: "/draw",
    name: "The draw",
    desc: "ISSUED TICKETS — THE ALLOCATION, ON RECORD",
  },
  {
    href: "/how",
    name: "How it works",
    desc: "PLATE NO. 1 — THE METHOD, SHOWN IN SECTION",
  },
];

export default async function ProgrammeCover() {
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

  const drawn = assignments.length > 0;
  const standings = drawn ? computeStandings(participants, assignments, teams, results) : [];
  const leader = standings[0];
  const alive = teams.filter((tm) => !tm.is_out).length;

  let upcomingFixtures: ReturnType<typeof buildUpcomingHolderFixtures> = [];
  if (drawn) {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (apiKey) {
      try {
        const fixtures = await fetchWcFixtures(apiKey);
        upcomingFixtures = buildUpcomingHolderFixtures(
          fixtures,
          assignments,
          participants,
          teams
        );
      } catch {
        // Fixture sheet unavailable — programme still renders
      }
    }
  }

  const issued = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  }).toUpperCase();

  return (
    <div>
      {/* Edition data — date, price, edition number */}
      <p className="overline">
        MATCHDAY PROGRAMME · VOL. I · {issued}
      </p>

      {/* Event title — the one ROAR moment on the page */}
      <h1
        className="compressed"
        style={{ fontSize: "clamp(3.2rem, 11vw, 6.5rem)", marginTop: "0.5rem" }}
      >
        World Cup
        <br />
        Twenty s<span className="intruder synth">i</span>x
      </h1>

      <p className="display mt-5 max-w-2xl text-xl" style={{ lineHeight: 1.5 }}>
        Thirty-eight teams, two hats, one pot. Drawn once, recorded forever —
        the office’s official sweepstake, kept to matchday standards.
      </p>

      <div className="mt-10 grid gap-10 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          {/* State of play — true figures from the record */}
          <section className="ruled-box">
            <p className="ruled-box-label">State of play — figures as filed</p>
            <dl
              className="mono grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4"
              style={{ fontSize: "0.6rem", letterSpacing: "0.08em" }}
            >
              <div>
                <dt style={{ color: "var(--dim)" }}>HOLDERS</dt>
                <dd className="mt-1 text-xl" style={{ color: "var(--cream)" }}>{participants.length}</dd>
              </div>
              <div>
                <dt style={{ color: "var(--dim)" }}>TEAMS ALIVE</dt>
                <dd className="mt-1 text-xl" style={{ color: "var(--cream)" }}>
                  {alive}<span style={{ color: "var(--dim)", fontSize: "0.8rem" }}> / {teams.length}</span>
                </dd>
              </div>
              <div>
                <dt style={{ color: "var(--dim)" }}>{drawn ? "LEADING" : "THE DRAW"}</dt>
                <dd className="mt-1 text-xl" style={{ color: "var(--cream)" }}>
                  {drawn && leader
                    ? <>{leader.participant.name}<span style={{ color: "var(--yellow)", fontSize: "0.8rem" }}> · {leader.total} PTS</span></>
                    : "PENDING"}
                </dd>
              </div>
            </dl>
          </section>

          {drawn && (
            <section className="ruled-box mt-8">
              <p className="ruled-box-label">Next fixtures — holder drawcards on the sheet</p>
              <h2 className="display text-2xl" style={{ marginBottom: "0.75rem" }}>
                Coming <span className="intruder">u</span>p
              </h2>
              {upcomingFixtures.length > 0 ? (
                <ol className="fixture-sheet">
                  {upcomingFixtures.map((row, i) => (
                    <li key={row.fixtureId} className="fixture-sheet-row">
                      <span className="fixture-sheet-num mono">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="fixture-sheet-when mono tabular-nums">
                        {row.isLive
                          ? "LIVE"
                          : `${fmtFixtureNzstDate(row.startTimestamp)} · ${fmtFixtureNzstTime(row.startTimestamp)}`}
                      </span>
                      <span className="fixture-sheet-match">
                        <span className="fixture-sheet-side">
                          <span>{row.home.team.flag}</span>
                          <span>
                            {row.home.holder ? (
                              <><span className="fixture-sheet-holder">{row.home.holder}</span>
                              <span className="fixture-sheet-team"> · {row.home.team.name}</span></>
                            ) : (
                              row.home.team.name
                            )}
                          </span>
                        </span>
                        <span className="fixture-sheet-vs mono">vs</span>
                        <span className="fixture-sheet-side">
                          <span>{row.away.team.flag}</span>
                          <span>
                            {row.away.holder ? (
                              <><span className="fixture-sheet-holder">{row.away.holder}</span>
                              <span className="fixture-sheet-team"> · {row.away.team.name}</span></>
                            ) : (
                              row.away.team.name
                            )}
                          </span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mono text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
                  No holder fixtures on the sheet in the next fortnight.
                </p>
              )}
              <p className="mono mt-4 text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
                FIG. 2 — ORDERED BY KICKOFF · NZST ·{" "}
                <Link href="/live" className="underline" style={{ color: "var(--cream)" }}>
                  Full scoreboard
                </Link>
              </p>
            </section>
          )}

          {/* Contents — the rooms, listed as a programme index */}
          <section className="mt-8">
            <p className="ruled-box-label" style={{ borderBottom: "1px solid var(--rule)" }}>
              In this issue
            </p>
            <ul className="mt-1">
              {ROOMS.map((room, i) => (
                <li key={room.href}>
                  <Link
                    href={room.href}
                    className="rule-faint flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 no-underline"
                  >
                    <span className="mono text-xs" style={{ color: "var(--dim)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="display text-2xl">{room.name}</span>
                    <span
                      className="mono ml-auto text-right"
                      style={{ fontSize: "0.55rem", letterSpacing: "0.1em", color: "var(--dim)" }}
                    >
                      {room.desc}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Central illustration — the hat, drawn in line */}
        <figure className="mx-auto w-56 md:w-64">
          <svg
            viewBox="0 0 200 190"
            role="img"
            aria-label="Line drawing of the sweepstake hat with tickets falling in"
            style={{ width: "100%", height: "auto" }}
          >
            {/* tickets falling in */}
            <g stroke="var(--cream-30, rgba(241,234,216,0.3))" strokeWidth="1" fill="none">
              <rect x="48" y="14" width="26" height="14" transform="rotate(-14 61 21)" />
              <rect x="120" y="8" width="26" height="14" transform="rotate(11 133 15)" />
              <rect x="88" y="30" width="26" height="14" transform="rotate(-5 101 37)" />
            </g>
            {/* the hat */}
            <g stroke="var(--cream)" strokeWidth="1.4" fill="none">
              <path d="M 52 130 L 64 66 L 136 66 L 148 130" />
              <line x1="28" y1="130" x2="172" y2="130" />
              <line x1="28" y1="137" x2="172" y2="137" />
              <line x1="60" y1="100" x2="140" y2="100" strokeDasharray="4 4" />
            </g>
            <text
              x="100"
              y="166"
              textAnchor="middle"
              fontFamily="IBM Plex Mono, monospace"
              fontSize="8"
              letterSpacing="0.14em"
              fill="var(--dim)"
            >
              FIG. 1 — THE HAT
            </text>
            <text
              x="100"
              y="180"
              textAnchor="middle"
              fontFamily="IBM Plex Mono, monospace"
              fontSize="7"
              letterSpacing="0.12em"
              fill="var(--cream-30, rgba(241,234,216,0.3))"
            >
              ALL FATES SEALED WITHIN
            </text>
          </svg>
        </figure>
      </div>
    </div>
  );
}
