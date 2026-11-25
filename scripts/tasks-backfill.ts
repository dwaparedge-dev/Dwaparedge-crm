/**
 * One-off: raise auto-tasks for records dated BEFORE TASKS_AUTO_FROM (the live sync only handles newer ones).
 *
 *   npm run tasks:backfill                         dry run: lists what would be raised, per rule
 *   npm run tasks:backfill -- --apply              creates them
 *   npm run tasks:backfill -- --max-age-days 90    only records dated within the last 90 days
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { db, closePool } = await import("../src/lib/db");
  const { getEnv } = await import("../src/lib/env");
  const { SIGNAL_RULES } = await import("../src/features/tasks/signals");
  const { raiseCandidates } = await import("../src/features/tasks/sync");
  const { todayIST } = await import("../src/lib/dates");

  const from = getEnv().TASKS_AUTO_FROM;
  if (!from) throw new Error("Set TASKS_AUTO_FROM (YYYY-MM-DD) first: the backfill covers everything dated before it.");
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const i = args.indexOf("--max-age-days");
  const maxAge = i >= 0 ? Number(args[i + 1]) : undefined;
  if (maxAge !== undefined && !(maxAge > 0)) throw new Error("--max-age-days needs a positive number");
  const today = todayIST();
  const oldest = maxAge ? new Date(Date.parse(`${today}T00:00:00Z`) - maxAge * 86_400_000).toISOString().slice(0, 10) : null;

  await db.transaction(async (tx) => {
    let total = 0;
    for (const rule of SIGNAL_RULES) {
      const rows = (await rule.holds(tx, today)).filter((c) => c.triggerDate < from && (!oldest || c.triggerDate >= oldest));
      console.log(`${rule.name}: ${rows.length}`);
      for (const c of rows) console.log(`   ${c.triggerDate}  ${c.title}`);
      if (apply) total += await raiseCandidates(rows, tx);
    }
    console.log(apply ? `Created ${total} task(s).` : "Dry run: nothing created. Add --apply to create them.");
  });
  await closePool();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
