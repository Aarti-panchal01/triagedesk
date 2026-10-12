import pg, { type PoolClient, type QueryResultRow } from "pg";

// BIGINT ids and NUMERIC aggregates come back as strings by default. Our ids
// stay far below 2^53, so numbers are safe and much nicer to work with.
pg.types.setTypeParser(20, (v) => Number(v)); // int8
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric

const g = globalThis as unknown as { __tdPool?: pg.Pool };

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
}

export function getPool(): pg.Pool {
  // Reuse one pool across hot reloads in dev
  if (!g.__tdPool) g.__tdPool = createPool();
  return g.__tdPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Runs fn inside BEGIN/COMMIT. The acting user id is stored in the
 * transaction-local setting app.user_id so database triggers (audit log,
 * auto-escalation) can record who made the change.
 */
export async function withTransaction<T>(
  actorId: number | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (actorId != null) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [String(actorId)]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
