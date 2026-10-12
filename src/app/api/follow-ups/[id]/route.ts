import { NextResponse } from "next/server";
import { handler, HttpError, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { lockCaseForWrite } from "@/lib/case-access";
import { completeFollowUpSchema } from "@/lib/validation";

async function loadFollowUp(db: import("pg").PoolClient, id: number) {
  const { rows } = await db.query<{ case_id: number; completed_at: Date | null }>(
    "SELECT case_id, completed_at FROM follow_up WHERE follow_up_id = $1", [id]);
  if (!rows[0]) throw new HttpError(404, "Follow-up not found.");
  return rows[0];
}

// PATCH: mark done with an outcome
export const PATCH = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession();
  const id = parseId((await params).id);
  const { outcome } = completeFollowUpSchema.parse(await req.json());
  await withTransaction(s.userId, async (db) => {
    const f = await loadFollowUp(db, id);
    await lockCaseForWrite(db, s, f.case_id);
    if (f.completed_at) throw new HttpError(400, "Follow-up is already completed.");
    await db.query("UPDATE follow_up SET completed_at = now(), outcome = $1 WHERE follow_up_id = $2", [outcome, id]);
    await db.query(
      "INSERT INTO case_note (case_id, author_id, note_type, body) VALUES ($1, $2, 'follow_up', $3)",
      [f.case_id, s.userId, `Follow-up call done: ${outcome}`],
    );
  });
  return NextResponse.json({ ok: true });
});

// DELETE: cancel a follow-up that has not happened yet
export const DELETE = handler<{ id: string }>(async (_req, { params }) => {
  const s = await requireApiSession();
  const id = parseId((await params).id);
  await withTransaction(s.userId, async (db) => {
    const f = await loadFollowUp(db, id);
    await lockCaseForWrite(db, s, f.case_id);
    if (f.completed_at) throw new HttpError(400, "Completed follow-ups are kept as history.");
    await db.query("DELETE FROM follow_up WHERE follow_up_id = $1", [id]);
  });
  return NextResponse.json({ ok: true });
});
