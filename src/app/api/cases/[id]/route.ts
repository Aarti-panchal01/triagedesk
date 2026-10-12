import { NextResponse } from "next/server";
import { handler, HttpError, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { getCase } from "@/lib/data";
import { lockCaseForWrite } from "@/lib/case-access";
import { updateCaseSchema } from "@/lib/validation";

export const GET = handler<{ id: string }>(async (_req, { params }) => {
  await requireApiSession();
  const c = await getCase(parseId((await params).id));
  if (!c) throw new HttpError(404, "Case not found.");
  return NextResponse.json(c);
});

// PATCH: change status (open / in_progress / follow_up), severity or applied protocol.
// Escalating and closing have their own endpoints because they need extra data.
export const PATCH = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession();
  const id = parseId((await params).id);
  const body = updateCaseSchema.parse(await req.json());

  await withTransaction(s.userId, async (db) => {
    const current = await lockCaseForWrite(db, s, id);
    if (current.status === "closed") throw new HttpError(400, "Closed cases cannot be changed.");
    if (current.status === "escalated" && body.status) {
      throw new HttpError(400, "This case is escalated. A supervisor resolves the escalation first.");
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (body.status) { vals.push(body.status); sets.push(`status = $${vals.length}::case_status`); }
    if (body.severity) { vals.push(body.severity); sets.push(`severity = $${vals.length}::case_severity`); }
    if (body.applied_protocol_id !== undefined) {
      vals.push(body.applied_protocol_id); sets.push(`applied_protocol_id = $${vals.length}`);
    }
    vals.push(id);
    await db.query(`UPDATE help_case SET ${sets.join(", ")} WHERE case_id = $${vals.length}`, vals);
  });
  return NextResponse.json({ ok: true });
});
