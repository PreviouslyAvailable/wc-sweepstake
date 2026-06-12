import { supaAnon } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* Instructional plate — ARCHIVE register.
   Required sections: title, central illustration, essay block,
   numbered annotations, figure labels. Signatures: annotation
   layer (the numbered markers), colophon (the foot line). */

const STEPS = [
  {
    n: 1,
    head: "NAMES IN THE BOOK",
    body: "Everyone who wants in gives their name to the steward and pays the stake. The list closes when there is exactly one name per ticket.",
  },
  {
    n: 2,
    head: "TWO HATS",
    body: "The 38 teams are split into two hats — Hat A holds the contenders, Hat B the wildcards. Each hat is shuffled cryptographically: no fix, no favours.",
  },
  {
    n: 3,
    head: "TICKETS ISSUED",
    body: "Each holder draws one team from each hat. Two teams per person, serial-numbered in order of issue. Once dealt, the draw locks and goes on record.",
  },
  {
    n: 4,
    head: "MATCHES FILED",
    body: "Every result is recorded at the results desk and points are issued under the schedule — goals, clean sheets, cards, and giant-killings all count.",
  },
  {
    n: 5,
    head: "THE POT",
    body: "Points accumulate on the ladder for as long as your teams survive. The highest total when the final is filed takes the pot.",
  },
];

function Marker({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="11" fill="var(--black)" stroke="var(--yellow)" strokeWidth="1" />
      <text
        x={x}
        y={y + 3.5}
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="10"
        fill="var(--yellow)"
      >
        {n}
      </text>
    </g>
  );
}

function Hat({ x, label }: { x: number; label: string }) {
  return (
    <g stroke="var(--cream)" fill="none" strokeWidth="1.2">
      {/* crown */}
      <path d={`M ${x + 18} 96 L ${x + 26} 52 L ${x + 94} 52 L ${x + 102} 96`} />
      {/* brim */}
      <line x1={x} y1="96" x2={x + 120} y2="96" />
      <line x1={x} y1="101" x2={x + 120} y2="101" />
      {/* band */}
      <line x1={x + 22} y1="76" x2={x + 98} y2="76" strokeDasharray="3 3" />
      <text
        x={x + 60}
        y="120"
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="9"
        letterSpacing="0.1em"
        fill="var(--dim)"
        stroke="none"
      >
        {label}
      </text>
    </g>
  );
}

