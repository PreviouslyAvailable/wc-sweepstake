import type { Metadata } from "next";
import "./globals.css";
import NavTabs from "./nav-tabs";

export const metadata: Metadata = {
  title: "Matchkit — FIFA World Cup 2026",
  description: "Matchkit: FIFA World Cup 2026 — official sweepstake record.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  }).toUpperCase();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Anton&family=Archivo:wght@400;600;700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* ── Masthead — floodlit scoreboard ───────────
            Product: MATCHKIT (built in SIXPENCE)
            Stock: patent_black_ground (night paper)
            Inks: sixpence_cream + signal_yellow;
            whistle_red reserved for the record dot.
            Italic Intruder: "Matchk<i>i</i>t".            */}
        <header className="masthead">
          <div className="masthead-band">
            <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div>
                {/* Compressed grotesque wordmark with Italic Intruder on 'i' */}
                <div className="wordmark" style={{ fontSize: "clamp(1.8rem, 5vw, 2.6rem)" }}>
                  Matchk<span className="intruder synth">i</span>t
                </div>
                <div className="mono" style={{ fontSize: "0.6rem", letterSpacing: "0.12em", color: "var(--cream-50)", marginTop: "0.3rem" }}>
                  FIFA WORLD CUP 2026 — OFFICIAL SWEEPSTAKE RECORD
                </div>
              </div>
              {/* Annotation — patent-office colophon */}
              <div className="mono text-right" style={{ fontSize: "0.58rem", letterSpacing: "0.1em", color: "var(--cream-30)" }}>
                <div>FIG. 1 — 38 TEAMS · TWO HATS</div>
                <div style={{ color: "var(--yellow)" }}>PRICE: SIXPENCE</div>
              </div>
            </div>
          </div>

          {/* Navigation strip — index dividers */}
          <div className="mx-auto max-w-5xl px-4">
            <NavTabs />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

        {/* ── Footer colophon — ARCHIVE ─────────────────
            date · price · edition · scoring rules
            Institutional deadpan, IBM Plex Mono.          */}
        <footer style={{ borderTop: "1px solid var(--rule)" }}>
          <div className="mx-auto max-w-5xl px-4 py-5 flex flex-wrap justify-between gap-4">
            <p className="mono" style={{ fontSize: "0.6rem", color: "var(--dim)", letterSpacing: "0.06em" }}>
              {today} · PRICE: SIXPENCE · VOL. I · A PREVIOUSLY UNAVAILABLE RECORD
            </p>
            <p className="mono" style={{ fontSize: "0.6rem", color: "var(--dim)", letterSpacing: "0.05em" }}>
              GOAL +1 · CLEAN SHEET +3 · YELLOW +1 · STRAIGHT RED +3 · GIANT-KILLING +1 PER 10 RANKS
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
