import { NextResponse } from "next/server";
import { handler, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { embed, protocolEmbeddingText, toPgVector } from "@/lib/embeddings";
import { listProtocols } from "@/lib/data";
import { protocolSchema } from "@/lib/validation";

export const GET = handler(async () => {
  await requireApiSession();
  return NextResponse.json(await listProtocols());
});

export const POST = handler(async (req) => {
  const s = await requireApiSession(["supervisor", "admin"]);
  const b = protocolSchema.parse(await req.json());
  const vec = toPgVector(await embed(protocolEmbeddingText(b)));
  const id = await withTransaction(s.userId, async (db) => {
    const { rows } = await db.query<{ protocol_id: number }>(
      `INSERT INTO protocol (code, title, category, content, is_active, created_by, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector) RETURNING protocol_id`,
      [b.code, b.title, b.category, b.content, b.is_active, s.userId, vec],
    );
    return rows[0].protocol_id;
  });
  return NextResponse.json({ protocol_id: id }, { status: 201 });
});
