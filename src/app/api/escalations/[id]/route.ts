import { NextResponse } from "next/server";
import { handler, HttpError, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { escalationUpdateSchema } from "@/lib/validation";

// Supervisors acknowledge or resolve escalations. Resolving puts the case back in progress.
export const PATCH = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession(["supervisor", "admin"]);
  const id = parseId((await params).id);
  const { status } = escalationUpdateSchema.parse(await req.json());
  await withTransaction(s.userId, async (db) => {
    const { rows } = await db.query<{ case_id: number; status: string; severity: string }>(
      `SELECT e.case_id, e.status, c.severity FROM escalation e
         JOIN help_case c ON c.case_id = e.case_id
        WHERE e.escalation_id = $1 FOR UPDATE OF e, c`, [id]);
    const e = rows[0];
    if (!e) throw new HttpError(404, "Escalation not found.");
    if (e.status === "resolved") throw new HttpError(400, "Escalation is already resolved.");
    if (status === "resolved" && e.severity === "critical") {
      throw new HttpError(400, "Lower the case severity below critical before resolving its escalation.");
    }
    await db.query(
      `UPDATE escalation SET status = $1::escalation_status,
              resolved_at = CASE WHEN $1 = 'resolved' THEN now() END,
              assigned_supervisor = coalesce(assigned_supervisor, $3)
        WHERE escalation_id = $2`,
      [status, id, s.userId],
    );
    if (status === "resolved") {
      await db.query("UPDATE help_case SET status = 'in_progress' WHERE case_id = $1 AND status = 'escalated'", [e.case_id]);
    }
    await db.query(
      "INSERT INTO case_note (case_id, author_id, note_type, body) VALUES ($1, $2, 'system', $3)",
      [e.case_id, s.userId, `Escalation ${status} by ${s.name}.`],
    );
  });
  return NextResponse.json({ ok: true });
});
