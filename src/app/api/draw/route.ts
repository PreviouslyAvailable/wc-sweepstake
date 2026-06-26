import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { supaAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { DRAW_POOL_SIZE, resolveActiveDrawPool } from "@/lib/draw-pool";

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
    db.from("teams").select("id,world_rank"),
  ]);

  if (!participants?.length) {
    return NextResponse.json({ error: "Add participants first" }, { status: 400 });
  }

  if (participants.length > DRAW_POOL_SIZE) {
    return NextResponse.json(
      { error: `Maximum ${DRAW_POOL_SIZE} participants — remove ${participants.length - DRAW_POOL_SIZE}` },
      { status: 400 }
    );
  }

  const pool = resolveActiveDrawPool(participants.length, teams ?? []);
  const deckA = shuffle(pool.bandA);
  const deckB = shuffle(pool.bandB);

  if (deckA.length !== participants.length || deckB.length !== participants.length) {
    return NextResponse.json({ error: "Could not build a balanced draw pool" }, { status: 400 });
  }

  const order = shuffle(participants);

  const rows = order.flatMap((p, i) => [
    { participant_id: p.id, team_id: deckA[i], position: 0 },
    { participant_id: p.id, team_id: deckB[i], position: 1 },
  ]);

  const { error } = await db.from("assignments").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const participantOrder = order.map((p) => p.id);
  const [lockRes, revealRes, excludedRes] = await Promise.all([
    db.from("settings").upsert({ key: "draw_locked", value: true }),
    db.from("settings").upsert({ key: "draw_reveal_order", value: participantOrder }),
    db.from("settings").upsert({ key: "draw_excluded_teams", value: pool.excluded }),
  ]);
  const settingsError = lockRes.error ?? revealRes.error ?? excludedRes.error;
  if (settingsError) {
    await db.from("assignments").delete().neq("team_id", "");
    return NextResponse.json({ error: `Draw lock failed: ${settingsError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dealt: rows.length,
    participantOrder,
    excluded: pool.excluded,
  });
}

export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  const db = supaAdmin();

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

  await Promise.all([
    db.from("settings").upsert({ key: "draw_reveal_order", value: [] }),
    db.from("settings").upsert({ key: "draw_excluded_teams", value: [] }),
  ]);

  return NextResponse.json({ ok: true });
}
