import { NextResponse } from "next/server";
import { handler, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { caseEmbeddingText, embed, toPgVector } from "@/lib/embeddings";
import { createCaseSchema } from "@/lib/validation";
import { listCases } from "@/lib/data";

// GET /api/cases?q=&status=&severity=&category=&page=
export const GET = handler(async (req) => {
  await requireApiSession();
  const p = new URL(req.url).searchParams;
  const data = await listCases({
    q: p.get("q") || undefined,
    status: p.get("status") || undefined,
    severity: p.get("severity") || undefined,
    category: p.get("category") || undefined,
    page: Number(p.get("page") ?? 1),
  });
  return NextResponse.json(data);
});

// POST /api/cases : register a call. One transaction covers caller upsert,
// case insert, auto-assignment and symptom links; triggers then apply the
// red-flag and escalation rules inside the same transaction.
export const POST = handler(async (req) => {
  const s = await requireApiSession();
  const body = createCaseSchema.parse(await req.json());

  // Embed before opening the transaction so locks are held as briefly as possible
  const vec = toPgVector(await embed(caseEmbeddingText(body)));

  const caseId = await withTransaction(s.userId, async (db) => {
    const c = body.caller;
    const caller = await db.query<{ caller_id: number }>(
      `INSERT INTO caller (phone, full_name, age, gender, district_id, preferred_language)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (phone) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             age = coalesce(EXCLUDED.age, caller.age),
             gender = coalesce(EXCLUDED.gender, caller.gender),
             district_id = coalesce(EXCLUDED.district_id, caller.district_id),
             preferred_language = EXCLUDED.preferred_language
       RETURNING caller_id`,
      [c.phone, c.full_name, c.age ?? null, c.gender ?? null, c.district_id ?? null, c.preferred_language],
    );

    // Agents keep the calls they take; leads route the case to the least-loaded agent
    const inserted = await db.query<{ case_id: number }>(
      `INSERT INTO help_case (caller_id, created_by, assigned_to, chief_complaint, category,
                              severity, applied_protocol_id, embedding)
       VALUES ($1, $2, CASE WHEN $3 THEN $2 ELSE fn_pick_agent() END, $4, $5, $6, $7, $8::vector)
       RETURNING case_id`,
      [caller.rows[0].caller_id, s.userId, s.role === "agent", body.chief_complaint, body.category,
       body.severity, body.applied_protocol_id ?? null, vec],
    );
    const id = inserted.rows[0].case_id;

    if (body.symptom_ids.length) {
      await db.query(
        `INSERT INTO case_symptom (case_id, symptom_id)
         SELECT $1, unnest($2::smallint[]) ON CONFLICT DO NOTHING`,
        [id, body.symptom_ids],
      );
    }
    await db.query(
      "INSERT INTO case_note (case_id, author_id, note_type, body) VALUES ($1, $2, 'system', 'Call registered.')",
      [id, s.userId],
    );
    return id;
  });

  return NextResponse.json({ case_id: caseId }, { status: 201 });
});
