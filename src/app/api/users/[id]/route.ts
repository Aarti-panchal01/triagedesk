import { NextResponse } from "next/server";
import { handler, HttpError, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { updateUserSchema } from "@/lib/validation";

export const PATCH = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession(["admin"]);
  const id = parseId((await params).id);
  const b = updateUserSchema.parse(await req.json());
  if (id === s.userId && (b.is_active === false || (b.role && b.role !== "admin"))) {
    throw new HttpError(400, "You cannot deactivate or demote your own account.");
  }
  await withTransaction(s.userId, async (db) => {
    const { rowCount } = await db.query(
      `UPDATE app_user
          SET role = coalesce($1::user_role, role),
              is_active = coalesce($2, is_active),
              max_open_cases = coalesce($3, max_open_cases)
        WHERE user_id = $4`,
      [b.role ?? null, b.is_active ?? null, b.max_open_cases ?? null, id],
    );
    if (!rowCount) throw new HttpError(404, "User not found.");
    // A deactivated agent's open cases go back to the pool
    if (b.is_active === false) {
      await db.query(
        `UPDATE help_case SET assigned_to = fn_pick_agent($1)
          WHERE assigned_to = $1 AND status <> 'closed'`,
        [id],
      );
    }
  });
  return NextResponse.json({ ok: true });
});
