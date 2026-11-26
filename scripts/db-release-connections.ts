/**
 * Frees database connections that are open but idle (nobody is running a query on them). Use it when the pooler's limit is
 * reached (EMAXCONNSESSION: "max clients reached"). Only the app's own pooled connections (Supavisor) are closed, never Supabase's
 * internal services; running queries are never touched; the apps reconnect on their next query.
 *
 *   npm run db:release-connections             shows how many connections each program holds, changes nothing
 *   npm run db:release-connections -- --apply  closes the idle ones
 */
import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is required");
  const apply = process.argv.includes("--apply");
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query<{ state: string | null; app: string; n: number }>(
      `SELECT state, COALESCE(NULLIF(application_name, ''), '(none)') AS app, count(*)::int AS n
       FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'
       GROUP BY 1, 2 ORDER BY n DESC`);
    console.log(rows.length ? rows.map((r) => `${String(r.n).padStart(3)}  ${r.state ?? "unknown"}  ${r.app}`).join("\n") : "no other connections");
    const idle = rows.filter((r) => r.state === "idle" && r.app === "Supavisor").reduce((a, r) => a + r.n, 0);
    if (!apply) { console.log(`\n${idle} idle app connection(s). Run again with --apply to close them.`); return; }
    const res = await client.query(
      `SELECT count(pg_terminate_backend(pid))::int AS closed FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend' AND state = 'idle' AND application_name = 'Supavisor'`);
    console.log(`\nclosed ${res.rows[0].closed} idle connection(s)`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
