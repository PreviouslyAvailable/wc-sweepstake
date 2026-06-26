"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { HolderFixtureRow } from "@/lib/holder-fixtures";
import { fmtFixtureNzstDate, fmtFixtureNzstTime } from "@/lib/match-dates";

interface FixtureSheetProps {
  fixtures: HolderFixtureRow[];
  holders: string[];
}

function FixtureSide({ side }: { side: HolderFixtureRow["home"] }) {
  return (
    <span className="fixture-sheet-side">
      <span>{side.team.flag}</span>
      <span>
        {side.holder ? (
          <>
            <span className="fixture-sheet-holder">{side.holder}</span>
            <span className="fixture-sheet-team"> · {side.team.name}</span>
          </>
        ) : (
          side.team.name
        )}
      </span>
    </span>
  );
}

export default function FixtureSheet({ fixtures, holders }: FixtureSheetProps) {
  const [holder, setHolder] = useState("");

  const shown = useMemo(() => {
    if (!holder) return fixtures;
    return fixtures.filter(
      (row) => row.home.holder === holder || row.away.holder === holder
    );
  }, [fixtures, holder]);

  return (
    <>
      <div className="fixture-sheet-filter">
        <label className="mono fixture-sheet-filter-label" htmlFor="fixture-holder">
          Show fixtures for
        </label>
        <select
          id="fixture-holder"
          className="field fixture-sheet-select"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
        >
          <option value="">Everyone</option>
          {holders.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {shown.length > 0 ? (
        <ol className="fixture-sheet">
          {shown.map((row, i) => (
            <li key={row.fixtureId} className="fixture-sheet-row">
              <span className="fixture-sheet-num mono">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="fixture-sheet-when mono tabular-nums">
                {row.isKnockout && row.roundLabel ? (
                  <span className="fixture-sheet-round">{row.roundLabel}</span>
                ) : null}
                {row.isLive
                  ? "LIVE"
                  : `${fmtFixtureNzstDate(row.startTimestamp)} · ${fmtFixtureNzstTime(row.startTimestamp)}`}
              </span>
              <span className="fixture-sheet-match">
                <FixtureSide side={row.home} />
                <span className="fixture-sheet-vs mono">vs</span>
                <FixtureSide side={row.away} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mono text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
          {holder
            ? `No fixtures for ${holder} on the sheet in the next fortnight.`
            : "No holder fixtures on the sheet in the next fortnight."}
        </p>
      )}

      <p className="mono mt-4 text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
        FIG. 2 — ORDERED BY KICKOFF · NZST ·{" "}
        <Link href="/live" className="underline" style={{ color: "var(--cream)" }}>
          Full scoreboard
        </Link>
      </p>
    </>
  );
}
