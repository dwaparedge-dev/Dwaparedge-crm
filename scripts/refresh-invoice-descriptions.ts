/**
 * Brings issued invoices up to date with the sale's wording: any invoice whose lines no longer read like the sale's
 * lines is regenerated (a new version, the earlier ones are kept). An invoice with a payment applied to it cannot be
 * regenerated, so it is listed as skipped: reverse the payment allocation first, then run this again.
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
  let done = 0;
  for (const inv of stale) {
    for (const c of inv.changes) console.log(`${inv.invoice_number}: "${c.from}"  ->  "${c.to}"`);
    if (inv.paid) {
      console.log(`  skipped: ${inv.invoice_number} has payments applied, so it cannot be regenerated`);
      continue;
    }
    done++;
    if (apply) {
      const actor = inv.issued_by ?? fallbackUser;
      if (!actor) throw new Error("There is no user to record the regeneration against");
      console.log(`  regenerated as version ${await regenerateInvoice(inv.id, "Item descriptions updated from the sale", actor)}`);
    }
  }
  const skipped = stale.length - done;
  console.log(apply ? `\nDone: ${done} invoice(s) regenerated${skipped ? `, ${skipped} skipped (payments applied)` : ""}.` : `\nDry run: ${done} invoice(s) would be regenerated${skipped ? `, ${skipped} skipped (payments applied)` : ""}. Run again with --apply.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
