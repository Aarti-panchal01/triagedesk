/**
 * Two retrieval strategies over the same data, so they can be compared:
 *  - keyword:  Postgres full-text search (tsvector + GIN index, ts_rank)
 *  - semantic: pgvector cosine similarity over sentence embeddings (HNSW index)
 */
import "server-only";
import { query } from "./db";
import { embed, toPgVector } from "./embeddings";
import type { Severity, Status } from "./constants";

export type CaseHit = {
  case_id: number; case_ref: string; chief_complaint: string; resolution_notes: string | null;
  category: string; severity: Severity; status: Status; score: number;
};
export type ProtocolHit = { protocol_id: number; code: string; title: string; category: string; excerpt: string; score: number };

export type SearchOptions = { category?: string; closedOnly?: boolean; limit?: number; minScore?: number };

export async function semanticSearch(text: string, opts: SearchOptions = {}) {
  const vec = toPgVector(await embed(text));
  const limit = opts.limit ?? 6;
  const minScore = opts.minScore ?? 0.25;

  // 1 - cosine distance = cosine similarity (vectors are normalised)
  const cases = await query<CaseHit>(
    `SELECT h.case_id, 'TD-' || lpad(h.case_id::text, 6, '0') AS case_ref,
            h.chief_complaint, h.resolution_notes, h.category, h.severity, h.status,
            round((1 - (h.embedding <=> $1::vector))::numeric, 3) AS score
       FROM help_case h
      WHERE h.embedding IS NOT NULL
        AND ($2::text IS NULL OR h.category = $2)
        AND (NOT $3 OR h.status = 'closed')
        AND 1 - (h.embedding <=> $1::vector) >= $5
      ORDER BY h.embedding <=> $1::vector
      LIMIT $4`,
    [vec, opts.category ?? null, opts.closedOnly ?? false, limit, minScore],
  );

  const protocols = await query<ProtocolHit>(
    `SELECT p.protocol_id, p.code, p.title, p.category, left(p.content, 220) AS excerpt,
            round((1 - (p.embedding <=> $1::vector))::numeric, 3) AS score
       FROM protocol p
      WHERE p.is_active AND p.embedding IS NOT NULL
        AND 1 - (p.embedding <=> $1::vector) >= $3
      ORDER BY p.embedding <=> $1::vector
      LIMIT $2`,
    [vec, Math.min(limit, 4), minScore],
  );
  return { cases, protocols };
}

export async function keywordSearch(text: string, opts: SearchOptions = {}) {
  const limit = opts.limit ?? 6;
  const cases = await query<CaseHit>(
    `SELECT h.case_id, 'TD-' || lpad(h.case_id::text, 6, '0') AS case_ref,
            h.chief_complaint, h.resolution_notes, h.category, h.severity, h.status,
            round(ts_rank(h.search_tsv, q)::numeric, 3) AS score
       FROM help_case h, websearch_to_tsquery('english', $1) q
      WHERE h.search_tsv @@ q
        AND ($2::text IS NULL OR h.category = $2)
        AND (NOT $3 OR h.status = 'closed')
      ORDER BY score DESC
      LIMIT $4`,
    [text, opts.category ?? null, opts.closedOnly ?? false, limit],
  );
  // Protocols have no stored tsvector; compute it on the fly (small table)
  const protocols = await query<ProtocolHit>(
    `SELECT p.protocol_id, p.code, p.title, p.category, left(p.content, 220) AS excerpt,
            round(ts_rank(to_tsvector('english', p.title || ' ' || p.content), q)::numeric, 3) AS score
       FROM protocol p, websearch_to_tsquery('english', $1) q
      WHERE p.is_active AND to_tsvector('english', p.title || ' ' || p.content) @@ q
      ORDER BY score DESC
      LIMIT $2`,
    [text, Math.min(limit, 4)],
  );
  return { cases, protocols };
}
