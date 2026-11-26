/**
 * Storage limitation for website analytics: erases visitors, visits and events older than ANALYTICS_RETENTION_DAYS (default 395).
 * Run it once a day from a machine or scheduler that holds the database credential.
 *
 *   npm run analytics:purge                  uses ANALYTICS_RETENTION_DAYS
 *   npm run analytics:purge -- --days 180    a shorter window for this run
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { closePool } = await import("../src/lib/db");
  const { purgeExpiredAnalytics } = await import("../src/features/analytics/service");
  const args = process.argv.slice(2);
  const i = args.indexOf("--days");
  const days = i >= 0 ? Number(args[i + 1]) : undefined;
  if (days !== undefined && !(Number.isInteger(days) && days >= 30)) throw new Error("--days needs a whole number of at least 30");
  try {
    const r = await purgeExpiredAnalytics(days);
    console.log(`erased ${r.visitors} visitor(s) and ${r.sessions} visit(s) past the retention window`);
  } finally {
    await closePool();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
