/**
 * Copies every row of every CRM table from one database to another (for moving to a new Supabase project).
 * The structure must already exist in the target: run `npm run db:sync` against it first.
 *
 *   npm run db:copy-data              dry run: checks both databases and prints what would be copied, changes nothing
 *   npm run db:copy-data -- --apply   copies, then proves every table matches (row count + checksum of every row)
 *   npm run db:copy-data -- --verify  copies nothing: only re-checks that the target matches the source
 *
 * SOURCE: old_database_url (or OLD_DATABASE_URL, or --from <url>).  TARGET: DIRECT_URL or DATABASE_URL.
 * The source is only ever read (one read-only snapshot). The target is written in ONE transaction: if anything fails, nothing is kept.
 * It refuses to run if the target already holds data other than the starter rows `db:sync` seeds (no accounts, no records).
 */
import pg from "pg";
import { config } from "dotenv";
import { TABLE_REGISTRY } from "../db/schema";
config({ path: ".env.local" });
config();

/** Tables `db:sync` fills with starter rows. These are replaced by the source's rows (which may have been edited or deleted). */
const SEEDED = new Set(["company_settings", "field_options", "task_categories", "task_priorities"]);
const CHUNK = 200;
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const ssl = (url: string) => (url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false });
const where = (url: string) => { const u = new URL(url); return `${decodeURIComponent(u.username)}@${u.host}${u.pathname}`; };

/** Row count + checksum per table. Rows are compared as jsonb, so the physical column order (which differs between a database built
 *  fresh and one that gained columns over time) does not matter, only the values do. Returns the number of tables that differ. */
