import { NextResponse } from "next/server";
import { handler, HttpError, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { lockCaseForWrite } from "@/lib/case-access";
import { followUpSchema } from "@/lib/validation";

export const POST = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession();
  const id = parseId((await params).id);
  const { scheduled_for } = followUpSchema.parse(await req.json());
  await withTransaction(s.userId, async (db) => {
    const c = await lockCaseForWrite(db, s, id);
    if (c.status === "closed") throw new HttpError(400, "Closed cases cannot get follow-ups.");
    await db.query("INSERT INTO follow_up (case_id, created_by, scheduled_for) VALUES ($1, $2, $3)",
      [id, s.userId, scheduled_for]);
    if (c.status !== "escalated") await db.query("UPDATE help_case SET status = 'follow_up' WHERE case_id = $1", [id]);
  });
  return NextResponse.json({ ok: true }, { status: 201 });
});
