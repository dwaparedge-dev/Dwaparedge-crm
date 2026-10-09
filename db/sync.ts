import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { config } from "dotenv";
import { LOGIC_FILES, SEED_FILES, TABLE_REGISTRY, getActiveTables } from "./schema";

const DB_DIR = join(process.cwd(), "db");

export interface SyncOptions {
  table?: string;
  module?: string;
  /** Skip the functions/triggers/views and default rows (used with --table). */
  tablesOnly?: boolean;
  /** Enable row level security and close the Supabase API roles after syncing (db/hardening.sql). */
  harden?: boolean;
  log?: (line: string) => void;
}

export interface SyncResult {
  tablesSynced: string[];
  columnsAdded: Record<string, string[]>;
  durationMs: number;
}

/** Table-level lines inside CREATE TABLE ( ... ) that are not columns. */
const NOT_A_COLUMN = /^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|EXCLUDE)\b/i;

/** Column definitions (name + definition) from the file's CREATE TABLE; one column per line. */
export function parseColumns(sql: string): { name: string; def: string }[] {
  const body = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[^\s(]+\s*\(([\s\S]*?)\n\);/i)?.[1];
  if (!body) return [];
  const cols: { name: string; def: string }[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.replace(/--.*$/, "").trim().replace(/,$/, "");
    if (!line || NOT_A_COLUMN.test(line)) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)$/);
    if (m) cols.push({ name: m[1], def: m[2] });
  }
  return cols;
}

/** Adds the columns the file declares but the existing table lacks. Returns the names added. */
async function addMissingColumns(client: pg.PoolClient | pg.Client, table: string, sql: string): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1", [table],
  );
  const have = new Set(rows.map((r) => r.column_name.toLowerCase()));
  const added: string[] = [];
  for (const c of parseColumns(sql)) {
    if (have.has(c.name.toLowerCase())) continue;
    // Table names and columns come from our own SQL files, never from input. A NOT NULL column without a
    // default fails on a table that already has rows: that error aborts the sync and says which column.
    await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${c.name} ${c.def}`);
    added.push(c.name);
  }
  return added;
}

/** Brings the connection's current schema up to what db/tables, db/logic and db/seeds describe. */
export async function syncSchema(client: pg.PoolClient | pg.Client, options: SyncOptions = {}): Promise<SyncResult> {
  const started = Date.now();
  const log = options.log ?? (() => undefined);
  const filtered = Boolean(options.table || options.module);
  const tables = getActiveTables({ table: options.table, module: options.module });
  const result: SyncResult = { tablesSynced: [], columnsAdded: {}, durationMs: 0 };

  for (const table of tables) {
    const sql = await readFile(join(DB_DIR, "tables", table.file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      const added = await addMissingColumns(client, table.name, sql);
      await client.query("COMMIT");
      if (added.length) result.columnsAdded[table.name] = added;
      result.tablesSynced.push(table.name);
      log(`  synced ${table.name}${added.length ? ` (added columns: ${added.join(", ")})` : ""}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`Syncing table "${table.name}" failed: ${(e as Error).message}`);
    }
  }

  if (!filtered && !options.tablesOnly) {
    for (const [kind, files] of [["logic", LOGIC_FILES], ["seeds", SEED_FILES]] as const) {
      for (const file of files) {
        await client.query("BEGIN");
        try {
          await client.query(await readFile(join(DB_DIR, kind, file), "utf8"));
          await client.query("COMMIT");
          log(`  applied ${kind}/${file}`);
        } catch (e) {
          await client.query("ROLLBACK");
          throw new Error(`Applying ${kind}/${file} failed: ${(e as Error).message}`);
        }
      }
    }
  }

  if (options.harden) {
    await client.query(await readFile(join(DB_DIR, "hardening.sql"), "utf8"));
    log("  locked the API roles out (db/hardening.sql)");
  }
  result.durationMs = Date.now() - started;
  return result;
}

/** Table files that exist on disk but are not in the registry (they would silently never be created). */
export async function unregisteredTableFiles(): Promise<string[]> {
  const known = new Set(TABLE_REGISTRY.map((t) => t.file));
  const found: string[] = [];
  for (const mod of await readdir(join(DB_DIR, "tables"))) {
    for (const f of await readdir(join(DB_DIR, "tables", mod))) if (f.endsWith(".sql") && !known.has(`${mod}/${f}`)) found.push(`${mod}/${f}`);
  }
  return found;
}

async function main() {
  config({ path: ".env.local" });
  config();
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is required");
  const args = process.argv.slice(2);
  const arg = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const table = arg("table");
  const mod = arg("module");

  const local = url.includes("localhost") || url.includes("127.0.0.1");
  const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const stray = await unregisteredTableFiles();
    if (stray.length) console.warn(`Not in db/schema.ts, so skipped: ${stray.join(", ")}`);
    console.log(`\nSyncing database${table ? ` (table ${table})` : mod ? ` (module ${mod})` : ""}...`);
    const r = await syncSchema(client, { table, module: mod, harden: !table && !mod, log: console.log });
    console.log(`\nDone: ${r.tablesSynced.length} table(s) in ${r.durationMs}ms.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("sync.ts")) {
  main().catch((e) => {
    console.error(`\nSync failed: ${(e as Error).message}`);
    process.exit(1);
  });
}
