import { NextResponse } from "next/server";
import { handler, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { lockCaseForWrite } from "@/lib/case-access";
import { handoffSchema } from "@/lib/validation";

export const POST = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession();
  const id = parseId((await params).id);
  const body = handoffSchema.parse(await req.json());
  await withTransaction(s.userId, async (db) => {
    await lockCaseForWrite(db, s, id);
    await db.query("CALL sp_handoff_case($1, $2, $3, $4)", [id, s.userId, body.to_agent_id ?? null, body.note || null]);
  });
  return NextResponse.json({ ok: true });
});
