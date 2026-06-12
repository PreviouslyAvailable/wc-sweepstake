import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { supaAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // crypto-grade, so nobody can claim the fix was in
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const db = supaAdmin();

  const { data: locked } = await db.from("settings").select("value").eq("key", "draw_locked").single();
  if (locked?.value === true) {
    return NextResponse.json({ error: "The draw has already been run" }, { status: 409 });
  }

  const [{ data: participants }, { data: teams }] = await Promise.all([
    db.from("participants").select("id,name"),
    db.from("teams").select("id,band"),
  ]);

  if (!participants?.length) {
    return NextResponse.json({ error: "Add participants first" }, { status: 400 });
  }

  const bandA = (teams ?? []).filter((t) => t.band === "A").map((t) => t.id);
  const bandB = (teams ?? []).filter((t) => t.band === "B").map((t) => t.id);

  if (bandA.length !== bandB.length) {
    return NextResponse.json(
      { error: `Band A has ${bandA.length} teams but Band B has ${bandB.length} — they must match` },
      { status: 400 }
    );
  }
  if (participants.length !== bandA.length) {
    return NextResponse.json(
      { error: `Need exactly ${bandA.length} participants (one per team per band), got ${participants.length}` },
      { status: 400 }
    );
  }

  // Shuffle the participant order and both band decks independently.
  const order = shuffle(participants);
  const deckA = shuffle(bandA);
  const deckB = shuffle(bandB);

  const rows = order.flatMap((p, i) => [
    { participant_id: p.id, team_id: deckA[i], position: 0 }, // Band A contender
    { participant_id: p.id, team_id: deckB[i], position: 1 }, // Band B wildcard
  ]);

  const { error } = await db.from("assignments").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await db.from("settings").upsert({ key: "draw_locked", value: true });
  return NextResponse.json({ ok: true, dealt: rows.length });
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const db = supaAdmin();

  // File the outgoing draw before clearing it. The archive never fully
  // deletes: retired tickets are kept (with holder names denormalised,
  // so the record survives participant deletion) in settings.draw_archive.
  const [{ data: assignments }, { data: participants }] = await Promise.all([
    db.from("assignments").select("participant_id,team_id,position"),
    db.from("participants").select("id,name"),
  ]);

  if (assignments?.length) {
    const nameById = new Map((participants ?? []).map((p) => [p.id, p.name]));
    const { data: existing } = await db
      .from("settings")
      .select("value")
      .eq("key", "draw_archive")
      .single();
    const editions = Array.isArray(existing?.value) ? existing.value : [];
    editions.push({
      archived_at: new Date().toISOString(),
      reason: "reset",
      tickets: assignments.map((a) => ({
        holder: nameById.get(a.participant_id) ?? a.participant_id,
        team_id: a.team_id,
        position: a.position,
      })),
    });
    const { error: archiveError } = await db
      .from("settings")
      .upsert({ key: "draw_archive", value: editions });
    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 400 });
  }

  const { error: clearError } = await db.from("assignments").delete().neq("team_id", "");
  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 400 });

  const { error: unlockError } = await db
    .from("settings")
    .upsert({ key: "draw_locked", value: false });
  if (unlockError) return NextResponse.json({ error: unlockError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
