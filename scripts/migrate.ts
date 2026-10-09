import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DIRECT_URL or DATABASE_URL is required");
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

async function run() {
  const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const applied = new Set((await client.query<{ name: string }>("SELECT name FROM _migrations")).rows.map((r) => r.name));
    const dir = join(process.cwd(), "db", "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(dir, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
    // Lock the tables away from Supabase's public REST API (see db/hardening.sql); safe to repeat.
    await client.query(await readFile(join(process.cwd(), "db", "hardening.sql"), "utf8"));
    console.log("migrations up to date; API roles locked out");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
