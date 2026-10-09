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

  // Serverless: every instance has its own pool, so keep it small to stay under the database pooler's limit.
  return new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 3 : 10,
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });
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
