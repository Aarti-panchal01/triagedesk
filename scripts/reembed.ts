/**
 * Recomputes every stored embedding. Run this if you change EMBEDDING_PROVIDER
 * or the model, because vectors from different models are not comparable.
 * Usage: npm run db:reembed
 */
import "dotenv/config";
import { Client } from "pg";
import { caseEmbeddingText, embed, protocolEmbeddingText, toPgVector } from "../src/lib/embeddings";

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const cases = await db.query("SELECT case_id, category, chief_complaint, resolution_notes FROM help_case");
  for (const c of cases.rows) {
    await db.query("UPDATE help_case SET embedding = $1::vector WHERE case_id = $2", [toPgVector(await embed(caseEmbeddingText(c))), c.case_id]);
  }
  const protocols = await db.query("SELECT protocol_id, title, category, content FROM protocol");
  for (const p of protocols.rows) {
    await db.query("UPDATE protocol SET embedding = $1::vector WHERE protocol_id = $2", [toPgVector(await embed(protocolEmbeddingText(p))), p.protocol_id]);
  }
  console.log(`Re-embedded ${cases.rowCount} cases and ${protocols.rowCount} protocols.`);
  await db.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
