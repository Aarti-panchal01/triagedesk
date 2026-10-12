import { NextResponse } from "next/server";
import { handler, HttpError, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { lockCaseForWrite } from "@/lib/case-access";
import { escalateSchema } from "@/lib/validation";

export const POST = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession();
  const id = parseId((await params).id);
  const { reason } = escalateSchema.parse(await req.json());
  await withTransaction(s.userId, async (db) => {
    const c = await lockCaseForWrite(db, s, id);
    if (c.status === "closed") throw new HttpError(400, "Closed cases cannot be escalated.");
    // Insert our escalation first so the auto-escalate trigger sees it and does not add a second one.
    // The partial unique index rejects a duplicate if one is already open.
    await db.query(
      `INSERT INTO escalation (case_id, raised_by, assigned_supervisor, reason)
       VALUES ($1, $2, fn_pick_supervisor(), $3)`,
      [id, s.userId, reason],
    );
    await db.query("UPDATE help_case SET status = 'escalated' WHERE case_id = $1", [id]);
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});