export default async function HowPage() {
  const db = supaAnon();
  const { data: pot } = await db.from("settings").select("value").eq("key", "pot").single();
  const buyIn = (pot?.value as { buy_in?: number; currency?: string } | null) ?? {};
  const stake =
    buyIn.buy_in != null ? `$${buyIn.buy_in} ${buyIn.currency ?? ""}`.trim() : "sixpence";

  return (
    <div className="max-w-3xl">
      <p className="overline">INSTRUCTIONAL PLATE · PLATE NO. 1 · THE METHOD</p>
      <h1 className="display text-5xl" style={{ marginTop: "0.2rem" }}>
        How the h<span className="intruder">a</span>t works
      </h1>

      {/* Essay block — editorial serif, spoken once, plainly */}
      <p className="display mt-6 text-xl" style={{ lineHeight: 1.5 }}>
        A sweepstake is a simple machine: names go in, teams come out, and the
        tournament does the rest. Nobody picks their side. Nobody trades. Your
        fate is sealed at the draw and filed in the record — which is precisely
        what makes a group-stage caution in the 94th minute feel like a cup final.
      </p>
      <p className="mt-3 text-sm" style={{ color: "var(--dim)" }}>
        The stake is {stake} a head, paid before the draw. The mechanism is shown
        below in section.
      </p>

      {/* Central illustration — the mechanism, drawn as a patent figure */}
      <figure className="ruled-box mt-10">
        <p className="ruled-box-label">Fig. 1 — the mechanism, shown in section</p>
        <svg
          viewBox="0 0 640 430"
          role="img"
          aria-label="Diagram: names enter two hats, each holder draws one team from each, points accumulate on the ladder, the highest total takes the pot"
          style={{ width: "100%", height: "auto" }}
        >
          {/* names entering the hats */}
          <text x="320" y="20" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="9" letterSpacing="0.12em" fill="var(--dim)">
            THE NAMES, ONE PER TICKET
          </text>
          <path d="M 290 30 L 180 48" stroke="var(--cream-30, rgba(241,234,216,0.3))" strokeWidth="1" strokeDasharray="3 3" fill="none" />
          <path d="M 350 30 L 460 48" stroke="var(--cream-30, rgba(241,234,216,0.3))" strokeWidth="1" strokeDasharray="3 3" fill="none" />

          {/* the two hats */}
          <Hat x={100} label="HAT A — CONTENDERS" />
          <Hat x={420} label="HAT B — WILDCARDS" />

          {/* draw lines converging on the ticket */}
          <path d="M 160 130 L 280 180" stroke="var(--cream)" strokeWidth="1" fill="none" />
          <path d="M 480 130 L 360 180" stroke="var(--cream)" strokeWidth="1" fill="none" />

          {/* the ticket */}
          <g>
            <rect x="245" y="180" width="150" height="58" fill="none" stroke="var(--cream)" strokeWidth="1.2" />
            <line x1="245" y1="209" x2="395" y2="209" stroke="var(--cream)" strokeWidth="1" strokeDasharray="4 4" />
            <text x="320" y="200" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="9" letterSpacing="0.12em" fill="var(--cream)">
              ONE TICKET
            </text>
            <text x="320" y="228" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="9" letterSpacing="0.12em" fill="var(--dim)">
              TWO TEAMS
            </text>
          </g>

          {/* matches feeding the ladder */}
          <path d="M 320 238 L 320 282" stroke="var(--cream)" strokeWidth="1" fill="none" />
          <text x="334" y="266" fontFamily="IBM Plex Mono, monospace" fontSize="8" letterSpacing="0.1em" fill="var(--dim)">
            POINTS PER THE SCHEDULE
          </text>

          {/* the ladder */}
          <g fontFamily="IBM Plex Mono, monospace" fontSize="9" fill="var(--dim)">
            <line x1="150" y1="295" x2="430" y2="295" stroke="var(--rule, rgba(241,234,216,0.14))" />
            <text x="150" y="312">01</text>
            <line x1="175" y1="308" x2="430" y2="308" stroke="var(--cream)" strokeWidth="1" />
            <text x="150" y="332">02</text>
            <line x1="175" y1="328" x2="430" y2="328" stroke="var(--cream-30, rgba(241,234,216,0.3))" strokeWidth="1" />
            <text x="150" y="352">03</text>
            <line x1="175" y1="348" x2="430" y2="348" stroke="var(--cream-30, rgba(241,234,216,0.3))" strokeWidth="1" />
            <text x="150" y="375" letterSpacing="0.12em">THE LADDER</text>
          </g>

          {/* the pot */}
          <g stroke="var(--cream)" fill="none" strokeWidth="1.2">
            <circle cx="520" cy="330" r="26" />
            <circle cx="520" cy="330" r="20" strokeDasharray="3 3" strokeWidth="1" />
            <text x="520" y="334" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="8" letterSpacing="0.1em" fill="var(--cream)" stroke="none">
              POT
            </text>
          </g>
          <path d="M 432 318 L 492 326" stroke="var(--cream-30, rgba(241,234,216,0.3))" strokeWidth="1" strokeDasharray="3 3" fill="none" />

          {/* annotation layer — numbered markers keyed to the steps below */}
          <Marker n={1} x={320} y={42} />
          <Marker n={2} x={86} y={60} />
          <Marker n={3} x={412} y={209} />
          <Marker n={4} x={132} y={306} />
          <Marker n={5} x={552} y={302} />
        </svg>
        <figcaption className="overline" style={{ marginTop: "0.6rem" }}>
          DRAWN TO NO PARTICULAR SCALE · NUMBERED PARTS REFER TO THE STEPS BELOW
        </figcaption>
      </figure>

      {/* Numbered annotations — the steps, filed in order */}
      <section className="mt-10">
        <p className="ruled-box-label" style={{ borderBottom: "1px solid var(--rule)" }}>
          The steps, numbered as figured
        </p>
        <ol className="mt-2">
          {STEPS.map((s) => (
            <li key={s.n} className="rule-faint flex gap-4 py-3">
              <span
                className="mono text-sm"
                style={{
                  color: "var(--yellow)",
                  border: "1px solid var(--yellow)",
                  borderRadius: "50%",
                  width: "1.6rem",
                  height: "1.6rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {s.n}
              </span>
              <div>
                <p className="mono text-xs" style={{ letterSpacing: "0.1em", color: "var(--cream)" }}>
                  {s.head}
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--dim)" }}>
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Colophon */}
      <p className="overline mt-10">
        PLATE NO. 1 · DRAWN FROM THE PATENT FILES · MATCHKIT, WORLD CUP 2026
      </p>
    </div>
  );
}
