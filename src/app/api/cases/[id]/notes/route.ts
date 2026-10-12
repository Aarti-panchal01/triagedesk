import { NextResponse } from "next/server";
import { handler, HttpError, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { lockCaseForWrite } from "@/lib/case-access";
import { noteSchema } from "@/lib/validation";

export const POST = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession();
  const id = parseId((await params).id);
  const body = noteSchema.parse(await req.json());
  await withTransaction(s.userId, async (db) => {
    const c = await lockCaseForWrite(db, s, id);
    if (c.status === "closed") throw new HttpError(400, "Closed cases cannot get new notes.");
    await db.query(
      "INSERT INTO case_note (case_id, author_id, note_type, body) VALUES ($1, $2, $3, $4)",
      [id, s.userId, body.note_type, body.body],
    );
    // First note from the assigned agent moves a fresh case into progress
    if (c.status === "open") await db.query("UPDATE help_case SET status = 'in_progress' WHERE case_id = $1", [id]);
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});
