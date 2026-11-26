import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getEnv } from "@/lib/env";

const globalForPg = globalThis as unknown as { __pgPool?: Pool };

function createPool(): Pool {
  const url = getEnv().DATABASE_URL;
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  // Used only by the integration tests, which run inside a throwaway schema (see tests/integration/helpers.ts).
  const schema = process.env.DB_SEARCH_PATH;
  if (schema && !/^vt_[a-z0-9_]+$/.test(schema)) throw new Error("DB_SEARCH_PATH must be a vt_* test schema");

  // Every server instance has its own pool: (instances x DB_POOL_MAX) must stay under the database pooler's limit (see docs/SECURITY.md).
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: getEnv().DB_POOL_MAX,
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });
  // An idle connection the database or pooler closes (restart, scale-down, an admin freeing connections) raises 'error' on the pool.
  // Without a listener Node treats it as uncaught and takes the whole instance down; with one, pg drops that connection and opens a new one.
  pool.on("error", (error) => console.error("Idle database connection closed:", error.message));
  return pool;
}

function pool(): Pool {
  globalForPg.__pgPool ??= createPool();
  return globalForPg.__pgPool;
}

export type Queryable = Pick<PoolClient, "query">;

export async function query<T extends QueryResultRow>(
  text: string,
  values?: unknown[],
  client?: Queryable,
): Promise<T[]> {
  const result = await (client ?? pool()).query<T>(text, values);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  values?: unknown[],
  client?: Queryable,
): Promise<T | null> {
  const rows = await query<T>(text, values, client);
  return rows[0] ?? null;
}

/** Runs fn inside a transaction; commits on success, rolls back on any error. */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const db = { query, queryOne, transaction };

/** Closes the shared pool. Only the integration tests need this (to drop their throwaway schema). */
export async function closePool(): Promise<void> {
  const pool = globalForPg.__pgPool;
  globalForPg.__pgPool = undefined;
  await pool?.end();
}
