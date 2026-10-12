/**
 * Applies db/0*.sql in filename order inside one transaction.
 * Usage: npm run db:migrate
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");

  const dir = join(process.cwd(), "db");
  const files = readdirSync(dir).filter((f) => /^0\d_.*\.sql$/.test(f)).sort();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SET client_min_messages = warning");
    await client.query("BEGIN");
    for (const f of files) {
      process.stdout.write(`applying ${f} ... `);
      await client.query(readFileSync(join(dir, f), "utf8"));
      console.log("ok");
    }
    await client.query("COMMIT");
    console.log("Schema ready.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\nMigration failed:", e.message);
  process.exit(1);
});
