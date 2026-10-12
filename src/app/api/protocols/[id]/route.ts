import { NextResponse } from "next/server";
import { handler, HttpError, parseId, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { embed, protocolEmbeddingText, toPgVector } from "@/lib/embeddings";
import { protocolSchema } from "@/lib/validation";

export const PUT = handler<{ id: string }>(async (req, { params }) => {
  const s = await requireApiSession(["supervisor", "admin"]);
  const id = parseId((await params).id);
  const b = protocolSchema.parse(await req.json());
  // Content changed, so the stored vector must change with it
  const vec = toPgVector(await embed(protocolEmbeddingText(b)));
  await withTransaction(s.userId, async (db) => {
    const { rowCount } = await db.query(
      `UPDATE protocol SET code = $1, title = $2, category = $3, content = $4, is_active = $5, embedding = $6::vector
        WHERE protocol_id = $7`,
      [b.code, b.title, b.category, b.content, b.is_active, vec, id],
    );
    if (!rowCount) throw new HttpError(404, "Protocol not found.");
  });
  return NextResponse.json({ ok: true });
});

// Hard delete is admin-only. Cases that referenced it keep working:
// fk_case_protocol is ON DELETE SET NULL.
export const DELETE = handler<{ id: string }>(async (_req, { params }) => {
  const s = await requireApiSession(["admin"]);
  const id = parseId((await params).id);
  await withTransaction(s.userId, async (db) => {
    const { rowCount } = await db.query("DELETE FROM protocol WHERE protocol_id = $1", [id]);
    if (!rowCount) throw new HttpError(404, "Protocol not found.");
  });
  return NextResponse.json({ ok: true });
});
