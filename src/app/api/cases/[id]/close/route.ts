import { NextResponse } from "next/server";
import { handler, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { lockCaseForWrite, refreshCaseEmbedding } from "@/lib/case-access";
import { closeSchema } from "@/lib/validation";

export const POST = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession();
  const id = parseId((await params).id);
  const body = closeSchema.parse(await req.json());
  await withTransaction(s.userId, async (db) => {
    await lockCaseForWrite(db, s, id);
    await db.query("CALL sp_close_case($1, $2, $3, $4)", [id, s.userId, body.resolution, body.protocol_id ?? null]);
  });
  // The resolution is now part of what future calls should match against
  await refreshCaseEmbedding(id);
  return NextResponse.json({ ok: true });
});
