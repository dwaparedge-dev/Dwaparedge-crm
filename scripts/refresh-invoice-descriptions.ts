/**
 * Brings issued invoices up to date with the sale's wording: any invoice whose lines no longer read like the sale's
 * lines is regenerated (a new version, the earlier ones are kept).
 *
 *   npm run invoices:refresh              (dry run: lists what would change, writes nothing)
 *   npm run invoices:refresh -- --apply   (regenerates those invoices)
 *
 * Needs the `item_descriptions` column of invoice_versions: run `npm run db:sync` first.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const apply = process.argv.includes("--apply");
  const { db } = await import("../src/lib/db");
  const { invoicesWithStaleDescriptions, regenerateInvoice } = await import("../src/features/invoices/service");

  const stale = await invoicesWithStaleDescriptions();
  if (!stale.length) {
    console.log("Every issued invoice already matches its sale. Nothing to do.");
    return;
  }
  const fallbackUser = (await db.queryOne<{ id: string }>("SELECT id FROM users ORDER BY created_at LIMIT 1"))?.id;
  for (const inv of stale) {
    for (const c of inv.changes) console.log(`${inv.invoice_number}: "${c.from}"  ->  "${c.to}"`);
    if (apply) {
      const actor = inv.issued_by ?? fallbackUser;
      if (!actor) throw new Error("There is no user to record the regeneration against");
      console.log(`  regenerated as version ${await regenerateInvoice(inv.id, "Item descriptions updated from the sale", actor)}`);
    }
  }
  console.log(apply ? `\nDone: ${stale.length} invoice(s) regenerated.` : `\nDry run: ${stale.length} invoice(s) would be regenerated. Run again with --apply.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