async function verify(src: pg.Client, dst: pg.Client, tables: string[]): Promise<number> {
  let bad = 0;
  for (const t of tables) {
    const sql = `SELECT count(*)::int AS n, COALESCE(md5(string_agg(j, '|' ORDER BY j)), '') AS h FROM (SELECT to_jsonb(x)::text AS j FROM ${q(t)} x) y`;
    const a = (await src.query(sql)).rows[0], b = (await dst.query(sql)).rows[0];
    const ok = a.n === b.n && a.h === b.h;
    if (!ok) bad++;
    console.log(`  ${ok ? "match   " : "MISMATCH"} ${t.padEnd(22)} source ${a.n}  target ${b.n}`);
  }
  return bad;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const verifyOnly = args.includes("--verify");
  const fromArg = args.indexOf("--from");
  const sourceUrl = (fromArg >= 0 ? args[fromArg + 1] : undefined) ?? process.env.old_database_url ?? process.env.OLD_DATABASE_URL;
  const targetUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error("Source not set: put the old address in old_database_url (or pass --from <url>)");
  if (!targetUrl) throw new Error("Target not set: DATABASE_URL (or DIRECT_URL)");
  if (where(sourceUrl) === where(targetUrl) || new URL(sourceUrl).username === new URL(targetUrl).username)
    throw new Error("Source and target look like the same database. Refusing: this would copy a database onto itself.");
  console.log(`source (read only): ${where(sourceUrl)}\ntarget (written):   ${where(targetUrl)}\n`);

  const src = new pg.Client({ connectionString: sourceUrl, ssl: ssl(sourceUrl) });
  const dst = new pg.Client({ connectionString: targetUrl, ssl: ssl(targetUrl) });
  await src.connect();
  await dst.connect();
  try {
    // One consistent snapshot of the source, read-only: a half-finished copy can never change it.
    await src.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

    const names = TABLE_REGISTRY.filter((t) => t.enabled).map((t) => t.name);
    const hasMigrations = (await src.query("SELECT to_regclass('public._migrations') IS NOT NULL AS has")).rows[0].has as boolean;
    const tables = hasMigrations ? ["_migrations", ...names] : names;

    for (const t of names) if (!(await dst.query("SELECT to_regclass($1) IS NOT NULL AS has", [`public.${t}`])).rows[0].has)
      throw new Error(`Target is missing table ${t}. Run \`npm run db:sync\` against the target first.`);

    // Safety: the target may hold only starter rows.
    const dirty: string[] = [];
    for (const t of names) if (!SEEDED.has(t) && (await dst.query(`SELECT count(*)::int n FROM ${q(t)}`)).rows[0].n > 0) dirty.push(t);
    if (!verifyOnly && dirty.length) throw new Error(`Target already holds data in: ${dirty.join(", ")}. Refusing to mix two databases. Use an empty target.`);

    if (verifyOnly) {
      console.log("verifying (row count + checksum of every row)...");
      const bad = await verify(src, dst, tables);
      if (bad) throw new Error(`${bad} table(s) differ.`);
      console.log("\nAll tables match exactly.");
      return;
    }

    const counts: Record<string, number> = {};
    for (const t of tables) counts[t] = (await src.query(`SELECT count(*)::int n FROM ${q(t)}`)).rows[0].n;
    console.log("rows to copy:");
    for (const t of tables) console.log(`  ${t.padEnd(22)} ${String(counts[t]).padStart(6)}${SEEDED.has(t) ? "   (replaces the starter rows)" : ""}`);
    if (!apply) { console.log("\nDry run: nothing changed. Run again with --apply to copy."); return; }

    await dst.query("BEGIN");
    // Rows were valid in the source: skip the guard triggers and foreign-key checks so nothing is re-validated or rewritten on the way in.
    // If the role may not do this, fall back to parent-first order (the registry order), which also satisfies the keys.
    let replica = true;
    try { await dst.query("SET LOCAL session_replication_role = replica"); } catch { replica = false; await dst.query("ROLLBACK"); await dst.query("BEGIN"); }
    console.log(`\ncopying (${replica ? "triggers and key checks off for the copy" : "in parent-first order, triggers on"})...`);

    await dst.query(`CREATE TABLE IF NOT EXISTS _migrations (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const wipe = [...SEEDED, ...(hasMigrations ? ["_migrations"] : [])].map(q).join(", ");
    await dst.query(`TRUNCATE ${wipe} RESTART IDENTITY CASCADE`);

    for (const t of tables) {
      if (!counts[t]) continue;
      // Rows travel as JSON text (never parsed in JavaScript), so numbers, dates, arrays and jsonb arrive exactly as stored.
      const { rows } = await src.query<{ j: string }>(`SELECT row_to_json(x)::text AS j FROM ${q(t)} x`);
      for (let i = 0; i < rows.length; i += CHUNK) {
        const payload = `[${rows.slice(i, i + CHUNK).map((r) => r.j).join(",")}]`;
        await dst.query(`INSERT INTO ${q(t)} OVERRIDING SYSTEM VALUE SELECT * FROM json_populate_recordset(NULL::${q(t)}, $1::json)`, [payload]);
      }
      console.log(`  ${t.padEnd(22)} ${String(rows.length).padStart(6)}`);
    }

    // Counters (serial / identity columns) continue after the highest copied value.
    const seq = await dst.query<{ t: string; c: string }>(
      `SELECT table_name t, column_name c FROM information_schema.columns
       WHERE table_schema = 'public' AND (is_identity = 'YES' OR column_default LIKE 'nextval(%')`);
    for (const { t, c } of seq.rows) {
      await dst.query(`SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT max(${q(c)}) FROM ${q(t)}), 0) + 1, false)`, [`public.${t}`, c]);
    }
    await dst.query("COMMIT");
    console.log("committed.\n\nverifying every table (row count + checksum of every row)...");

    const bad = await verify(src, dst, tables);
    if (bad) throw new Error(`${bad} table(s) do not match. The target was committed: fix the cause, then empty the target (drop its tables) and run \`db:sync\` and this again.`);
    console.log("\nAll tables match exactly.");
  } catch (e) {
    await dst.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await src.query("ROLLBACK").catch(() => undefined);
    await src.end().catch(() => undefined);
    await dst.end().catch(() => undefined);
  }
}

main().catch((e) => { console.error("\n" + (e instanceof Error ? e.message : e)); process.exit(1); });
