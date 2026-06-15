"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import { buildDealOrder } from "@/lib/draw-order";
import type { DrawAssignment, DrawPerson, DrawTeam } from "@/lib/draw-order";

const DrawRevealOverlay = dynamic(
  () =>
    import("@/components/draw-reveal/DrawRevealOverlay")
      .then((m) => m.DrawRevealOverlay)
      .catch(() => {
        function DrawRevealFallback() {
          return null;
        }
        return DrawRevealFallback;
      }),
  { ssr: false }
);

interface ArchiveTicket { holder: string; team_id: string; position: number }
interface Edition { archived_at: string; reason: string; tickets: ArchiveTicket[] }

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function DrawPage() {
  const [admin, setAdmin] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [people, setPeople] = useState<DrawPerson[]>([]);
  const [teams, setTeams] = useState<DrawTeam[]>([]);
  const [assignments, setAssignments] = useState<DrawAssignment[]>([]);
  const [locked, setLocked] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [participantOrder, setParticipantOrder] = useState<string[]>([]);
  const [showReveal, setShowReveal] = useState(false);
  const [hideGridDuringReveal, setHideGridDuringReveal] = useState(false);

  const load = useCallback(async () => {
    const db = supa();
    try {
      const [p, t, a, s, ar, ro, auth] = await Promise.all([
        db.from("participants").select("id,name").order("created_at"),
        db.from("teams").select("id,name,flag,band,world_rank"),
        db.from("assignments").select("participant_id,team_id,position"),
        db.from("settings").select("value").eq("key", "draw_locked").maybeSingle(),
        db.from("settings").select("value").eq("key", "draw_archive").maybeSingle(),
        db.from("settings").select("value").eq("key", "draw_reveal_order").maybeSingle(),
        fetch("/api/login").then((r) => r.json()),
      ]);
      setPeople((p.data ?? []) as DrawPerson[]);
      setTeams((t.data ?? []) as DrawTeam[]);
      setAssignments((a.data ?? []) as DrawAssignment[]);
      setLocked(s.data?.value === true);
      setEditions(Array.isArray(ar.data?.value) ? (ar.data.value as Edition[]) : []);
      setParticipantOrder(Array.isArray(ro.data?.value) ? (ro.data.value as string[]) : []);
      setAdmin(Boolean(auth.admin));
    } catch {
      setError("Could not load the draw record. Refresh the page.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  async function addPerson() {
    if (!name.trim()) return;
    setError(null);
    const res = await fetch("/api/participants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setName("");
    setPeople((prev) => [...prev, data.participant]);
  }

  async function removePerson(id: string) {
    const res = await fetch("/api/participants", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setPeople((prev) => prev.filter((p) => p.id !== id));
  }

  async function resetDraw() {
    if (!confirm(
      "Retire this draw and unlock the names? " +
      "The current tickets are filed in the archive — nothing is destroyed — " +
      "and a fresh edition can be dealt."
    )) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/draw", { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error); return; }
    setShowReveal(false);
    setHideGridDuringReveal(false);
    await load();
  }

  async function runDraw() {
    const needed = teams.filter((t) => t.band === "A").length;
    if (!confirm(
      `Deal the teams to ${people.length} people? ` +
      `Each person gets one Band A contender and one Band B wildcard. ` +
      `This can only be done once.`
    )) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/draw", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error); return; }
    if (Array.isArray(data.participantOrder)) {
      setParticipantOrder(data.participantOrder);
    }
    await load();
    setHideGridDuringReveal(true);
    setShowReveal(true);
  }

  function startReplay() {
    setHideGridDuringReveal(true);
    setShowReveal(true);
  }

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const bandACount = teams.filter((t) => t.band === "A").length;
  const bandBCount = teams.filter((t) => t.band === "B").length;
  const teamsPerBand = Math.min(bandACount, bandBCount);
  const ready = people.length === teamsPerBand;

  const dealOrder = buildDealOrder(assignments, people);
  const shown = locked && !hideGridDuringReveal ? dealOrder : [];

  const ticketNo = new Map(dealOrder.map((a, i) => [a.team_id, i + 1]));

  return (
    <div>
      <p className="overline">
        {locked
          ? `DRAW RECORD · ${assignments.length} TICKETS ISSUED · ` +
            (editions.length > 0 ? `EDITION ${String(editions.length + 1).padStart(2, "0")} · ` : "") +
            "LOCKED"
          : "DRAW DESK · TWO HATS · AWAITING NAMES" +
            (editions.length > 0 ? ` · ${editions.length} RETIRED ${editions.length === 1 ? "DRAW" : "DRAWS"} ON FILE` : "")}
      </p>
      <h1 className="display text-5xl" style={{ marginTop: "0.2rem" }}>
        The dr<span className="intruder">a</span>w
      </h1>

      {!admin && (
        <div className="mt-8 max-w-sm">
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            The draw is run and recorded here. Enter the steward passcode to open the allocation record.
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
        </div>
      )}

      {admin && !locked && (
        <div className="mt-8 grid gap-10 md:grid-cols-2">
          <section>
            <h2 className="display text-2xl">Names in the hat</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--dim)" }}>
              Need exactly {teamsPerBand} names — one per team per band.
              {people.length > 0 && (
                <span style={{ color: people.length === teamsPerBand ? "var(--yellow)" : "var(--cream)" }}>
                  {" "}{people.length}/{teamsPerBand}
                </span>
              )}
            </p>
            <div className="mt-3 flex gap-2">
              <input
                className="field flex-1"
                placeholder="Add a name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPerson()}
              />
              <button className="btn" onClick={addPerson}>Add</button>
            </div>
            <ul className="mt-4 space-y-2">
              {people.map((p) => (
                <li key={p.id} className="rule-faint flex items-center justify-between pb-2">
                  <span>{p.name}</span>
                  <button
                    className="text-xs underline"
                    style={{ color: "var(--dim)" }}
                    onClick={() => removePerson(p.id)}
                  >
                    remove
                  </button>
                </li>
              ))}
              {!people.length && (
                <li className="text-sm" style={{ color: "var(--dim)" }}>Nobody yet.</li>
              )}
            </ul>
          </section>

          <section>
            <h2 className="display text-2xl">Deal the teams</h2>
            <p className="mt-3 text-sm" style={{ color: "var(--dim)" }}>
              Two hats: {bandACount} Band A contenders and {bandBCount} Band B wildcards.
              Each person draws one from each — everyone gets exactly 2 teams.
              The shuffle is cryptographic — no fix, no favours.
            </p>
            <button
              className="btn mt-4 text-lg"
              onClick={runDraw}
              disabled={busy || !ready}
            >
              {busy ? "Shuffling…" : "Run the draw"}
            </button>
            {!ready && people.length > 0 && (
              <p className="mt-2 text-xs" style={{ color: "var(--yellow)" }}>
                {people.length < teamsPerBand
                  ? `Add ${teamsPerBand - people.length} more ${teamsPerBand - people.length === 1 ? "person" : "people"} to fill all tickets.`
                  : `${people.length - teamsPerBand} too many — remove some names.`}
              </p>
            )}
            <p className="mt-2 text-xs font-semibold" style={{ color: "var(--yellow)" }}>
              One shot only. Once dealt, names and tickets lock.
            </p>
            {editions.length > 0 && (
              <p className="mono mt-4 text-xs" style={{ color: "var(--dim)", letterSpacing: "0.06em" }}>
                {editions.length} RETIRED {editions.length === 1 ? "DRAW" : "DRAWS"} ON FILE · LAST FILED{" "}
                {new Date(editions[editions.length - 1].archived_at)
                  .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                  .toUpperCase()}
              </p>
            )}
          </section>
        </div>
      )}

      {locked && (
        <div className="mt-8">
          <div className="mb-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn text-sm"
              onClick={startReplay}
              disabled={showReveal}
            >
              Watch the reveal
            </button>
            {admin && (
              <button
                className="btn text-sm"
                onClick={resetDraw}
                disabled={busy}
                style={{ color: "var(--red)" }}
              >
                {busy ? "Filing…" : "Retire the draw"}
              </button>
            )}
          </div>
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            The draw is complete and locked. Every issued ticket is on record below.
          </p>
          {shown.some((a) => teamById.get(a.team_id)?.band === "A") && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase" style={{ color: "var(--yellow)" }}>
                Band A — Contenders
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {shown
                  .filter((a) => teamById.get(a.team_id)?.band === "A")
                  .map((a) => {
                    const team = teamById.get(a.team_id);
                    const person = people.find((p) => p.id === a.participant_id);
                    if (!team || !person) return null;
                    return (
                      <li key={a.team_id} className="stub deal-in flex items-center gap-2">
                        <span aria-hidden>{team.flag}</span>
                        <div>
                          <div className="text-sm font-semibold">{team.name}</div>
                          <div className="ticket-no">
                            No. {String(ticketNo.get(a.team_id) ?? 0).padStart(3, "0")} · [{team.world_rank}]
                          </div>
                        </div>
                        <span className="ml-auto text-xs opacity-70">→ {person.name}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
          {shown.some((a) => teamById.get(a.team_id)?.band === "B") && (
            <div className="mt-6">
              <p className="mb-3 text-xs font-semibold uppercase" style={{ color: "var(--dim)" }}>
                Band B — Wildcards
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {shown
                  .filter((a) => teamById.get(a.team_id)?.band === "B")
                  .map((a) => {
                    const team = teamById.get(a.team_id);
                    const person = people.find((p) => p.id === a.participant_id);
                    if (!team || !person) return null;
                    return (
                      <li key={a.team_id} className="stub deal-in flex items-center gap-2">
                        <span aria-hidden>{team.flag}</span>
                        <div>
                          <div className="text-sm font-semibold">{team.name}</div>
                          <div className="ticket-no">
                            No. {String(ticketNo.get(a.team_id) ?? 0).padStart(3, "0")} · [{team.world_rank}]
                          </div>
                        </div>
                        <span className="ml-auto text-xs opacity-70">→ {person.name}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm" style={{ color: "var(--red)" }}>{error}</p>}

      {editions.length > 0 && (
        <div className="mt-14">
          <p className="overline">
            RETIRED EDITIONS · {editions.length} ON FILE · KEPT, NOT DESTROYED
          </p>
          <div className="mt-4 space-y-6">
            {editions.map((ed, i) => {
              const holders = new Map<string, ArchiveTicket[]>();
              for (const t of ed.tickets) {
                const list = holders.get(t.holder) ?? [];
                list.push(t);
                holders.set(t.holder, list);
              }
              const filed = new Date(ed.archived_at)
                .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                .toUpperCase();
              return (
                <section key={ed.archived_at} className="ruled-box" style={{ opacity: 0.72 }}>
                  <p className="ruled-box-label">
                    Edition {String(i + 1).padStart(2, "0")} — retired and filed {filed}
                  </p>
                  <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                    {[...holders.entries()].map(([holder, tickets]) => (
                      <li
                        key={holder}
                        className="rule-faint flex items-baseline justify-between gap-3 pb-1 text-xs"
                      >
                        <span>{holder}</span>
                        <span className="mono" style={{ color: "var(--dim)" }}>
                          {tickets
                            .sort((a, b) => a.position - b.position)
                            .map((t) => teamById.get(t.team_id)?.name ?? t.team_id)
                            .join(" / ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {showReveal && locked && assignments.length > 0 && (
        <DrawRevealOverlay
          assignments={assignments}
          people={people}
          teams={teams}
          participantOrder={participantOrder}
          onComplete={() => {
            setShowReveal(false);
            setHideGridDuringReveal(false);
          }}
          onExit={() => {
            setShowReveal(false);
            setHideGridDuringReveal(false);
          }}
        />
      )}
    </div>
  );
}
