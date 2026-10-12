import "server-only";
import type { PoolClient } from "pg";
import { HttpError } from "./api";
import type { Session } from "./auth";
import { embed, toPgVector, caseEmbeddingText } from "./embeddings";
import { query } from "./db";

/**
 * Agents can read every case (they need history) but only change cases
 * assigned to them. Supervisors and admins can change any case.
 * Locks the row (FOR UPDATE) so concurrent edits queue up.
 */
export async function lockCaseForWrite(client: PoolClient, s: Session, caseId: number) {
  const { rows } = await client.query<{ assigned_to: number | null; status: string }>(
    "SELECT assigned_to, status FROM help_case WHERE case_id = $1 FOR UPDATE",
    [caseId],
  );
  const c = rows[0];
  if (!c) throw new HttpError(404, "Case not found.");
  if (s.role === "agent" && c.assigned_to !== s.userId) {
    throw new HttpError(403, "Only the assigned agent or a supervisor can change this case.");
  }
  return c;
}

/** Recompute a case embedding (after create or close). Failures are logged, not fatal. */
export async function refreshCaseEmbedding(caseId: number) {
  try {
    const [c] = await query<{ category: string; chief_complaint: string; resolution_notes: string | null }>(
      "SELECT category, chief_complaint, resolution_notes FROM help_case WHERE case_id = $1",
      [caseId],
    );
    if (!c) return;
    const vec = await embed(caseEmbeddingText(c));
    await query("UPDATE help_case SET embedding = $1::vector WHERE case_id = $2", [toPgVector(vec), caseId]);
  } catch (err) {
    console.error(`Embedding refresh failed for case ${caseId}:`, err);
  }
}
